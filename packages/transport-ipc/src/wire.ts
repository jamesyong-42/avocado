/**
 * Wire Format — Length-prefixed MessagePack framing
 *
 * Shared encode/decode for CLI ↔ Playground communication over UDS/Named Pipe.
 *
 * Wire Format:
 * ┌────────────────┬───────┬─────────────────────────────────┐
 * │ Length (4 bytes)│ Flags │        Payload (N bytes)        │
 * │  big-endian)   │(1 byte│   (MessagePack, JSON, or raw)   │
 * └────────────────┴───────┴─────────────────────────────────┘
 *
 * Flags byte:
 *   bit 0: compressed (0 = no, 1 = yes) — ALWAYS 0 for UDS
 *   bit 1-2: serialization format (00 = MessagePack, 01 = JSON)
 *   bit 3-7: reserved
 */

import { encode, decode } from '@msgpack/msgpack';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const HEADER_SIZE = 5;
export const FLAG_FORMAT_MASK = 0x06;
export const FLAG_FORMAT_MSGPACK = 0x00;
export const FLAG_FORMAT_JSON = 0x02;
export const MAX_MESSAGE_SIZE = 16 * 1024 * 1024;

export const PTY_NAMESPACE = 'pty';

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE ENVELOPE
// ═══════════════════════════════════════════════════════════════════════════

export interface NamespacedMessage<T = unknown> {
  namespace: string;
  type: string;
  payload?: T;
  id?: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCODING
// ═══════════════════════════════════════════════════════════════════════════

export function encodeMessage(
  msg: NamespacedMessage,
  format: 'msgpack' | 'json' = 'msgpack'
): Buffer {
  let payload: Buffer;
  let flags: number;

  if (format === 'msgpack') {
    payload = Buffer.from(encode(msg));
    flags = FLAG_FORMAT_MSGPACK;
  } else {
    payload = Buffer.from(JSON.stringify(msg), 'utf-8');
    flags = FLAG_FORMAT_JSON;
  }

  const frame = Buffer.alloc(HEADER_SIZE + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  frame.writeUInt8(flags, 4);
  payload.copy(frame, HEADER_SIZE);

  return frame;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECODING
// ═══════════════════════════════════════════════════════════════════════════

export interface DecodeResult {
  message: NamespacedMessage;
  bytesConsumed: number;
}

/**
 * Decode a single frame from buffer.
 * Returns null if buffer is incomplete.
 */
export function decodeFrame(buffer: Buffer): DecodeResult | null {
  if (buffer.length < HEADER_SIZE) {
    return null;
  }

  const payloadLength = buffer.readUInt32BE(0);
  const flags = buffer.readUInt8(4);

  if (payloadLength > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${payloadLength} bytes (max: ${MAX_MESSAGE_SIZE})`);
  }

  const totalLength = HEADER_SIZE + payloadLength;
  if (buffer.length < totalLength) {
    return null;
  }

  const payload = buffer.subarray(HEADER_SIZE, totalLength);
  const format = flags & FLAG_FORMAT_MASK;

  let parsed: unknown;
  if (format === FLAG_FORMAT_MSGPACK) {
    parsed = decode(payload);
  } else if (format === FLAG_FORMAT_JSON) {
    parsed = JSON.parse(payload.toString('utf-8'));
  } else {
    throw new Error(`Unknown format flag: ${format}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).namespace !== 'string' ||
    typeof (parsed as Record<string, unknown>).type !== 'string'
  ) {
    throw new Error('Invalid message format: missing namespace or type');
  }

  return {
    message: parsed as NamespacedMessage,
    bytesConsumed: totalLength,
  };
}
