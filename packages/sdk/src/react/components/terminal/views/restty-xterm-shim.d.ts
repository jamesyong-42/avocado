/**
 * Ambient modules so optional peer `restty` typechecks when not installed
 * as a hard dependency of the SDK package.
 */
declare module 'restty' {
  export class Restty {
    constructor(config: Record<string, unknown>);
    sendInput(text: string, source?: string): void;
    resize(cols: number, rows: number): void;
    focus(): void;
    blur(): void;
    updateSize(): void;
    destroy(): void;
    connectPty?(url: string): void;
    disconnectPty?(): void;
  }
  export function createRestty(config: Record<string, unknown>): Restty;
  export function getBuiltinTheme(name: string): unknown;
}

declare module 'restty/xterm' {
  export class Terminal {
    constructor(options?: {
      cols?: number;
      rows?: number;
      fontSize?: number;
      fontFamily?: string;
      cursorBlink?: boolean;
      [key: string]: unknown;
    });
    open(parent: HTMLElement): void;
    write(data: string, callback?: () => void): void;
    resize(cols: number, rows: number): void;
    focus(): void;
    blur(): void;
    dispose(): void;
    onData(listener: (data: string) => void): { dispose: () => void } | (() => void);
    onResize(
      listener: (size: { cols: number; rows: number }) => void
    ): { dispose: () => void } | (() => void);
    cols?: number;
    rows?: number;
    options?: Record<string, unknown>;
  }
}

declare module 'xterm/css/xterm.css' {
  const css: string;
  export default css;
}
