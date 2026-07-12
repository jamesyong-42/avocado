/**
 * Ghostty-parity defaults for the restty engine.
 *
 * Restty embeds libghostty-vt (WASM) + GPU text; it is not the Ghostty app.
 * This module maps Ghostty’s known-good defaults onto restty’s public config
 * so avocado’s restty path feels as close as the web stack allows.
 *
 * References:
 * - Ghostty ships JetBrains Mono + built-in Nerd Fonts, default dark palette
 * - restty DEFAULT_FONT_INPUTS + getBuiltinTheme("Ghostty Default Style Dark")
 * - restty TerminalConfig (renderer, ligatures, alphaBlending, nerdIconScale, …)
 */

import type { TerminalViewTheme } from './types.js';
import { buildResttyFontChain, type ResttyFontInputLike } from './bundled-font.js';

/** Ghostty’s stock dark palette name in restty’s builtin catalog. */
export const GHOSTTY_DEFAULT_THEME_NAME = 'Ghostty Default Style Dark';

/**
 * Ghostty default font-size is 13 (points). We pass CSS px; at 1x they match
 * closely enough that restty cells look Ghostty-sized.
 */
export const GHOSTTY_DEFAULT_FONT_SIZE = 13;

/** Ghostty default window padding (px). Applied as host inset around the canvas. */
export const GHOSTTY_WINDOW_PADDING_PX = 2;

/** Approximate Ghostty default background (#282c34). */
export const GHOSTTY_DEFAULT_BG = '#282c34';
export const GHOSTTY_DEFAULT_FG = '#ffffff';

export type ResttyRendererPref = 'auto' | 'webgpu' | 'webgl2';

export type GhosttyParityOptions = {
  fontSize?: number;
  /** restty builtin theme name (default: Ghostty Default Style Dark). */
  ghosttyThemeName?: string;
  /** Engine-neutral avocado theme bag → converted to GhosttyTheme when set. */
  theme?: TerminalViewTheme;
  /** Prefer WebGPU (Ghostty≈Metal). Default auto. */
  renderer?: ResttyRendererPref;
  ligatures?: boolean;
  /** TrueType atlas hinting (Ghostty/mac CoreText differs; default false). */
  fontHinting?: boolean;
  fontHintTarget?: 'auto' | 'light' | 'normal';
  /**
   * How fontSize maps to design units.
   * Ghostty sizes by face height; restty "height" tracks that more closely.
   */
  fontSizeMode?: 'em' | 'height';
  /**
   * GPU alpha blending. Default `native` matches Ghostty’s macOS default
   * (Display-P3-style native blend). `linear` / `linear-corrected` often
   * wash out saturated UI (e.g. Claude effort bars).
   */
  alphaBlending?: 'native' | 'linear' | 'linear-corrected';
  nerdIconScale?: number;
  /** Scrollback cap in bytes (restty/Ghostty-scale default 10MB). */
  maxScrollbackBytes?: number;
};

export type BuiltGhosttyParity = {
  fonts: ResttyFontInputLike[];
  theme: unknown | undefined;
  themeSourceLabel: string | undefined;
  terminal: Record<string, unknown>;
  hostPaddingPx: number;
  hostBackground: string;
};

type ThemeColor = { r: number; g: number; b: number; a?: number };

function parseHexColor(hex: string): ThemeColor | null {
  const raw = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(raw)) {
    return null;
  }
  let r: number;
  let g: number;
  let b: number;
  let a: number | undefined;
  if (raw.length === 3) {
    r = parseInt(raw[0]! + raw[0]!, 16);
    g = parseInt(raw[1]! + raw[1]!, 16);
    b = parseInt(raw[2]! + raw[2]!, 16);
  } else {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
    if (raw.length === 8) {
      a = parseInt(raw.slice(6, 8), 16);
    }
  }
  return a === undefined ? { r, g, b } : { r, g, b, a };
}

const ANSI_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

/**
 * Convert avocado’s xterm-style theme bag into a GhosttyTheme-shaped object
 * restty’s applyTheme / terminal.theme accept.
 */
export function terminalViewThemeToGhostty(
  theme: TerminalViewTheme,
  name = 'avocado'
): {
  name: string;
  colors: {
    background?: ThemeColor;
    foreground?: ThemeColor;
    cursor?: ThemeColor;
    cursorText?: ThemeColor;
    selectionBackground?: ThemeColor;
    palette: Array<ThemeColor | undefined>;
  };
  raw: Record<string, string>;
} {
  const colors: {
    background?: ThemeColor;
    foreground?: ThemeColor;
    cursor?: ThemeColor;
    cursorText?: ThemeColor;
    selectionBackground?: ThemeColor;
    palette: Array<ThemeColor | undefined>;
  } = { palette: new Array(256).fill(undefined) };

  const raw: Record<string, string> = {};

  if (theme.background) {
    const c = parseHexColor(theme.background);
    if (c) colors.background = c;
    raw.background = theme.background;
  }
  if (theme.foreground) {
    const c = parseHexColor(theme.foreground);
    if (c) colors.foreground = c;
    raw.foreground = theme.foreground;
  }
  if (theme.cursor) {
    const c = parseHexColor(theme.cursor);
    if (c) colors.cursor = c;
    raw['cursor-color'] = theme.cursor;
  }
  if (theme.cursorAccent) {
    const c = parseHexColor(theme.cursorAccent);
    if (c) colors.cursorText = c;
    raw['cursor-text'] = theme.cursorAccent;
  }
  if (theme.selectionBackground) {
    const c = parseHexColor(theme.selectionBackground);
    if (c) colors.selectionBackground = c;
    raw['selection-background'] = theme.selectionBackground;
  }

  ANSI_KEYS.forEach((key, i) => {
    const hex = theme[key];
    if (!hex) return;
    const c = parseHexColor(hex);
    if (c) colors.palette[i] = c;
    raw[`palette-${i}`] = hex;
  });

  return { name, colors, raw };
}

export type ResttyThemeLoader = {
  getBuiltinTheme?: (name: string) => unknown;
};

/**
 * Build fonts + terminal config + host chrome for maximum Ghostty likeness.
 */
export async function buildGhosttyParity(
  options: GhosttyParityOptions,
  resttyMod?: ResttyThemeLoader | null
): Promise<BuiltGhosttyParity> {
  const fontSize = options.fontSize ?? GHOSTTY_DEFAULT_FONT_SIZE;
  const renderer = options.renderer ?? 'auto';
  const ligatures = options.ligatures ?? true;
  const fontHinting = options.fontHinting ?? false;
  const fontHintTarget = options.fontHintTarget ?? 'auto';
  // height mode tracks face metrics more like Ghostty cell sizing.
  const fontSizeMode = options.fontSizeMode ?? 'height';
  // Ghostty macOS default is native; linear-corrected desaturates midtones.
  const alphaBlending = options.alphaBlending ?? 'native';
  const nerdIconScale = options.nerdIconScale ?? 1;
  const maxScrollbackBytes = options.maxScrollbackBytes ?? 10_000_000;

  const fonts = await buildResttyFontChain();

  let theme: unknown | undefined;
  let themeSourceLabel: string | undefined;
  let hostBackground = GHOSTTY_DEFAULT_BG;

  if (options.theme) {
    theme = terminalViewThemeToGhostty(options.theme);
    themeSourceLabel = 'avocado-theme';
    if (options.theme.background) hostBackground = options.theme.background;
  } else {
    const themeName = options.ghosttyThemeName ?? GHOSTTY_DEFAULT_THEME_NAME;
    theme = resttyMod?.getBuiltinTheme?.(themeName) ?? undefined;
    themeSourceLabel = theme ? themeName : undefined;
    const bg = (
      theme as { colors?: { background?: ThemeColor } } | null | undefined
    )?.colors?.background;
    if (bg) {
      hostBackground = `#${[bg.r, bg.g, bg.b]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')}`;
    }
  }

  const terminal: Record<string, unknown> = {
    renderer,
    fontSize,
    ligatures,
    fontHinting,
    fontHintTarget,
    fontSizeMode,
    alphaBlending,
    nerdIconScale,
    maxScrollbackBytes,
    autoResize: true,
    showResizeOverlay: false,
    // Avocado PTY owns device attribute replies.
    forwardTerminalReplies: false,
    fonts,
  };
  if (theme) {
    terminal.theme = theme;
  }

  return {
    fonts,
    theme,
    themeSourceLabel,
    terminal,
    hostPaddingPx: GHOSTTY_WINDOW_PADDING_PX,
    hostBackground,
  };
}
