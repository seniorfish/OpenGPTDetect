## Read first, before touching anything

- `docs/api.md`
- `README.md`

## Map

- `server/backends/..` — backend contract (`Backend` ABC + `Capabilities`) and
  implementations: `llama_cpp_backend.py` (real inference), `mock_backend.py`
  (deterministic pseudo-NLL, testing only).
- `server/api.py` — the FastAPI app: routes, Pydantic models, validation,
  alignment, aggregation, backend switching, `__main__` entry.
- `server/tests/..` — pytest contract tests; run on the mock backend, no model.
- `docs/api.md` — API contract baseline.
- `editor/..` — Vite + CodeMirror 6 (TypeScript) frontend; builds to a single HTML.
- `extension/..` — Chrome MV3 extension turning page text into PPL heatmaps.
- root `README*.md` — overview and configuration.

## Common commands

```bash
python -m pytest server/tests -q                # server contract tests (mock)
cd server && python api.py                      # start service (.env MODEL_PATH)
cd server && BACKEND=mock python api.py         # model-free demo backend
cd editor && npm run build                      # build single-file editor
# editor e2e: start BACKEND=mock service on :8000, then:
cd editor && node test/e2e.test.mjs
```

## Code style

- All code comments in **English**.
- Commits follow Conventional Commit.