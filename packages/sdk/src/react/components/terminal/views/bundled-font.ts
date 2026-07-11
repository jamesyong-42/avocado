/**
 * Bundled terminal fonts for restty — Ghostty-like coverage without CDN.
 *
 * Ghostty embeds JetBrains Mono + built-in Nerd Font symbols. Restty's default
 * chain does the same via local faces + jsdelivr fallbacks. We ship:
 *   1. JetBrainsMono NL Nerd Font Mono (primary text + icons)
 *   2. Symbols Nerd Font (full PUA / powerline / codicons coverage)
 *
 * Overriding `terminal.fonts` **replaces** restty's DEFAULT_FONT_INPUTS, so a
 * plain JetBrains Mono alone causes missing-glyph tofu (white box with ×).
 */

export type BundledFontFace = {
  data: ArrayBuffer;
  name: string;
  weight: number;
  style: 'normal' | 'italic';
};

/** Restty-compatible font input (buffer or local family). */
export type ResttyFontInputLike =
  | {
      data: ArrayBuffer;
      name: string;
      weight?: number;
      style?: 'normal' | 'italic' | 'oblique';
    }
  | {
      family: string;
      local?: 'prefer' | 'require';
      name?: string;
      weight?: number;
      style?: 'normal' | 'italic' | 'oblique';
    };

/**
 * Relative path from this module (src or dist) to package assets:
 *   views → terminal → components → react → src|dist → package root → assets
 * = five levels up.
 */
const ASSETS = '../../../../../assets/fonts';

type FontSpec = {
  file: string;
  name: string;
  weight: number;
  style: 'normal' | 'italic';
};

const BUNDLED_SPECS: FontSpec[] = [
  {
    file: 'JetBrainsMonoNLNerdFontMono-Regular.ttf',
    name: 'JetBrains Mono NL Nerd Font Mono',
    weight: 400,
    style: 'normal',
  },
  {
    file: 'SymbolsNerdFont-Regular.ttf',
    name: 'Symbols Nerd Font',
    weight: 400,
    style: 'normal',
  },
];

async function loadFontFile(file: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof fetch === 'function') {
      try {
        let url: string | undefined;
        try {
          // Vite emits a content-hashed asset when ?url is used.
          const mod = await import(
            /* @vite-ignore */ `${ASSETS}/${file}?url`
          );
          url = typeof mod === 'string' ? mod : (mod as { default?: string }).default;
        } catch {
          url = new URL(`${ASSETS}/${file}`, import.meta.url).href;
        }
        if (url) {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.arrayBuffer();
            if (data.byteLength > 0) return data;
          }
        }
      } catch {
        /* fall through to fs */
      }
    }

    if (typeof process !== 'undefined' && process.versions?.node) {
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const here = dirname(fileURLToPath(import.meta.url));
      const candidates = [
        join(here, ASSETS, file),
        join(process.cwd(), 'assets/fonts', file),
        join(process.cwd(), 'packages/sdk/assets/fonts', file),
      ];
      for (const path of candidates) {
        try {
          const buf = await readFile(path);
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } catch {
          /* try next */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function loadBundledFontFace(spec: FontSpec): Promise<BundledFontFace | null> {
  const data = await loadFontFile(spec.file);
  if (!data) return null;
  return {
    data,
    name: spec.name,
    weight: spec.weight,
    style: spec.style,
  };
}

/**
 * Load primary mono face (Nerd Font Mono when available).
 * @deprecated Prefer {@link buildResttyFontChain}; kept for simple consumers.
 */
export async function loadBundledMonoFont(): Promise<BundledFontFace | null> {
  const nerd = await loadBundledFontFace(BUNDLED_SPECS[0]!);
  if (nerd) return nerd;
  // Legacy plain JetBrains Mono if nerd asset missing
  return loadBundledFontFace({
    file: 'JetBrainsMono-Regular.ttf',
    name: 'JetBrains Mono',
    weight: 400,
    style: 'normal',
  });
}

export function bundledFontResttyInput(
  face: BundledFontFace
): { data: ArrayBuffer; name: string; weight: number; style: 'normal' | 'italic' } {
  return {
    data: face.data,
    name: face.name,
    weight: face.weight,
    style: face.style,
  };
}

/**
 * Restty font chain approximating Ghostty defaults:
 * primary Nerd Mono → Symbols Nerd Font → local emoji/system symbols.
 *
 * Always returns at least local family fallbacks so restty is not left with
 * an empty list (which would still use DEFAULT_FONT_INPUTS only when fonts
 * is **omitted**, not empty).
 */
export async function buildResttyFontChain(): Promise<ResttyFontInputLike[]> {
  const chain: ResttyFontInputLike[] = [];

  for (const spec of BUNDLED_SPECS) {
    const face = await loadBundledFontFace(spec);
    if (face) {
      chain.push(bundledFontResttyInput(face));
    }
  }

  // Prefer locally installed Nerd / symbol faces when the user has them
  // (Electron may not grant Local Font Access; restty ignores failures).
  for (const family of [
    'JetBrains Mono Nerd Font',
    'JetBrainsMono Nerd Font',
    'Symbols Nerd Font',
    'Apple Symbols',
    'Apple Color Emoji',
    'Menlo',
    'Monaco',
    'SF Mono',
    'Cascadia Mono',
    'Consolas',
  ]) {
    chain.push({ family, local: 'prefer', name: family });
  }

  // If nothing bundled loaded, leave chain as local-only; restty will still
  // render ASCII from system mono. Caller may choose to omit fonts entirely
  // to restore restty CDN defaults.
  return chain;
}

/** True when both critical glyph-coverage faces are present. */
export async function hasBundledNerdCoverage(): Promise<boolean> {
  const mono = await loadFontFile(BUNDLED_SPECS[0]!.file);
  const symbols = await loadFontFile(BUNDLED_SPECS[1]!.file);
  return Boolean(mono && symbols && mono.byteLength > 50_000 && symbols.byteLength > 50_000);
}
