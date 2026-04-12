/**
 * CRTEffect - Custom Postprocessing Effect
 *
 * A GLSL shader effect that simulates classic CRT monitor characteristics:
 * - Scanlines, Curvature, Chromatic Aberration, Vignette, Phosphor Glow, Flicker
 */

import { forwardRef, useMemo, useEffect } from 'react';
import { Effect } from 'postprocessing';
import * as THREE from 'three';
import type { CRTOptions } from '../types';

const fragmentShader = /* glsl */ `
uniform float scanlineIntensity;
uniform float curvature;
uniform float chromaticAberration;
uniform float vignetteIntensity;
uniform float phosphorGlow;
uniform float flickerIntensity;
uniform float time;
uniform vec2 resolution;

vec2 curveUV(vec2 uv) {
  if (curvature <= 0.0) return uv;
  vec2 curved = uv * 2.0 - 1.0;
  vec2 offset = curved.yx * curved.yx * curvature;
  curved += curved * offset;
  return curved * 0.5 + 0.5;
}

bool isInBounds(vec2 uv) {
  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 curvedUV = curveUV(uv);

  if (!isInBounds(curvedUV)) {
    outputColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec4 color;

  if (chromaticAberration > 0.0) {
    float aberration = chromaticAberration / resolution.x;
    vec2 direction = (curvedUV - 0.5) * 2.0;
    float dist = length(direction);
    vec2 offset = direction * aberration * dist;

    float r = texture2D(inputBuffer, curvedUV + offset).r;
    float g = texture2D(inputBuffer, curvedUV).g;
    float b = texture2D(inputBuffer, curvedUV - offset).b;
    color = vec4(r, g, b, 1.0);
  } else {
    color = texture2D(inputBuffer, curvedUV);
  }

  if (scanlineIntensity > 0.0) {
    float scanline = sin(curvedUV.y * resolution.y * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 1.5);
    color.rgb *= 1.0 - (scanlineIntensity * (1.0 - scanline));
  }

  if (phosphorGlow > 0.0) {
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb += vec3(0.0, phosphorGlow * luminance * 0.1, 0.0);
  }

  if (vignetteIntensity > 0.0) {
    vec2 vignetteUV = curvedUV * (1.0 - curvedUV);
    float vignette = vignetteUV.x * vignetteUV.y * 15.0;
    vignette = pow(vignette, vignetteIntensity);
    color.rgb *= vignette;
  }

  if (flickerIntensity > 0.0) {
    float flicker = 1.0 - flickerIntensity * 0.5 * (sin(time * 60.0) * 0.5 + 0.5);
    color.rgb *= flicker;
  }

  outputColor = color;
}
`;

class CRTEffectImpl extends Effect {
  private _scanlineIntensity: THREE.Uniform;
  private _curvature: THREE.Uniform;
  private _chromaticAberration: THREE.Uniform;
  private _vignetteIntensity: THREE.Uniform;
  private _phosphorGlow: THREE.Uniform;
  private _flickerIntensity: THREE.Uniform;
  private _time: THREE.Uniform;
  private _resolution: THREE.Uniform;

  constructor({
    scanlineIntensity = 0.2,
    curvature = 0.12,
    chromaticAberration = 1.5,
    vignetteIntensity = 0.3,
    phosphorGlow = 0.1,
    flickerIntensity = 0.0,
    resolution = new THREE.Vector2(1920, 1080),
  }: {
    scanlineIntensity?: number;
    curvature?: number;
    chromaticAberration?: number;
    vignetteIntensity?: number;
    phosphorGlow?: number;
    flickerIntensity?: number;
    resolution?: THREE.Vector2;
  } = {}) {
    const uniforms = new Map<string, THREE.Uniform>([
      ['scanlineIntensity', new THREE.Uniform(scanlineIntensity)],
      ['curvature', new THREE.Uniform(curvature)],
      ['chromaticAberration', new THREE.Uniform(chromaticAberration)],
      ['vignetteIntensity', new THREE.Uniform(vignetteIntensity)],
      ['phosphorGlow', new THREE.Uniform(phosphorGlow)],
      ['flickerIntensity', new THREE.Uniform(flickerIntensity)],
      ['time', new THREE.Uniform(0.0)],
      ['resolution', new THREE.Uniform(resolution)],
    ]);

    super('CRTEffect', fragmentShader, { uniforms });

    this._scanlineIntensity = uniforms.get('scanlineIntensity')!;
    this._curvature = uniforms.get('curvature')!;
    this._chromaticAberration = uniforms.get('chromaticAberration')!;
    this._vignetteIntensity = uniforms.get('vignetteIntensity')!;
    this._phosphorGlow = uniforms.get('phosphorGlow')!;
    this._flickerIntensity = uniforms.get('flickerIntensity')!;
    this._time = uniforms.get('time')!;
    this._resolution = uniforms.get('resolution')!;
  }

  // @ts-expect-error — three.js type version mismatch (WebGLRenderer)
  update(
    _renderer: THREE.WebGLRenderer,
    _inputBuffer: THREE.WebGLRenderTarget,
    deltaTime: number
  ): void {
    this._time.value += deltaTime;
  }

  setResolution(width: number, height: number): void { this._resolution.value.set(width, height); }
  setScanlineIntensity(value: number): void { this._scanlineIntensity.value = value; }
  setCurvature(value: number): void { this._curvature.value = value; }
  setChromaticAberration(value: number): void { this._chromaticAberration.value = value; }
  setVignetteIntensity(value: number): void { this._vignetteIntensity.value = value; }
  setPhosphorGlow(value: number): void { this._phosphorGlow.value = value; }
  setFlickerIntensity(value: number): void { this._flickerIntensity.value = value; }
}

export interface CRTEffectProps extends CRTOptions {
  width?: number;
  height?: number;
}

export const CRTEffect = forwardRef<CRTEffectImpl, CRTEffectProps>(function CRTEffect(
  {
    scanlineIntensity = 0.2,
    curvature = 0.12,
    chromaticAberration = 1.5,
    vignetteIntensity = 0.3,
    phosphorGlow = 0.1,
    flickerIntensity = 0.0,
    width = 1920,
    height = 1080,
  },
  ref
) {
  const effect = useMemo(() => {
    return new CRTEffectImpl({
      scanlineIntensity,
      curvature,
      chromaticAberration,
      vignetteIntensity,
      phosphorGlow,
      flickerIntensity,
      resolution: new THREE.Vector2(width, height),
    });
  }, []);

  useEffect(() => {
    effect.setScanlineIntensity(scanlineIntensity);
    effect.setCurvature(curvature);
    effect.setChromaticAberration(chromaticAberration);
    effect.setVignetteIntensity(vignetteIntensity);
    effect.setPhosphorGlow(phosphorGlow);
    effect.setFlickerIntensity(flickerIntensity);
    effect.setResolution(width, height);
  }, [effect, scanlineIntensity, curvature, chromaticAberration, vignetteIntensity, phosphorGlow, flickerIntensity, width, height]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});

export { CRTEffectImpl };
export default CRTEffect;
