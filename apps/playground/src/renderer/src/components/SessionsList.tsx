/**
 * SessionsList — PTY session management panel.
 *
 * Features:
 *   - Source filter (all / local / ipc / remote)
 *   - Session create form (cwd, cols, rows)
 *   - Per-session controls (destroy, resize)
 *   - Session detail display (source badge, pid, dimensions, running state)
 */

import { useState, type JSX } from 'react';
import type { PtySession, CreateSessionOptions } from '@vibecook/avocado-sdk/types';
import type { SessionSourceFilter } from '@vibecook/avocado-sdk/react';

export interface SessionsListProps {
  sessions: PtySession[];
  filteredSessions: PtySession[];
  selectedSessionId: string | null;
  sourceFilter: SessionSourceFilter;
  onSourceFilterChange: (filter: SessionSourceFilter) => void;
  onSelect: (sessionId: string) => void;
  onCreate: (options: CreateSessionOptions) => Promise<string | null>;
  onDestroy: (sessionId: string) => Promise<boolean>;
  onResize: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
}

const SOURCE_FILTERS: { value: SessionSourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'local', label: 'Local' },
  { value: 'ipc', label: 'IPC' },
  { value: 'remote', label: 'Remote' },
];

export function SessionsList({
  sessions,
  filteredSessions,
  selectedSessionId,
  sourceFilter,
  onSourceFilterChange,
  onSelect,
  onCreate,
  onDestroy,
  onResize,
}: SessionsListProps): JSX.Element {
  const [showCreate, setShowCreate] = useState(false);
  const [cwd, setCwd] = useState('/');
  const [cols, setCols] = useState(80);
  const [rows, setRows] = useState(24);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeCols, setResizeCols] = useState(80);
  const [resizeRows, setResizeRows] = useState(24);

  const handleCreate = async (): Promise<void> => {
    await onCreate({ cwd, cols, rows });
    setShowCreate(false);
  };

  const handleResize = async (sessionId: string): Promise<void> => {
    await onResize(sessionId, resizeCols, resizeRows);
    setResizingId(null);
  };

  const openResize = (session: PtySession): void => {
    setResizeCols(session.cols);
    setResizeRows(session.rows);
    setResizingId(session.id);
  };

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Sessions ({sessions.length})</h2>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: '2px 8px', fontSize: 11, background: '#2a3040',
            border: '1px solid #3a4050', color: '#e6e6e6', borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {showCreate ? 'Cancel' : '+ New'}
        </button>
      </div>

      {/* Source filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onSourceFilterChange(f.value)}
            style={{
              padding: '2px 6px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
              border: 'none',
              background: sourceFilter === f.value ? '#7aa2f7' : '#262a36',
              color: sourceFilter === f.value ? '#1a1b26' : '#9aa0b0',
              fontWeight: sourceFilter === f.value ? 700 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          padding: 8, marginBottom: 8, background: '#0f1117',
          border: '1px solid #262a36', borderRadius: 4, fontSize: 11,
        }}>
          <div style={{ marginBottom: 4 }}>
            <label style={{ color: '#9aa0b0', display: 'block', marginBottom: 2 }}>cwd</label>
            <input
              type="text" value={cwd} onChange={(e) => setCwd(e.target.value)}
              style={{
                width: '100%', padding: '3px 6px', background: '#181b24',
                border: '1px solid #3a4050', borderRadius: 3, color: '#e6e6e6',
                fontSize: 11, boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#9aa0b0', display: 'block', marginBottom: 2 }}>cols</label>
              <input
                type="number" value={cols} onChange={(e) => setCols(+e.target.value)}
                style={{
                  width: '100%', padding: '3px 6px', background: '#181b24',
                  border: '1px solid #3a4050', borderRadius: 3, color: '#e6e6e6',
                  fontSize: 11, boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#9aa0b0', display: 'block', marginBottom: 2 }}>rows</label>
              <input
                type="number" value={rows} onChange={(e) => setRows(+e.target.value)}
                style={{
                  width: '100%', padding: '3px 6px', background: '#181b24',
                  border: '1px solid #3a4050', borderRadius: 3, color: '#e6e6e6',
                  fontSize: 11, boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <button
            type="button" onClick={() => void handleCreate()}
            style={{
              width: '100%', padding: '4px 0', background: '#9ece6a',
              color: '#1a1b26', border: 'none', borderRadius: 3,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Spawn
          </button>
        </div>
      )}

      {/* Session list */}
      {filteredSessions.length === 0 ? (
        <ul><li className="empty">No sessions — create one above</li></ul>
      ) : (
        <ul>
          {filteredSessions.map((session) => (
            <li
              key={session.id}
              className={selectedSessionId === session.id ? 'active' : undefined}
              onClick={() => onSelect(session.id)}
              title={session.id}
              style={{ position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{session.command}</strong>
                <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => openResize(session)}
                    title="Resize"
                    style={{
                      padding: '1px 4px', fontSize: 9, background: '#262a36',
                      border: 'none', color: '#9aa0b0', borderRadius: 2, cursor: 'pointer',
                    }}
                  >
                    Sz
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDestroy(session.id)}
                    title="Destroy session"
                    style={{
                      padding: '1px 4px', fontSize: 9, background: '#3a1d20',
                      border: 'none', color: '#f7768e', borderRadius: 2, cursor: 'pointer',
                    }}
                  >
                    x
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#9aa0b0', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                <span style={{
                  padding: '0 4px', borderRadius: 2, fontSize: 9, fontWeight: 600,
                  background: session.source === 'local' ? '#1a3322' : session.source === 'ipc' ? '#2a2240' : '#1a2a40',
                  color: session.source === 'local' ? '#7be490' : session.source === 'ipc' ? '#b89cff' : '#7dcfff',
                }}>
                  {session.source}
                </span>
                <span>pid {session.pid}</span>
                <span>{session.cols}x{session.rows}</span>
                {!session.isRunning && (
                  <span style={{ color: '#f7768e' }}>
                    exited{session.exitCode != null ? ` (${session.exitCode})` : ''}
                  </span>
                )}
                {session.deviceId && (
                  <span style={{ color: '#7dcfff', fontSize: 9 }}>
                    {session.deviceId.slice(0, 6)}
                  </span>
                )}
              </div>

              {/* Inline resize form */}
              {resizingId === session.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 4, padding: 6, background: '#0f1117',
                    border: '1px solid #262a36', borderRadius: 3, fontSize: 10,
                  }}
                >
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    <input
                      type="number" value={resizeCols}
                      onChange={(e) => setResizeCols(+e.target.value)}
                      style={{
                        width: 50, padding: '2px 4px', background: '#181b24',
                        border: '1px solid #3a4050', borderRadius: 2, color: '#e6e6e6', fontSize: 10,
                      }}
                    />
                    <span style={{ color: '#565f89' }}>x</span>
                    <input
                      type="number" value={resizeRows}
                      onChange={(e) => setResizeRows(+e.target.value)}
                      style={{
                        width: 50, padding: '2px 4px', background: '#181b24',
                        border: '1px solid #3a4050', borderRadius: 2, color: '#e6e6e6', fontSize: 10,
                      }}
                    />
                    <button
                      type="button" onClick={() => void handleResize(session.id)}
                      style={{
                        padding: '2px 6px', background: '#7aa2f7', color: '#1a1b26',
                        border: 'none', borderRadius: 2, fontSize: 10, cursor: 'pointer',
                      }}
                    >
                      Apply
                    </button>
                    <button
                      type="button" onClick={() => setResizingId(null)}
                      style={{
                        padding: '2px 6px', background: '#262a36', color: '#9aa0b0',
                        border: 'none', borderRadius: 2, fontSize: 10, cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
