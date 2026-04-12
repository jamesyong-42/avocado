# Changelog

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
