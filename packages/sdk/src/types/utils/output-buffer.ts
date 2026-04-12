/**
 * CircularOutputBuffer - Efficient circular buffer for terminal output
 *
 * Maintains a rolling buffer of terminal output data with a configurable
 * maximum size. Older data is automatically discarded when the buffer
 * exceeds its limit.
 */

/** Maximum output buffer size per session (1 MB) */
export const MAX_OUTPUT_BUFFER_SIZE = 1024 * 1024;

// ===============================================================================
// CIRCULAR OUTPUT BUFFER
// ===============================================================================

/**
 * Circular buffer for terminal output
 *
 * Efficiently manages terminal output with automatic size limiting.
 * Maintains insertion order while discarding oldest data when full.
 */
export class CircularOutputBuffer {
  private chunks: Buffer[] = [];
  private totalSize: number = 0;
  private readonly maxSize: number;

  /**
   * Create a new circular output buffer
   * @param maxSize Maximum buffer size in bytes (default: 1MB)
   */
  constructor(maxSize: number = MAX_OUTPUT_BUFFER_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Push data into the buffer
   */
  push(data: Buffer | string): void {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;

    // If single chunk exceeds max size, keep only the tail
    if (buffer.length >= this.maxSize) {
      this.chunks = [buffer.subarray(buffer.length - this.maxSize)];
      this.totalSize = this.chunks[0].length;
      return;
    }

    // Add new chunk
    this.chunks.push(buffer);
    this.totalSize += buffer.length;

    // Trim oldest chunks to stay within limit
    this.trim();
  }

  /**
   * Get the complete buffer contents
   * @param maxBytes Optional maximum bytes to return (from the end)
   */
  get(maxBytes?: number): Buffer {
    if (this.chunks.length === 0) {
      return Buffer.alloc(0);
    }

    const fullBuffer = Buffer.concat(this.chunks);

    if (maxBytes !== undefined && fullBuffer.length > maxBytes) {
      return fullBuffer.subarray(fullBuffer.length - maxBytes);
    }

    return fullBuffer;
  }

  /** Get the current buffer size in bytes */
  get size(): number {
    return this.totalSize;
  }

  /** Get the maximum buffer size */
  get capacity(): number {
    return this.maxSize;
  }

  /** Check if the buffer is empty */
  get isEmpty(): boolean {
    return this.totalSize === 0;
  }

  /** Clear all buffer contents */
  clear(): void {
    this.chunks = [];
    this.totalSize = 0;
  }

  /** Get the number of chunks in the buffer */
  get chunkCount(): number {
    return this.chunks.length;
  }

  /** Trim buffer to stay within max size */
  private trim(): void {
    while (this.totalSize > this.maxSize && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      if (removed) {
        this.totalSize -= removed.length;
      }
    }

    // If still over limit with single chunk, trim from start
    if (this.totalSize > this.maxSize && this.chunks.length === 1) {
      const excess = this.totalSize - this.maxSize;
      this.chunks[0] = this.chunks[0].subarray(excess);
      this.totalSize = this.chunks[0].length;
    }
  }

  /** Compact the buffer into a single chunk (reduces memory fragmentation) */
  compact(): void {
    if (this.chunks.length > 1) {
      this.chunks = [Buffer.concat(this.chunks)];
    }
  }
}

/**
 * Create a new output buffer with default settings
 */
export function createOutputBuffer(maxSize?: number): CircularOutputBuffer {
  return new CircularOutputBuffer(maxSize);
}
