/**
 * App.tsx — avocado playground root component.
 *
 * Flow:
 *
 *   1. On mount, call `window.avocado.lifecycle.start()` which spins up
 *      the truffle node and every avocado subsystem in the main process.
 *   2. Subscribe to status changes so the UI reflects starting/running/
 *      error state.
 *   3. Wrap the interactive UI in `<AvocadoProvider>` with an
 *      electron-backed `TerminalBackend` so `@avocado/react`'s hooks and
 *      components can talk to the main process through IPC.
 *   4. Render:
 *        - status header with the local device identity
 *        - peers panel (mesh discovery)
 *        - sessions panel (local + remote PTY sessions)
 *        - terminal host (the selected session's VirtualTerminal)
 *        - a "Spawn shell" button that creates a local PTY + virtual
 *          terminal for it
 */

import { useEffect, useRef, useState, type JSX } from 'react';
import {
  AvocadoProvider,
  VirtualTerminal,
  usePTYSessions,
  useTerminals,
} from '@avocado/react';
import type { PtySession, TerminalInfo } from '@avocado/types';

import { createElectronBackend } from './electron-backend';
import { AuthGate } from './components/AuthGate';
import { PeersList } from './components/PeersList';
import { SessionsList } from './components/SessionsList';
import type { NodeStatus, NodeStatusEvent } from '@shared/ipc';

// Single backend instance so `<AvocadoProvider>` doesn't recreate the
// identity across re-renders.
const backend = createElectronBackend();

// Default terminal dimensions used for both the PTY and the virtual
// terminal wrapper. xterm's fit addon adjusts after mount.
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export function App(): JSX.Element {
  const [status, setStatus] = useState<NodeStatus>('idle');
  const [statusError, setStatusError] = useState<string | undefined>(undefined);
  const [identity, setIdentity] = useState<NodeStatusEvent['identity']>();
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  // Avoid re-invoking start on StrictMode double-mount.
  const startedRef = useRef(false);

  // ─── Lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubStatus = window.avocado.lifecycle.onStatusChanged((event) => {
      setStatus(event.status);
      if (event.identity) setIdentity(event.identity);
      setStatusError(event.error);
    });

    const unsubAuth = window.avocado.lifecycle.onAuthRequired((url) => {
      setAuthUrl(url);
    });

    if (!startedRef.current) {
      startedRef.current = true;
      void window.avocado.lifecycle
        .start()
        .then((event) => {
          setStatus(event.status);
          if (event.identity) setIdentity(event.identity);
        })
        .catch((err: unknown) => {
          console.error('[renderer] lifecycle.start failed:', err);
          setStatus('error');
          setStatusError(err instanceof Error ? err.message : String(err));
        });
    }

    // Also ask for the current status in case we missed the event between
    // mount and subscription.
    void window.avocado.lifecycle.getStatus().then((event) => {
      setStatus(event.status);
      if (event.identity) setIdentity(event.identity);
    });

    return () => {
      unsubStatus();
      unsubAuth();
    };
  }, []);

  // Show the auth gate as a full-screen overlay when truffle needs login.
  // It dismisses automatically once status transitions to 'running'.
  const showAuthGate = authUrl !== null && status !== 'running';

  return (
    <AvocadoProvider backend={backend}>
      <div className="app">
        <Header
          status={status}
          error={statusError}
          identity={identity}
        />
        {showAuthGate ? (
          <AuthGate authUrl={authUrl} />
        ) : status === 'running' ? (
          <PlaygroundBody />
        ) : (
          <div className="empty-state">
            <em>
              {status === 'starting'
                ? 'Starting truffle node...'
                : status === 'error'
                  ? `Error: ${statusError ?? 'unknown'}`
                  : 'Idle'}
            </em>
          </div>
        )}
      </div>
    </AvocadoProvider>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

function Header({
  status,
  error,
  identity,
}: {
  status: NodeStatus;
  error: string | undefined;
  identity: NodeStatusEvent['identity'];
}): JSX.Element {
  return (
    <div className="header">
      <h1>Avocado Playground</h1>
      <div className="identity no-drag">
        {identity ? (
          <>
            <span>
              device <strong>{identity.deviceName}</strong>
            </span>
            <span>
              id <strong>{identity.deviceId.slice(0, 8)}</strong>
            </span>
            <span>
              app <strong>{identity.appId}</strong>
            </span>
          </>
        ) : error ? (
          <span style={{ color: '#ff7b7b' }}>{error}</span>
        ) : null}
        <span className={`state-pill ${status}`}>{status}</span>
      </div>
    </div>
  );
}

// ─── Body ──────────────────────────────────────────────────────────────────

/**
 * Body component — only mounted when the truffle node is running, which
 * guarantees `backend.pty.list()` and friends will resolve.
 */
function PlaygroundBody(): JSX.Element {
  const { sessions, selectedSessionId, selectSession, createSession } =
    usePTYSessions();
  const { terminals, createTerminal } = useTerminals();

  // Track which sessions already have a virtual terminal wired up. The
  // hook state is the source of truth; this ref just prevents double-creates
  // in the same render before `terminals` updates.
  const pendingTerminalRef = useRef<Set<string>>(new Set());

  // Auto-create a virtual terminal for any session that doesn't have one
  // yet. `terminals` comes from `useTerminals`, which refreshes on changes.
  useEffect(() => {
    for (const session of sessions) {
      const hasTerminal = terminals.some(
        (t: TerminalInfo) => t.sessionId === session.id
      );
      if (hasTerminal || pendingTerminalRef.current.has(session.id)) continue;
      pendingTerminalRef.current.add(session.id);
      void createTerminal(
        session.id,
        'virtual',
        { cols: DEFAULT_COLS, rows: DEFAULT_ROWS, mode: 'active' },
        session
      ).finally(() => {
        pendingTerminalRef.current.delete(session.id);
      });
    }
  }, [sessions, terminals, createTerminal]);

  const handleSpawn = async (): Promise<void> => {
    // Use process.env.HOME-ish fallback — the main process spawn function
    // already defaults to `process.cwd()` if we pass an empty string, but
    // the PTY session type requires a non-empty cwd.
    const cwd = '/';
    const sessionId = await createSession({
      cwd,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });
    if (sessionId) {
      selectSession(sessionId);
    }
  };

  const selectedSession: PtySession | undefined = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId)
    : undefined;
  const selectedTerminal: TerminalInfo | undefined = selectedSession
    ? terminals.find((t) => t.sessionId === selectedSession.id)
    : undefined;

  return (
    <div className="panels">
      <div className="sidebar">
        <PeersList />
        <SessionsList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelect={selectSession}
        />
      </div>
      <div className="main-pane">
        <div className="toolbar">
          <button type="button" onClick={() => void handleSpawn()}>
            Spawn shell
          </button>
        </div>
        <div className="terminal-host">
          {selectedSession && selectedTerminal ? (
            <VirtualTerminal
              sessionId={selectedSession.id}
              terminalId={selectedTerminal.id}
              cols={DEFAULT_COLS}
              rows={DEFAULT_ROWS}
              isActive
              autoResize
              renderer="default"
            />
          ) : (
            <div className="empty-state">
              <em>
                {sessions.length === 0
                  ? 'Click "Spawn shell" to start a local PTY.'
                  : 'Select a session to attach a terminal.'}
              </em>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
