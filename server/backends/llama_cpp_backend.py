"""llama.cpp backend: GPT-style scoring through llama-cpp-python.

NLL computation supports an optional PyTorch accelerator (auto-detects
cuda / xpu / cpu) and falls back to a chunked, numerically stable numpy
log-sum-exp implementation.
"""

from __future__ import annotations

from typing import Iterator, List, Optional

import numpy as np

from . import Backend, Capabilities


def _detect_torch(use_torch: bool):
    """Import torch if requested/available and pick a device.

    Returns (module, device_name); (None, None) => force numpy.
    """
    if not use_torch:
        return None, None
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            return torch, "cuda"
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            return torch, "xpu"
        return torch, "cpu"
    except Exception:
        return None, None


class LlamaCppBackend(Backend):
    id = "llamacpp"

    def __init__(self, *, model_path: Optional[str] = None, model_name: str = "Qwen3.5-9B-Base",
                 n_ctx: int = 2048, n_batch: int = 1024, n_ubatch: int = 512,
                 flash_attn: bool = False, nll_chunk: int = 128,
                 use_torch: bool = True, n_gpu_layers: int = -1) -> None:
        super().__init__()
        self._model_path = model_path
        self._model_name = model_name
        self._n_ctx = n_ctx
        self._n_batch = n_batch
        self._n_ubatch = n_ubatch
        self._flash_attn = flash_attn
        self._nll_chunk = nll_chunk
        self._n_gpu_layers = n_gpu_layers
        self._torch, self._torch_device = _detect_torch(use_torch)
        self._llm = None
        self._caps = Capabilities(max_input_tokens=n_ctx, supports_streaming=False)

    # ---- info ---------------------------------------------------------
    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def n_ctx(self) -> int:
        return self._n_ctx

    @property
    def n_vocab(self) -> int:
        return self._llm.n_vocab()

    @property
    def nll_backend(self) -> str:
        if self._torch is not None:
            return f"torch/{self._torch_device}"
        return "numpy"

    @property
    def capabilities(self) -> Capabilities:
        return self._caps

    # ---- lifecycle ----------------------------------------------------
    def load(self, model_path: Optional[str] = None, **kw) -> None:
        from llama_cpp import Llama

        path = model_path or self._model_path
        if not path:
            raise ValueError("MODEL_PATH is not set; cannot load the llama.cpp backend")
        if self._llm is not None:
            self._llm.close()
        self._llm = Llama(
            model_path=path,
            logits_all=True,          # PPL needs logits at every position
            n_ctx=self._n_ctx,
            n_batch=self._n_batch,
            n_ubatch=self._n_ubatch,
            n_gpu_layers=self._n_gpu_layers,
            flash_attn=self._flash_attn,
            verbose=False,
        )
        self._loaded = True

    def unload(self) -> None:
        if self._llm is not None:
            self._llm.close()
            self._llm = None
        self._loaded = False

    # ---- tokenization / decoding --------------------------------------
    def tokenize(self, text: str, *, add_bos: bool = False,
                 parse_special: bool = True) -> List[int]:
        return self._llm.tokenize(text.encode("utf-8"), special=parse_special,
                                  add_bos=add_bos)

    def detokenize(self, tokens: List[int]) -> str:
        return self._llm.detokenize(tokens).decode("utf-8", errors="replace")

    def token_texts(self, tokens: List[int]) -> List[str]:
        return [self._llm.detokenize([t]).decode("utf-8", errors="replace")
                for t in tokens]

    # ---- scoring ------------------------------------------------------
    def score_stream(self, tokens: List[int]) -> Iterator[float]:
        n = len(tokens)
        self._llm.reset()
        self._llm.eval(tokens)
        logits = self._llm.scores[: n - 1]          # logits[i] predicts token i+1
        targets = np.asarray(tokens[1:], dtype=np.int64)
        nlls = self._compute_nll(logits, targets)   # (n-1,) float64
        for v in nlls:
            yield float(v)

    def _compute_nll(self, logits: np.ndarray, targets: np.ndarray) -> np.ndarray:
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
        if self._torch is not None:
            dev = self._torch_device
            step = self._nll_chunk * 4
            for s in range(0, n, step):
                e = min(s + step, n)
                t = self._torch.from_numpy(np.ascontiguousarray(logits[s:e])).to(dev)
                lp = self._torch.log_softmax(t, dim=-1)
                tgt = self._torch.from_numpy(targets[s:e]).to(dev)
                nll = -lp[self._torch.arange(e - s, device=dev), tgt]
                out[s:e] = nll.to("cpu", dtype=self._torch.float64).numpy()
            return out

        # ---- Default: chunked numpy log-sum-exp (numerically stable) ----
        for s in range(0, n, self._nll_chunk):
            e = min(s + self._nll_chunk, n)
            x = logits[s:e]                                   # (c, V) view, zero copy
            m = x.max(axis=1, keepdims=True)
            z = x - m                                         # the only large temp array (c, V)
            z_tgt = z[np.arange(e - s), targets[s:e]]         # pull the target column first
            np.exp(z, out=z)
            lse = np.log(z.sum(axis=1, dtype=np.float64))
            out[s:e] = lse - z_tgt                            # m cancels on both sides
        return out


# register
from . import REGISTRY  # noqa: E402

REGISTRY["llamacpp"] = LlamaCppBackend