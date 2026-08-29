# OpenGPTDetect PPL Analysis API

## Endpoints

| Method | Path | Function | Inference |
|---|---|---|---|
| POST | `/ppl` | text → tokens → PPL | yes |
| POST | `/tokenize` | text → token sequence | no |
| POST | `/ppl_from_tokens` | token sequence → PPL | yes |
| GET | `/health` | health check / config | no |

The two-step flow is exactly equivalent to `/ppl`:

```
POST /ppl {text: T}   ≡   POST /tokenize {text: T}  →  POST /ppl_from_tokens {tokens, text: T}
```

Both share identical tokenization params (`add_bos=false, parse_special=true`) and the same scoring/NLL code, so values match per-token, including offsets.

**Concurrency**: all requests run serially under a single global lock (a llama.cpp decode context cannot be reused concurrently); clients may fire concurrent requests, but they are queued — scale out with multiple service instances for throughput.

## Common Conventions

- Bodies are `application/json`, UTF-8.
- `char_start`/`char_end` are **Unicode code-point indices** (Python `str` indices), half-open `[start, end)` — not byte offsets.
- Errors: `400` business-parameter error, `422` Pydantic validation, `500` internal (e.g. inference failure). Body is always `{"detail": "<message>"}`.
- Field semantics: `nll[i] = -ln p(tok[i] | tok[0..i))`, `ppl = exp(nll)`, both clamped to `exp(80)` when `nll > 80`; `average_nll` = mean over `i ≥ 1`, `average_ppl = exp(average_nll)`; the token at index 0 always has `nll`/`ppl` = `null`; unalignable tokens (special tokens, byte-fallback bytes) get a zero-width range (`char_start == char_end`).

---

## POST `/ppl`

One shot: tokenizes the text and returns overall + per-token perplexity.

**Request**

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Non-empty, not all whitespace; `len ≤ max_char_count`; token count after tokenization must be within `[2, n_ctx]` |

**Example**

```bash
curl -X POST http://127.0.0.1:8000/ppl -H 'Content-Type: application/json' -d '{"text": "Hello, world!"}'
```

```json
{
  "average_ppl": 14.927070686778848,
  "average_nll": 2.7031763891379037,
  "token_count": 4,
  "char_count": 13,
  "token_details": [
    {"token_index": 0, "token_id": 9419, "token_text": "Hello",  "nll": null, "ppl": null, "char_start": 0,  "char_end": 5},
    {"token_index": 1, "token_id": 11,   "token_text": ",",      "nll": 1.0442713499069214, "ppl": 2.8413274356937013,  "char_start": 5,  "char_end": 6},
    {"token_index": 2, "token_id": 1814, "token_text": " world", "nll": 6.7092976570129395, "ppl": 819.9945197571183,   "char_start": 6,  "char_end": 12},
    {"token_index": 3, "token_id": 0,    "token_text": "!",      "nll": 0.3559601604938507, "ppl": 1.4275506742170716,  "char_start": 12, "char_end": 13}
  ]
}
```

**Errors (400)**: text empty or whitespace-only; text exceeds `max_char_count`; fewer than 2 tokens; more tokens than `n_ctx`.

---

## POST `/tokenize`

Tokenization only, no inference. The returned `tokens` feed directly into `/ppl_from_tokens`.

**Request**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` | string | yes | — | Same limits as `/ppl` |
| `add_bos` | bool | no | `false` | Prepend a BOS token. Requires the model to define a BOS id; the bundled `Qwen3.5-9B-Base` GGUF does **not** (metadata `add_bos_token=false`), so it has no effect on that model |
| `parse_special` | bool | no | `true` | Parse special-token literals (e.g. `<\|im_start\|>`) into token ids; `false` splits them as plain text |

**Example**

```bash
curl -X POST http://127.0.0.1:8000/tokenize -H 'Content-Type: application/json' -d '{"text": "Hello, world!", "add_bos": false, "parse_special": true}'
```

```json
{
  "tokens": [9419, 11, 1814, 0],
  "token_count": 4,
  "char_count": 13,
  "fits_ctx": true,
  "token_details": [
    {"token_index": 0, "token_id": 9419, "token_text": "Hello",  "nll": null, "ppl": null, "char_start": 0,  "char_end": 5},
    {"token_index": 1, "token_id": 11,   "token_text": ",",      "nll": null, "ppl": null, "char_start": 5,  "char_end": 6},
    {"token_index": 2, "token_id": 1814, "token_text": " world", "nll": null, "ppl": null, "char_start": 6,  "char_end": 12},
    {"token_index": 3, "token_id": 0,    "token_text": "!",      "nll": null, "ppl": null, "char_start": 12, "char_end": 13}
  ]
}
```

`token_details` here always has `nll`/`ppl` = `null`. This endpoint does **not** enforce the 2..`n_ctx` limits — it reports `fits_ctx` (`token_count ≤ n_ctx`) instead; the checks run in `/ppl_from_tokens`.

**Errors (400)**: text empty or whitespace-only; text exceeds `max_char_count`; tokenization produced no tokens.

---

## POST `/ppl_from_tokens`

Computes PPL for a given token-id sequence, skipping text tokenization.

**Request**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `tokens` | int[] | yes | — | Length within `[2, n_ctx]`; every id within `[0, n_vocab)` |
| `text` | string \| null | no | `null` | Used **only** for `char_start`/`char_end` + `char_count`; never affects nll/ppl values. Omit to align against the text re-detokenized from `tokens` |

The service does not verify that `text` and `tokens` correspond. If they don't, PPL values stay correct (they depend on `tokens` only) but offsets are best-effort.

**Example**

```bash
curl -X POST http://127.0.0.1:8000/ppl_from_tokens -H 'Content-Type: application/json' -d '{"tokens": [9419, 11, 1814, 0], "text": "Hello, world!"}'
```

```json
{
  "average_ppl": 14.927070686778848,
  "average_nll": 2.7031763891379037,
  "token_count": 4,
  "char_count": 13,
  "token_details": [
    {"token_index": 0, "token_id": 9419, "token_text": "Hello",  "nll": null, "ppl": null, "char_start": 0,  "char_end": 5},
    {"token_index": 1, "token_id": 11,   "token_text": ",",      "nll": 1.0442713499069214, "ppl": 2.8413274356937013,  "char_start": 5,  "char_end": 6},
    {"token_index": 2, "token_id": 1814, "token_text": " world", "nll": 6.7092976570129395, "ppl": 819.9945197571183,   "char_start": 6,  "char_end": 12},
    {"token_index": 3, "token_id": 0,    "token_text": "!",      "nll": 0.3559601604938507, "ppl": 1.4275506742170716,  "char_start": 12, "char_end": 13}
  ]
}
```

**Errors**: `400` — fewer than 2 tokens; more tokens than `n_ctx`; out-of-range token ids (message reports valid range and examples). `422` — `tokens` is not an integer array.

---

## GET `/health`

No parameters.

```bash
curl http://127.0.0.1:8000/health
```

```json
{
  "status": "ok",
  "model": "Qwen3.5-9B-Base",
  "n_ctx": 2048,
  "max_char_count": 4096,
  "n_vocab": 248320,
  "nll_backend": "torch/xpu"
}
```

| Field | Description |
|---|---|
| `status` | Always `ok` |
| `model` | Display name (`MODEL_NAME`) |
| `n_ctx` | Context window (hard token cap) |
| `max_char_count` | Character limit for the text endpoints |
| `n_vocab` | Vocabulary size (upper bound for valid ids; `null` before the model loads) |
| `nll_backend` | `torch/cuda`, `torch/xpu`, `torch/cpu` or `numpy` |

---

## Data Models

`/ppl` and `/ppl_from_tokens` return **PPLResponse**; `/tokenize` returns **TokenizeResponse**.

| Field | Type | Description |
|---|---|---|
| `average_ppl` | float | Overall perplexity, `exp(average_nll)` |
| `average_nll` | float | Mean negative log-likelihood (natural log, `i ≥ 1`) |
| `token_count` | int | Token count |
| `char_count` | int | Character count of the reference text |
| `token_details` | TokenDetail[] | Per-token details |

**TokenizeResponse** adds `tokens: int[]` and `fits_ctx: bool` (`token_count ≤ n_ctx`), and its `token_details` always have `nll`/`ppl` = `null`.

**TokenDetail**

| Field | Type | Description |
|---|---|---|
| `token_index` | int | 0-based position in the sequence |
| `token_id` | int | Token id |
| `token_text` | string | Independently decoded text (byte-fallback bytes may appear as `�`) |
| `nll` | float \| null | Negative log-likelihood; `null` when `token_index = 0` |
| `ppl` | float \| null | `exp(nll)`; `null` when `token_index = 0` |
| `char_start` | int \| null | Inclusive start in the reference text (code-point index) |
| `char_end` | int \| null | Exclusive end; equals `char_start` when alignment is impossible |

---

## Configuration

Read from environment variables or a `server/.env` file (`python-dotenv`); all optional except `MODEL_PATH`.

| Variable | Default | Description |
|---|---|---|
| `MODEL_PATH` | *required* | Path to the GGUF model file |
| `MODEL_NAME` | `Qwen3.5-9B-Base` | Display name (used by `/health` only) |
| `N_CTX` | `2048` | Max context length (hard token cap) |
| `MAX_CHAR_COUNT` | `2200` | Max characters for the text endpoints |
| `N_BATCH` / `N_UBATCH` | `1024` / `512` | llama.cpp logical / physical batch sizes |
| `FLASH_ATTN` | `False` | Enable Flash Attention |
| `NLL_CHUNK` | `128` | numpy NLL rows per chunk |
| `PPL_USE_TORCH` | `1` | `1` = PyTorch NLL (auto-picks cuda/xpu/cpu), `0` = numpy |
| `PORT` | `8000` | uvicorn listen port |

Run with `python llama.py` (reads `server/.env`); the service is ready once the log shows `Model loaded, service ready`.