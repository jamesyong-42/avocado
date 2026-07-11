/**
 * VirtualTerminal — interactive terminal bound to a PTY session.
 *
 * Engine-agnostic: xterm (default) or restty (libghostty-vt). Session I/O
 * goes through AvocadoProvider / TerminalBackend.
 */

import { useCallback, type CSSProperties, type JSX } from 'react';
import { useTerminalCore } from './useTerminalCore.js';
import type { TerminalEngineId } from './views/types.js';
// Side-effect: hide xterm helper textarea / style viewport. Also loaded
// lazily inside XtermTerminalView; importing here covers HMR and default path.
import 'xterm/css/xterm.css';

export interface VirtualTerminalProps {
  sessionId: string;
  terminalId: string;
  cols?: number;
  rows?: number;
  isActive?: boolean;
  autoResize?: boolean;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  fontSize?: number;
  fontFamily?: string;
  convertEol?: boolean;
  suppressTerminalResponses?: boolean;
  /**
   * Rendering engine.
   * - `xterm` (default): classic xterm.js
   * - `restty`: Ghostty VT via restty (optional peer dep)
   */
  engine?: TerminalEngineId;
}

const HOST_FILL: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
};

export function VirtualTerminal({
  sessionId,
  terminalId,
  cols = 80,
  rows = 24,
  isActive = false,
  autoResize = true,
  onResize,
  onInput,
  onFocus,
  onBlur,
  className = '',
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, "Courier New", monospace',
  convertEol = false,
  suppressTerminalResponses = false,
  engine = 'xterm',
}: VirtualTerminalProps): JSX.Element {
  const { state, actions, error } = useTerminalCore({
    sessionId,
    terminalId,
    cols,
    rows,
    isActive,
    autoResize,
    onResize,
    onInput,
    onFocus,
    onBlur,
    fontSize,
    fontFamily,
    convertEol,
    suppressTerminalResponses,
    engine,
  });

  const { containerRef, fixedDimensions, isReady } = state;

  const handleClick = useCallback(() => {
    actions.focus();
    onFocus?.();
  }, [actions, onFocus]);

  const containerStyle: CSSProperties = autoResize
    ? {
        width: '100%',
        height: '100%',
        minHeight: '100px',
        backgroundColor: '#1a1b26',
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative',
      }
    : {
        width: fixedDimensions?.width ?? 'auto',
        height: fixedDimensions?.height ?? 'auto',
        minWidth: fixedDimensions?.width ?? 'auto',
        minHeight: fixedDimensions?.height ?? 'auto',
        flexShrink: 0,
        flexGrow: 0,
        backgroundColor: '#1a1b26',
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative',
      };

  return (
    <div
      className={`virtual-terminal ${className}`}
      style={containerStyle}
      data-terminal-id={terminalId}
      data-session-id={sessionId}
      data-is-active={isActive}
      data-auto-resize={autoResize}
      data-engine={engine}
      data-ready={isReady}
    >
      {/* Engine host: absolute fill so xterm/restty always get a real size. */}
      <div
        ref={containerRef}
        className="virtual-terminal-host"
        onClick={handleClick}
        onFocusCapture={onFocus}
        onBlurCapture={onBlur}
        style={HOST_FILL}
      />
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            background: 'rgba(26,27,38,0.95)',
            color: '#f7768e',
            fontSize: 12,
            textAlign: 'center',
            zIndex: 2,
          }}
        >
          {error.message}
        </div>
      )}
    </div>
  );
}

export default VirtualTerminal;
export type { TerminalEngineId };
