import { describe, it, expect } from 'vitest';
import {
  encodeMessage,
  decodeFrame,
  HEADER_SIZE,
  MAX_MESSAGE_SIZE,
  PTY_NAMESPACE,
  type NamespacedMessage,
} from '../../src/transport-ipc/wire.js';

describe('IPC wire framing', () => {
  const sample: NamespacedMessage = {
    namespace: PTY_NAMESPACE,
    type: 'pty:input',
    payload: { sessionId: 's1', data: 'aGk=' },
    timestamp: 1_700_000_000_000,
  };

  it('msgpack round-trips', () => {
    const frame = encodeMessage(sample, 'msgpack');
    expect(frame.length).toBeGreaterThan(HEADER_SIZE);
    const decoded = decodeFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded!.bytesConsumed).toBe(frame.length);
    expect(decoded!.message.namespace).toBe(PTY_NAMESPACE);
    expect(decoded!.message.type).toBe('pty:input');
    expect(decoded!.message.payload).toEqual(sample.payload);
  });

  it('json round-trips', () => {
    const frame = encodeMessage(sample, 'json');
    const decoded = decodeFrame(frame);
    expect(decoded!.message).toMatchObject({
      namespace: PTY_NAMESPACE,
      type: 'pty:input',
      payload: sample.payload,
    });
  });

  it('returns null for incomplete header', () => {
    expect(decodeFrame(Buffer.alloc(2))).toBeNull();
  });

  it('returns null for incomplete payload', () => {
    const frame = encodeMessage(sample);
    const partial = frame.subarray(0, frame.length - 3);
    expect(decodeFrame(partial)).toBeNull();
  });

  it('decodes first frame when extra bytes follow', () => {
    const a = encodeMessage({ namespace: 'pty', type: 'a', timestamp: 1 });
    const b = encodeMessage({ namespace: 'pty', type: 'b', timestamp: 2 });
    const combined = Buffer.concat([a, b]);
    const first = decodeFrame(combined)!;
    expect(first.message.type).toBe('a');
    expect(first.bytesConsumed).toBe(a.length);
    const second = decodeFrame(combined.subarray(first.bytesConsumed))!;
    expect(second.message.type).toBe('b');
  });

  it('rejects oversized messages', () => {
    const huge = Buffer.alloc(HEADER_SIZE);
    huge.writeUInt32BE(MAX_MESSAGE_SIZE + 1, 0);
    huge.writeUInt8(0, 4);
    expect(() => decodeFrame(huge)).toThrow(/too large/i);
  });

  it('rejects invalid payload objects', async () => {
    // Craft msgpack of a string (not an object with namespace/type).
    const { encode } = await import('@msgpack/msgpack');
    const payload = Buffer.from(encode('not-an-object'));
    const frame = Buffer.alloc(HEADER_SIZE + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    frame.writeUInt8(0, 4);
    payload.copy(frame, HEADER_SIZE);
    expect(() => decodeFrame(frame)).toThrow(/Invalid message format/);
  });
});
