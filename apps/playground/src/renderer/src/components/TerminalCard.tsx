/**
 * TerminalCard — playground terminal container with header and controls.
 *
 * Playground chrome (Tokyo Night styling, badges, FIT/close buttons) built
 * on the SDK's headless primitives: TerminalSurface + useResizeHandle.
 */

import { useRef, type JSX, type ReactNode } from 'react';
import type { TerminalInfo, TerminalSettings, PtySession } from '@vibecook/avocado-sdk/types';
import {
  TerminalSurface,
  useResizeHandle,
  type TerminalEngineId,
} from '@vibecook/avocado-sdk/react';
import { HeadlessTerminal } from './HeadlessTerminal';

export interface TerminalCardProps {
  terminal: TerminalInfo;
  session: PtySession | undefined;
  index: number;
  settings: TerminalSettings;
  onSettingsChange: (updates: Partial<TerminalSettings>) => void;
  onClose: () => void;
  onFocus: () => void;
  onBlur: () => void;
  engine?: TerminalEngineId;
}

function renderTerminalError(error: Error): ReactNode {
  return (
    <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: 'rgba(26,27,38,0.95)', color: '#f7768e', fontSize: 12, textAlign: 'center', zIndex: 2 }}>
      {error.message}
    </div>
  );
}

export function TerminalCard({
  terminal,
  session,
  index,
  settings,
  onSettingsChange,
  onClose,
  onFocus,
  onBlur,
  engine = 'xterm',
}: TerminalCardProps): JSX.Element {
  const isUdsSession = session?.source === 'ipc';
  const hasCustomSize = settings.width !== undefined && settings.height !== undefined;
  const terminalAutoResize = settings.autoResize && !(isUdsSession && terminal.mode !== 'active');

  const containerRef = useRef<HTMLDivElement>(null);
  const { getHandleProps } = useResizeHandle({
    targetRef: containerRef,
    minWidth: 200,
    minHeight: 100,
    onResize: ({ width, height }) => onSettingsChange({ width, height }),
  });
  const eHandle = getHandleProps('e');
  const sHandle = getHandleProps('s');
  const seHandle = getHandleProps('se');

  // Match Ghostty Default Style Dark host when restty is selected.
  const hostBg = engine === 'restty' ? '#282c34' : '#1a1b26';

  return (
    <div ref={containerRef} data-terminal-container style={{ display: 'flex', flexDirection: 'column', border: '1px solid #414868', borderRadius: '4px', overflow: 'hidden', position: 'relative', minWidth: '200px', minHeight: '100px', ...(hasCustomSize ? { width: settings.width, height: settings.height, flexShrink: 0 } : {}) }}>
      <div style={{ padding: '4px 8px', backgroundColor: '#1a1b26', borderBottom: '1px solid #414868', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', gap: '4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ backgroundColor: '#7aa2f7', color: '#1a1b26', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>{index + 1}</span>
          <span style={{ color: '#565f89' }}>{terminal.type === 'virtual' ? 'VIR' : 'HDL'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span title={terminal.mode === 'active' ? 'Active (focused)' : 'Passive'} style={{ padding: '2px 6px', backgroundColor: terminal.mode === 'active' ? '#9ece6a' : '#565f89', color: '#1a1b26', borderRadius: '3px', fontSize: '9px', fontWeight: 'bold' }}>{terminal.mode === 'active' ? 'ACT' : 'PAS'}</span>
          {terminal.type === 'virtual' && (<button onClick={() => onSettingsChange({ autoResize: !settings.autoResize })} title={settings.autoResize ? 'Disable Auto Resize' : 'Enable Auto Resize'} style={{ padding: '2px 6px', backgroundColor: settings.autoResize ? '#7aa2f7' : '#414868', color: settings.autoResize ? '#1a1b26' : '#c0caf5', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '9px' }}>FIT</button>)}
          <span style={{ color: '#565f89', fontSize: '9px' }}>{terminal.cols}x{terminal.rows}</span>
        </div>
        <button onClick={onClose} title="Remove from grid" style={{ padding: '2px 6px', backgroundColor: 'transparent', color: '#f7768e', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>x</button>
      </div>
      <div style={{ flex: 1, overflow: settings.autoResize ? 'hidden' : 'auto', position: 'relative' }}>
        {terminal.type === 'virtual' ? (
          <TerminalSurface
            sessionId={terminal.sessionId}
            terminalId={terminal.id}
            cols={terminal.cols}
            rows={terminal.rows}
            isActive={terminal.mode === 'active'}
            autoResize={terminalAutoResize}
            convertEol={isUdsSession}
            suppressTerminalResponses={isUdsSession}
            onFocus={onFocus}
            onBlur={onBlur}
            engine={engine}
            className="virtual-terminal"
            hostClassName="virtual-terminal-host"
            style={{ backgroundColor: hostBg, borderRadius: '4px', ...(terminalAutoResize ? { minHeight: '100px' } : {}) }}
            renderError={renderTerminalError}
          />
        ) : (
          <HeadlessTerminal sessionId={terminal.sessionId} terminalId={terminal.id} cols={terminal.cols} rows={terminal.rows} isActive={terminal.mode === 'active'} showLineNumbers showCursor />
        )}
      </div>
      <div {...eHandle} style={{ ...eHandle.style, position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', backgroundColor: 'transparent' }} />
      <div {...sHandle} style={{ ...sHandle.style, position: 'absolute', left: 0, right: 0, bottom: 0, height: '6px', backgroundColor: 'transparent' }} />
      <div {...seHandle} style={{ ...seHandle.style, position: 'absolute', right: 0, bottom: 0, width: '12px', height: '12px', backgroundColor: 'transparent' }} />
    </div>
  );
}

export default TerminalCard;
