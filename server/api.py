#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Text Perplexity (PPL) lookup service (FastAPI), split into an API layer and
replaceable backends.

Endpoints:
    POST /ppl               text -> tokens -> PPL (one shot)
    POST /tokenize          text -> token sequence                [v3.1]
    POST /ppl_from_tokens   token sequence -> PPL                 [v3.1]
    POST /ppl_from_tokens/stream   token sequence -> PPL (SSE)    [new]
    GET  /health            health check / service info
    GET  /backends          list available backends + current state[new]
    POST /backends/{id}/load|unload       switch backend          [new]

All model work goes through a backend implementing the contract in
``backends/`` (default: llama.cpp). The two-step chain (/tokenize ->
/ppl_from_tokens) and the one-step endpoint (/ppl) produce identical results.

Run:  python api.py   (or: uvicorn api:app)
"""

import os
import math
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Optional, List, Tuple

import numpy as np

from fastapi import FastAPI, HTTPException   # noqa: E402
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel               # noqa: E402

from backends import Backend, REGISTRY, create, available          # noqa: E402

# Load configuration from a server/.env file, if present (env vars win).
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv is optional; env vars still work
    pass

# =============================================================================
#                          Configurable constants
# =============================================================================

BACKEND = os.getenv("BACKEND", "llamacpp")
# Future API-level sliding window switch (unused in this iteration): when on,
# the API layer chunks inputs beyond a backend's per-segment limit and
# resumes scoring with a recent-window prefix. Not implemented yet.
SLIDING_WINDOW = os.getenv("SLIDING_WINDOW", "0").lower() in ("true", "1", "yes")

MODEL_PATH = os.getenv("MODEL_PATH")
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen3.5-9B-Base")   # display name, only used by /health
N_CTX = int(os.getenv("N_CTX", "2048"))                # max context length (token hard cap)
MAX_CHAR_COUNT = int(os.getenv("MAX_CHAR_COUNT", "2200"))    # max chars for text endpoints
N_BATCH = int(os.getenv("N_BATCH", "1024"))            # logical batch (tokens decoded at once)
N_UBATCH = int(os.getenv("N_UBATCH", "512"))           # physical batch
FLASH_ATTN = os.getenv("FLASH_ATTN", "False").lower() in ("true", "1", "yes")
NLL_CHUNK = int(os.getenv("NLL_CHUNK", "128"))         # numpy NLL rows per chunk
USE_TORCH = os.getenv("PPL_USE_TORCH", "1") == "1"     # set to "0" to force numpy
PORT = int(os.getenv("PORT", "8000"))                  # uvicorn listen port

# =============================================================================
#                     FastAPI app and global state
# =============================================================================

current_backend: Optional[Backend] = None
inference_lock = asyncio.Lock()


def _build_backend(backend_id: str, *, model_path: Optional[str] = None) -> Backend:
    """Construct (not load) a backend instance for the given id.

    model_path only applies to model-based backends and overrides MODEL_PATH.
    """
    if backend_id not in REGISTRY:
        raise ValueError(f"unknown backend: {backend_id}")
    if backend_id == "llamacpp":
        path = model_path or MODEL_PATH
        if not path:
            raise ValueError(
                "MODEL_PATH is not set. Copy server/.env.example to server/.env and fill in "
                "the path to a GGUF model file, or set the MODEL_PATH environment variable."
            )
        return create(backend_id, model_path=path, model_name=MODEL_NAME, n_ctx=N_CTX,
                      n_batch=N_BATCH, n_ubatch=N_UBATCH, flash_attn=FLASH_ATTN,
                      nll_chunk=NLL_CHUNK, use_torch=USE_TORCH, n_gpu_layers=-1)
    if backend_id == "mock":
        return create("mock", model_name=f"{MODEL_NAME} (mock)")
    raise ValueError(f"no configuration for backend: {backend_id}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global current_backend
    try:
        current_backend = _build_backend(BACKEND)
    except ValueError as e:
        raise RuntimeError(str(e)) from e
    try:
        await asyncio.to_thread(current_backend.load)
    except Exception as e:
        raise RuntimeError(f"backend '{BACKEND}' failed to load: {e}") from e
    print(f"Backend '{current_backend.id}' loaded, service ready")
    yield
    try:
        await asyncio.to_thread(current_backend.unload)
    except Exception:
        pass
    current_backend = None


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

class BackendLoadRequest(BaseModel):
    model_path: Optional[str] = None               # optional override for model-based backends

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
    fits_ctx: bool                  # token_count <= backend limit, safe to feed into /ppl_from_tokens
    token_details: List[TokenDetail]   # nll/ppl are always null in this endpoint

class PPLResponse(BaseModel):
    average_ppl: float
    average_nll: float
    token_count: int
    char_count: int
    token_details: List[TokenDetail]

# =============================================================================
#              Character offset alignment (O(n), replaces old O(n^2))
# =============================================================================

def token_offsets_and_pieces(text: str, backend: Backend,
                             tokens: List[int]) -> Tuple[List[Tuple[int, int]], List[str]]:
    pieces = backend.token_texts(tokens)
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

class BackendNotLoadedError(Exception):
    pass


def _require_loaded(backend: Optional[Backend]) -> None:
    if backend is None or not backend.loaded:
        raise BackendNotLoadedError()


def _check_text(text: str) -> None:
    if not text or not text.strip():
        raise ValueError("text cannot be empty")
    if len(text) > MAX_CHAR_COUNT:
        raise ValueError(f"text too long; current limit is {MAX_CHAR_COUNT} chars, please shorten it")


def _check_tokens(tokens: List[int], backend: Backend) -> None:
    n = len(tokens)
    if n < 2:
        raise ValueError("need at least 2 tokens to compute PPL with a causal language model")
    limit = backend.capabilities.max_input_tokens
    if limit is not None and n > limit:
        raise ValueError(f"token count ({n}) exceeds the context window N_CTX={limit}; "
                         f"shorten the input or raise N_CTX")
    vocab = backend.n_vocab
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


def _score(backend: Backend, tokens: List[int]) -> Tuple[np.ndarray, np.ndarray]:
    """Score a whole token sequence: (nlls, ppls), length len(tokens) - 1."""
    nlls = np.asarray(backend.score(tokens), dtype=np.float64)
    ppls = np.exp(np.minimum(nlls, 80.0))
    return nlls, ppls

# =============================================================================
#                       Synchronous cores for the three routes
# =============================================================================

def tokenize_sync(backend: Backend, text: str, add_bos: bool = False,
                  parse_special: bool = True) -> TokenizeResponse:
    """/tokenize: text -> token sequence (no model eval, very cheap)"""
    _require_loaded(backend)
    _check_text(text)
    tokens = backend.tokenize(text, add_bos=add_bos, parse_special=parse_special)
    if not tokens:
        raise ValueError("tokenization produced no tokens, cannot proceed")
    offsets, pieces = token_offsets_and_pieces(text, backend, tokens)
    limit = backend.capabilities.max_input_tokens
    return TokenizeResponse(
        tokens=tokens,
        token_count=len(tokens),
        char_count=len(text),
        fits_ctx=(limit is None or len(tokens) <= limit),
        token_details=build_token_details(tokens, pieces, offsets),
    )


def ppl_from_tokens_sync(backend: Backend, tokens: List[int],
                         text: Optional[str] = None) -> PPLResponse:
    """/ppl_from_tokens: token sequence -> PPL"""
    _require_loaded(backend)
    _check_tokens(tokens, backend)

    # Reference text for offset alignment: prefer the caller-provided original,
    # otherwise use the detokenized form of the tokens themselves.
    if text is not None:
        align_text = text
    else:
        align_text = backend.detokenize(tokens)
    offsets, pieces = token_offsets_and_pieces(align_text, backend, tokens)

    nlls, ppls = _score(backend, tokens)
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


def calculate_ppl_sync(backend: Backend, text: str) -> PPLResponse:
    """/ppl: one shot, equivalent to tokenize_sync + ppl_from_tokens_sync"""
    _require_loaded(backend)
    _check_text(text)
    tokens = backend.tokenize(text, add_bos=False, parse_special=True)
    _check_tokens(tokens, backend)
    offsets, pieces = token_offsets_and_pieces(text, backend, tokens)

    nlls, ppls = _score(backend, tokens)
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
            return await asyncio.to_thread(calculate_ppl_sync, current_backend, req.text)
        except BackendNotLoadedError:
            raise HTTPException(status_code=503, detail="backend not loaded")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"internal server error: {str(e)}")


@app.post("/tokenize", response_model=TokenizeResponse)
async def tokenize_api(req: TokenizeRequest):
    async with inference_lock:
        try:
            return await asyncio.to_thread(tokenize_sync, current_backend,
                                           req.text, req.add_bos, req.parse_special)
        except BackendNotLoadedError:
            raise HTTPException(status_code=503, detail="backend not loaded")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"internal server error: {str(e)}")


@app.post("/ppl_from_tokens", response_model=PPLResponse)
async def ppl_from_tokens_api(req: PPLTokensRequest):
    async with inference_lock:
        try:
            return await asyncio.to_thread(ppl_from_tokens_sync, current_backend,
                                           req.tokens, req.text)
        except BackendNotLoadedError:
            raise HTTPException(status_code=503, detail="backend not loaded")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"internal server error: {str(e)}")


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/ppl_from_tokens/stream")
async def ppl_from_tokens_stream(req: PPLTokensRequest):
    """SSE streaming of per-token nll/ppl, then a final summary event.

    Values are identical to /ppl_from_tokens. If the backend declares
    supports_streaming, score_stream() drives the events incrementally;
    otherwise the batch score is computed once and replayed as events.
    The inference lock is held for the whole stream.
    """

    async def event_stream():
        async with inference_lock:
            b = current_backend
            try:
                _require_loaded(b)
                tokens = req.tokens
                _check_tokens(tokens, b)
                n = len(tokens)

                if req.text is not None:
                    align_text = req.text
                else:
                    align_text = await asyncio.to_thread(b.detokenize, tokens)
                offsets, pieces = await asyncio.to_thread(
                    token_offsets_and_pieces, align_text, b, tokens)

                if b.capabilities.supports_streaming:
                    it = b.score_stream(tokens)

                    def pull():
                        try:
                            return next(it)
                        except StopIteration:
                            return None

                    yield _sse({"token_index": 0, "token_id": tokens[0],
                                "token_text": pieces[0], "nll": None, "ppl": None,
                                "char_start": offsets[0][0], "char_end": offsets[0][1]})
                    nlls = []
                    for i in range(1, n):
                        v = await asyncio.to_thread(pull)
                        if v is None:
                            break
                        nlls.append(v)
                        yield _sse({"token_index": i, "token_id": tokens[i],
                                    "token_text": pieces[i], "nll": float(v),
                                    "ppl": math.exp(min(float(v), 80.0)),
                                    "char_start": offsets[i][0], "char_end": offsets[i][1]})
                else:
                    nlls = await asyncio.to_thread(b.score, tokens)
                    yield _sse({"token_index": 0, "token_id": tokens[0],
                                "token_text": pieces[0], "nll": None, "ppl": None,
                                "char_start": offsets[0][0], "char_end": offsets[0][1]})
                    for i in range(1, n):
                        v = nlls[i - 1]
                        yield _sse({"token_index": i, "token_id": tokens[i],
                                    "token_text": pieces[i], "nll": float(v),
                                    "ppl": math.exp(min(float(v), 80.0)),
                                    "char_start": offsets[i][0], "char_end": offsets[i][1]})

                avg_nll = float(np.mean(nlls)) if nlls else 0.0
                avg_ppl = math.exp(min(avg_nll, 80.0))
                yield _sse({"average_nll": avg_nll, "average_ppl": avg_ppl,
                            "token_count": n, "char_count": len(align_text)})
            except BackendNotLoadedError:
                yield _sse({"detail": "backend not loaded"})
            except ValueError as e:
                yield _sse({"detail": str(e)})
            except Exception as e:
                yield _sse({"detail": f"internal server error: {str(e)}"})

    return StreamingResponse(event_stream(), media_type="text/event-stream; charset=utf-8")


@app.get("/backends")
async def list_backends():
    b = current_backend
    return {
        "available": available(),
        "current": b.id if b else None,
        "loaded": b.loaded if b else False,
        "model": b.model_name if (b is not None and b.loaded) else None,
    }


@app.post("/backends/{backend_id}/load")
async def load_backend(backend_id: str, body: BackendLoadRequest):
    global current_backend
    async with inference_lock:
        if backend_id not in REGISTRY:
            raise HTTPException(status_code=404, detail=f"unknown backend: {backend_id}")
        try:
            b = _build_backend(backend_id, model_path=body.model_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        try:
            await asyncio.to_thread(b.load)
        except NotImplementedError:
            raise HTTPException(status_code=501,
                                detail=f"backend '{backend_id}' does not support loading")
        except Exception as e:
            raise HTTPException(status_code=500,
                                detail=f"failed to load backend '{backend_id}': {str(e)}")
        current_backend = b
        return {"backend": b.id, "model": b.model_name, "loaded": True}


@app.post("/backends/{backend_id}/unload")
async def unload_backend(backend_id: str):
    async with inference_lock:
        b = current_backend
        if b is None or b.id != backend_id:
            raise HTTPException(status_code=404, detail=f"backend '{backend_id}' is not loaded")
        if not b.capabilities.supports_unload:
            raise HTTPException(status_code=501,
                                detail=f"backend '{backend_id}' declares it does not support unloading")
        try:
            await asyncio.to_thread(b.unload)
        except NotImplementedError:
            raise HTTPException(status_code=501,
                                detail=f"backend '{backend_id}' does not support unloading")
        return {"backend": backend_id, "loaded": False}


@app.get("/health")
async def health_check():
    b = current_backend
    loaded = bool(b is not None and b.loaded)
    return {
        "status": "ok",
        "model": b.model_name if loaded else None,
        "n_ctx": b.n_ctx if b is not None else None,
        "max_char_count": MAX_CHAR_COUNT,
        "n_vocab": b.n_vocab if loaded else None,
        "nll_backend": b.nll_backend if loaded else None,
        "backend": b.id if b is not None else None,
        "loaded": loaded,
        "max_input_tokens": b.capabilities.max_input_tokens if b is not None else None,
    }

# =============================================================================
#                                 Program entry
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")