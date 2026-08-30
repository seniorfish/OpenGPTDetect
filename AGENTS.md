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
- `editor/..` — Vite + React + CodeMirror 6 frontend (Zustand + shadcn/ui + Zod at the API boundary), built to a single HTML; see `editor/AGENTS.md` for the adopted stack and rules.
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

## Editor frontend — stack and paradigm

The editor is a **single-file SPA** (one HTML, opened via `file://`), following api.md.

- **Stack**: Vite + TypeScript `strict` + Tailwind v4 + shadcn/ui + Zustand +
  Zod (API boundary only) + Vitest (React).
- **composable-first**: business logic lives in composables / custom hooks
  (now `useApp`/`useSettings`/`usePresets`/`useCommands`), never in components.
  Components stay thin and read shared state via store selectors
  (`useStore(s => ...)`), not by deriving into local component state.
- **Keep the portable layer framework-independent**: `types.ts`, `util.ts`,
  `chunks.ts`, `store.ts`, `api.ts` (the `createApi` factory) and the raw
  CodeMirror wrapper `editor.ts` stay zero-framework. Mount CodeMirror
  imperatively (React: `useRef` + `useEffect`); keep its `StateField` state
  machine out of the hooks world.
