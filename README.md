English | [简体中文](README.zh-CN.md)

# OpenGPTDetect

A local-LLM-powered **text perplexity (PPL)** analysis toolkit. It computes per-token perplexity of text as an interpretable "text complexity" signal, which can help spot likely AI-generated content.

Backed by `llama.cpp` (`llama-cpp-python`); all inference runs on your own machine — text and results never leave it.


## Components

| Component | Location | Description |
|---|---|---|
| **PPL analysis service** (backend) | `server/api.py` + `server/backends/` | FastAPI + llama.cpp, per-token NLL / PPL, cache-friendly two-step API, switchable backends |
| **API contract** | `docs/api.md` | Server interface definitions, data models, field semantics |
| **Web editor** | `editor/` | CodeMirror 6 perplexity text editor built with Vite + Vue 3, bundled into a single HTML file |
| **Chrome extension** | `extension/` | MV3 extension that shows page-text perplexity as heatmaps + annotations |

All four consumers (editor, extension, curl/scripts, service tests) share one API contract — see `docs/api.md`.

## Quick start

### 1. Get a model

Download the [Qwen3.5-9B-Base-i1-GGUF](https://huggingface.co/mradermacher/Qwen3.5-9B-Base-i1-GGUF) quantized GGUF — or any other GGUF-format causal language model. **Use a Base model**: chat/instruct fine-tunes carry chat-template artifacts that muddy per-token perplexity.

### 2. Start the service

```bash
cd server
pip install -r requirements.txt
cp .env.example .env        # then set MODEL_PATH in .env to point at your model
python api.py
```

Once the model is loaded, open `http://127.0.0.1:8000/docs` (Swagger) or verify with curl:

```bash
curl -X POST "http://127.0.0.1:8000/ppl" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!"}'
```

### 3. Use the editor / extension

- **Web editor:** `cd editor && npm install && npm run dev`, then open the URL Vite prints; the production build is a single HTML file at `editor/dist/index.html` (`npm run build`).
- **Chrome extension:** `chrome://extensions` → enable "Developer mode" → "Load unpacked" → select the `extension/` directory. It scans the current page and talks to the local service.

> Both default to `http://127.0.0.1:8000` — start the service first.

## Configuration

All settings are injected via `server/.env` or environment variables (`MODEL_PATH` is required; everything else has a default). The full list lives in the "Quick start" section of `docs/api.md`. NLL computation uses PyTorch by default (auto-selects cuda / xpu / cpu) and falls back to numpy when torch is absent.

`BACKEND=mock` starts a model-free demo server that returns deterministic pseudo-NLL — intended for tests and frontend development **only**, never for real analysis; the service prints a warning whenever it is active.

## Hardware and backend choice

The service has two layers; hardware needs are decided by the llama.cpp build and the optional torch acceleration. Any machine that can run llama.cpp (including pure CPU) works — only the speed differs.

- **Model inference layer (llama.cpp):** determined by how `llama-cpp-python` was installed.
  - Official PyPI wheels: CPU-only on Windows / Linux, Metal on macOS (Apple Silicon).
  - GPU acceleration needs a different build: CUDA for NVIDIA, SYCL / XPU for Intel (requires the oneAPI runtime).
  - The code defaults to `n_gpu_layers=-1` (offload as much as possible); on a CPU-only build it has no effect and falls back to CPU automatically.
- **NLL post-processing layer:** with `PPL_USE_TORCH=1` and torch installed, it probes CUDA → XPU → CPU in order; without torch (or with `PPL_USE_TORCH=0`) it uses numpy (pure CPU, single-threaded chunks).

> Note: the `nll_backend` field in `/health` only reflects the post-processing backend (`torch/*` or `numpy`), not which device the llama.cpp inference layer actually runs on.

## Project layout

```
├─ server/          # FastAPI service + pluggable backends (api.py, backends/, requirements, .env.example)
├─ docs/api.md      # API contract (routes, fields, error codes, FAQ)
├─ editor/          # Vite + Vue 3 + CodeMirror frontend
├─ extension/       # Chrome MV3 extension
└─ README.md
```

## License

[MIT](LICENSE)