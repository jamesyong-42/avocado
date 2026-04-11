/**
 * Adapter that wraps `window.avocado.{pty,terminal}` as a `TerminalBackend`.
 *
 * `@avocado/react`'s `<AvocadoProvider>` consumes a `TerminalBackend` from
 * `@avocado/types`. Our IPC surface was designed to match that contract
 * 1:1 (see `@shared/ipc.ts` — `PtyAPI` and `TerminalAPI`), so the adapter
 * is essentially `{ pty, terminal } = window.avocado`.
 */

import type { TerminalBackend } from '@avocado/types';

export function createElectronBackend(): TerminalBackend {
  const { pty, terminal } = window.avocado;
  // `TerminalBackend` has stricter field-level optionality than our
  // `PtyAPI`/`TerminalAPI` slices (some `onXxx` are optional). Our slices
  // implement every optional method, so a structural cast is safe.
  return {
    pty: pty as unknown as TerminalBackend['pty'],
    terminal: terminal as unknown as TerminalBackend['terminal'],
  };
}
