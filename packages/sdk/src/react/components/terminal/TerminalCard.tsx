/**
 * TerminalCard - Reusable terminal container with header and controls
 */

import React, { useCallback, type JSX } from 'react';
import type { TerminalInfo, TerminalSettings, PtySession } from '#types';
import type { RendererType, CRTPreset } from './renderers/types';
import { VirtualTerminal } from './VirtualTerminal';
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
  renderer?: RendererType;
  crtPreset?: CRTPreset;
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
  renderer = 'default',
  crtPreset = 'classic',
}: TerminalCardProps): JSX.Element {
  const isUdsSession = session?.source === 'ipc';
  const hasCustomSize = settings.width !== undefined && settings.height !== undefined;
  const terminalAutoResize = settings.autoResize && !(isUdsSession && terminal.mode !== 'active');

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: 'e' | 's' | 'se') => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const containerEl = (e.target as HTMLElement).closest('[data-terminal-container]') as HTMLElement;
      if (!containerEl) return;
      const startWidth = containerEl.offsetWidth;
      const startHeight = containerEl.offsetHeight;

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        const newWidth = direction === 's' ? startWidth : Math.max(200, startWidth + deltaX);
        const newHeight = direction === 'e' ? startHeight : Math.max(100, startHeight + deltaY);
        onSettingsChange({ width: newWidth, height: newHeight });
      };

      const handleMouseUp = (): void => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = direction === 'se' ? 'nwse-resize' : direction === 'e' ? 'ew-resize' : 'ns-resize';
      document.body.style.userSelect = 'none';
    },
    [onSettingsChange]
  );

  return (
    <div data-terminal-container style={{ display: 'flex', flexDirection: 'column', border: '1px solid #414868', borderRadius: '4px', overflow: 'hidden', position: 'relative', minWidth: '200px', minHeight: '100px', ...(hasCustomSize ? { width: settings.width, height: settings.height, flexShrink: 0 } : {}) }}>
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
          <VirtualTerminal sessionId={terminal.sessionId} terminalId={terminal.id} cols={terminal.cols} rows={terminal.rows} isActive={terminal.mode === 'active'} autoResize={terminalAutoResize} convertEol={isUdsSession} suppressTerminalResponses={isUdsSession} onFocus={onFocus} onBlur={onBlur} renderer={renderer} crtPreset={crtPreset} />
        ) : (
          <HeadlessTerminal sessionId={terminal.sessionId} terminalId={terminal.id} cols={terminal.cols} rows={terminal.rows} isActive={terminal.mode === 'active'} showLineNumbers showCursor />
        )}
      </div>
      <div onMouseDown={(e) => handleResizeStart(e, 'e')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '6px', cursor: 'ew-resize', backgroundColor: 'transparent' }} />
      <div onMouseDown={(e) => handleResizeStart(e, 's')} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '6px', cursor: 'ns-resize', backgroundColor: 'transparent' }} />
      <div onMouseDown={(e) => handleResizeStart(e, 'se')} style={{ position: 'absolute', right: 0, bottom: 0, width: '12px', height: '12px', cursor: 'nwse-resize', backgroundColor: 'transparent' }} />
    </div>
  );
}

export default TerminalCard;
