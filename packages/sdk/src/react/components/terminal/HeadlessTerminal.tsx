/**
 * HeadlessTerminal Component
 *
 * Display-only terminal that shows content from a headless terminal
 * running in the backend. Uses useAvocadoBackend() instead of window.desktopAPI.
 */

import { useEffect, useState, useCallback, useRef, type JSX } from 'react';
import { useAvocadoBackend } from '../../context/AvocadoProvider';

export interface HeadlessTerminalProps {
  terminalId: string;
  sessionId: string;
  cols?: number;
  rows?: number;
  isActive?: boolean;
  refreshInterval?: number;
  className?: string;
  fontSize?: number;
  fontFamily?: string;
  showLineNumbers?: boolean;
  showCursor?: boolean;
}

interface ScreenState {
  lines: string[];
  content: string;
  cursorX: number;
  cursorY: number;
  lastUpdate: Date;
}

export function HeadlessTerminal({
  terminalId,
  sessionId,
  cols = 80,
  rows = 24,
  isActive = false,
  refreshInterval = 100,
  className = '',
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, "Courier New", monospace',
  showLineNumbers = false,
  showCursor = true,
}: HeadlessTerminalProps): JSX.Element {
  const backend = useAvocadoBackend();
  const [screenState, setScreenState] = useState<ScreenState>({
    lines: [],
    content: '',
    cursorX: 0,
    cursorY: 0,
    lastUpdate: new Date(),
  });
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchContent = useCallback(async () => {
    try {
      const [linesResult, cursorResult] = await Promise.all([
        backend.terminal.getScreenLines?.(terminalId),
        backend.terminal.getCursorPosition?.(terminalId),
      ]);

      if (linesResult?.success && linesResult.lines) {
        setScreenState({
          lines: linesResult.lines,
          content: linesResult.lines.join('\n'),
          cursorX: cursorResult?.success ? cursorResult.position?.x ?? 0 : 0,
          cursorY: cursorResult?.success ? cursorResult.position?.y ?? 0 : 0,
          lastUpdate: new Date(),
        });
        setError(null);
      } else if (linesResult && !linesResult.success) {
        setError(linesResult.error || 'Failed to fetch content');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [terminalId, backend]);

  useEffect(() => {
    fetchContent();
    if (refreshInterval > 0) {
      refreshTimerRef.current = setInterval(fetchContent, refreshInterval);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [terminalId, refreshInterval, fetchContent]);

  const renderLine = (line: string, lineIndex: number): JSX.Element => {
    const isCursorLine = showCursor && lineIndex === screenState.cursorY;

    if (!isCursorLine) {
      return (
        <div key={lineIndex} className="terminal-line" style={{ whiteSpace: 'pre', height: `${fontSize * 1.2}px`, lineHeight: `${fontSize * 1.2}px` }}>
          {showLineNumbers && (<span style={{ display: 'inline-block', width: '3em', textAlign: 'right', marginRight: '1em', color: '#565f89', userSelect: 'none' }}>{lineIndex + 1}</span>)}
          {line || ' '}
        </div>
      );
    }

    const beforeCursor = line.slice(0, screenState.cursorX);
    const cursorChar = line[screenState.cursorX] || ' ';
    const afterCursor = line.slice(screenState.cursorX + 1);

    return (
      <div key={lineIndex} className="terminal-line" style={{ whiteSpace: 'pre', height: `${fontSize * 1.2}px`, lineHeight: `${fontSize * 1.2}px` }}>
        {showLineNumbers && (<span style={{ display: 'inline-block', width: '3em', textAlign: 'right', marginRight: '1em', color: '#565f89', userSelect: 'none' }}>{lineIndex + 1}</span>)}
        {beforeCursor}
        <span style={{ backgroundColor: '#c0caf5', color: '#1a1b26' }}>{cursorChar}</span>
        {afterCursor}
      </div>
    );
  };

  return (
    <div className={`headless-terminal ${className}`} style={{ width: '100%', height: '100%', backgroundColor: '#1a1b26', color: '#c0caf5', fontFamily, fontSize: `${fontSize}px`, borderRadius: '4px', overflow: 'auto', padding: '8px', boxSizing: 'border-box' }} data-terminal-id={terminalId} data-session-id={sessionId} data-is-active={isActive}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #414868', fontSize: '12px', color: '#565f89' }}>
        <span>Headless Terminal ({cols}x{rows}){isActive && (<span style={{ marginLeft: '8px', padding: '2px 6px', backgroundColor: '#9ece6a', color: '#1a1b26', borderRadius: '4px', fontSize: '10px' }}>ACTIVE</span>)}</span>
        <span>Cursor: ({screenState.cursorX}, {screenState.cursorY})</span>
      </div>
      {error && (<div style={{ padding: '8px', backgroundColor: '#f7768e20', color: '#f7768e', borderRadius: '4px', marginBottom: '8px' }}>Error: {error}</div>)}
      <div className="terminal-screen" style={{ minHeight: `${rows * fontSize * 1.2}px` }}>
        {screenState.lines.length > 0 ? screenState.lines.map((line, index) => renderLine(line, index)) : (<div style={{ color: '#565f89', fontStyle: 'italic' }}>No content yet...</div>)}
      </div>
      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #414868', fontSize: '10px', color: '#565f89', textAlign: 'right' }}>Last update: {screenState.lastUpdate.toLocaleTimeString()}</div>
    </div>
  );
}

export default HeadlessTerminal;
