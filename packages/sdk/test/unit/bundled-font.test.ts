/**
 * Bundled fonts — Nerd Mono + Symbols for Ghostty-like glyph coverage.
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

describe('bundled mono + nerd fonts', () => {
  it('ships JetBrains Mono NL Nerd Font Mono and Symbols Nerd Font', () => {
    const mono = resolve(FONTS_DIR, 'JetBrainsMonoNLNerdFontMono-Regular.ttf');
    const symbols = resolve(FONTS_DIR, 'SymbolsNerdFont-Regular.ttf');
    expect(existsSync(mono)).toBe(true);
    expect(existsSync(symbols)).toBe(true);
    expect(readFileSync(mono).byteLength).toBeGreaterThan(100_000);
    expect(readFileSync(symbols).byteLength).toBeGreaterThan(100_000);
  });

  it('hasBundledNerdCoverage is true with both assets', async () => {
    expect(await hasBundledNerdCoverage()).toBe(true);
  });

  it('loadBundledMonoFont resolves Nerd Mono primary', async () => {
    const face = await loadBundledMonoFont();
    expect(face).not.toBeNull();
    expect(face!.name.toLowerCase()).toMatch(/nerd|jetbrains/);
    expect(face!.data.byteLength).toBeGreaterThan(100_000);
  });

  it('buildResttyFontChain includes buffer faces + local fallbacks', async () => {
    const chain = await buildResttyFontChain();
    expect(chain.length).toBeGreaterThan(2);

    const buffers = chain.filter((f) => 'data' in f);
    expect(buffers.length).toBeGreaterThanOrEqual(2);
    expect(buffers.some((f) => 'name' in f && /nerd/i.test(String(f.name)))).toBe(
      true
    );

    const locals = chain.filter((f) => 'family' in f);
    expect(locals.some((f) => 'family' in f && f.family === 'Apple Color Emoji')).toBe(
      true
    );
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
