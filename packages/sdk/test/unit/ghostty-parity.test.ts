/**
 * Ghostty-parity config builder + theme conversion.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildGhosttyParity,
  terminalViewThemeToGhostty,
  GHOSTTY_DEFAULT_THEME_NAME,
  GHOSTTY_DEFAULT_FONT_SIZE,
  GHOSTTY_WINDOW_PADDING_PX,
  GHOSTTY_DEFAULT_BG,
} from '../../src/react/components/terminal/views/ghostty-parity.js';

describe('terminalViewThemeToGhostty', () => {
  it('maps hex avocado theme to GhosttyTheme shape', () => {
    const g = terminalViewThemeToGhostty({
      background: '#282c34',
      foreground: '#ffffff',
      cursor: '#aabbcc',
      black: '#000000',
      red: '#ff0000',
      brightWhite: '#eeeeee',
    });
    expect(g.colors.background).toEqual({ r: 0x28, g: 0x2c, b: 0x34 });
    expect(g.colors.foreground).toEqual({ r: 255, g: 255, b: 255 });
    expect(g.colors.cursor).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(g.colors.palette[0]).toEqual({ r: 0, g: 0, b: 0 });
    expect(g.colors.palette[1]).toEqual({ r: 255, g: 0, b: 0 });
    expect(g.colors.palette[15]).toEqual({ r: 0xee, g: 0xee, b: 0xee });
  });

  it('accepts 3-digit hex', () => {
    const g = terminalViewThemeToGhostty({ background: '#abc' });
    expect(g.colors.background).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });
});

describe('buildGhosttyParity', () => {
  it('uses Ghostty defaults when no overrides', async () => {
    const getBuiltinTheme = vi.fn(() => ({
      colors: { background: { r: 40, g: 44, b: 52 } },
    }));
    const parity = await buildGhosttyParity({}, { getBuiltinTheme });

    expect(getBuiltinTheme).toHaveBeenCalledWith(GHOSTTY_DEFAULT_THEME_NAME);
    expect(parity.terminal.fontSize).toBe(GHOSTTY_DEFAULT_FONT_SIZE);
    expect(parity.terminal.renderer).toBe('auto');
    expect(parity.terminal.ligatures).toBe(true);
    expect(parity.terminal.fontHinting).toBe(false);
    expect(parity.terminal.fontSizeMode).toBe('height');
    expect(parity.terminal.alphaBlending).toBe('native');
    expect(parity.terminal.nerdIconScale).toBe(1);
    expect(parity.terminal.maxScrollbackBytes).toBe(10_000_000);
    expect(parity.terminal.forwardTerminalReplies).toBe(false);
    expect(parity.hostPaddingPx).toBe(GHOSTTY_WINDOW_PADDING_PX);
    expect(parity.hostBackground).toBe(GHOSTTY_DEFAULT_BG);
    expect(parity.theme).toBeTruthy();

    const fonts = parity.fonts as Array<Record<string, unknown>>;
    const buffers = fonts.filter((f) => 'data' in f);
    // Regular/Bold/Italic/BoldItalic + Symbols when assets present
    expect(buffers.length).toBeGreaterThanOrEqual(2);
    expect(
      buffers.some((f) => String(f.name).toLowerCase().includes('bold'))
    ).toBe(true);
    expect(
      buffers.some((f) => String(f.name).toLowerCase().includes('symbols'))
    ).toBe(true);
  });

  it('prefers avocado theme bag over builtin name', async () => {
    const getBuiltinTheme = vi.fn();
    const parity = await buildGhosttyParity(
      {
        theme: { background: '#111111', foreground: '#eeeeee' },
        ghosttyThemeName: 'Dracula',
      },
      { getBuiltinTheme }
    );
    expect(getBuiltinTheme).not.toHaveBeenCalled();
    expect(parity.themeSourceLabel).toBe('avocado-theme');
    expect(parity.hostBackground).toBe('#111111');
  });

  it('honors renderer / ligature / scale overrides', async () => {
    const parity = await buildGhosttyParity({
      fontSize: 16,
      renderer: 'webgl2',
      ligatures: false,
      nerdIconScale: 0.9,
      alphaBlending: 'native',
    });
    expect(parity.terminal.fontSize).toBe(16);
    expect(parity.terminal.renderer).toBe('webgl2');
    expect(parity.terminal.ligatures).toBe(false);
    expect(parity.terminal.nerdIconScale).toBe(0.9);
    expect(parity.terminal.alphaBlending).toBe('native');
  });
});
