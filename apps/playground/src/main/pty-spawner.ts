/**
 * PTY spawner — thin wrapper around `node-pty` that adapts its default
 * export to the `PTYSpawnFunction` shape expected by
 * `@avocado/node-pty/LocalPTYSession.spawn`.
 *
 * `node-pty` must be rebuilt against Electron's Node ABI via
 * `@electron/rebuild` — see `postinstall` in `package.json`. Without that
 * rebuild, the `import 'node-pty'` call at the top of this file throws
 * `NODE_MODULE_VERSION` at startup.
 */

import type { PTYSpawnFunction, IPty } from '@avocado/node-pty';
import * as nodePty from 'node-pty';

/**
 * Create a `PTYSpawnFunction` backed by node-pty.
 *
 * The returned function takes an avocado `PTYSpawnConfig` and forwards it
 * to `node-pty.spawn(command, args, options)`. The returned `IPty` from
 * node-pty already matches avocado's minimal `IPty` interface.
 */
export function createPTYSpawnFunction(): PTYSpawnFunction {
  return (config): IPty => {
    const pty = nodePty.spawn(config.command, config.args ?? [], {
      cwd: config.cwd ?? process.cwd(),
      env: config.env as NodeJS.ProcessEnv,
      cols: config.cols ?? 80,
      rows: config.rows ?? 24,
      name: config.name ?? 'xterm-color',
    });
    // node-pty's IPty is a structural superset of avocado's minimal IPty:
    // both expose pid/cols/rows/write/resize/kill/onData/onExit with
    // identical signatures. The cast is safe.
    return pty as unknown as IPty;
  };
}
