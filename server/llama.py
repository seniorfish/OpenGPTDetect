#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Text Perplexity (PPL) lookup service (FastAPI + llama.cpp).

Endpoints:
    POST /ppl               text -> tokens -> PPL (one shot)
    POST /tokenize          text -> token sequence                [v3.1]
    POST /ppl_from_tokens   token sequence -> PPL                 [v3.1]
    GET  /health            health check / service info

The two-step chain (/tokenize -> /ppl_from_tokens) and the one-step
endpoint (/ppl) produce identical results.
"""

import os
import math
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List, Tuple

import numpy as np

from fastapi import FastAPI, HTTPException   # noqa: E402
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel               # noqa: E402
from llama_cpp import Llama                  # noqa: E402

# Load configuration from a server/.env file, if present.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv is optional; env vars still work
    pass

# =============================================================================
#                          Configurable constants
# =============================================================================

# Path to the GGUF model file (required).
# Set it via the MODEL_PATH environment variable or a server/.env file.
MODEL_PATH = os.getenv("MODEL_PATH")
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen3.5-9B-Base")   # display name, only used by /health
N_CTX = int(os.getenv("N_CTX", "2048"))                # max context length (token hard cap)
MAX_CHAR_COUNT = int(os.getenv("MAX_CHAR_COUNT", "2200"))    # max chars for text endpoints
N_BATCH = int(os.getenv("N_BATCH", "1024"))            # logical batch (tokens decoded at once)
N_UBATCH = int(os.getenv("N_UBATCH", "512"))           # physical batch
FLASH_ATTN = os.getenv("FLASH_ATTN", "False").lower() in ("true", "1", "yes")  # try on if SYCL supports it
NLL_CHUNK = int(os.getenv("NLL_CHUNK", "128"))         # numpy NLL rows per chunk
USE_TORCH = os.getenv("PPL_USE_TORCH", "1") == "1"     # set to "0" to force numpy
PORT = int(os.getenv("PORT", "8000"))                  # uvicorn listen port

# =============================================================================
#               Optional PyTorch acceleration (falls back to numpy)
# =============================================================================

_torch = None
_torch_device = None
if USE_TORCH:
    try:
        import torch as _torch  # type: ignore
        if _torch.cuda.is_available():
            _torch_device = "cuda"
        elif hasattr(_torch, "xpu") and _torch.xpu.is_available():
            _torch_device = "xpu"
        else:
            _torch_device = "cpu"   # torch CPU is multi-threaded, usually faster than numpy
    except Exception:
        _torch = None
        _torch_device = None

# =============================================================================
#                     FastAPI app and global state
# =============================================================================

llm: Optional[Llama] = None
inference_lock = asyncio.Lock()

@asynccontextmanager
async def lifespan(app: FastAPI):
    global llm
    if not MODEL_PATH:
        raise RuntimeError(
            "MODEL_PATH is not set. Copy server/.env.example to server/.env and fill in "
            "the path to a GGUF model file, or set the MODEL_PATH environment variable."
        )
    print(f"Loading model: {MODEL_PATH}")
    llm = Llama(
        model_path=MODEL_PATH,
        logits_all=True,          # PPL needs logits at every position
        n_ctx=N_CTX,
        n_batch=N_BATCH,
        n_ubatch=N_UBATCH,
        n_gpu_layers=-1,
        flash_attn=FLASH_ATTN,
        verbose=False,
    )
    backend = f"torch/{_torch_device}" if _torch is not None else "numpy"
    print(f"Model loaded, service ready (NLL backend: {backend})")
    yield
    if llm is not None:
        llm.close()

app = FastAPI(title="OpenGPTDetect PPL Analysis API (llama.cpp)", version="3.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # all origins; the local editor and extension run against localhost
    allow_credentials=True,    # allow cookies, if a client ever needs them
    allow_methods=["*"],       # allow all HTTP methods (GET, POST, ...)
    allow_headers=["*"],       # allow all headers
)

# =============================================================================
#                                Pydantic models
# =============================================================================

class PPLRequest(BaseModel):
    text: str

class TokenizeRequest(BaseModel):
    text: str
    add_bos: bool = False        # prepend a BOS token to the sequence
    parse_special: bool = True   # parse special-token literals (e.g. <|im_start|>) as ids

class PPLTokensRequest(BaseModel):
    tokens: List[int]                              # token ids to score
    text: Optional[str] = None                     # optional original text, only for offset alignment

class TokenDetail(BaseModel):
    token_index: int
    token_id: int
    token_text: str
    nll: Optional[float] = None
    ppl: Optional[float] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None

class TokenizeResponse(BaseModel):
    tokens: List[int]
    token_count: int
    char_count: int
    fits_ctx: bool                  # token_count <= N_CTX, safe to feed into /ppl_from_tokens
    token_details: List[TokenDetail]   # nll/ppl are always null in this endpoint

class PPLResponse(BaseModel):
    average_ppl: float
    average_nll: float
    token_count: int
    char_count: int
    token_details: List[TokenDetail]

# =============================================================================
#                          NLL computation (hot path)
# =============================================================================

def compute_nll(logits: np.ndarray, targets: np.ndarray) -> np.ndarray:
    """
    logits:  (N, V) float32; logits[i] predicts targets[i]
    targets: (N,)   int64
    returns: (N,)   float64, NLL = -log p(target | previous tokens)

    Only the target column is pulled out; the full (N, V) logprobs matrix
    is never materialized.
    """
    n = logits.shape[0]
    out = np.empty(n, dtype=np.float64)

    # ---- Optional PyTorch backend ----
    if _torch is not None:
        dev = _torch_device
        step = NLL_CHUNK * 4
        for s in range(0, n, step):
            e = min(s + step, n)
            t = _torch.from_numpy(np.ascontiguousarray(logits[s:e])).to(dev)
            lp = _torch.log_softmax(t, dim=-1)
            tgt = _torch.from_numpy(targets[s:e]).to(dev)
            nll = -lp[_torch.arange(e - s, device=dev), tgt]
            out[s:e] = nll.to("cpu", dtype=_torch.float64).numpy()
        return out

    # ---- Default: chunked numpy log-sum-exp (numerically stable) ----
    for s in range(0, n, NLL_CHUNK):
        e = min(s + NLL_CHUNK, n)
        x = logits[s:e]                                   # (c, V) view, zero copy
        m = x.max(axis=1, keepdims=True)
        z = x - m                                         # the only large temp array (c, V)
        z_tgt = z[np.arange(e - s), targets[s:e]]         # pull the target column first
        np.exp(z, out=z)
        lse = np.log(z.sum(axis=1, dtype=np.float64))
        out[s:e] = lse - z_tgt                            # m cancels on both sides
    return out

# =============================================================================
#              Character offset alignment (O(n), replaces old O(n^2))
# =============================================================================

def token_offsets_and_pieces(text: str, tokens: List[int]) -> Tuple[List[Tuple[int, int]], List[str]]:
    pieces = [llm.detokenize([t]).decode("utf-8", errors="replace") for t in tokens]
    offsets: List[Tuple[int, int]] = []

    # Fast path: per-token decoded pieces concatenate back to the original text
    # (the common case), so offsets are exact.
    if "".join(pieces) == text:
        pos = 0
        for p in pieces:
            offsets.append((pos, pos + len(p)))
            pos += len(p)
        return offsets, pieces

    # Fallback: forward-search each piece in the original text, from the
    # current position (handles byte-fallback UTF-8 bytes, special tokens...).
    pos = 0
    for p in pieces:
        if p:
            idx = text.find(p, pos)
            if idx != -1:
                offsets.append((idx, idx + len(p)))
                pos = idx + len(p)
                continue
        offsets.append((pos, pos))   # unalignable (e.g. special token): zero-width range
    return offsets, pieces

# =============================================================================
#                     Shared validation and assembly utils
# =============================================================================

def _check_text(text: str) -> None:
    if not text or not text.strip():
        raise ValueError("text cannot be empty")
    if len(text) > MAX_CHAR_COUNT:
        raise ValueError(f"text too long; current limit is {MAX_CHAR_COUNT} chars, please shorten it")

def _check_tokens(tokens: List[int]) -> None:
    n = len(tokens)
    if n < 2:
        raise ValueError("need at least 2 tokens to compute PPL with a causal language model")
    if n > N_CTX:
        raise ValueError(f"token count ({n}) exceeds the context window N_CTX={N_CTX}; "
                         f"shorten the input or raise N_CTX")
    vocab = llm.n_vocab()
    bad = [t for t in tokens if not 0 <= t < vocab]
    if bad:
        raise ValueError(f"{len(bad)} token ids out of range (valid range [0, {vocab})), "
                         f"e.g.: {bad[:5]}")

def build_token_details(
    tokens: List[int],
    pieces: List[str],
    offsets: List[Tuple[int, int]],
    nlls: Optional[np.ndarray] = None,
    ppls: Optional[np.ndarray] = None,
) -> List[TokenDetail]:
    """Assemble per-token details; when nlls/ppls are None (e.g. /tokenize), output null."""
    details: List[TokenDetail] = []
    for i, tok in enumerate(tokens):
        s, e = offsets[i]
        nll = ppl = None
        if nlls is not None and i > 0:
            nll = float(nlls[i - 1])
            ppl = float(ppls[i - 1])
        details.append(
            TokenDetail(
                token_index=i,
                token_id=tok,
                token_text=pieces[i],
                nll=nll,
                ppl=ppl,
                char_start=s,
                char_end=e,
            )
        )
    return details

def _eval_nll(tokens: List[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Prefill once and compute the NLL / PPL of every token (except the first)."""
    n = len(tokens)
    llm.reset()
    llm.eval(tokens)
    logits = llm.scores[: n - 1]          # logits[i] predicts token i+1
    targets = np.asarray(tokens[1:], dtype=np.int64)
    nlls = compute_nll(logits, targets)   # (n-1,) float64
    ppls = np.exp(np.minimum(nlls, 80.0))
    return nlls, ppls

# =============================================================================
#                       Synchronous cores for the three routes
# =============================================================================

def tokenize_sync(text: str, add_bos: bool = False, parse_special: bool = True) -> TokenizeResponse:
    """/tokenize: text -> token sequence (no model eval, very cheap)"""
    _check_text(text)
    tokens = llm.tokenize(text.encode("utf-8"), special=parse_special, add_bos=add_bos)
    if not tokens:
        raise ValueError("tokenization produced no tokens, cannot proceed")
    offsets, pieces = token_offsets_and_pieces(text, tokens)
    return TokenizeResponse(
        tokens=tokens,
        token_count=len(tokens),
        char_count=len(text),
        fits_ctx=len(tokens) <= N_CTX,
        token_details=build_token_details(tokens, pieces, offsets),
    )

def ppl_from_tokens_sync(tokens: List[int], text: Optional[str] = None) -> PPLResponse:
    """/ppl_from_tokens: token sequence -> PPL"""
    _check_tokens(tokens)

    # Reference text for offset alignment: prefer the caller-provided original,
    # otherwise use the detokenized form of the tokens themselves.
    if text is not None:
        align_text = text
    else:
        align_text = llm.detokenize(tokens).decode("utf-8", errors="replace")
    offsets, pieces = token_offsets_and_pieces(align_text, tokens)

    nlls, ppls = _eval_nll(tokens)
    details = build_token_details(tokens, pieces, offsets, nlls, ppls)

    avg_nll = float(nlls.mean())
    avg_ppl = float(math.exp(min(avg_nll, 80.0)))
    return PPLResponse(
        average_ppl=avg_ppl,
        average_nll=avg_nll,
        token_count=len(tokens),
        char_count=len(align_text),
        token_details=details,
    )

def calculate_ppl_sync(text: str) -> PPLResponse:
    """/ppl: one shot, equivalent to tokenize_sync + ppl_from_tokens_sync"""
    _check_text(text)
    tokens = llm.tokenize(text.encode("utf-8"), special=True, add_bos=False)
    _check_tokens(tokens)
    offsets, pieces = token_offsets_and_pieces(text, tokens)

    nlls, ppls = _eval_nll(tokens)
    details = build_token_details(tokens, pieces, offsets, nlls, ppls)

    avg_nll = float(nlls.mean())
    avg_ppl = float(math.exp(min(avg_nll, 80.0)))
    return PPLResponse(
        average_ppl=avg_ppl,
        average_nll=avg_nll,
        token_count=len(tokens),
        char_count=len(text),
        token_details=details,
    )

# =============================================================================
#                                  API routes
# =============================================================================

@app.post("/ppl", response_model=PPLResponse)
async def get_ppl(req: PPLRequest):
    async with inference_lock:
        try:
            return await asyncio.to_thread(calculate_ppl_sync, req.text)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"internal server error: {str(e)}")

@app.post("/tokenize", response_model=TokenizeResponse)
async def tokenize_api(req: TokenizeRequest):
    async with inference_lock:
        try:
            return await asyncio.to_thread(tokenize_sync, req.text, req.add_bos, req.parse_special)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"internal server error: {str(e)}")

@app.post("/ppl_from_tokens", response_model=PPLResponse)
async def ppl_from_tokens_api(req: PPLTokensRequest):
    async with inference_lock:
        try:
            return await asyncio.to_thread(ppl_from_tokens_sync, req.tokens, req.text)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"internal server error: {str(e)}")

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "n_ctx": N_CTX,
        "max_char_count": MAX_CHAR_COUNT,
        "n_vocab": llm.n_vocab() if llm is not None else None,
        "nll_backend": f"torch/{_torch_device}" if _torch is not None else "numpy",
    }

# =============================================================================
#                                 Program entry
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")