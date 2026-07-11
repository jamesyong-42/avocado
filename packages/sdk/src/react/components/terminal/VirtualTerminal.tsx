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
  /** Restty only: Ghostty builtin theme name (default Ghostty Default Style Dark). */
  ghosttyThemeName?: string;
  resttyRenderer?: 'auto' | 'webgpu' | 'webgl2';
  resttyLigatures?: boolean;
  resttyFontHinting?: boolean;
  resttyAlphaBlending?: 'native' | 'linear' | 'linear-corrected';
  resttyNerdIconScale?: number;
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
  ghosttyThemeName,
  resttyRenderer,
  resttyLigatures,
  resttyFontHinting,
  resttyAlphaBlending,
  resttyNerdIconScale,
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
    ghosttyThemeName,
    resttyRenderer,
    resttyLigatures,
    resttyFontHinting,
    resttyAlphaBlending,
    resttyNerdIconScale,
  });

  const { containerRef, fixedDimensions, isReady } = state;

  const handleClick = useCallback(() => {
    actions.focus();
    onFocus?.();
  }, [actions, onFocus]);

  // Match Ghostty Default Style Dark host when restty is selected.
  const hostBg = engine === 'restty' ? '#282c34' : '#1a1b26';

  const containerStyle: CSSProperties = autoResize
    ? {
        width: '100%',
        height: '100%',
        minHeight: '100px',
        backgroundColor: hostBg,
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
        backgroundColor: hostBg,
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
