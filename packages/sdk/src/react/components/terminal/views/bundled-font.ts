/**
 * Bundled terminal fonts for restty — Ghostty-like coverage without CDN.
 *
 * Ghostty embeds JetBrains Mono + built-in Nerd Fonts. Restty’s default chain
 * does the same via local faces + jsdelivr. We ship the full mono weight set
 * plus Symbols Nerd Font so overriding `terminal.fonts` does not produce tofu.
 *
 * Assets (under packages/sdk/assets/fonts/):
 *   JetBrainsMonoNLNerdFontMono-{Regular,Bold,Italic,BoldItalic}.ttf
 *   SymbolsNerdFont-Regular.ttf
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

/** Matches restty DEFAULT_FONT_INPUTS naming for style selection. */
const BUNDLED_SPECS: FontSpec[] = [
  {
    file: 'JetBrainsMonoNLNerdFontMono-Regular.ttf',
    name: 'JetBrains Mono Nerd Font Regular',
    weight: 400,
    style: 'normal',
  },
  {
    file: 'JetBrainsMonoNLNerdFontMono-Bold.ttf',
    name: 'JetBrains Mono Nerd Font Bold',
    weight: 700,
    style: 'normal',
  },
  {
    file: 'JetBrainsMonoNLNerdFontMono-Italic.ttf',
    name: 'JetBrains Mono Nerd Font Italic',
    weight: 400,
    style: 'italic',
  },
  {
    file: 'JetBrainsMonoNLNerdFontMono-BoldItalic.ttf',
    name: 'JetBrains Mono Nerd Font Bold Italic',
    weight: 700,
    style: 'italic',
  },
  {
    file: 'SymbolsNerdFont-Regular.ttf',
    name: 'Symbols Nerd Font',
    weight: 400,
    style: 'normal',
  },
];

/** Vite-friendly static URL imports (hashed assets in electron-vite builds). */
async function viteFontUrl(file: string): Promise<string | undefined> {
  try {
    switch (file) {
      case 'JetBrainsMonoNLNerdFontMono-Regular.ttf': {
        // @ts-expect-error vite ?url
        const mod = await import('../../../../../assets/fonts/JetBrainsMonoNLNerdFontMono-Regular.ttf?url');
        return typeof mod === 'string' ? mod : (mod as { default?: string }).default;
      }
      case 'JetBrainsMonoNLNerdFontMono-Bold.ttf': {
        // @ts-expect-error vite ?url
        const mod = await import('../../../../../assets/fonts/JetBrainsMonoNLNerdFontMono-Bold.ttf?url');
        return typeof mod === 'string' ? mod : (mod as { default?: string }).default;
      }
      case 'JetBrainsMonoNLNerdFontMono-Italic.ttf': {
        // @ts-expect-error vite ?url
        const mod = await import('../../../../../assets/fonts/JetBrainsMonoNLNerdFontMono-Italic.ttf?url');
        return typeof mod === 'string' ? mod : (mod as { default?: string }).default;
      }
      case 'JetBrainsMonoNLNerdFontMono-BoldItalic.ttf': {
        // @ts-expect-error vite ?url
        const mod = await import('../../../../../assets/fonts/JetBrainsMonoNLNerdFontMono-BoldItalic.ttf?url');
        return typeof mod === 'string' ? mod : (mod as { default?: string }).default;
      }
      case 'SymbolsNerdFont-Regular.ttf': {
        // @ts-expect-error vite ?url
        const mod = await import('../../../../../assets/fonts/SymbolsNerdFont-Regular.ttf?url');
        return typeof mod === 'string' ? mod : (mod as { default?: string }).default;
      }
      case 'JetBrainsMono-Regular.ttf': {
        // @ts-expect-error vite ?url
        const mod = await import('../../../../../assets/fonts/JetBrainsMono-Regular.ttf?url');
        return typeof mod === 'string' ? mod : (mod as { default?: string }).default;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

async function loadFontFile(file: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof fetch === 'function') {
      try {
        let url = await viteFontUrl(file);
        if (!url) {
          url = new URL(`${ASSETS}/${file}`, import.meta.url).href;
        }
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.arrayBuffer();
          if (data.byteLength > 0) return data;
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
 * Load primary mono face (Nerd Font Mono Regular when available).
 */
export async function loadBundledMonoFont(): Promise<BundledFontFace | null> {
  const nerd = await loadBundledFontFace(BUNDLED_SPECS[0]!);
  if (nerd) return nerd;
  return loadBundledFontFace({
    file: 'JetBrainsMono-Regular.ttf',
    name: 'JetBrains Mono',
    weight: 400,
    style: 'normal',
  });
}

export function bundledFontResttyInput(
  face: BundledFontFace
): {
  data: ArrayBuffer;
  name: string;
  weight: number;
  style: 'normal' | 'italic';
} {
  return {
    data: face.data,
    name: face.name,
    weight: face.weight,
    style: face.style,
  };
}

/**
 * Restty font chain approximating Ghostty + restty DEFAULT_FONT_INPUTS:
 *   Regular/Bold/Italic/BoldItalic Nerd Mono → Symbols Nerd Font →
 *   local nerd/emoji/system mono faces.
 */
export async function buildResttyFontChain(): Promise<ResttyFontInputLike[]> {
  const chain: ResttyFontInputLike[] = [];

  for (const spec of BUNDLED_SPECS) {
    const face = await loadBundledFontFace(spec);
    if (face) {
      chain.push(bundledFontResttyInput(face));
    }
  }

  // Local faces (Electron may not grant Local Font Access; failures are fine).
  for (const entry of [
    { family: 'JetBrains Mono Nerd Font', name: 'JetBrains Mono Nerd Font', weight: 400 },
    { family: 'JetBrains Mono Nerd Font', name: 'JetBrains Mono Nerd Font Bold', weight: 700 },
    {
      family: 'JetBrains Mono Nerd Font',
      name: 'JetBrains Mono Nerd Font Italic',
      weight: 400,
      style: 'italic' as const,
    },
    {
      family: 'JetBrains Mono Nerd Font',
      name: 'JetBrains Mono Nerd Font Bold Italic',
      weight: 700,
      style: 'italic' as const,
    },
    { family: 'Symbols Nerd Font', name: 'Symbols Nerd Font' },
    { family: 'Apple Symbols', name: 'Apple Symbols' },
    { family: 'Apple Color Emoji', name: 'Apple Color Emoji' },
    { family: 'Menlo', name: 'Menlo' },
    { family: 'Monaco', name: 'Monaco' },
    { family: 'SF Mono', name: 'SF Mono' },
    { family: 'Cascadia Mono', name: 'Cascadia Mono' },
    { family: 'Consolas', name: 'Consolas' },
  ]) {
    chain.push({
      family: entry.family,
      local: 'prefer',
      name: entry.name,
      weight: entry.weight,
      style: 'style' in entry ? entry.style : 'normal',
    });
  }

  return chain;
}

/** True when all critical glyph-coverage faces are present. */
export async function hasBundledNerdCoverage(): Promise<boolean> {
  const needed = [
    'JetBrainsMonoNLNerdFontMono-Regular.ttf',
    'JetBrainsMonoNLNerdFontMono-Bold.ttf',
    'JetBrainsMonoNLNerdFontMono-Italic.ttf',
    'JetBrainsMonoNLNerdFontMono-BoldItalic.ttf',
    'SymbolsNerdFont-Regular.ttf',
  ];
  for (const file of needed) {
    const data = await loadFontFile(file);
    if (!data || data.byteLength < 50_000) return false;
  }
  return true;
}

export { BUNDLED_SPECS };
