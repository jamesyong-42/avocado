/**
 * Adapter that wraps `window.avocado.{pty,terminal,remoteSessions}` as a `TerminalBackend`.
 *
 * `@vibecook/avocado-sdk/react`'s `<AvocadoProvider>` consumes a `TerminalBackend` from
 * `@vibecook/avocado-sdk/types`. Our IPC surface was designed to match that contract
 * 1:1 (see `@shared/ipc.ts` — `PtyAPI` and `TerminalAPI`), so the adapter
 * is essentially `{ pty, terminal, remoteSessions } = window.avocado`.
 */

import type { TerminalBackend } from '@vibecook/avocado-sdk/types';

export function createElectronBackend(): TerminalBackend {
  const { pty, terminal, remoteSessions } = window.avocado;
  // `TerminalBackend` has stricter field-level optionality than our
  // `PtyAPI`/`TerminalAPI` slices (some `onXxx` are optional). Our slices
  // implement every optional method, so a structural cast is safe.
  return {
    pty: pty as unknown as TerminalBackend['pty'],
    terminal: terminal as unknown as TerminalBackend['terminal'],
    remoteSessions: remoteSessions as unknown as TerminalBackend['remoteSessions'],
  };
}
