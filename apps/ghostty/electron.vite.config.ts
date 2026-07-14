import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * electron-vite configuration for the Ghostty-parity showcase.
 *
 * Same conventions as apps/playground, minus the truffle mesh:
 * - main: externalize deps (node-pty is a native binding), resolve workspace
 *   packages from TypeScript source via the "source" export condition.
 * - preload: emitted as `.mjs`; main loads `../preload/index.mjs`.
 * - renderer: pure browser code; the SDK's react/types subpaths, react,
 *   xterm (css only) and restty are bundled by Vite. No Node-only imports.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['node-pty'],
      },
    },
    resolve: {
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
      conditions: ['source'],
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  },
});
