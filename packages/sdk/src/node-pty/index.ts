/**
 * #node-pty - Barrel export
 *
 * Local PTY session management using node-pty.
 */

export {
  LocalPTYSession,
  buildInteractivePtyEnv,
} from './local-pty-session.js';
export type {
  IPty,
  PTYSpawnConfig,
  PTYSpawnFunction,
  LocalPTYSessionOptions,
} from './local-pty-session.js';
