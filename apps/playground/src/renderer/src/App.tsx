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
 *      electron-backed `TerminalBackend` so `@vibecook/avocado-sdk/react`'s hooks and
 *      components can talk to the main process through IPC.
 *   4. Render:
 *        - status header with the local device identity
 *        - peers panel (mesh discovery)
 *        - sessions panel with create/destroy/resize/filter
 *        - terminals panel with type/mode selection and grid toggle
 *        - terminal grid (up to 3x3) with engine toggle (xterm | restty)
 */

import { useEffect, useRef, useState, type JSX } from 'react';
import {
  AvocadoProvider,
  usePTYSessions,
  useTerminals,
  useTerminalGrid,
} from '@vibecook/avocado-sdk/react';
import type { TerminalEngineId } from '@vibecook/avocado-sdk/react';

import { createElectronBackend } from './electron-backend';
import { AuthGate } from './components/AuthGate';
import { TerminalGrid } from './components/TerminalGrid';
import { PeersList } from './components/PeersList';
import { SessionsList } from './components/SessionsList';
import { TerminalsList } from './components/TerminalsList';
import type { NodeStatus, NodeStatusEvent } from '@shared/ipc';

// Single backend instance so `<AvocadoProvider>` doesn't recreate the
// identity across re-renders.
const backend = createElectronBackend();

export function App(): JSX.Element {
  const [status, setStatus] = useState<NodeStatus>('idle');
  const [statusError, setStatusError] = useState<string | undefined>(undefined);
  const [identity, setIdentity] = useState<NodeStatusEvent['identity']>();
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  // Avoid re-invoking start on StrictMode double-mount.
  const startedRef = useRef(false);

  // ─── Lifecycle ─────────��───────────────────────────────���───────────────
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

// ─── Body ───────────────────────────────────────────────��──────────────────

/**
 * Body component — only mounted when the truffle node is running, which
 * guarantees `backend.pty.list()` and friends will resolve.
 */
function PlaygroundBody(): JSX.Element {
  const {
    sessions,
    filteredSessions,
    selectedSessionId,
    selectedSession,
    sourceFilter,
    setSourceFilter,
    selectSession,
    createSession,
    destroySession,
    resizeSession,
  } = usePTYSessions();

  const {
    terminals,
    createTerminal,
    destroyTerminal,
    handleTerminalFocus,
    handleTerminalBlur,
  } = useTerminals();

  const {
    selectedIds,
    settings,
    gridLayout,
    getSelectedTerminals,
    toggleSelection,
    addToGrid,
    clearSelection,
    getSettings,
    updateSettings,
    maxTerminals,
  } = useTerminalGrid();

  const [engine, setEngine] = useState<TerminalEngineId>('xterm');

  const selectedTerminals = getSelectedTerminals(terminals);

  return (
    <div className="panels">
      <div className="sidebar">
        <PeersList />
        <SessionsList
          sessions={sessions}
          filteredSessions={filteredSessions}
          selectedSessionId={selectedSessionId}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          onSelect={selectSession}
          onCreate={createSession}
          onDestroy={destroySession}
          onResize={resizeSession}
        />
        <TerminalsList
          session={selectedSession}
          terminals={terminals}
          selectedIds={selectedIds}
          onToggleGrid={toggleSelection}
          onCreate={async (sessionId, type, options, session) => {
            const terminalId = await createTerminal(sessionId, type, options, session);
            if (terminalId) addToGrid(terminalId);
            return terminalId;
          }}
          onDestroy={async (terminalId) => {
            toggleSelection(terminalId); // remove from grid if present
            return destroyTerminal(terminalId);
          }}
          maxTerminals={maxTerminals}
        />
      </div>
      <div className="main-pane">
        {selectedTerminals.length === 0 ? (
          <div className="terminal-host">
            <div className="empty-state">
              <em>
                {sessions.length === 0
                  ? 'No sessions yet — create one in the sidebar.'
                  : terminals.length === 0
                    ? 'Creating terminal...'
                    : 'Select terminals in the sidebar to add them to the grid.'}
              </em>
            </div>
          </div>
        ) : (
          <div className="terminal-host">
            <TerminalGrid
              terminals={selectedTerminals}
              sessions={sessions}
              gridLayout={gridLayout}
              getSettings={getSettings}
              onSettingsChange={(terminalId, updates) => updateSettings(terminalId, updates)}
              onRemoveFromGrid={(terminalId) => {
                toggleSelection(terminalId);
                void destroyTerminal(terminalId);
              }}
              onTerminalFocus={handleTerminalFocus}
              onTerminalBlur={handleTerminalBlur}
              onClearAll={clearSelection}
              engine={engine}
              onEngineChange={setEngine}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
