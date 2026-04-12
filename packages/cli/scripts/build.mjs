#!/usr/bin/env node
/**
 * Build script for @vibecook/avocado
 *
 * Bundles TypeScript with esbuild, marks node-pty as external (native module).
 */

import * as esbuild from 'esbuild';
import { mkdirSync, rmSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

async function build() {
  console.log('Building @vibecook/avocado...');

  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true });
  }
  mkdirSync(DIST, { recursive: true });

  await esbuild.build({
    entryPoints: [join(ROOT, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: join(DIST, 'index.js'),
    external: ['node-pty'],
    banner: {
      js: '#!/usr/bin/env node',
    },
    sourcemap: false,
    minify: false,
  });

  chmodSync(join(DIST, 'index.js'), 0o755);

  console.log('Build complete!');
  console.log('');
  console.log('To install globally:');
  console.log('  cd packages/cli && npm link');
  console.log('');
  console.log('To test locally:');
  console.log('  node packages/cli/dist/index.js');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
