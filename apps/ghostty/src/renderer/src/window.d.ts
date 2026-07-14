import type { TerminalBackend } from '@vibecook/avocado-sdk/types';
import type { GhosttyAppInfo } from '@shared/ipc';

declare global {
  interface Window {
    /** TerminalBackend-shaped bridge exposed by the preload script. */
    ghostty: TerminalBackend;
    ghosttyInfo: GhosttyAppInfo;
  }
}

export {};
