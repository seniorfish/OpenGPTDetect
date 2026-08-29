"""Backend contract for the PPL service.

The contract is intentionally minimal: a backend implements text <-> token
conversion plus a streaming scorer. ``Backend.score()`` is derived from
``score_stream()`` by default, because streaming is the more general primitive
(a full result is just a fully consumed stream; the reverse does not hold).
A backend only has to implement ``score_stream`` to be fully functional, and
may override ``score`` for a faster whole-batch path.

Optional capabilities are declared via the frozen :class:`Capabilities` record
rather than by padding the API with extra abstract methods.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterator, List, Optional


@dataclass(frozen=True)
class Capabilities:
    #: Max token length one call can evaluate (e.g. llama.cpp n_ctx).
    #: None => no API-level upper check; chunking is the API layer's job
    #: (future sliding window), not the backend's.
    max_input_tokens: Optional[int]
    #: Whether score_stream can genuinely produce results incrementally.
    supports_streaming: bool = False
    #: Whether an unload() is possible for this backend type.
    supports_unload: bool = True


class Backend(ABC):
    def __init__(self) -> None:
        self._loaded = False

    # ---- info ---------------------------------------------------------
    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    @abstractmethod
    def id(self) -> str:
        """Stable backend id, e.g. 'llamacpp' / 'mock'."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Display name for /health."""

    @property
    @abstractmethod
    def n_ctx(self) -> Optional[int]:
        """Per-segment context length (informational / window reference)."""

    @property
    @abstractmethod
    def n_vocab(self) -> int:
        """Vocabulary size; upper bound for valid token ids."""

    @property
    @abstractmethod
    def nll_backend(self) -> str:
        """NLL computation label for /health, e.g. 'numpy'/'torch/xpu'/'mock'."""

    @property
    @abstractmethod
    def capabilities(self) -> Capabilities:
        ...

    # ---- lifecycle ----------------------------------------------------
    @abstractmethod
    def load(self, model_path: Optional[str] = None, **kw) -> None:
        """Make the backend ready. Idempotent; reload if called again."""
        raise NotImplementedError

    @abstractmethod
    def unload(self) -> None:
        """Free resources. Raise NotImplementedError if not supported."""
        raise NotImplementedError

    # ---- tokenization / decoding (pure text, no model inference) -----
    @abstractmethod
    def tokenize(self, text: str, *, add_bos: bool = False,
                 parse_special: bool = True) -> List[int]:
        ...

    @abstractmethod
    def detokenize(self, tokens: List[int]) -> str:
        ...

    @abstractmethod
    def token_texts(self, tokens: List[int]) -> List[str]:
        """Per-token independent decode, used for char-offset alignment."""

    # ---- scoring (core contract) --------------------------------------
    @abstractmethod
    def score_stream(self, tokens: List[int]) -> Iterator[float]:
        """Yield len(tokens) - 1 values where s[i] = -ln p(tokens[i+1] | tokens[0..i]).

        Natural log. Input length is bounded by the backend
        (<= capabilities.max_input_tokens); chunking longer inputs is the API
        layer's responsibility. The token at index 0 has no prefix and is
        filled as null by the API layer. Streaming granularity (per token /
        per chunk) is the backend's choice, but values must be emitted lazily
        in whole-token units; the API layer converts an exception mid-stream
        into an SSE error event rather than letting the stream truncate.
        Backends that cannot stream incrementally may compute everything first
        and then yield in segments.
        """
        raise NotImplementedError

    def score(self, tokens: List[int]) -> List[float]:
        """Whole-batch nll; default = fully consume score_stream()."""
        return list(self.score_stream(tokens))


# Registry is filled by importing the concrete backends below.
REGISTRY: dict[str, type[Backend]] = {}


def create(backend_id: str, **cfg) -> Backend:
    try:
        cls = REGISTRY[backend_id]
    except KeyError:
        raise ValueError(f"unknown backend: {backend_id}") from None
    return cls(**cfg)


def available() -> List[str]:
    return list(REGISTRY)


# Importing the concrete backends registers them into REGISTRY.
from . import llama_cpp_backend as _llama_cpp_backend  # noqa: E402, F401
from . import mock_backend as _mock_backend  # noqa: E402, F401