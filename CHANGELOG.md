# Changelog

## [Unreleased]

### ⚠ BREAKING CHANGES

* **transport-truffle** requires `@vibecook/truffle@^0.6.0` (RFC 022 Peer-first API).
  * Live PTY routing uses interned `Peer` handles / `peer.ref`, not `deviceId` strings.
  * `MeshPTYTransport` is constructed with `{ node, peer }` (Peer handle), not `{ peerId, peerName }`.
  * `PTYMeshBridge.getTransport(peerRef)` keys by process-local peer ref; use `getTransportByDeviceId(ulid)` for SyncedStore reconciliation.
  * Inbound `msg.from` is a `Peer` (or Tailscale id string fallback) — WhoIs-verified, never a self-declared ULID fallback.
  * Playground `PeerInfo` now exposes `peerRef`, `displayName`, and `deviceId: string | null`.

### ⚠ BREAKING CHANGES (react renderers)

* Removed the Three.js / R3F CRT WebGL path (`CRTEffect`, `TerminalPlane`,
  `useTextureSync`, CRT presets, `renderer` / `crtPreset` props).
* Optional peers dropped: `three`, `@react-three/*`, `postprocessing`,
  `@xterm/addon-webgl`.
* `VirtualTerminal` now takes `engine?: 'xterm' | 'restty'` instead of
  `renderer` / CRT options.

### Features

* **transport-truffle:** migrate to truffle 0.6 Peer-first API (RFC 022)
* **transport-truffle:** create MeshPTYTransports for online peers (not only `wsConnected`); eager identity often leaves WS down after hello
* **sdk:** add Vitest unit/integration suite (`pnpm test`) covering types, core, IPC wire, truffle transports (mocked), UDS, node-pty, and optional live mesh
* **react:** pluggable `TerminalView` engines — default **xterm**, optional **restty** (libghostty-vt via `restty` peer)
* **react:** retire brittle CRT/Three.js WebGL compositor
* **react:** first-class `AvocadoPtyTransport` for restty (no local echo; keys → avocado, display via `sendInput(..., "pty")`)
* **react:** terminal view lifecycle events (`connected` / `disconnected` / `exit` / `error`)
* **react:** single-direction resize ownership — host `resize()` does not re-emit; engine fit/autoResize drives PTY size
* **react:** ship full JetBrains Mono **Nerd Font Mono** weight set (regular/bold/italic/bold-italic) + Symbols Nerd Font for restty glyph coverage (no CDN; fixes tofu / □× icons)
* **react:** Ghostty-parity restty defaults — WebGPU-first, `Ghostty Default Style Dark`, font-size 13, height sizing, ligatures, **native** alpha blending (Ghostty macOS; avoids washed-out colors), 2px window padding, theme conversion from avocado palette bags
* **sdk:** restty path smoke e2e (`pnpm test:e2e`) — type, backspace, resize, lifecycle, engine factory

## [0.2.1](https://github.com/jamesyong-42/avocado/compare/avocado-v0.2.0...avocado-v0.2.1) (2026-04-13)


### Bug Fixes

* **ci:** align npm publish with trusted publishing requirements ([2b99e27](https://github.com/jamesyong-42/avocado/commit/2b99e2777fbfef894ded0ddd3431000a90ef5c8f))
* **ci:** drop registry-url from setup-node, pass --registry inline ([4baf933](https://github.com/jamesyong-42/avocado/commit/4baf9331cf33bbda0c6c270af51535ec39483d1b))
* **ci:** restore registry-url on setup-node (needed for OIDC) ([d153b79](https://github.com/jamesyong-42/avocado/commit/d153b7962f2eaff64f4ae9bfc1765d7d26dfe64c))
* **ci:** use node 24 for npm trusted publishing ([17e5834](https://github.com/jamesyong-42/avocado/commit/17e5834ecd39ef75216a3a50ffbd02621c046329))
* **ci:** use working-directory for pnpm publish instead of -C ([8156934](https://github.com/jamesyong-42/avocado/commit/8156934ca64f81e599217a1581250e44668d805e))

## [0.2.0](https://github.com/jamesyong-42/avocado/compare/avocado-v0.1.0...avocado-v0.2.0) (2026-04-12)


### ⚠ BREAKING CHANGES

* @avocado/* scope is gone. Migrate imports:   @avocado/core            → @vibecook/avocado-sdk   @avocado/types           → @vibecook/avocado-sdk/types   @avocado/node-pty        → @vibecook/avocado-sdk/node-pty   @avocado/transport-ipc   → @vibecook/avocado-sdk/transport-ipc   @avocado/transport-truffle → @vibecook/avocado-sdk/transport-truffle   @avocado/react           → @vibecook/avocado-sdk/react   @avocado/cli             → @vibecook/avocado (global CLI binary)

### Features

* **cli:** add @avocado/cli — general terminal session wrapper with playground sync ([81743a4](https://github.com/jamesyong-42/avocado/commit/81743a44eac0a0d406b2f89554bf67f5b1e6f7b1))
* **cli:** add TUI startup banner with ASCII art and sync status ([b24f7dc](https://github.com/jamesyong-42/avocado/commit/b24f7dcc8553a2f96a36df0bffc434c87185dfd3))
* **playground:** multi-terminal grid UI, headless support, IPC surface, focus switching ([bf444eb](https://github.com/jamesyong-42/avocado/commit/bf444ebcec14424c698b02efafbda7e297a482e9))
* **playground:** scaffold Electron app with full avocado stack ([848374b](https://github.com/jamesyong-42/avocado/commit/848374be73094d2f26675f38e95740c852be8c38))
* **transport-ipc:** add UDS server and wire IPC bridge into playground ([4cf3dfd](https://github.com/jamesyong-42/avocado/commit/4cf3dfd2b41f30925c9ad97dcbbc6801005bde7f))
* **transport-truffle:** port mesh sync orchestration from vibe-ctl ([bdd4f8e](https://github.com/jamesyong-42/avocado/commit/bdd4f8e00a6420c871a3aa7b7faf55ac739ec7ee))
* **transport-truffle:** port MeshPTYTransport from vibe-ctl ([17c550b](https://github.com/jamesyong-42/avocado/commit/17c550b5a4bc51a0c46d2c60b626e9559724c8e9))


### Bug Fixes

* **build:** source-first resolution, dev scripts, WebGL type fixes ([e33e97e](https://github.com/jamesyong-42/avocado/commit/e33e97e46ef7f35630f366c7e5b2d1dd94daa90d))
* **ci:** build SDK before typechecking the playground ([aea9170](https://github.com/jamesyong-42/avocado/commit/aea91706eb5b1cb96ae5de205a6cec5b858a61e1))
* clean up six latent bugs flagged in the code report ([c119160](https://github.com/jamesyong-42/avocado/commit/c11916026ddb1d37e1e474cebe8f5a89cdb71c3c))
* **playground:** auth gate UX, draggable header, terminal output routing ([9c3abea](https://github.com/jamesyong-42/avocado/commit/9c3abeac7e0b7afe7ade0cd0c6620b2b093205b8))
* **playground:** destroy terminal on grid close, sync grid and list state ([5997c86](https://github.com/jamesyong-42/avocado/commit/5997c869cec723ba7c674f25adf075d8d87db821))
* **playground:** remove auto-create terminal for sessions ([0eb4931](https://github.com/jamesyong-42/avocado/commit/0eb493191231abd9fed4fc627abad06da72f7168))
* **transport-ipc:** route PTY namespace messages to IPC transports ([332453e](https://github.com/jamesyong-42/avocado/commit/332453e5552a58b2100506436e82c8fe56269fa3))
* **transport-truffle:** migrate to truffle 0.4.0 (RFC 017) ([37caa75](https://github.com/jamesyong-42/avocado/commit/37caa75559c1b3915ca570e2f0c83838ec1e95a4))


### Miscellaneous Chores

* restructure to @vibecook/avocado-sdk + @vibecook/avocado ([ba1b724](https://github.com/jamesyong-42/avocado/commit/ba1b7241e36d8bfb3a876b2f9bcfe0198baae988))
