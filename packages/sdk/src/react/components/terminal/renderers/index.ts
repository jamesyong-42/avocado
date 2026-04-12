export { DefaultRenderer } from './DefaultRenderer';
export { getPreset, mergeWithPreset, getPresetNames, PRESETS } from './presets';
export type {
  CRTOptions,
  BloomOptions,
  RendererOptions,
  CRTPreset,
  RendererType,
  TerminalCoreState,
  TerminalCoreActions,
  TerminalRendererProps,
  VirtualTerminalRendererProps,
} from './types';
export { CRTEffect, CRTEffectImpl, TerminalPlane, useTextureSync, findXtermCanvas } from './webgl/index';
