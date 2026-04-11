/**
 * Renderer-side ambient typing for `window.avocado`.
 *
 * The preload bridge calls `contextBridge.exposeInMainWorld('avocado', api)`
 * where `api: AvocadoAPI`. That runtime injection is invisible to
 * TypeScript, so we augment the global `Window` type here.
 */

import type { AvocadoAPI } from '@shared/ipc';

declare global {
  interface Window {
    avocado: AvocadoAPI;
  }
}

export {};
