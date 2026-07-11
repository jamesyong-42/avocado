/**
 * Load the bundled JetBrains Mono face for restty (no CDN).
 *
 * Font path resolves via `import.meta.url` so Vite/electron-vite emit a
 * hashed asset URL; in Node tests we fall back to filesystem read when
 * available.
 */

export type BundledFontFace = {
  data: ArrayBuffer;
  name: string;
  weight: number;
  style: 'normal';
};

const FONT_NAME = 'JetBrains Mono';

/**
 * Relative path from this module (src or dist) to package assets:
 *   views → terminal → components → react → src|dist → package root → assets
 * = five levels up.
 */
const FONT_REL = '../../../../../assets/fonts/JetBrainsMono-Regular.ttf';

function fontFileUrl(): URL {
  return new URL(FONT_REL, import.meta.url);
}

export async function loadBundledMonoFont(): Promise<BundledFontFace | null> {
  try {
    // Prefer fetch (browser / electron renderer / vite).
    if (typeof fetch === 'function') {
      try {
        let url: string | undefined;
        try {
          // Vite emits a content-hashed asset when ?url is used.
          // @ts-expect-error optional vite query import
          const mod = await import('../../../../../assets/fonts/JetBrainsMono-Regular.ttf?url');
          url = typeof mod === 'string' ? mod : (mod as { default?: string }).default;
        } catch {
          url = fontFileUrl().href;
        }
        if (url) {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.arrayBuffer();
            if (data.byteLength > 0) {
              return { data, name: FONT_NAME, weight: 400, style: 'normal' };
            }
          }
        }
      } catch {
        /* fall through to fs */
      }
    }

    // Node (unit tests): read from package assets if present.
    if (typeof process !== 'undefined' && process.versions?.node) {
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const here = dirname(fileURLToPath(import.meta.url));
      const candidates = [
        join(here, FONT_REL),
        join(process.cwd(), 'assets/fonts/JetBrainsMono-Regular.ttf'),
        join(process.cwd(), 'packages/sdk/assets/fonts/JetBrainsMono-Regular.ttf'),
      ];
      for (const path of candidates) {
        try {
          const buf = await readFile(path);
          return {
            data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            name: FONT_NAME,
            weight: 400,
            style: 'normal',
          };
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

export function bundledFontResttyInput(
  face: BundledFontFace
): { data: ArrayBuffer; name: string; weight: number; style: 'normal' } {
  return {
    data: face.data,
    name: face.name,
    weight: face.weight,
    style: face.style,
  };
}
