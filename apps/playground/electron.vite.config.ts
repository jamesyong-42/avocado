import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * electron-vite configuration for the avocado playground.
 *
 * Notes:
 *
 * - Main process:
 *   • `externalizeDepsPlugin()` keeps every package.json dependency out of
 *     the main bundle. This is critical for:
 *       - `node-pty` (native C++ binding)
 *       - `@vibecook/truffle` (loads a Rust NAPI addon + Go sidecar via
 *         `require()` at runtime, see truffle's own playground config)
 *       - `@avocado/core`, `@avocado/node-pty`, `@avocado/transport-truffle`
 *         (they internally use Node-only features)
 *
 * - Preload:
 *   • electron-vite emits the preload as `.mjs` by default, which truffle's
 *     own playground uses (and resolves via `join(__dirname,
 *     '../preload/index.mjs')` in main). We inherit that convention — our
 *     main process loads `../preload/index.mjs` as well.
 *   • `externalizeDepsPlugin()` keeps `electron` out of the preload bundle.
 *
 * - Renderer:
 *   • Pure browser code. `@avocado/react`, `@avocado/types`, react/react-dom,
 *     xterm, and optional restty are bundled by Vite.
 *   • The renderer MUST NOT import any Node-only avocado package
 *     (`@avocado/core`, `@avocado/node-pty`, `@avocado/transport-truffle`)
 *     or `@vibecook/truffle`. Those packages live in the main process and
 *     are reached via `window.avocado.*` from the preload bridge.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: [
          '@vibecook/truffle',
          /^@vibecook\/truffle-native.*/,
          /^@vibecook\/truffle-sidecar.*/,
          'node-pty',
        ],
      },
    },
    resolve: {
      // Resolve workspace packages from TypeScript source in dev via the
      // "source" condition in each package.json's exports map. This avoids
      // needing to rebuild library packages after every source change.
      conditions: ['source'],
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      // Same "source" condition — renderer imports from @avocado/react and
      // @avocado/types resolve directly to .ts source files during dev,
      // eliminating the stale-dist problem.
      conditions: ['source'],
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  },
});
