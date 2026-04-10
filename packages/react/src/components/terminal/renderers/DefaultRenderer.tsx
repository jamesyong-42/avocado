/**
 * DefaultRenderer Component
 *
 * Standard terminal renderer - displays xterm.js canvas directly without effects.
 */

import type { JSX } from 'react';
import type { TerminalRendererProps } from './types';

export function DefaultRenderer({
  core,
  autoResize,
  onClick,
  onFocus,
  onBlur,
  className = '',
}: TerminalRendererProps): JSX.Element {
  const { containerRef, fixedDimensions } = core;

  const containerStyle: React.CSSProperties = autoResize
    ? { width: '100%', height: '100%', minHeight: '100px', backgroundColor: '#1a1b26', borderRadius: '4px', overflow: 'hidden', cursor: 'text' }
    : { width: fixedDimensions?.width ?? 'auto', height: fixedDimensions?.height ?? 'auto', minWidth: fixedDimensions?.width ?? 'auto', minHeight: fixedDimensions?.height ?? 'auto', flexShrink: 0, flexGrow: 0, backgroundColor: '#1a1b26', borderRadius: '4px', overflow: 'hidden', cursor: 'text' };

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onFocusCapture={onFocus}
      onBlurCapture={onBlur}
      className={`virtual-terminal ${className}`}
      style={containerStyle}
    />
  );
}

export default DefaultRenderer;
