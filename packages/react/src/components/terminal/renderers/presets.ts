/**
 * CRT Effect Presets
 *
 * Pre-configured settings for common CRT visual styles.
 */

import type { CRTPreset, RendererOptions } from './types';

export const PRESET_NONE: RendererOptions = {
  crt: {
    scanlineIntensity: 0,
    curvature: 0,
    chromaticAberration: 0,
    vignetteIntensity: 0,
    phosphorGlow: 0,
    flickerIntensity: 0,
  },
  bloom: {
    intensity: 0,
    luminanceThreshold: 1,
    luminanceSmoothing: 0,
  },
};

export const PRESET_SUBTLE: RendererOptions = {
  crt: {
    scanlineIntensity: 0.08,
    curvature: 0.03,
    chromaticAberration: 0.5,
    vignetteIntensity: 0.15,
    phosphorGlow: 0.05,
    flickerIntensity: 0,
  },
  bloom: {
    intensity: 0.3,
    luminanceThreshold: 0.85,
    luminanceSmoothing: 0.9,
  },
};

export const PRESET_CLASSIC: RendererOptions = {
  crt: {
    scanlineIntensity: 0.2,
    curvature: 0.12,
    chromaticAberration: 1.5,
    vignetteIntensity: 0.3,
    phosphorGlow: 0.1,
    flickerIntensity: 0,
  },
  bloom: {
    intensity: 0.6,
    luminanceThreshold: 0.75,
    luminanceSmoothing: 0.9,
  },
};

export const PRESET_HEAVY: RendererOptions = {
  crt: {
    scanlineIntensity: 0.35,
    curvature: 0.25,
    chromaticAberration: 3.0,
    vignetteIntensity: 0.5,
    phosphorGlow: 0.2,
    flickerIntensity: 0.02,
  },
  bloom: {
    intensity: 1.0,
    luminanceThreshold: 0.6,
    luminanceSmoothing: 0.8,
  },
};

export const PRESETS: Record<CRTPreset, RendererOptions> = {
  none: PRESET_NONE,
  subtle: PRESET_SUBTLE,
  classic: PRESET_CLASSIC,
  heavy: PRESET_HEAVY,
};

export function getPreset(name: CRTPreset): RendererOptions {
  return PRESETS[name] ?? PRESET_CLASSIC;
}

export function mergeWithPreset(
  preset: RendererOptions,
  custom?: RendererOptions
): RendererOptions {
  if (!custom) return preset;
  return {
    crt: { ...preset.crt, ...custom.crt },
    bloom: { ...preset.bloom, ...custom.bloom },
  };
}

export function getPresetNames(): CRTPreset[] {
  return Object.keys(PRESETS) as CRTPreset[];
}

export default PRESETS;
