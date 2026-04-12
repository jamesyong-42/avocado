#!/usr/bin/env node
/**
 * Postinstall script to fix node-pty spawn-helper permissions
 */

import { readdirSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function fixSpawnHelperPermissions(dir) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        fixSpawnHelperPermissions(fullPath);
      } else if (entry.name.startsWith('spawn-helper')) {
        try {
          chmodSync(fullPath, 0o755);
          console.log(`[avo] Fixed permissions: ${fullPath}`);
        } catch {
          // Ignore permission errors
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
}

const nodePtyPath = join(ROOT, 'node_modules', 'node-pty');
fixSpawnHelperPermissions(nodePtyPath);
