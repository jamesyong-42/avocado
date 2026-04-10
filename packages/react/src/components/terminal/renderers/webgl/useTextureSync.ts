/**
 * useTextureSync Hook
 *
 * Synchronizes an HTML canvas element to a Three.js CanvasTexture.
 * Uses a dirty flag pattern to only update the texture when the
 * source canvas has changed.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface UseTextureSyncOptions {
  canvas: HTMLCanvasElement | null;
  enabled?: boolean;
}

export interface UseTextureSyncResult {
  texture: THREE.CanvasTexture | null;
  markDirty: () => void;
  forceUpdate: () => void;
}

export function useTextureSync({
  canvas,
  enabled = true,
}: UseTextureSyncOptions): UseTextureSyncResult {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const dirtyRef = useRef(true);
  const prevCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas || !enabled) {
      setTexture((prev) => {
        if (prev) prev.dispose();
        return null;
      });
      prevCanvasRef.current = null;
      return;
    }

    if (canvas !== prevCanvasRef.current) {
      const newTexture = new THREE.CanvasTexture(canvas);
      newTexture.minFilter = THREE.LinearFilter;
      newTexture.magFilter = THREE.LinearFilter;
      newTexture.format = THREE.RGBAFormat;
      newTexture.needsUpdate = true;

      setTexture((prev) => {
        if (prev) prev.dispose();
        return newTexture;
      });

      prevCanvasRef.current = canvas;
      dirtyRef.current = true;
    }
  }, [canvas, enabled]);

  useEffect(() => {
    return () => {
      setTexture((prev) => {
        if (prev) prev.dispose();
        return null;
      });
    };
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const forceUpdate = useCallback(() => {
    if (texture) {
      texture.needsUpdate = true;
      dirtyRef.current = false;
    }
  }, [texture]);

  useFrame(() => {
    if (dirtyRef.current && texture && enabled) {
      texture.needsUpdate = true;
      dirtyRef.current = false;
    }
  });

  return { texture, markDirty, forceUpdate };
}

/**
 * Find the xterm.js canvas element within a container
 */
export function findXtermCanvas(container: HTMLElement | null): HTMLCanvasElement | null {
  if (!container) return null;

  const screen = container.querySelector('.xterm-screen');
  if (!screen) {
    const canvases = container.querySelectorAll('canvas');
    if (canvases.length > 0) {
      let largest: HTMLCanvasElement | null = null;
      let largestArea = 0;
      canvases.forEach((c) => {
        const canvas = c as HTMLCanvasElement;
        const area = canvas.width * canvas.height;
        if (area > largestArea) {
          largestArea = area;
          largest = canvas;
        }
      });
      return largest;
    }
    return null;
  }

  const canvases = screen.querySelectorAll('canvas');
  if (canvases.length === 0) return null;

  for (const c of canvases) {
    const canvas = c as HTMLCanvasElement;
    if (canvas.className?.includes('text') || canvas.classList?.contains('xterm-text-layer')) {
      return canvas;
    }
  }

  return canvases[0] as HTMLCanvasElement;
}

export default useTextureSync;
