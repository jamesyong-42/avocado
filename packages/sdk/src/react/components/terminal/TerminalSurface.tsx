/**
 * TerminalSurface — headless interactive terminal bound to a PTY session.
 *
 * Owns behavior only: engine lifecycle (xterm | restty), PTY I/O wiring,
 * auto-fit via ResizeObserver, click-to-focus, and active/passive gating of
 * PTY resizes. Renders two bare divs — a root and an absolute-fill engine
 * host — with structural CSS only (positioning, overflow, engine-required
 * sizing). No colors, borders, typography, or chrome.
 *
 * Style from your own CSS via the state data attributes on the root:
 *
 *   [data-active]        present while this terminal is the active one
 *   [data-ready]         present once the engine has mounted
 *   [data-engine]        'xterm' | 'restty'
 *   [data-auto-resize]   present when auto-fit is enabled
 *
 * ```css
 * .my-terminal[data-active] { outline: 1px solid highlight; }
 * ```
 *
 * Children render above the engine host, so chrome overlays (badges, focus
 * rings, toolbars) can be layered inside the surface by the consumer.
 */

import {
  useCallback,
  useImperativeHandle,
  type CSSProperties,
  type HTMLAttributes,
  type JSX,
  type ReactNode,
  type Ref,
} from 'react';
import { useTerminalCore } from './useTerminalCore.js';
import type { TerminalCoreActions } from './renderers/types.js';
import type { TerminalEngineId, TerminalViewFactory } from './views/types.js';
// Side-effect: hide xterm helper textarea / style viewport. Also loaded
// lazily inside XtermTerminalView; importing here covers HMR and default path.
import 'xterm/css/xterm.css';

export interface TerminalSurfaceProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'onResize' | 'onInput' | 'onFocus' | 'onBlur'
  > {
  sessionId: string;
  terminalId: string;
  cols?: number;
  rows?: number;
  /** Active terminals own PTY sizing; passive ones only render output. */
  isActive?: boolean;
  /** Fit the engine to the host box and refit on container resize. */
  autoResize?: boolean;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
  /** Semantic focus intent (click or DOM focus inside the surface). */
  onFocus?: () => void;
  onBlur?: () => void;
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
  /** Injectable view factory (tests / custom engines). */
  createView?: TerminalViewFactory;
  /** Restty only: Ghostty builtin theme name. */
  ghosttyThemeName?: string;
  resttyRenderer?: 'auto' | 'webgpu' | 'webgl2';
  resttyLigatures?: boolean;
  resttyFontHinting?: boolean;
  resttyAlphaBlending?: 'native' | 'linear' | 'linear-corrected';
  resttyNerdIconScale?: number;
  /** Class applied to the inner engine host element. */
  hostClassName?: string;
  /** Imperative terminal actions (focus / blur / fit / write / resize). */
  actionsRef?: Ref<TerminalCoreActions>;
  /**
   * Render the engine-create error. Defaults to an unstyled, centered
   * `role="alert"` overlay tagged `[data-terminal-error]`; return `null`
   * to suppress entirely.
   */
  renderError?: (error: Error) => ReactNode;
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

function defaultRenderError(error: Error): ReactNode {
  return (
    <div
      role="alert"
      data-terminal-error=""
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        zIndex: 1,
      }}
    >
      {error.message}
    </div>
  );
}

export function TerminalSurface({
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
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, "Courier New", monospace',
  convertEol = false,
  suppressTerminalResponses = false,
  engine = 'xterm',
  createView,
  ghosttyThemeName,
  resttyRenderer,
  resttyLigatures,
  resttyFontHinting,
  resttyAlphaBlending,
  resttyNerdIconScale,
  hostClassName,
  actionsRef,
  renderError = defaultRenderError,
  className,
  style,
  children,
  ...rest
}: TerminalSurfaceProps): JSX.Element {
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
    createView,
    ghosttyThemeName,
    resttyRenderer,
    resttyLigatures,
    resttyFontHinting,
    resttyAlphaBlending,
    resttyNerdIconScale,
  });

  const { containerRef, fixedDimensions, isReady } = state;

  useImperativeHandle(actionsRef, () => actions, [actions]);

  const handleClick = useCallback(() => {
    actions.focus();
    onFocus?.();
  }, [actions, onFocus]);

  // Structural only. autoResize fills the consumer-controlled box; fixed
  // mode pins the box to the engine's cols×rows footprint.
  const structuralStyle: CSSProperties = autoResize
    ? {
        position: 'relative',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }
    : {
        position: 'relative',
        width: fixedDimensions?.width ?? 'auto',
        height: fixedDimensions?.height ?? 'auto',
        minWidth: fixedDimensions?.width ?? 'auto',
        minHeight: fixedDimensions?.height ?? 'auto',
        flexShrink: 0,
        flexGrow: 0,
        overflow: 'hidden',
      };

  return (
    <div
      {...rest}
      className={className}
      style={{ ...structuralStyle, ...style }}
      data-terminal-id={terminalId}
      data-session-id={sessionId}
      data-engine={engine}
      data-active={isActive ? '' : undefined}
      data-ready={isReady ? '' : undefined}
      data-auto-resize={autoResize ? '' : undefined}
    >
      {/* Engine host: absolute fill so xterm/restty always get a real size. */}
      <div
        ref={containerRef}
        className={hostClassName}
        data-terminal-host=""
        onClick={handleClick}
        onFocusCapture={onFocus}
        onBlurCapture={onBlur}
        style={HOST_FILL}
      />
      {error ? renderError(error) : null}
      {children}
    </div>
  );
}

export default TerminalSurface;
export type { TerminalEngineId };
