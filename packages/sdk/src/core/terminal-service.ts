/**
 * TerminalService - Terminal management layer above PTYSessionManager
 *
 * Manages HeadlessTerminal and VirtualTerminal instances for PTY sessions.
 * Handles dimension synchronization with active/passive modes.
 *
 * NOTE: Unlike the original, this does NOT depend on @xterm/headless or Electron.
 * Headless terminal support requires the consumer to provide an xterm factory.
 * The store sync interface is abstracted - no Electron BrowserWindow references.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  TerminalType,
  TerminalMode,
  CreateTerminalOptions,
  TerminalInfo,
} from '#types';
import type { ITerminalStoreSync } from './terminal-store-sync.js';

// Re-export for convenience so consumers of #core can pick these up
// without needing a separate #types import for basic terminal work.
export type { TerminalType, TerminalMode, CreateTerminalOptions, TerminalInfo };

// ===============================================================================
// PTY SESSION SOURCE INTERFACE
// ===============================================================================

/**
 * Minimal session info required by TerminalService
 */
export interface PTYSessionInfo {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
}

/**
 * Common interface for PTY session providers.
 * PTYSessionManager implements this interface naturally.
 */
export interface IPTYSessionSource extends EventEmitter {
  getSession(sessionId: string): PTYSessionInfo | null;
  resize(sessionId: string, cols: number, rows: number): boolean;
  getOutputBuffer(sessionId: string, maxBytes?: number): Buffer | null;
}

// ===============================================================================
// TYPES
// ===============================================================================

export interface TerminalDimensions {
  cols: number;
  rows: number;
}

// ===============================================================================
// INTERNAL TYPES
// ===============================================================================

interface BaseTerminal {
  id: string;
  sessionId: string;
  type: TerminalType;
  mode: TerminalMode;
  cols: number;
  rows: number;
  /** Epoch milliseconds */
  createdAt: number;
}

interface VirtualTerminalInternal extends BaseTerminal {
  type: 'virtual';
}

interface HeadlessTerminalInternal extends BaseTerminal {
  type: 'headless';
}

// ===============================================================================
// TERMINAL SERVICE INTERFACE
// ===============================================================================

export interface TerminalService extends EventEmitter {
  setStoreSync(storeSync: ITerminalStoreSync): void;
  setActive(terminalId: string): void;
  applyModeFromStore(terminalId: string, mode: TerminalMode): void;
  createVirtualTerminal(sessionId: string, options: CreateTerminalOptions, canonicalSessionId?: string): string;
  createHeadlessTerminal(sessionId: string, options: CreateTerminalOptions, canonicalSessionId?: string): string;
  getTerminal(terminalId: string): TerminalInfo | null;
  getSessionTerminals(sessionId: string): TerminalInfo[];
  getAllTerminals(): TerminalInfo[];
  getTerminalInfo(terminalId: string): TerminalInfo | null;
  hasActiveTerminal(sessionId: string): boolean;
  getActiveTerminal(sessionId: string): TerminalInfo | null;
  resize(terminalId: string, cols: number, rows: number): boolean;
  getDimensions(terminalId: string): TerminalDimensions | null;
  getSessionDimensions(sessionId: string): TerminalDimensions | null;
  destroyTerminal(terminalId: string): void;
  destroySessionTerminals(sessionId: string): void;
  shutdown(): void;
}

// ===============================================================================
// IMPLEMENTATION
// ===============================================================================

const LOG_PREFIX = '[TerminalService]';

export class TerminalServiceImpl extends EventEmitter implements TerminalService {
  private sessionSource: IPTYSessionSource;
  private terminals: Map<string, BaseTerminal> = new Map();
  private sessionTerminals: Map<string, Set<string>> = new Map();
  private outputHandlers: Map<string, (data: { sessionId: string; data: Buffer }) => void> = new Map();
  private ptyExitHandler: ((event: { sessionId: string }) => void) | null = null;
  private ptySessionLostHandler: ((event: { sessionId: string }) => void) | null = null;
  private ptySessionResizedHandler:
    | ((event: { sessionId: string; cols: number; rows: number }) => void)
    | null = null;

  private storeSync: ITerminalStoreSync | null = null;

  constructor(sessionSource: IPTYSessionSource) {
    super();
    this.sessionSource = sessionSource;

    this.ptyExitHandler = (event: { sessionId: string }) => {
      this.destroySessionTerminals(event.sessionId);
    };
    this.ptySessionLostHandler = (event: { sessionId: string }) => {
      this.destroySessionTerminals(event.sessionId);
    };
    this.ptySessionResizedHandler = (event: { sessionId: string; cols: number; rows: number }) => {
      this.applySessionResize(event.sessionId, event.cols, event.rows);
    };
    this.sessionSource.on('exit', this.ptyExitHandler);
    this.sessionSource.on('sessionLost', this.ptySessionLostHandler);
    this.sessionSource.on('sessionResized', this.ptySessionResizedHandler);
  }

  // ---------------------------------------------------------------------------
  // STORE SYNC INTEGRATION
  // ---------------------------------------------------------------------------

  setStoreSync(storeSync: ITerminalStoreSync): void {
    this.storeSync = storeSync;
    if ('setApplyModeCallback' in storeSync) {
      (storeSync as { setApplyModeCallback: (cb: (id: string, mode: TerminalMode) => void) => void })
        .setApplyModeCallback(this.applyModeFromStore.bind(this));
    }
    console.log(`${LOG_PREFIX} Store sync set`);
  }

  setActive(terminalId: string): void {
    if (this.storeSync) {
      // Delegate to storeSync — it handles one-active-per-session enforcement
      // and calls back via applyModeFromStore for each changed terminal.
      this.storeSync.setActive(terminalId);
      return;
    }

    // Fallback for when storeSync is not configured: cascade directly.
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;

    const { sessionId } = terminal;
    const sessionTerminalIds = this.sessionTerminals.get(sessionId);
    if (!sessionTerminalIds) return;

    for (const id of sessionTerminalIds) {
      const t = this.terminals.get(id);
      if (!t) continue;

      const newMode: TerminalMode = id === terminalId ? 'active' : 'passive';
      if (t.mode !== newMode) {
        t.mode = newMode;
        this.emit('terminalModeChanged', { terminalId: id, sessionId, mode: newMode });
      }
    }
  }

  applyModeFromStore(terminalId: string, mode: TerminalMode): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;
    if (terminal.mode === mode) return;

    terminal.mode = mode;
    this.emit('terminalModeChanged', {
      terminalId,
      sessionId: terminal.sessionId,
      mode,
    });
  }

  // ---------------------------------------------------------------------------
  // TERMINAL CREATION
  // ---------------------------------------------------------------------------

  createVirtualTerminal(sessionId: string, options: CreateTerminalOptions, canonicalSessionId?: string): string {
    this.validateSession(sessionId);
    this.validateActiveMode(sessionId, options.mode);

    const terminalId = randomUUID();
    const { cols, rows, mode } = options;

    let actualCols = cols;
    let actualRows = rows;

    if (mode === 'passive') {
      const session = this.sessionSource.getSession(sessionId);
      if (session) {
        actualCols = session.cols;
        actualRows = session.rows;
      }
    }

    const terminal: VirtualTerminalInternal = {
      id: terminalId,
      sessionId,
      type: 'virtual',
      mode,
      cols: actualCols,
      rows: actualRows,
      createdAt: Date.now(),
    };

    this.terminals.set(terminalId, terminal);
    this.addToSession(sessionId, terminalId);

    if (this.storeSync) {
      const storeSessionId = canonicalSessionId ?? sessionId;
      this.storeSync.registerTerminal(this.toTerminalInfo(terminal), storeSessionId);
    }

    if (mode === 'active') {
      this.sessionSource.resize(sessionId, cols, rows);
      this.syncPassiveTerminals(sessionId, cols, rows);
    }

    this.ensureOutputRouting(sessionId);
    this.replayOutputBufferToTerminal(sessionId, terminalId);

    this.emit('terminalCreated', this.toTerminalInfo(terminal));
    return terminalId;
  }

  createHeadlessTerminal(sessionId: string, options: CreateTerminalOptions, canonicalSessionId?: string): string {
    this.validateSession(sessionId);
    this.validateActiveMode(sessionId, options.mode);

    const terminalId = randomUUID();
    const { cols, rows, mode } = options;

    let actualCols = cols;
    let actualRows = rows;

    if (mode === 'passive') {
      const session = this.sessionSource.getSession(sessionId);
      if (session) {
        actualCols = session.cols;
        actualRows = session.rows;
      }
    }

    const terminal: HeadlessTerminalInternal = {
      id: terminalId,
      sessionId,
      type: 'headless',
      mode,
      cols: actualCols,
      rows: actualRows,
      createdAt: Date.now(),
    };

    this.terminals.set(terminalId, terminal);
    this.addToSession(sessionId, terminalId);

    if (this.storeSync) {
      const storeSessionId = canonicalSessionId ?? sessionId;
      this.storeSync.registerTerminal(this.toTerminalInfo(terminal), storeSessionId);
    }

    if (mode === 'active') {
      this.sessionSource.resize(sessionId, cols, rows);
      this.syncPassiveTerminals(sessionId, cols, rows);
    }

    this.ensureOutputRouting(sessionId);
    this.replayOutputBufferToTerminal(sessionId, terminalId);

    this.emit('terminalCreated', this.toTerminalInfo(terminal));
    return terminalId;
  }

  // ---------------------------------------------------------------------------
  // TERMINAL ACCESS
  // ---------------------------------------------------------------------------

  getTerminal(terminalId: string): TerminalInfo | null {
    const terminal = this.terminals.get(terminalId);
    return terminal ? this.toTerminalInfo(terminal) : null;
  }

  getSessionTerminals(sessionId: string): TerminalInfo[] {
    const terminalIds = this.sessionTerminals.get(sessionId);
    if (!terminalIds) return [];

    return Array.from(terminalIds)
      .map((id) => this.terminals.get(id))
      .filter((t): t is BaseTerminal => t !== undefined)
      .map((t) => this.toTerminalInfo(t));
  }

  getAllTerminals(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map((t) => this.toTerminalInfo(t));
  }

  getTerminalInfo(terminalId: string): TerminalInfo | null {
    return this.getTerminal(terminalId);
  }

  hasActiveTerminal(sessionId: string): boolean {
    return this.getActiveTerminal(sessionId) !== null;
  }

  getActiveTerminal(sessionId: string): TerminalInfo | null {
    const terminalIds = this.sessionTerminals.get(sessionId);
    if (!terminalIds) return null;

    for (const id of terminalIds) {
      const terminal = this.terminals.get(id);
      if (terminal && terminal.mode === 'active') {
        return this.toTerminalInfo(terminal);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // DIMENSION CONTROL
  // ---------------------------------------------------------------------------

  resize(terminalId: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    const { sessionId, mode } = terminal;

    if (this.storeSync && !this.storeSync.canResize(terminalId)) {
      return false;
    }

    if (mode === 'passive') {
      return false;
    }

    this.sessionSource.resize(sessionId, cols, rows);

    terminal.cols = cols;
    terminal.rows = rows;

    this.syncPassiveTerminals(sessionId, cols, rows);

    this.emit('terminalResized', {
      terminalId,
      sessionId,
      cols,
      rows,
    });

    return true;
  }

  getDimensions(terminalId: string): TerminalDimensions | null {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return null;
    return { cols: terminal.cols, rows: terminal.rows };
  }

  getSessionDimensions(sessionId: string): TerminalDimensions | null {
    const session = this.sessionSource.getSession(sessionId);
    if (!session) return null;
    return { cols: session.cols, rows: session.rows };
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------

  destroyTerminal(terminalId: string): void {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;

    const { sessionId } = terminal;

    if (this.storeSync) {
      this.storeSync.unregisterTerminal(terminalId);
    }

    this.terminals.delete(terminalId);
    const sessionSet = this.sessionTerminals.get(sessionId);
    if (sessionSet) {
      sessionSet.delete(terminalId);
      if (sessionSet.size === 0) {
        this.sessionTerminals.delete(sessionId);
        this.removeOutputRouting(sessionId);
      }
    }

    this.emit('terminalDestroyed', { terminalId, sessionId });
  }

  destroySessionTerminals(sessionId: string): void {
    const terminalIds = this.sessionTerminals.get(sessionId);
    if (!terminalIds) return;

    for (const terminalId of Array.from(terminalIds)) {
      this.destroyTerminal(terminalId);
    }
  }

  shutdown(): void {
    for (const terminalId of Array.from(this.terminals.keys())) {
      this.destroyTerminal(terminalId);
    }
    if (this.ptyExitHandler) {
      this.sessionSource.off('exit', this.ptyExitHandler);
    }
    if (this.ptySessionLostHandler) {
      this.sessionSource.off('sessionLost', this.ptySessionLostHandler);
    }
    if (this.ptySessionResizedHandler) {
      this.sessionSource.off('sessionResized', this.ptySessionResizedHandler);
    }
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private validateSession(sessionId: string): void {
    const session = this.sessionSource.getSession(sessionId);
    if (!session) {
      throw new Error(`PTY session not found: ${sessionId}`);
    }
  }

  private validateActiveMode(sessionId: string, mode: TerminalMode): void {
    if (mode === 'active' && this.hasActiveTerminal(sessionId)) {
      throw new Error(`Session ${sessionId} already has an active terminal`);
    }
  }

  private addToSession(sessionId: string, terminalId: string): void {
    let sessionSet = this.sessionTerminals.get(sessionId);
    if (!sessionSet) {
      sessionSet = new Set();
      this.sessionTerminals.set(sessionId, sessionSet);
    }
    sessionSet.add(terminalId);
  }

  private toTerminalInfo(terminal: BaseTerminal): TerminalInfo {
    return {
      id: terminal.id,
      sessionId: terminal.sessionId,
      type: terminal.type,
      mode: terminal.mode,
      cols: terminal.cols,
      rows: terminal.rows,
      createdAt: terminal.createdAt,
    };
  }

  private syncPassiveTerminals(sessionId: string, cols: number, rows: number): void {
    const terminalIds = this.sessionTerminals.get(sessionId);
    if (!terminalIds) return;

    for (const terminalId of terminalIds) {
      const terminal = this.terminals.get(terminalId);
      if (!terminal || terminal.mode === 'active') continue;

      terminal.cols = cols;
      terminal.rows = rows;
    }
  }

  private applySessionResize(sessionId: string, cols: number, rows: number): void {
    const terminalIds = this.sessionTerminals.get(sessionId);
    if (!terminalIds) return;

    for (const terminalId of terminalIds) {
      const terminal = this.terminals.get(terminalId);
      if (!terminal) continue;

      terminal.cols = cols;
      terminal.rows = rows;
    }
  }

  private ensureOutputRouting(sessionId: string): void {
    if (this.outputHandlers.has(sessionId)) {
      return;
    }

    const handler = (data: { sessionId: string; data: Buffer }): void => {
      if (data.sessionId !== sessionId) return;

      const output = data.data.toString('utf-8');
      this.routeOutputToTerminals(sessionId, output);
    };

    this.outputHandlers.set(sessionId, handler);
    this.sessionSource.on('output', handler);
  }

  private replayOutputBufferToTerminal(sessionId: string, terminalId: string): void {
    const buffer = this.sessionSource.getOutputBuffer(sessionId);
    if (!buffer || buffer.length === 0) return;

    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;

    const output = buffer.toString('utf-8');

    this.emit('terminalOutput', {
      terminalId,
      sessionId,
      data: output,
    });
  }

  private removeOutputRouting(sessionId: string): void {
    const handler = this.outputHandlers.get(sessionId);
    if (handler) {
      this.sessionSource.removeListener('output', handler);
      this.outputHandlers.delete(sessionId);
    }
  }

  private routeOutputToTerminals(sessionId: string, output: string): void {
    const terminalIds = this.sessionTerminals.get(sessionId);
    if (!terminalIds) return;

    for (const terminalId of terminalIds) {
      const terminal = this.terminals.get(terminalId);
      if (!terminal) continue;

      this.emit('terminalOutput', {
        terminalId,
        sessionId,
        data: output,
      });
    }
  }
}

// ===============================================================================
// FACTORY
// ===============================================================================

export function createTerminalService(sessionSource: IPTYSessionSource): TerminalService {
  return new TerminalServiceImpl(sessionSource);
}
