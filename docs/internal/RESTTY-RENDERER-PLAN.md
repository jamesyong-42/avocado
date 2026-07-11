# Restty terminal renderer — design & plan

**Status**: spike hardened (production-ready transport/lifecycle/resize)  
**Date**: 2026-07-10  
**Goal**: Replace xterm-only rendering with a pluggable **terminal view** abstraction; retire the broken Three.js CRT path; land a robust **restty** engine (Ghostty VT via WASM + WebGPU/WebGL2).

## 1. Why

| Old path | Problem |
|----------|---------|
| xterm + optional `@xterm/addon-webgl` | Fine as a default, but not Ghostty-class VT |
| R3F CRT (`TerminalPlane` / `CRTEffect` / canvas scrape) | Brittle, always-on addon, no tests, poor multi-pane cost |

[restty](https://github.com/wiedymi/restty) embeds **libghostty-vt** (WASM) + GPU text rendering. Avocado keeps owning PTY/mesh/IPC; restty is **view only**.

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React: VirtualTerminal / TerminalGrid                      │
│    engine?: 'xterm' | 'restty'                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  useTerminalCore  (engine-agnostic session wiring)          │
│    • TerminalBackend output → view.write                    │
│    • view.onData → backend.pty.write                        │
│    • view.onResize / fit → backend.terminal.resize          │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     TerminalView (interface)    createTerminalView(engine)
              │
     ┌────────┴────────┐
     ▼                 ▼
 XtermTerminalView  ResttyTerminalView
 (xterm + FitAddon) (restty/xterm → libghostty-vt)
```

### 2.1 `TerminalView` contract

Stable, engine-neutral surface:

- `write` / `resize` / `focus` / `blur` / `fit` / `dispose`
- `onData` / `onResize` → `Unsubscribe`
- optional `onLifecycle` (connect / disconnect / exit / error)
- `cols` / `rows` getters

**Resize ownership (single direction):**

| Call | Meaning | Emits `onResize`? |
|------|---------|-------------------|
| `view.resize(c, r)` | Host-driven (props / fixed size) | **No** |
| `view.fit()` / restty autoResize / transport.resize | Engine-driven measure | **Yes** if size changed |

`useTerminalCore` applies PTY resize **only** from `view.onResize` (plus one initial attach size). Host `view.resize` never loops back into the backend via the view.

Engines adapt their native APIs to this interface. **No React, no avocado backend** inside engines — pure view adapters (testable in isolation).

### 2.2 Restty I/O + `AvocadoPtyTransport`

```
Keystrokes:  restty → AvocadoPtyTransport.sendInput → view.onData → backend.pty.write
Display:     backend.pty.onOutput → view.write → Restty.sendInput(text, "pty")
```

`AvocadoPtyTransport` is a first-class restty `PtyTransport`:

- Connected before Restty mounts so restty **does not local-echo** (PTY owns echo)
- Lifecycle: `idle → connecting → connected → idle` / `destroyed`
- `withHostResizeSuppressed` blocks transport.resize feedback during host-driven size apply
- `reportExit` / `reportError` for session end / engine failures

### 2.3 Engine registry

```ts
type TerminalEngineId = 'xterm' | 'restty';

createTerminalView(engine, options): Promise<TerminalView>
```

- **xterm**: default; dynamic import of xterm + FitAddon  
- **restty**: dynamic `import('restty')` + bundled JetBrains Mono (no CDN required)

Optional peer: `restty`. Missing restty → clear error when `engine: 'restty'`.

### 2.4 Fonts (why tofu / □ with × happens)

Restty **replaces** its entire `DEFAULT_FONT_INPUTS` chain when `terminal.fonts`
is set. That default chain is Ghostty-like:

1. JetBrains Mono **Nerd Font** (regular/bold/italic/bold-italic)
2. **Symbols Nerd Font** (powerline / codicons / PUA)
3. Apple Symbols, emoji, CJK, …

Avocado ships (via `buildResttyFontChain` / `buildGhosttyParity`):

| File | Role |
|------|------|
| `JetBrainsMonoNLNerdFontMono-Regular.ttf` | Primary mono + nerd glyphs |
| `…-Bold / Italic / BoldItalic.ttf` | Style faces (SGR bold/italic) |
| `SymbolsNerdFont-Regular.ttf` | Full Nerd symbols fallback |
| `JetBrainsMono-Regular.ttf` | Legacy plain mono (optional) |

**Plain JetBrains Mono alone** cannot render Nerd/PUA codepoints → white box
with × (missing glyph / tofu).

### 2.5 Ghostty parity knobs (`ghostty-parity.ts`)

| Knob | Value | Why |
|------|-------|-----|
| `renderer` | `auto` | WebGPU first (≈ Ghostty Metal), WebGL2 fallback |
| `theme` | `Ghostty Default Style Dark` | Stock Ghostty palette (#282c34) |
| `fontSize` | 13 | Ghostty default font-size |
| `fontSizeMode` | `height` | Closer to Ghostty face metrics |
| `ligatures` | true | Coding-font default |
| `fontHinting` | false | Closer to macOS CoreText look |
| `alphaBlending` | `native` | Ghostty macOS default (avoid washed purples) |
| `nerdIconScale` | 1 | 1:1 icon scale |
| `maxScrollbackBytes` | 10MB | restty/Ghostty-scale |
| host padding | 2px | Ghostty `window-padding-x/y` |
| surface chrome | minimal | avocado owns card chrome |

Optional overrides: `ghosttyThemeName`, `resttyRenderer`, `theme` bag on
`VirtualTerminal` / `TerminalViewCreateOptions`.

**Hard limits vs native Ghostty:** WASM VT (not full app), no Metal, no native
window decorations, no shell-integration extras, emoji/CJK rely on local faces.

### 2.5 What we deliberately do **not** do in this spike

- Pixel CRT/Three.js effects (retired; future restty shaders/plugins if wanted)
- Full restty multi-pane surface API (use one view per avocado terminal card)
- Headless restty in main process (later: `restty/headless` for tests/replay)
- Replacing mesh/IPC protocols
- Full Electron + WASM pixel Playwright suite (engine smoke lives in `test/e2e`)

## 3. Lifecycle

1. Mount container `div`
2. `createTerminalView(engine, { container, cols, rows, fonts, … })`
3. Restty: connect `AvocadoPtyTransport` before Restty ctor
4. Wire backend subscriptions + optional `onLifecycle`
5. On dispose: unsubscribe + transport.disconnect/destroy + `view.dispose()`
6. Engine switch (playground toggle): full remount of core for that terminal (simplest correctness)

Async restty WASM load: core stays `isReady === false` until view resolves; outputs buffer optional later if needed.
Session exit/error: `ResttyTerminalView.reportExit` / `reportError` → lifecycle listeners → `useTerminalCore` logs / sets `error`.

## 4. Testing strategy

| Layer | Tests |
|-------|--------|
| `AvocadoPtyTransport` | Unit: connect/disconnect/exit/error, host suppress, keys |
| `bundled-font` | Unit: asset present + Node load |
| `TerminalView` contract | Fake view implements interface; core uses it |
| `ResttyTerminalView` | Unit with **mocked** Restty; display path `source: "pty"` |
| `createTerminalView` | Factory routing + missing-restty error |
| `useTerminalCore` wiring | Backend mock + fake view (lightweight harness) |
| `test/e2e/restty-smoke` | Type, backspace, host/engine resize, lifecycle, engine toggle |
| Integration | Optional: real restty in Electron (manual / future Playwright) |

Injectability: `useTerminalCore({ createView })` for tests without real engines.

## 5. Playground

- Engine toggle: **xterm** | **restty** (replaces Default/WebGL + CRT preset UI)
- Default remains **xterm** until restty is validated

## 6. Migration / breaking changes

- Removed public exports: `CRTEffect`, `TerminalPlane`, `useTextureSync`, `findXtermCanvas`, presets, CRT types, `DefaultRenderer` (unused shell)
- Removed peers: `three`, `@react-three/*`, `postprocessing`, `@xterm/addon-webgl`
- Added optional peer: `restty`
- `VirtualTerminal` props: `renderer` / `crtPreset` / `rendererOptions` → `engine?: TerminalEngineId`

## 7. Implementation checklist

- [x] Delete WebGL/CRT path
- [x] Introduce `TerminalView` + xterm + restty adapters
- [x] Refactor `useTerminalCore` to engine-agnostic wiring
- [x] Playground engine toggle (`xterm` | `restty`)
- [x] Unit tests for view layer + factory + wiring contract
- [x] First-class `AvocadoPtyTransport` (typed, tested, exported)
- [x] Session lifecycle: connect / disconnect / exit / error
- [x] Unify resize ownership (host vs engine; single PTY path)
- [x] Restty path smoke e2e (`test/e2e/restty-smoke.test.ts`)
- [x] Bundle JetBrains Mono for restty (no CDN required)
- [x] Docs / changelog / peer deps updated
- [ ] Follow-ups: Electron + WASM Playwright, theme mapping, better restty fit metrics, optional headless restty

## 8. Risks

| Risk | Mitigation |
|------|------------|
| restty API churn (pre-1.0) | Adapter boundary isolates avocado |
| Electron WebGPU | restty WebGL2 fallback; document flags |
| Multi-grid cost (N WASM) | Measure later; one view per card already |
| xterm FitAddon vs restty fit | `fit()` best-effort; resize still explicit |
