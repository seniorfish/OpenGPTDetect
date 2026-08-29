"""Deterministic in-memory backend for frontend development and API tests.

No model is required. Tokenization maps every Unicode code point to its own
token id (= ord), so Chinese text stays readable and char-offset alignment is
exact. Scoring emits a stable pseudo-NLL (hash-derived, 0..5 range) that is
cheap, repeatable, and independent of any LLM.

max_input_tokens is None: demonstrates that the API layer applies no length
cap, which is the seam a future API-level sliding window would use.
"""

from __future__ import annotations

from typing import Iterator, List, Optional

from . import Backend, Capabilities


def _pseudo_nll(tid: int, prev: int) -> float:
    # Deterministic "surprise": hash of the pair, stretched over [0, 5).
    x = (tid * 31 + prev * 17 + 97) % 100000
    return ((x % 1000) / 1000.0) * 5.0 + (1.0 if tid == prev else 0.0)


class MockBackend(Backend):
    # UNICODE max code point is the upper bound for token ids (ord-based).
    id = "mock"
    _VOCAB = 0x110000

    def __init__(self, *, model_name: str = "mock") -> None:
        super().__init__()
        self._model_name = model_name
        self._caps = Capabilities(max_input_tokens=None, supports_streaming=False)

    # ---- info ---------------------------------------------------------
    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def n_ctx(self) -> Optional[int]:
        return None  # no window; score_stream accepts any length

    @property
    def n_vocab(self) -> int:
        return self._VOCAB

    @property
    def nll_backend(self) -> str:
        return "mock"

    @property
    def capabilities(self) -> Capabilities:
        return self._caps

    # ---- lifecycle ----------------------------------------------------
    def load(self, model_path: Optional[str] = None, **kw) -> None:
        self._loaded = True

    def unload(self) -> None:
        self._loaded = False

    # ---- tokenization / decoding --------------------------------------
    def tokenize(self, text: str, *, add_bos: bool = False,
                 parse_special: bool = True) -> List[int]:
        toks = [ord(ch) for ch in text]
        if add_bos:
            toks = [0] + toks  # 0 = BOS, decoded as empty text below
        return toks

    def detokenize(self, tokens: List[int]) -> str:
        return "".join("" if t == 0 else chr(t) for t in tokens if 0 < t < self._VOCAB)

    def token_texts(self, tokens: List[int]) -> List[str]:
        return ["" if t == 0 else chr(t) for t in tokens]

    # ---- scoring ------------------------------------------------------
    def score_stream(self, tokens: List[int]) -> Iterator[float]:
        prev: int = 0
        for t in tokens[1:]:
            yield _pseudo_nll(t, prev)
            prev = t


# register
from . import REGISTRY  # noqa: E402

REGISTRY["mock"] = MockBackend