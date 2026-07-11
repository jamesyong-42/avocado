/**
 * TerminalGrid - Display multiple terminals in a responsive grid
 */

import type { JSX } from 'react';
import type { TerminalInfo, TerminalSettings, PtySession } from '#types';
import type { TerminalEngineId } from './views/types.js';
import { TerminalCard } from './TerminalCard.js';

export interface GridLayout {
  cols: number;
  rows: number;
}

export interface TerminalGridProps {
  terminals: TerminalInfo[];
  sessions: PtySession[];
  gridLayout: GridLayout;
  getSettings: (terminalId: string) => TerminalSettings;
  onSettingsChange: (terminalId: string, updates: Partial<TerminalSettings>) => void;
  onRemoveFromGrid: (terminalId: string) => void;
  onTerminalFocus: (terminal: TerminalInfo) => void;
  onTerminalBlur: (terminal: TerminalInfo) => void;
  onClearAll?: () => void;
  /** Rendering engine for all virtual terminals in the grid. */
  engine?: TerminalEngineId;
  onEngineChange?: (engine: TerminalEngineId) => void;
}

export function TerminalGrid({
  terminals,
  sessions,
  gridLayout,
  getSettings,
  onSettingsChange,
  onRemoveFromGrid,
  onTerminalFocus,
  onTerminalBlur,
  onClearAll,
  engine = 'xterm',
  onEngineChange,
}: TerminalGridProps): JSX.Element {
  if (terminals.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#565f89',
          gap: '8px',
        }}
      >
        <span>Click terminals in the left panel to add them to the grid</span>
        <span style={{ fontSize: '12px' }}>(Up to 9 terminals in a 3x3 grid)</span>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        padding: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          marginBottom: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          {terminals.length} Terminal{terminals.length > 1 ? 's' : ''} ({gridLayout.cols}x
          {gridLayout.rows} grid)
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onEngineChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#565f89' }}>Engine:</span>
              <button
                type="button"
                onClick={() => onEngineChange(engine === 'xterm' ? 'restty' : 'xterm')}
                title={
                  engine === 'restty'
                    ? 'Using restty (libghostty-vt). Click for xterm.'
                    : 'Using xterm.js. Click for restty (Ghostty VT).'
                }
                style={{
                  padding: '4px 8px',
                  backgroundColor: engine === 'restty' ? '#bb9af7' : '#414868',
                  color: engine === 'restty' ? '#1a1b26' : '#c0caf5',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: engine === 'restty' ? 'bold' : 'normal',
                }}
              >
                {engine === 'restty' ? 'restty' : 'xterm'}
              </button>
            </div>
          )}
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              style={{
                padding: '4px 8px',
                backgroundColor: '#414868',
                color: '#c0caf5',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`,
          gap: '8px',
          overflow: 'auto',
        }}
      >
        {terminals.map((terminal, index) => {
          const session = sessions.find((s) => s.id === terminal.sessionId);
          return (
            <TerminalCard
              key={terminal.id}
              terminal={terminal}
              session={session}
              index={index}
              settings={getSettings(terminal.id)}
              onSettingsChange={(updates) => onSettingsChange(terminal.id, updates)}
              onClose={() => onRemoveFromGrid(terminal.id)}
              onFocus={() => onTerminalFocus(terminal)}
              onBlur={() => onTerminalBlur(terminal)}
              engine={engine}
            />
          );
        })}
      </div>
    </div>
  );
}

export default TerminalGrid;
