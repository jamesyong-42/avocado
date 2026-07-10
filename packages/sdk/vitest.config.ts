import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * SDK tests import source via package subpath aliases (`#types`, `#core`, …)
 * so we exercise TypeScript sources directly (same resolution as dist builds).
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Live mesh tests opt into longer timeouts themselves.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Sequence mesh live tests so two suites don't thrash Tailscale auth.
    fileParallelism: true,
    pool: 'forks',
  },
  resolve: {
    alias: {
      '#types': resolve(__dirname, 'src/types/index.ts'),
      '#core': resolve(__dirname, 'src/core/index.ts'),
      '#node-pty': resolve(__dirname, 'src/node-pty/index.ts'),
      '#transport-ipc': resolve(__dirname, 'src/transport-ipc/index.ts'),
      '#transport-truffle': resolve(__dirname, 'src/transport-truffle/index.ts'),
      '#react': resolve(__dirname, 'src/react/index.ts'),
    },
  },
});
