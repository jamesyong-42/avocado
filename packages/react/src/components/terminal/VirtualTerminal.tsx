/**
 * VirtualTerminal Component
 *
 * Full interactive terminal using xterm.js in the renderer process.
 * Connects to a PTY session via the AvocadoProvider backend.
 */

import { useCallback, useRef, useState, useEffect, type JSX } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import 'xterm/css/xterm.css';
import { useTerminalCore } from './useTerminalCore';
import { getPreset, mergeWithPreset } from './renderers/presets';
import { useTextureSync, findXtermCanvas } from './renderers/webgl/useTextureSync';
import { TerminalPlane } from './renderers/webgl/TerminalPlane';
import { CRTEffect } from './renderers/webgl/CRTEffect';
import type { RendererType, CRTPreset, RendererOptions, VirtualTerminalRendererProps } from './renderers/types';

export interface VirtualTerminalProps extends VirtualTerminalRendererProps {
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
}

function WebGLScene({
  xtermCanvas,
  crtOptions,
  bloomOptions,
  containerSize,
}: {
  xtermCanvas: HTMLCanvasElement | null;
  crtOptions: RendererOptions['crt'];
  bloomOptions: RendererOptions['bloom'];
  containerSize: { width: number; height: number };
}) {
  const { texture, markDirty } = useTextureSync({ canvas: xtermCanvas, enabled: true });

  useEffect(() => {
    const interval = setInterval(() => markDirty(), 16);
    return () => clearInterval(interval);
  }, [markDirty]);

  const hasCRTEffects = Boolean(
    crtOptions && (crtOptions.scanlineIntensity || crtOptions.curvature || crtOptions.chromaticAberration || crtOptions.vignetteIntensity)
  );
  const hasBloom = Boolean(bloomOptions && bloomOptions.intensity && bloomOptions.intensity > 0);

  const renderEffects = () => {
    if (hasCRTEffects && hasBloom && crtOptions && bloomOptions) {
      return (
        <EffectComposer>
          <CRTEffect {...crtOptions} width={containerSize.width} height={containerSize.height} />
          <Bloom intensity={bloomOptions.intensity ?? 0.5} luminanceThreshold={bloomOptions.luminanceThreshold ?? 0.75} luminanceSmoothing={bloomOptions.luminanceSmoothing ?? 0.9} />
        </EffectComposer>
      );
    }
    if (hasCRTEffects && crtOptions) {
      return (<EffectComposer><CRTEffect {...crtOptions} width={containerSize.width} height={containerSize.height} /></EffectComposer>);
    }
    if (hasBloom && bloomOptions) {
      return (<EffectComposer><Bloom intensity={bloomOptions.intensity ?? 0.5} luminanceThreshold={bloomOptions.luminanceThreshold ?? 0.75} luminanceSmoothing={bloomOptions.luminanceSmoothing ?? 0.9} /></EffectComposer>);
    }
    return null;
  };

  return (
    <>
      <TerminalPlane texture={texture} canvas={xtermCanvas} />
      {renderEffects()}
    </>
  );
}

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
  renderer = 'default',
  crtPreset = 'classic',
  rendererOptions,
}: VirtualTerminalProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [xtermCanvas, setXtermCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const { state, actions } = useTerminalCore({
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
    useWebGLRenderer: true,
  });

  const { containerRef, fixedDimensions } = state;

  const preset = getPreset(crtPreset);
  const { crt: crtOptions, bloom: bloomOptions } = mergeWithPreset(preset, rendererOptions);

  useEffect(() => {
    if (renderer !== 'webgl') { setXtermCanvas(null); return; }
    const findCanvas = () => {
      const canvas = findXtermCanvas(containerRef.current);
      if (canvas) setXtermCanvas(canvas);
    };
    findCanvas();
    const timer1 = setTimeout(findCanvas, 100);
    const timer2 = setTimeout(findCanvas, 300);
    const timer3 = setTimeout(findCanvas, 500);
    const observer = new MutationObserver(findCanvas);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); observer.disconnect(); };
  }, [renderer, containerRef, state.isReady]);

  useEffect(() => {
    if (renderer !== 'webgl' || !wrapperRef.current) return;
    const updateSize = () => {
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(wrapperRef.current);
    return () => resizeObserver.disconnect();
  }, [renderer]);

  const handleClick = useCallback(() => {
    actions.focus();
    if (onFocus) onFocus();
  }, [actions, onFocus]);

  const containerStyle: React.CSSProperties = autoResize
    ? { width: '100%', height: '100%', minHeight: '100px', backgroundColor: '#1a1b26', borderRadius: '4px', overflow: 'hidden', position: 'relative' }
    : { width: fixedDimensions?.width ?? 'auto', height: fixedDimensions?.height ?? 'auto', minWidth: fixedDimensions?.width ?? 'auto', minHeight: fixedDimensions?.height ?? 'auto', flexShrink: 0, flexGrow: 0, backgroundColor: '#1a1b26', borderRadius: '4px', overflow: 'hidden', position: 'relative' };

  const xtermContainerStyle: React.CSSProperties = renderer === 'webgl'
    ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'all', zIndex: 1 }
    : { width: '100%', height: '100%' };

  return (
    <div ref={wrapperRef} className={`virtual-terminal ${className}`} style={containerStyle} data-terminal-id={terminalId} data-session-id={sessionId} data-is-active={isActive} data-auto-resize={autoResize} data-renderer={renderer}>
      <div ref={containerRef} onClick={handleClick} onFocusCapture={onFocus} onBlurCapture={onBlur} style={xtermContainerStyle} />
      {renderer === 'webgl' && (
        <Canvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }} orthographic camera={{ zoom: 1, position: [0, 0, 100], near: 0.1, far: 1000 }} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}>
          <WebGLScene xtermCanvas={xtermCanvas} crtOptions={crtOptions} bloomOptions={bloomOptions} containerSize={containerSize} />
        </Canvas>
      )}
    </div>
  );
}

export default VirtualTerminal;
export type { RendererType, CRTPreset, RendererOptions };
