# Text Perplexity (PPL) Analysis Service — API Documentation

A local LLM perplexity computation service built on **FastAPI + llama.cpp**.

| Item | Value |
|---|---|
| Default address | `http://127.0.0.1:8000` |
| API version | 3.1.0 |
| Interactive docs (Swagger) | `http://127.0.0.1:8000/docs` |
| OpenAPI spec | `http://127.0.0.1:8000/openapi.json` |

---

## Table of Contents

- [Text Perplexity (PPL) Analysis Service — API Documentation](#text-perplexity-ppl-analysis-service--api-documentation)
  - [Table of Contents](#table-of-contents)
  - [1. Overview](#1-overview)
  - [2. Quick Start](#2-quick-start)
    - [2.1 Dependencies](#21-dependencies)
    - [2.2 Configuration](#22-configuration)
    - [2.3 Running the Service](#23-running-the-service)
  - [3. Conventions](#3-conventions)
    - [3.1 Request & Response Format](#31-request--response-format)
    - [3.2 Error Responses](#32-error-responses)
    - [3.3 Concurrency Model](#33-concurrency-model)
    - [3.4 Field Semantics](#34-field-semantics)
  - [4. Endpoint Details](#4-endpoint-details)
    - [4.1 POST `/ppl` (one shot: text → PPL)](#41-post-ppl-one-shot-text--ppl)
    - [4.2 POST `/tokenize` (text → token sequence)](#42-post-tokenizetext--token-sequence)
    - [4.3 POST `/ppl_from_tokens` (token sequence → PPL)](#43-post-ppl_from_tokens-token-sequence--ppl)
    - [4.4 GET `/health` (health check)](#44-get-healthhealth-check)
  - [5. Data Models](#5-data-models)
    - [PPLResponse (`/ppl`, `/ppl_from_tokens`)](#pplresponse-ppl-ppl_from_tokens)
    - [TokenDetail](#tokendetail)
  - [6. Complete Examples](#6-complete-examples)
    - [6.1 Python (requests)](#61-python-requests)
    - [6.2 JavaScript (fetch)](#62-javascript-fetch)
  - [7. Notes & FAQ](#7-notes--faq)

---

## 1. Overview

| Method | Path | Function | Model inference cost |
|---|---|---|---|
| POST | `/ppl` | One shot: text → tokenization → PPL | Yes |
| POST | `/tokenize` | Text → token sequence (ids, text pieces, char offsets) | No (tokenization only) |
| POST | `/ppl_from_tokens` | Token sequence → PPL | Yes |
| GET | `/health` | Health check / service configuration info | No |

**Equivalence of the two-step and one-step flows** (results are exactly identical):

```
POST /ppl {"text": T}
        ≡
POST /tokenize {"text": T}  →  take the `tokens` from the response
POST /ppl_from_tokens {"tokens": tokens, "text": T}
```

Flexibility the two-step flow unlocks:

- Tokenization results can be **cached and reused** — re-scoring the same token sequence does not require resending the text;
- Token sequences can be **hand-built or edited** before scoring (e.g. add a BOS, prepend context, mask out some tokens);
- Tokenization can be inspected on its own (token boundaries, char offsets) for debugging and visualization.

---

## 2. Quick Start

### 2.1 Dependencies

```bash
pip install fastapi uvicorn "pydantic>=1.10" numpy llama-cpp-python python-dotenv
# Optional (accelerates NLL computation; falls back to numpy when absent):
pip install torch
```

### 2.2 Configuration

Environment variables (all optional; every one has a default except `MODEL_PATH`):

| Variable | Default | Description |
|---|---|---|
| `MODEL_PATH` | none (required) | Path to the GGUF model file |
| `MODEL_NAME` | `Qwen3.5-9B-Base` | Model display name (used by `/health` only) |
| `N_CTX` | `2048` | Maximum context length (hard token cap) |
| `MAX_CHAR_COUNT` | `2200` | Maximum character count for the text endpoints |
| `N_BATCH` / `N_UBATCH` | `1024` / `512` | llama.cpp logical / physical batch sizes |
| `FLASH_ATTN` | `False` | Whether to enable Flash Attention |
| `NLL_CHUNK` | `128` | Chunk size (rows) for the numpy NLL computation |
| `PPL_USE_TORCH` | `1` | `1` computes NLL with PyTorch (auto-selects cuda/xpu/cpu), `0` forces numpy |
| `PORT` | `8000` | uvicorn listen port |

How to configure: copy `server/.env.example` to `server/.env` and edit it, or set environment variables with the same names directly.

### 2.3 Running the Service

```bash
python llama.py
# or
uvicorn llama:app --host 127.0.0.1 --port 8000
```

The service is ready once the log shows `Model loaded, service ready`.

---

## 3. Conventions

### 3.1 Request & Response Format

- Request bodies: `application/json`, UTF-8 encoded;
- Response bodies: JSON;
- Character offsets (`char_start` / `char_end`) are **Python string indices (Unicode code points)**, half-open `[start, end)`, **not byte offsets** (C / Go / other callers must watch out for multi-byte characters).

### 3.2 Error Responses

| Status | Meaning | When it occurs |
|---|---|---|
| 400 | Business parameter error | Text empty / too long, token count < 2, token count > N_CTX, out-of-range token id |
| 422 | Malformed request body | Missing field, wrong type (FastAPI/Pydantic validation) |
| 500 | Internal error | Unexpected errors such as model inference failures |

Error response body:

```json
{ "detail": "Token count (2500) exceeds the context window N_CTX=2048; shorten the input or raise N_CTX." }
```

### 3.3 Concurrency Model

The service holds a single global async lock (`inference_lock`); **all requests are executed serially** (a llama.cpp decoding context cannot be reused concurrently). Clients may fire concurrent requests, but they will be queued; scale out horizontally with multiple service instances for more throughput.

### 3.4 Field Semantics

- **nll** (Negative Log-Likelihood): `nll[i] = -ln p(token[i] | token[0..i-1])`, natural log;
- **ppl**: `ppl[i] = exp(nll[i])`; to prevent overflow, values above `nll > 80` are clamped to `exp(80)`;
- **average_nll**: arithmetic mean of all `nll[i]` (i ≥ 1);
- **average_ppl**: `exp(average_nll)`, equivalent to the **geometric mean** of per-token ppl, also clamped to `exp(80)`;
- The token at `token_index = 0` has no conditional probability, so its `nll` / `ppl` are always `null`;
- Tokens that cannot be aligned to the text (e.g. special tokens, byte-fallback bytes) have `char_start == char_end`, i.e. a zero-width range.

---

## 4. Endpoint Details

### 4.1 POST `/ppl` (one shot: text → PPL)

Tokenizes the input text automatically and computes the overall as well as per-token perplexity.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Text to analyze. Non-empty and not all whitespace; length ≤ `MAX_CHAR_COUNT` (default 2200) chars; token count after tokenization must be within [2, N_CTX] |

**Response body**: `PPLResponse`, see [Data Models](#5-data-models).

**Example**

```bash
curl -X POST "http://127.0.0.1:8000/ppl" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!"}'
```

```json
{
  "average_ppl": 19.88,
  "average_nll": 2.9898,
  "token_count": 4,
  "char_count": 13,
  "token_details": [
    {"token_index": 0, "token_id": 9707, "token_text": "Hello",  "nll": null,   "ppl": null,   "char_start": 0,  "char_end": 5},
    {"token_index": 1, "token_id": 11,   "token_text": ",",      "nll": 4.6531, "ppl": 104.92, "char_start": 5,  "char_end": 6},
    {"token_index": 2, "token_id": 1879, "token_text": " world", "nll": 3.2178, "ppl": 25.0,   "char_start": 6,  "char_end": 12},
    {"token_index": 3, "token_id": 0,    "token_text": "!",      "nll": 1.0986, "ppl": 3.0,    "char_start": 12, "char_end": 13}
  ]
}
```

> Note: all token ids and values in this document are illustrative; the actual response depends on the loaded model.

**Possible 400 errors**: text empty; text exceeds `MAX_CHAR_COUNT`; fewer than 2 tokens; more tokens than `N_CTX`.

---

### 4.2 POST `/tokenize` (text → token sequence)

Tokenization only, **no model inference**, very cheap. The returned `tokens` array can be fed directly to `/ppl_from_tokens`.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` | string | yes | — | Text to tokenize; same limits as `/ppl` |
| `add_bos` | bool | no | `false` | Whether to prepend a BOS token. `/ppl` internally always uses `false`; for a “PPL with BOS”, set this to `true` and then call `/ppl_from_tokens` |
| `parse_special` | bool | no | `true` | Whether to parse special-token literals (e.g. `<\|im_start\|>`) into the corresponding token ids. `false` splits them as ordinary text |

**Response body** `TokenizeResponse`

| Field | Type | Description |
|---|---|---|
| `tokens` | int[] | Token id sequence; can be passed directly to `/ppl_from_tokens` |
| `token_count` | int | Number of tokens |
| `char_count` | int | Character count of the input text |
| `fits_ctx` | bool | `token_count ≤ N_CTX`. Only safe to feed into `/ppl_from_tokens` when `true` |
| `token_details` | TokenDetail[] | Per-token details; **`nll` / `ppl` are always `null` in this endpoint** |

**Example**

```bash
curl -X POST "http://127.0.0.1:8000/tokenize" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "add_bos": false, "parse_special": true}'
```

```json
{
  "tokens": [9707, 11, 1879, 0],
  "token_count": 4,
  "char_count": 13,
  "fits_ctx": true,
  "token_details": [
    {"token_index": 0, "token_id": 9707, "token_text": "Hello",  "nll": null, "ppl": null, "char_start": 0,  "char_end": 5},
    {"token_index": 1, "token_id": 11,   "token_text": ",",      "nll": null, "ppl": null, "char_start": 5,  "char_end": 6},
    {"token_index": 2, "token_id": 1879, "token_text": " world", "nll": null, "ppl": null, "char_start": 6,  "char_end": 12},
    {"token_index": 3, "token_id": 0,    "token_text": "!",      "nll": null, "ppl": null, "char_start": 12, "char_end": 13}
  ]
}
```

**Possible 400 errors**: text empty; text exceeds `MAX_CHAR_COUNT`; tokenization produced no tokens.

> Note: this endpoint does **not** validate that the token count is ≥ 2 or ≤ `N_CTX` (it reports `fits_ctx` instead), because tokenization itself is not subject to those limits; the checks run inside `/ppl_from_tokens`.

---

### 4.3 POST `/ppl_from_tokens` (token sequence → PPL)

Computes perplexity directly for a given token id sequence, skipping text tokenization.

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `tokens` | int[] | yes | — | Token id sequence; length must be within [2, N_CTX]; every id must be within `[0, n_vocab)` |
| `text` | string \| null | no | `null` | Original text. Used **only** to compute the `char_start`/`char_end` offsets and `char_count`; it does not affect any nll/ppl values. When omitted, alignment uses the text re-detokenized from `tokens` |

**Response body**: `PPLResponse`, identical in structure to `/ppl`.

**Example**

```bash
curl -X POST "http://127.0.0.1:8000/ppl_from_tokens" \
  -H "Content-Type: application/json" \
  -d '{"tokens": [9707, 11, 1879, 0], "text": "Hello, world!"}'
```

Response example is the same as in 4.1.

**Possible 400 errors**:

- `tokens` length < 2;
- `tokens` length > `N_CTX`;
- out-of-range token ids (the error reports the valid range and examples);
- 422: `tokens` is not an integer array.

> The service does **not** verify that `text` and `tokens` actually correspond. If they do not, the PPL values remain correct (they depend only on `tokens`), but the char offsets are aligned via forward search as best effort and may be inaccurate.

---

### 4.4 GET `/health` (health check)

No request parameters.

```bash
curl "http://127.0.0.1:8000/health"
```

```json
{
  "status": "ok",
  "model": "Qwen3.5-9B-Base",
  "n_ctx": 2048,
  "max_char_count": 2200,
  "n_vocab": 151936,
  "nll_backend": "torch/cpu"
}
```

| Field | Description |
|---|---|
| `status` | Always `ok` |
| `model` | Display name configured via `MODEL_NAME` |
| `n_ctx` | Context window (hard token cap) |
| `max_char_count` | Character limit for text endpoints |
| `n_vocab` | Model vocabulary size (upper bound for valid token ids; `null` before the model loads) |
| `nll_backend` | NLL computation backend: `torch/cuda`, `torch/xpu`, `torch/cpu` or `numpy` |

---

## 5. Data Models

### PPLResponse (`/ppl`, `/ppl_from_tokens`)

| Field | Type | Description |
|---|---|---|
| `average_ppl` | float | Overall perplexity, `exp(average_nll)` |
| `average_nll` | float | Average negative log-likelihood (natural log) |
| `token_count` | int | Total token count |
| `char_count` | int | Character count of the reference text (see each endpoint) |
| `token_details` | TokenDetail[] | Per-token details |

### TokenDetail

| Field | Type | Description |
|---|---|---|
| `token_index` | int | Position of the token in the sequence (0-based) |
| `token_id` | int | Token id |
| `token_text` | string | Text of the token decoded independently (byte-fallback bytes may show the replacement char `�`) |
| `nll` | float \| null | Negative log-likelihood of this token; `null` when `token_index = 0` |
| `ppl` | float \| null | Perplexity of this token, `exp(nll)`; `null` when `token_index = 0` |
| `char_start` | int \| null | Start index (inclusive) in the reference text, Unicode code point index |
| `char_end` | int \| null | End index (exclusive); equals `char_start` (zero-width range) when alignment is impossible |

---

## 6. Complete Examples

### 6.1 Python (requests)

```python
import requests

BASE = "http://127.0.0.1:8000"
text = "人工智能正在改变世界。"

# ---- Way 1: one shot ----
r = requests.post(f"{BASE}/ppl", json={"text": text}, timeout=120)
r.raise_for_status()
data = r.json()
print(f"[one-shot] PPL = {data['average_ppl']:.4f}, tokens = {data['token_count']}")

# ---- Way 2: two steps (results are exactly identical) ----
tok = requests.post(f"{BASE}/tokenize", json={"text": text}, timeout=30).json()
assert tok["fits_ctx"], f"token count {tok['token_count']} exceeds the context window"

res = requests.post(
    f"{BASE}/ppl_from_tokens",
    json={"tokens": tok["tokens"], "text": text},
    timeout=120,
).json()
print(f"[two-step] PPL = {res['average_ppl']:.4f}")

# ---- Advanced: prepend a BOS manually, then compute PPL ----
tok_bos = requests.post(
    f"{BASE}/tokenize", json={"text": text, "add_bos": True}, timeout=30
).json()
res_bos = requests.post(
    f"{BASE}/ppl_from_tokens", json={"tokens": tok_bos["tokens"]}, timeout=120
).json()
print(f"[with BOS] PPL = {res_bos['average_ppl']:.4f}")

# ---- Highlight the top-3 tokens with the highest perplexity ----
scored = [t for t in res["token_details"] if t["nll"] is not None]
for t in sorted(scored, key=lambda x: -x["nll"])[:3]:
    print(f"  {t['token_text']!r:>12}  nll={t['nll']:.3f}  ppl={t['ppl']:.1f}")
```

### 6.2 JavaScript (fetch)

```javascript
const BASE = "http://127.0.0.1:8000";

const tok = await fetch(`${BASE}/tokenize`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "人工智能正在改变世界。" }),
}).then(r => r.json());

const ppl = await fetch(`${BASE}/ppl_from_tokens`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tokens: tok.tokens, text: "人工智能正在改变世界。" }),
}).then(r => r.json());

console.log("PPL =", ppl.average_ppl);
```

---

## 7. Notes & FAQ

**Q1: Are the two-step flow and `/ppl` really identical?**
Yes. Both share the exact same tokenization parameters (`/ppl` always uses `add_bos=false, parse_special=true`, the `/tokenize` defaults), the same scoring function, and the same NLL code. Feeding the `tokens` returned by `/tokenize` into `/ppl_from_tokens` unchanged yields identical values, including per-token nll/ppl.

**Q2: Why does the first token have no nll/ppl?**
A causal language model computes `p(token[i] | previous tokens)`; the first token has no "previous", so it has no conditional probability.

**Q3: What does `char_start == char_end` (zero-width range) mean?**
The token cannot be mapped back to a concrete position in the text, commonly: special tokens (e.g. BOS) and UTF-8 bytes split by byte fallback. The offset is the best estimate of the alignment position.

**Q4: Are char offsets byte indices?**
No. They are Unicode code point indices (Python `str` indices). A single CJK character and a single emoji each count as 1.

**Q5: Can I send token ids produced by someone else's tokenizer?**
They will be scored as long as each id falls within this model's vocabulary `[0, n_vocab)`, but the id meanings must match the tokenizer of **this service's loaded model**, otherwise the resulting PPL has no real meaning.

**Q6: What happens if `text` is wrong in `/ppl_from_tokens`?**
No PPL value is affected (they depend only on `tokens`); only the `char_start`/`char_end` offsets may be inaccurate. If you don't need the offsets, you can omit `text`.

**Q7: Is batch request supported?**
No. The service holds a global lock and processes requests serially; for batch workloads, loop from the client or deploy multiple instances behind a load balancer.

**Q8: How is numerical stability handled?**
NLL is computed with a numerically stable log-sum-exp algorithm; to prevent `exp` overflow, ppl is clamped to `exp(80) ≈ 5.54e34` when `nll > 80`.