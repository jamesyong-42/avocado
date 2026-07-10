import { describe, it, expect } from 'vitest';
import { CircularOutputBuffer, createOutputBuffer, MAX_OUTPUT_BUFFER_SIZE } from '#types';

describe('CircularOutputBuffer', () => {
  it('starts empty', () => {
    const buf = createOutputBuffer(100);
    expect(buf.isEmpty).toBe(true);
    expect(buf.size).toBe(0);
    expect(buf.get().length).toBe(0);
    expect(buf.capacity).toBe(100);
  });

  it('accepts string and Buffer', () => {
    const buf = new CircularOutputBuffer(100);
    buf.push('hello');
    buf.push(Buffer.from(' world'));
    expect(buf.get().toString()).toBe('hello world');
    expect(buf.size).toBe(11);
    expect(buf.chunkCount).toBe(2);
  });

  it('trims oldest chunks when over capacity', () => {
    const buf = new CircularOutputBuffer(10);
    buf.push('12345');
    buf.push('67890');
    buf.push('ABC');
    expect(buf.size).toBeLessThanOrEqual(10);
    expect(buf.get().toString()).toMatch(/ABC$/);
  });

  it('keeps only tail when single chunk exceeds max', () => {
    const buf = new CircularOutputBuffer(5);
    buf.push('abcdefghij');
    expect(buf.size).toBe(5);
    expect(buf.get().toString()).toBe('fghij');
  });

  it('get(maxBytes) returns trailing window', () => {
    const buf = new CircularOutputBuffer(100);
    buf.push('0123456789');
    expect(buf.get(4).toString()).toBe('6789');
  });

  it('clear resets state', () => {
    const buf = new CircularOutputBuffer(50);
    buf.push('data');
    buf.clear();
    expect(buf.isEmpty).toBe(true);
    expect(buf.chunkCount).toBe(0);
  });

  it('compact merges chunks', () => {
    const buf = new CircularOutputBuffer(100);
    buf.push('a');
    buf.push('b');
    buf.push('c');
    expect(buf.chunkCount).toBe(3);
    buf.compact();
    expect(buf.chunkCount).toBe(1);
    expect(buf.get().toString()).toBe('abc');
  });

  it('default capacity is MAX_OUTPUT_BUFFER_SIZE', () => {
    expect(new CircularOutputBuffer().capacity).toBe(MAX_OUTPUT_BUFFER_SIZE);
  });
});
