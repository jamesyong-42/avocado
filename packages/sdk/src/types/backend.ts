/**
 * TerminalBackend - Abstract backend interface for terminal operations
 *
 * This replaces window.desktopAPI in the Electron app. Consumers provide
 * their own implementation (e.g., Electron IPC, WebSocket, REST API).
 */

export interface TerminalBackend {
  pty: {
    create(options: { cwd: string; cols: number; rows: number }): Promise<{ success: boolean; sessionId?: string; error?: string }>;
    destroy(sessionId: string): Promise<{ success: boolean; error?: string }>;
    list(): Promise<{ success: boolean; sessions?: Array<{
      id: string;
      source: string;
      command: string;
      cwd: string;
      createdAt: number;
      pid: number;
      cols: number;
      rows: number;
      isRunning: boolean;
      isFocused?: boolean;
      exitCode?: number | null;
      deviceId?: string;
    }>; error?: string }>;
    listBySource?(source: string): Promise<{ success: boolean; sessions?: Array<{
      id: string;
      source: string;
      command: string;
      cwd: string;
      createdAt: number;
      pid: number;
      cols: number;
      rows: number;
      isRunning: boolean;
      isFocused?: boolean;
      exitCode?: number | null;
      deviceId?: string;
    }>; error?: string }>;
    write(sessionId: string, data: string): Promise<void>;
    resize(sessionId: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }>;
    onOutput(cb: (terminalId: string, sessionId: string, base64Data: string) => void): () => void;
    onExit(cb: (sessionId: string, exitCode: number) => void): () => void;
    onSessionDiscovered?(cb: (data: { sessionId: string; source: string }) => void): () => void;
    onSessionLost?(cb: (data: { sessionId: string; source: string; reason: string }) => void): () => void;
    onSessionResized?(cb: (sessionId: string, cols: number, rows: number, source: string, origin: string) => void): () => void;
    onSessionFocusChanged?(cb: (data: { sessionId: string; focused: boolean }) => void): () => void;
  };
  terminal: {
    createVirtual(sessionId: string, options: { cols: number; rows: number; mode: string }): Promise<{ success: boolean; terminalId?: string; error?: string }>;
    createHeadless(sessionId: string, options: { cols: number; rows: number; mode: string }): Promise<{ success: boolean; terminalId?: string; error?: string }>;
    destroy(terminalId: string): Promise<{ success: boolean; error?: string }>;
    list(): Promise<{ success: boolean; terminals?: Array<{
      id: string;
      sessionId: string;
      type: string;
      mode: string;
      cols: number;
      rows: number;
      createdAt: number;
    }>; error?: string }>;
    resize(terminalId: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }>;
    setActive(terminalId: string): Promise<{ success: boolean; error?: string }>;
    getScreenLines?(terminalId: string): Promise<{ success: boolean; lines?: string[]; error?: string }>;
    getCursorPosition?(terminalId: string): Promise<{ success: boolean; position?: { x: number; y: number }; error?: string }>;
    getInfo?(terminalId: string): Promise<{ success: boolean; terminal?: { id: string; sessionId: string; type: string; mode: string; cols: number; rows: number; createdAt: number }; error?: string }>;
    getSessionDimensions?(sessionId: string): Promise<{ success: boolean; dimensions?: { cols: number; rows: number }; error?: string }>;
    getActiveTerminal?(sessionId: string): Promise<{ success: boolean; terminal?: { id: string; sessionId: string; type: string; mode: string; cols: number; rows: number; createdAt: number }; error?: string }>;
    onModeChanged?(cb: (data: { terminalId: string; sessionId: string; mode: string }) => void): () => void;
    onDestroyed?(cb: (terminalId: string, sessionId: string) => void): () => void;
  };
  remoteSessions?: {
    list(): Promise<Array<{
      deviceId: string;
      deviceName: string;
      sessionId: string;
      command: string;
      cwd: string;
      cols: number;
      rows: number;
      pid: number;
    }>>;
    onChanged?(cb: (offers: Array<{
      deviceId: string;
      deviceName: string;
      sessionId: string;
      command: string;
      cwd: string;
      cols: number;
      rows: number;
      pid: number;
    }>) => void): () => void;
  };
}
