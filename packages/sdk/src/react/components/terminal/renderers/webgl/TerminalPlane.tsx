/**
 * TerminalPlane Component
 *
 * A React Three Fiber plane mesh that displays the terminal canvas
 * as a texture, sized to match the canvas aspect ratio.
 */

import { useMemo, useRef, useEffect, type ReactElement } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface TerminalPlaneProps {
  texture: THREE.CanvasTexture | null;
  canvas: HTMLCanvasElement | null;
}

export function TerminalPlane({ texture, canvas }: TerminalPlaneProps): ReactElement | null {
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      side: THREE.FrontSide,
    });
  }, [texture]);

  useEffect(() => {
    if (material && texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
  }, [material, texture]);

  const planeSize = useMemo(() => {
    if (!canvas) {
      return { width: viewport.width, height: viewport.height };
    }

    const canvasAspect = canvas.width / canvas.height;
    const viewportAspect = viewport.width / viewport.height;

    let width: number;
    let height: number;

    if (canvasAspect > viewportAspect) {
      width = viewport.width;
      height = viewport.width / canvasAspect;
    } else {
      height = viewport.height;
      width = viewport.height * canvasAspect;
    }

    return { width, height };
  }, [canvas, viewport.width, viewport.height]);

  useFrame(() => {
    if (meshRef.current) {
      const mesh = meshRef.current;
      const geo = mesh.geometry as THREE.PlaneGeometry;
      const params = geo.parameters;
      if (params.width !== planeSize.width || params.height !== planeSize.height) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(planeSize.width, planeSize.height);
      }
    }
  });

  if (!texture) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} material={material as any}>
      <planeGeometry args={[planeSize.width, planeSize.height]} />
    </mesh>
  );
}

export default TerminalPlane;
