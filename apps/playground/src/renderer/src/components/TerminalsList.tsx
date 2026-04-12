/**
 * TerminalsList — shows terminals for a session with grid-toggle controls.
 *
 * Each terminal has a checkbox to add/remove it from the grid, plus a
 * create-terminal form to spawn new virtual/headless terminals.
 */

import { useState, type JSX } from 'react';
import type { TerminalInfo, TerminalType, TerminalMode, PtySession } from '@vibecook/avocado-sdk/types';

export interface TerminalsListProps {
  session: PtySession | undefined;
  terminals: TerminalInfo[];
  selectedIds: string[];
  onToggleGrid: (terminalId: string) => void;
  onCreate: (
    sessionId: string,
    type: TerminalType,
    options: { cols: number; rows: number; mode: TerminalMode },
    session?: PtySession,
  ) => Promise<string | null>;
  onDestroy: (terminalId: string) => Promise<boolean>;
  maxTerminals: number;
}

export function TerminalsList({
  session,
  terminals,
  selectedIds,
  onToggleGrid,
  onCreate,
  onDestroy,
  maxTerminals,
}: TerminalsListProps): JSX.Element {
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState<TerminalType>('virtual');
  const [newMode, setNewMode] = useState<TerminalMode>('passive');
  const [newCols, setNewCols] = useState(80);
  const [newRows, setNewRows] = useState(24);
  const [createError, setCreateError] = useState<string | null>(null);

  const sessionTerminals = session
    ? terminals.filter((t) => t.sessionId === session.id)
    : [];

  // Auto-detect: only allow 'active' if session doesn't already have one
  const hasActiveTerminal = sessionTerminals.some((t) => t.mode === 'active');

  const handleCreate = async (): Promise<void> => {
    if (!session) return;
    setCreateError(null);
    const result = await onCreate(session.id, newType, { cols: newCols, rows: newRows, mode: newMode }, session);
    if (result) {
      setShowCreate(false);
    } else {
      setCreateError('Failed to create terminal (session may already have an active terminal)');
    }
  };

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>
          Terminals ({sessionTerminals.length})
        </h2>
        {session && (
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
        )}
      </div>

      {/* Create terminal form */}
      {showCreate && session && (
        <div style={{
          padding: 8, marginBottom: 8, background: '#0f1117',
          border: '1px solid #262a36', borderRadius: 4, fontSize: 11,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#9aa0b0', display: 'block', marginBottom: 2 }}>Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as TerminalType)}
                style={{
                  width: '100%', padding: '3px 4px', background: '#181b24',
                  border: '1px solid #3a4050', borderRadius: 3, color: '#e6e6e6',
                  fontSize: 11,
                }}
              >
                <option value="virtual">Virtual</option>
                <option value="headless">Headless</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#9aa0b0', display: 'block', marginBottom: 2 }}>Mode</label>
              <select
                value={newMode}
                onChange={(e) => setNewMode(e.target.value as TerminalMode)}
                style={{
                  width: '100%', padding: '3px 4px', background: '#181b24',
                  border: hasActiveTerminal && newMode === 'active' ? '1px solid #f7768e' : '1px solid #3a4050',
                  borderRadius: 3, color: '#e6e6e6',
                  fontSize: 11,
                }}
              >
                <option value="active" disabled={hasActiveTerminal}>Active{hasActiveTerminal ? ' (taken)' : ''}</option>
                <option value="passive">Passive</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#9aa0b0', display: 'block', marginBottom: 2 }}>cols</label>
              <input
                type="number" value={newCols} onChange={(e) => setNewCols(+e.target.value)}
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
                type="number" value={newRows} onChange={(e) => setNewRows(+e.target.value)}
                style={{
                  width: '100%', padding: '3px 6px', background: '#181b24',
                  border: '1px solid #3a4050', borderRadius: 3, color: '#e6e6e6',
                  fontSize: 11, boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          {createError && (
            <div style={{ marginBottom: 4, color: '#f7768e', fontSize: 10 }}>{createError}</div>
          )}
          <button
            type="button" onClick={() => void handleCreate()}
            style={{
              width: '100%', padding: '4px 0', background: '#9ece6a',
              color: '#1a1b26', border: 'none', borderRadius: 3,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Create Terminal
          </button>
        </div>
      )}

      {!session ? (
        <ul><li className="empty">Select a session first</li></ul>
      ) : sessionTerminals.length === 0 ? (
        <ul><li className="empty">No terminals — create one above</li></ul>
      ) : (
        <ul>
          {sessionTerminals.map((terminal) => {
            const inGrid = selectedIds.includes(terminal.id);
            return (
              <li
                key={terminal.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {/* Grid toggle */}
                <button
                  type="button"
                  onClick={() => onToggleGrid(terminal.id)}
                  disabled={!inGrid && selectedIds.length >= maxTerminals}
                  title={inGrid ? 'Remove from grid' : 'Add to grid'}
                  style={{
                    width: 20, height: 20, padding: 0, flexShrink: 0,
                    background: inGrid ? '#7aa2f7' : '#262a36',
                    color: inGrid ? '#1a1b26' : '#565f89',
                    border: 'none', borderRadius: 3, cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, lineHeight: '20px',
                  }}
                >
                  {inGrid ? selectedIds.indexOf(terminal.id) + 1 : '+'}
                </button>

                {/* Terminal info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9, padding: '0 4px', borderRadius: 2, fontWeight: 600,
                      background: terminal.type === 'virtual' ? '#2a2240' : '#262a36',
                      color: terminal.type === 'virtual' ? '#b89cff' : '#9aa0b0',
                    }}>
                      {terminal.type === 'virtual' ? 'VIR' : 'HDL'}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '0 4px', borderRadius: 2, fontWeight: 600,
                      background: terminal.mode === 'active' ? '#1a3322' : '#262a36',
                      color: terminal.mode === 'active' ? '#9ece6a' : '#565f89',
                    }}>
                      {terminal.mode === 'active' ? 'ACT' : 'PAS'}
                    </span>
                    <span style={{ fontSize: 9, color: '#565f89' }}>
                      {terminal.cols}x{terminal.rows}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: '#565f89', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {terminal.id.slice(0, 12)}
                  </div>
                </div>

                {/* Destroy */}
                <button
                  type="button"
                  onClick={() => void onDestroy(terminal.id)}
                  title="Destroy terminal"
                  style={{
                    padding: '1px 4px', fontSize: 9, background: '#3a1d20',
                    border: 'none', color: '#f7768e', borderRadius: 2, cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  x
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
