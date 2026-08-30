# Editor — AGENTS.md

Read the root `../AGENTS.md` first, then this file. The API contract lives in
`../docs/api.md`; the visual system and the command-driven architecture live in
`DESIGN.md`.

## What this folder is

A **single-file SPA** (`vite-plugin-singlefile`, one HTML opened via `file://`)
that talks to exactly two backend calls: `GET /health` (polling) and
`POST /ppl` (one-shot analysis). The stack is sized to that surface — no
"enterprise contract stack".

## Stack (React, adopted)

- Vite + TypeScript `strict` + Tailwind v4 + shadcn/ui (Radix) + Zustand +
  Zod (API boundary only) + Vitest.
- Excluded: TanStack Router / TanStack Query / XState / React Hook Form /
  Storybook. No routing, no cacheable server state, no multi-step state
  machine, no submit-style form, no component gallery — each would be dead
  weight and fight the command-driven, immediate-commit architecture.

## Non-negotiables

1. **Contract single-sourcing (schema = types)** — Backend responses
   (`PplResponse`, `HealthResponse`) are Zod schemas defined in one place; the
   TS types derive from them via `z.infer`. Never hand-write a second type for
   the same shape, and never `as T` the way in — `api.ts` parses. App-internal
   shapes (`Token`, `Chunk`, …) stay plain TS.
2. **Single source of truth for the document** — Editable content, tokens and
   ignores live only in the CodeMirror `hmField` (a state machine). Data moves
   between the CM world and the React world only through the explicit
   `EditorApi` bridge; never mirror a tokens list in React state and sync it.
3. **Derived state never enters the store** — A store holds facts (result,
   counts, flags), never "state computed from other state". Derived values are
   read via store selectors (`useStore(s => s.coverage)`) and `memo`'d; keep
   selectors granular so one settings change cannot re-render a whole panel.
4. **Registry-first** — Every action is one entry in `commands.ts`, every
   setting is one row in the declarative settings field list, every i18n
   string is a typed `MessageKey`. The palette, header menus and shortcuts all
   derive from the same registry. Never bolt on an ad-hoc button.
5. **Side effects live in named hooks/modules** — Health polling, the analyze
   orchestration and CodeMirror mounting each own their lifecycle (idempotent
   start/stop) inside a named hook or store action. No bare `useEffect` in
   components. CodeMirror is mounted imperatively (`useRef` + `useEffect`);
   its `StateField` stays out of the hooks world.
6. **Test sandwich** — Pure functions (`chunks`/`util`) are covered by Vitest
   unit tests, core hooks/stores by behavior tests, and the whole app by the
   puppeteer e2e suite. Each layer stays green before the next one moves.

## Layout

- `src/types.ts` — app-internal contracts (plain TS).
- `src/schemas.ts` — Zod schemas for backend responses (the single source of
  `PplResponse` / `HealthResponse`).
- `src/store.ts` — persisted data layer (settings/presets), framework-free.
- `src/api.ts` — `createApi` factory; parses responses through the schemas.
- `src/editor.ts` — raw CodeMirror wrapper (framework-free; the only place CM
  is touched).
- `src/i18n.ts` — typed i18n: a `t()` free function plus a `useI18n()` hook.
  zh is master; en must cover every key (compile-time check).
- `src/theme.ts` — light/dark/system controller, framework-free except a tiny
  React hook.
- `src/stores/` — Zustand stores: settings, presets, app (the migrated
  `useApp`/`useSettings`/`usePresets`).
- `src/commands.ts` — the command registry (drives palette + header + kbd).
- `src/components/` — React components; `ui/` are the shadcn/ui primitives.
- `src/App.tsx` / `src/main.tsx` — root layout + entry.

## Common commands

```bash
cd editor
npm install
npm run dev          # Vite dev server
npm run typecheck    # tsc --noEmit
npm run test         # typecheck + Vitest unit tests
npm run build        # single-file production build -> dist/index.html
# e2e: start BACKEND=mock service on :8000, build, then:
node test/e2e.test.mjs
```

## Code style

- Same as root: English comments, Conventional Commits.
- Framework-free layers (`types`, `schemas`, `store`, `api`, `chunks`,
  `util`, `editor`) never import React or Zustand.