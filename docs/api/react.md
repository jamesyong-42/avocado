# `@vibecook/avocado-sdk/react`

React components and hooks for avocado. **Peer deps (all optional):** `react`, `xterm`, `@xterm/addon-fit`. For the WebGL renderer, also: `three`, `@react-three/fiber`, `@react-three/postprocessing`, `postprocessing`.

## Components

- `<AvocadoProvider backend={…}>` — root provider that wires your IPC/backend shim
- `<TerminalGrid>` — grid of virtual terminals with resize + active-tab handling
- `<TerminalCard>` — single terminal card
- `<DefaultRenderer>` — xterm.js renderer (the default)
- `<WebGLRenderer>` — three.js / R3F renderer with optional CRT shader

## Hooks

- `usePTYSessions()` — live list of sessions from the backend
- `useTerminals()` / `useTerminalGrid()` — virtual terminal state + layout
