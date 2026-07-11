/**
 * Bundled JetBrains Mono — no CDN required for restty font face.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadBundledMonoFont,
  bundledFontResttyInput,
} from '../../src/react/components/terminal/views/bundled-font.js';

const FONT_PATH = resolve(
  __dirname,
  '../../assets/fonts/JetBrainsMono-Regular.ttf'
);

describe('bundled mono font', () => {
  it('ships JetBrainsMono-Regular.ttf in package assets', () => {
    expect(existsSync(FONT_PATH)).toBe(true);
    const buf = readFileSync(FONT_PATH);
    // TTF magic / size sanity (file is ~270KB)
    expect(buf.byteLength).toBeGreaterThan(50_000);
  });

  it('loadBundledMonoFont resolves from filesystem in Node', async () => {
    const face = await loadBundledMonoFont();
    expect(face).not.toBeNull();
    expect(face!.name).toBe('JetBrains Mono');
    expect(face!.weight).toBe(400);
    expect(face!.style).toBe('normal');
    expect(face!.data.byteLength).toBeGreaterThan(50_000);
  });

  it('bundledFontResttyInput maps to restty font descriptor shape', async () => {
    const face = await loadBundledMonoFont();
    expect(face).not.toBeNull();
    const input = bundledFontResttyInput(face!);
    expect(input).toEqual({
      data: face!.data,
      name: 'JetBrains Mono',
      weight: 400,
      style: 'normal',
    });
  });
});
