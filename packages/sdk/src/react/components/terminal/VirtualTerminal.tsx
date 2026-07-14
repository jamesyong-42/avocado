/**
 * VirtualTerminal — styled terminal bound to a PTY session.
 *
 * Thin wrapper over {@link TerminalSurface} that keeps the legacy visual
 * defaults (Tokyo Night / Ghostty host background, border radius, error
 * overlay). All behavior lives in TerminalSurface / useTerminalCore.
 *
 * @deprecated Use {@link TerminalSurface} and style it from your own CSS —
 * VirtualTerminal's baked-in colors and chrome will move out of the SDK in a
 * future release.
 */

import { type CSSProperties, type JSX, type ReactNode } from 'react';
import { TerminalSurface } from './TerminalSurface.js';
import type { TerminalEngineId } from './views/types.js';

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

function renderLegacyError(error: Error): ReactNode {
  return (
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
  );
}

export function VirtualTerminal({
  className = '',
  engine = 'xterm',
  autoResize = true,
  isActive = false,
  ...rest
}: VirtualTerminalProps): JSX.Element {
  // Match Ghostty Default Style Dark host when restty is selected.
  const hostBg = engine === 'restty' ? '#282c34' : '#1a1b26';

  const legacyStyle: CSSProperties = {
    backgroundColor: hostBg,
    borderRadius: '4px',
    ...(autoResize ? { minHeight: '100px' } : {}),
  };

  return (
    <TerminalSurface
      {...rest}
      engine={engine}
      autoResize={autoResize}
      isActive={isActive}
      className={`virtual-terminal ${className}`}
      hostClassName="virtual-terminal-host"
      style={legacyStyle}
      renderError={renderLegacyError}
    />
  );
}

export default VirtualTerminal;
export type { TerminalEngineId };
