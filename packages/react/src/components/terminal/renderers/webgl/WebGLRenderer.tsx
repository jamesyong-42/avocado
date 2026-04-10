/**
 * WebGLRenderer Component
 *
 * Terminal renderer using React Three Fiber with CRT shader effects and bloom.
 * Hidden xterm container receives input, R3F Canvas renders visual output.
 */

import { useRef, useState, useEffect, useCallback, type JSX } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { TerminalRendererProps } from '../types';
import { getPreset, mergeWithPreset } from '../presets';
import { TerminalPlane } from './TerminalPlane';
import { CRTEffect } from './CRTEffect';
import { useTextureSync, findXtermCanvas } from './useTextureSync';

function WebGLScene({
  xtermCanvas,
  crtOptions,
  bloomOptions,
  containerSize,
}: {
  xtermCanvas: HTMLCanvasElement | null;
  crtOptions: NonNullable<TerminalRendererProps['rendererOptions']>['crt'];
  bloomOptions: NonNullable<TerminalRendererProps['rendererOptions']>['bloom'];
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
      return (
        <EffectComposer>
          <CRTEffect {...crtOptions} width={containerSize.width} height={containerSize.height} />
        </EffectComposer>
      );
    }
    if (hasBloom && bloomOptions) {
      return (
        <EffectComposer>
          <Bloom intensity={bloomOptions.intensity ?? 0.5} luminanceThreshold={bloomOptions.luminanceThreshold ?? 0.75} luminanceSmoothing={bloomOptions.luminanceSmoothing ?? 0.9} />
        </EffectComposer>
      );
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

export function WebGLRenderer({
  core,
  autoResize,
  onClick,
  onFocus,
  onBlur,
  className = '',
  crtPreset = 'classic',
  rendererOptions,
}: TerminalRendererProps): JSX.Element {
  const { containerRef, fixedDimensions } = core;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [xtermCanvas, setXtermCanvas] = useState<HTMLCanvasElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const preset = getPreset(crtPreset);
  const { crt: crtOptions, bloom: bloomOptions } = mergeWithPreset(preset, rendererOptions);

  useEffect(() => {
    const findCanvas = () => {
      const canvas = findXtermCanvas(containerRef.current);
      if (canvas) setXtermCanvas(canvas);
    };
    findCanvas();
    const timer = setTimeout(findCanvas, 100);
    const observer = new MutationObserver(findCanvas);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [containerRef]);

  useEffect(() => {
    if (!wrapperRef.current) return;
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
  }, []);

  const handleCanvasClick = useCallback(() => {
    const xtermElement = containerRef.current?.querySelector('.xterm') as HTMLElement;
    if (xtermElement) xtermElement.focus();
    onClick?.();
  }, [containerRef, onClick]);

  const containerStyle: React.CSSProperties = autoResize
    ? { width: '100%', height: '100%', minHeight: '100px', backgroundColor: '#1a1b26', borderRadius: '4px', overflow: 'hidden', position: 'relative' }
    : { width: fixedDimensions?.width ?? 'auto', height: fixedDimensions?.height ?? 'auto', minWidth: fixedDimensions?.width ?? 'auto', minHeight: fixedDimensions?.height ?? 'auto', flexShrink: 0, flexGrow: 0, backgroundColor: '#1a1b26', borderRadius: '4px', overflow: 'hidden', position: 'relative' };

  return (
    <div ref={wrapperRef} className={`virtual-terminal webgl-renderer ${className}`} style={containerStyle}>
      <div ref={containerRef} onClick={onClick} onFocusCapture={onFocus} onBlurCapture={onBlur} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'all', zIndex: 1, cursor: 'text' }} />
      <Canvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }} orthographic camera={{ zoom: 1, position: [0, 0, 100], near: 0.1, far: 1000 }} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} onClick={handleCanvasClick}>
        <WebGLScene xtermCanvas={xtermCanvas} crtOptions={crtOptions} bloomOptions={bloomOptions} containerSize={containerSize} />
      </Canvas>
    </div>
  );
}

export default WebGLRenderer;
