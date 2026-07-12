/**
 * Bundled fonts — full Nerd Mono weight set + Symbols for Ghostty-like coverage.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadBundledMonoFont,
  bundledFontResttyInput,
  buildResttyFontChain,
  hasBundledNerdCoverage,
} from '../../src/react/components/terminal/views/bundled-font.js';

const FONTS_DIR = resolve(__dirname, '../../assets/fonts');

const REQUIRED = [
  'JetBrainsMonoNLNerdFontMono-Regular.ttf',
  'JetBrainsMonoNLNerdFontMono-Bold.ttf',
  'JetBrainsMonoNLNerdFontMono-Italic.ttf',
  'JetBrainsMonoNLNerdFontMono-BoldItalic.ttf',
  'SymbolsNerdFont-Regular.ttf',
];

describe('bundled mono + nerd fonts', () => {
  it('ships full Nerd Mono weight set + Symbols Nerd Font', () => {
    for (const file of REQUIRED) {
      const path = resolve(FONTS_DIR, file);
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path).byteLength).toBeGreaterThan(100_000);
    }
  });

  it('hasBundledNerdCoverage is true with all faces', async () => {
    expect(await hasBundledNerdCoverage()).toBe(true);
  });

  it('loadBundledMonoFont resolves Nerd Mono Regular', async () => {
    const face = await loadBundledMonoFont();
    expect(face).not.toBeNull();
    expect(face!.name.toLowerCase()).toMatch(/nerd|jetbrains/);
    expect(face!.weight).toBe(400);
    expect(face!.style).toBe('normal');
    expect(face!.data.byteLength).toBeGreaterThan(100_000);
  });

  it('buildResttyFontChain includes all weights + symbols + local fallbacks', async () => {
    const chain = await buildResttyFontChain();
    const buffers = chain.filter((f) => 'data' in f) as Array<{
      name: string;
      weight?: number;
      style?: string;
    }>;

    expect(buffers.length).toBeGreaterThanOrEqual(5);
    expect(buffers.some((f) => f.weight === 700 && f.style === 'normal')).toBe(
      true
    );
    expect(buffers.some((f) => f.style === 'italic')).toBe(true);
    expect(buffers.some((f) => /symbols/i.test(f.name))).toBe(true);

    const locals = chain.filter((f) => 'family' in f) as Array<{
      family: string;
    }>;
    expect(locals.some((f) => f.family === 'Apple Color Emoji')).toBe(true);
  });

  it('bundledFontResttyInput maps to restty buffer descriptor', async () => {
    const face = await loadBundledMonoFont();
    expect(face).not.toBeNull();
    const input = bundledFontResttyInput(face!);
    expect(input.data).toBe(face!.data);
    expect(input.weight).toBe(400);
    expect(input.style).toBe('normal');
  });
});
