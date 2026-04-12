---
layout: home

hero:
  name: Avocado
  text: Terminal session sync for the web stack
  tagline: One session model, pluggable transports — local PTY, IPC, mesh via Tailscale.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/jamesyong-42/avocado

features:
  - title: One session model
    details: A single `IPTYSession` + `PTYSessionManager` abstraction. Local PTYs, CLI sessions over IPC, and remote peer sessions all look identical to your UI.
  - title: Pluggable transports
    details: Ship with the transports you actually need — local `node-pty`, Unix Domain Socket / Named Pipe for CLI sync, or Tailscale-backed mesh for cross-device sharing.
  - title: xterm.js + WebGL
    details: Drop-in React components and hooks. DefaultRenderer uses xterm.js; optional WebGL renderer with CRT shader for that retro terminal look.
  - title: Typed end-to-end
    details: Written in TypeScript, ships source maps, strict types, and a small set of clean public interfaces (`IPTYTransport`, `IPTYSession`, `ITerminalStoreSync`).
---
