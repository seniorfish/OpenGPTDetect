# Editor UI — Design System ("shadcn/ui + Tailwind v4")

## 1. The organizing principle

**"Every action is a command; every setting is a field."**

The entire chrome is *derived* from two declarative registries rather than
hand-placed widgets, so the UI can never drift from the model behind it:

1. **`src/commands.ts`** — one array of `CommandDef` entries:
   `{ id, title(i18n key), keywords, shortcut, group, active?, disabled?,
   visibleWhen?, run }`.

   The *same* array drives three surfaces at once:
   - the Ctrl+K **command palette** (`CommandPalette.tsx` groups by `group`),
   - the **header menus/buttons** (the ignore menu, presets menu, theme menu and
     lang menu are built from `useCommands().commands`),
   - keyboard discoverability — every shortcut hint shown by the palette is the
     single `shortcut` field.

   A command added in `commands.ts` therefore appears in *both* the palette and
   the header automatically. The header only adds *immediate* inline controls
   (the chunk-mode segmented control, the auto-refresh switch, the Analyze
   button) and points them at the same shared handlers (`setChunkMode`,
   `toggleAutoRefresh`) the commands run.

2. **`SettingsDialog.tsx`'s `fields` array** — one declarative row per setting:
   `{ kind: 'text' | 'number' | 'select' | 'slider', key, labelKey, options?,
   min?, max?, commit }`. The template renders each row generically; the `commit`
   callback fires the right refresh (`settingsChanged` / `fontChanged` /
   `serverChanged`). Color stops are a single custom section.

**A future feature is exactly one registry entry + one field** — never an
ad-hoc button pile.

## 2. Component / primitive layer

- **Primitives**: Radix UI (select/dropdown/dialog/slider/switch/
  toggle-group/tooltip). shadcn/ui components were copied into
  `src/components/ui/`, so they are
  the canonical new-york style implementations.
- **Icons**: `lucide-react` (named imports only).
- **Toasts**: `sonner` mounted once in `App.tsx` (`<Toaster position
  ="bottom-center" theme={resolved}/>`), bridged through the existing
  `useToasts.ts` `toast(msg, type)` contract so every call site is unchanged.
- **Persisted UI state**: theme (`src/theme.ts`, `ppl-editor.theme.v1`) and the
  existing settings/presets/local keys. No new ad-hoc storage.

Layout skeleton (`App.tsx`):

```
┌ header (h-14, border-b) ────────────────┐
│ brand · undo/redo · [display] · auto · … │  ← menubar of commands
├ editor stage (flex-1) ──────────────────┤
│   CodeMirror heat-map editor            │
├ histogram card (dockable, collapsible) ─┤
│ title · window badge · shift/top/all · ▁▁▁│
└ status bar (h-8, border-t) ─────────────┘
```

## 3. Visual system

- **Base color**: neutral (oklch), light first, dark via a `.dark` class on
  `<html>` — Tokens live in `src/style.css` (`:root`, `.dark`, `@theme inline`
  mapping). `--background/foreground/card/popover/primary/muted/accent/
  destructive/border/input/ring` are the shadcn neutral values; `--radius` is
  0.625rem (rounded-md/lg live on the components).
- **Typography**: system stack (`Segoe UI` → `Microsoft YaHei`) so Latin and CJK
  render natively; `--font-mono` for stats/kbd. Sizes: header 13px, stats
  12px/11px, heat tooltip 12px.
- **Elevation/shape**: `rounded-md` controls, `shadow-xs`/`shadow-md` on menus,
  1px `border` hairline, no heavy shadows — Vercel/Linear-lean airiness.
- **Hierarchy**: one true primary (Analyze, `bg-primary`, in-flight spinner),
  everything else `ghost`/`outline`; destructive only where destructive
  (clear ignores, delete preset).
- **The heat layer uses the same tokens**: `.hm-hover`,
  `.cm-break-layer .cm-br-*`, `.ppl-tooltip`, `.histo-dim`, `.histo-brush` are
  all token-driven, so the editor, overlay and tooltips flip with the theme.
- **Status semantics**: backend health = pulsing `success`/`destructive` dot;
  avg PPL is colored by `colorForPpl()` (the palette), coverage/latency as
  muted label+value.

## 4. Where a future feature slots in

- **A new action** (e.g. "re-tokenize"): add one entry to the `base` array in
  `useCommands()` in `commands.ts`; pick a `group` (or add a group to
  `COMMAND_GROUPS` + its i18n key). It is then in the palette *and* reachable by
  skipping to a header menu; to give it a dedicated header button, `byId` it in
  `AppHeader.tsx`. No unrelated files change.
- **A new setting** (e.g. "line wrap"): add one row to `fields` in
  `SettingsDialog.tsx` with its label keys in `zh.json`/`en.json`; the generic
  renderer + `commit`-callback handles the rest. Persistent storage is already
  wired (`saveSettings()`).
- **A new theme / language / chunk mode**: it is a state-valued command with an
  `active()` predicate (see `themeLight/Dark/System`, `langZh/En`,
  `chunkToken/Sentence/Paragraph`) — the palette and menus render the checked
  state for free.
- **A new panel** (e.g. a token inspector): mount it inside the flex column in
  `App.tsx`; if it needs to run an existing action, just call the same handler
  the commands call — never duplicate logic.
- **i18n**: every new string is one key in `zh.json` (master) and `en.json`;
  `MessageKey` typing (via the `_enSchemaCheck`) makes missing keys a typecheck
  error.

## 5. Notes / trade-offs

- Light mode is the default; theme choice (incl. "system") persists.
- The old flat toolbar is gone; the histogram's window strip became a
  collapsible card with icon buttons + a live window badge, working in token
  mode only (a hint explains otherwise).
- The legacy `test/e2e.test.mjs` DOM ids were intentionally not preserved; the
  new driver is `test/design-screenshot.mjs` plus the interaction probes in the
  same folder.