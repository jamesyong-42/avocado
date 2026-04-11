/**
 * IPCNotifier — bridges `RemoteSessionService`'s `IPeerNotifier` interface
 * to `BrowserWindow.webContents.send(...)` so focus changes and remote
 * session-count updates reach the renderer.
 *
 * `getMainWindow` is a closure over the current window so we tolerate
 * window recreation (macOS dock click) without holding a stale reference.
 */

import type { BrowserWindow } from 'electron';
import type { IPeerNotifier } from '@avocado/transport-truffle';

export class IPCNotifier implements IPeerNotifier {
  private readonly getMainWindow: () => BrowserWindow | null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  sessionFocusChanged(
    _sessionId: string,
    _focused: boolean,
    _source: 'local' | 'remote',
    _deviceId?: string
  ): void {
    // v0.1 — focus notifications are not yet surfaced in the playground UI.
    // Implementing the channel is cheap but there's nothing to do with it
    // in the renderer until we add cooperative focus handoff, so we drop
    // the event silently rather than spamming an empty IPC channel.
  }

  remoteSessionsChanged(_deviceId: string, _count: number): void {
    // Same rationale as above — remote session list is already reconciled
    // via PTYSessionManager's sessionDiscovered/sessionLost events, which
    // flow to the renderer via `EVT_PTY_SESSION_*` channels. This callback
    // is a counter for consumers that want to show a badge; the playground
    // just uses the session list directly.
  }
}
