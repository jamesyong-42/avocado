/**
 * createTerminalView — engine factory for TerminalView instances.
 */

import type {
  TerminalEngineId,
  TerminalView,
  TerminalViewCreateOptions,
  TerminalViewFactory,
} from './types.js';
import { createXtermTerminalView } from './xterm-view.js';
import { createResttyTerminalView, type LoadRestty } from './restty-view.js';

export interface CreateTerminalViewDeps {
  /** Override restty module loader (tests). */
  loadRestty?: LoadRestty;
  /** @deprecated use loadRestty */
  loadResttyXterm?: LoadRestty;
}

/**
 * Create a terminal view for the given engine.
 *
 * @throws If `engine` is unknown, or restty cannot be loaded when requested.
 */
export async function createTerminalView(
  engine: TerminalEngineId,
  options: TerminalViewCreateOptions,
  deps: CreateTerminalViewDeps = {}
): Promise<TerminalView> {
  switch (engine) {
    case 'xterm':
      return await createXtermTerminalView(options);
    case 'restty':
      return createResttyTerminalView(options, deps.loadRestty ?? deps.loadResttyXterm);
    default: {
      const _exhaustive: never = engine;
      throw new Error(`[avocado] Unknown terminal engine: ${String(_exhaustive)}`);
    }
  }
}

/** Default factory bound for production `useTerminalCore`. */
export const defaultTerminalViewFactory: TerminalViewFactory = (engine, options) =>
  createTerminalView(engine, options);
