# SDK test suite

Vitest suite for `@vibecook/avocado-sdk`.

## Commands

```bash
# From repo root
pnpm test                 # all unit + integration (live mesh auto-skips without auth)
pnpm test:unit            # unit only
pnpm test:integration     # integration only

# From packages/sdk
pnpm test
pnpm test:watch
pnpm test:live            # force-run mesh-live.test.ts (needs TRUFFLE_TEST_AUTHKEY)
```

## Layout

| Path | Coverage |
|------|----------|
| `test/unit/` | Pure logic + mocks (session ids, buffers, wire, session manager, store sync, truffle transports) |
| `test/integration/uds-server.test.ts` | Real Unix domain socket handshake |
| `test/integration/local-pty-spawn.test.ts` | Real `node-pty` spawn when available |
| `test/integration/mesh-live.test.ts` | Two-node Tailscale mesh (optional) |
| `test/helpers/` | Shared mocks and in-memory backends |

## Live mesh tests

Set `TRUFFLE_TEST_AUTHKEY` (or put it in `packages/sdk/.env` / sibling `truffle/.env`).

Disable explicitly:

```bash
AVOCADO_SKIP_MESH_LIVE=1 pnpm test
```

CI always sets `AVOCADO_SKIP_MESH_LIVE=1` so PRs stay offline-safe.
