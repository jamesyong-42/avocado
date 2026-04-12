# Introduction

**Avocado** is a TypeScript library for synchronizing terminal (PTY) sessions across processes, machines, and networks. It factors the plumbing that every terminal-UI project rebuilds — PTY spawning, output buffering, resize coordination, one-active-terminal-per-session logic, cross-device focus handoff — into a reusable core, and lets you pick the transport(s) you actually need.

## Why

Every terminal-UI project ends up re-implementing the same primitives. Avocado gives you:

- a single `PTYSessionManager` that treats local, IPC, and mesh peers identically
- a stable `IPTYTransport` contract so adding a new transport is additive, not invasive
- opinionated React components for the common cases (xterm.js renderer, terminal grids)
- a CLI (`avo`) for connecting a shell session to a desktop playground or remote peer

## Architecture at a glance

```
@vibecook/avocado-sdk
├── /types                  → shared interfaces & protocol types
├── /                       → PTYSessionManager, TerminalService (core)
├── /node-pty               → spawn local PTYs (peer dep: node-pty)
├── /transport-ipc          → UDS / Named Pipe for CLI ↔ host
├── /transport-truffle      → Tailscale mesh transport (peer dep: @vibecook/truffle)
└── /react                  → React components, hooks, xterm.js + WebGL renderers
```

All transports implement `IPTYTransport`. The session manager doesn't know or care which transport backs a given session — local, CLI-connected, or remote peer, they're all the same `IPTYSession` interface.

## Packages

Avocado ships two npm packages:

| Package | What it is | Install |
|---------|------------|---------|
| `@vibecook/avocado` | CLI (`avo` binary) — connect shell sessions to the host | `npm i -g @vibecook/avocado` |
| `@vibecook/avocado-sdk` | Library — embed the session model in your app | `npm i @vibecook/avocado-sdk` |

The SDK's subpath exports (`/react`, `/transport-truffle`, …) let you install only the peer dependencies you actually need.

## Status

Pre-alpha. Extracted from an internal vibe-ctl project and undergoing refactor. APIs may change before `1.0`.
