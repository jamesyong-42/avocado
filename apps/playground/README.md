# Playground

Electron showcase app for [avocado](../../README.md).

## What it demonstrates

Cross-device terminal session sync over the **truffle mesh**:

- Run two instances on two machines on the same Tailscale network
- Sessions spawned on one device become visible on the other
- Input and output stream in real time
- Focus handoff between devices via `TerminalStoreSync`
- Optional WebGL CRT effects via `@avocado/react`

## Stack

- Electron (main + preload + renderer)
- `@avocado/react` — UI components, xterm.js, WebGL renderer
- `@avocado/core` — session/terminal management in the main process
- `@avocado/node-pty` — local PTY spawning
- `@avocado/transport-truffle` — mesh sync over truffle

## Status

Not yet scaffolded.
