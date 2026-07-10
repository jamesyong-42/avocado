/**
 * IPTYTransport test double for PTYSessionManager / relay tests.
 */

import { EventEmitter } from 'node:events';
import type { IPTYTransport, TransportType, RemoteSessionAnnounce } from '#types';

export class MockTransport extends EventEmitter implements IPTYTransport {
  readonly transportId: string;
  readonly transportType: TransportType;
  isReady = true;

  sent: Array<{ method: string; args: unknown[] }> = [];

  constructor(transportId = 'transport-1', transportType: TransportType = 'ws') {
    super();
    this.transportId = transportId;
    this.transportType = transportType;
  }

  sendInput(sessionId: string, data: string | Buffer): void {
    this.sent.push({ method: 'sendInput', args: [sessionId, data] });
  }

  sendResize(sessionId: string, cols: number, rows: number): void {
    this.sent.push({ method: 'sendResize', args: [sessionId, cols, rows] });
  }

  sendKill(sessionId: string, signal?: string): void {
    this.sent.push({ method: 'sendKill', args: [sessionId, signal] });
  }

  sendFocus(sessionId: string, focused: boolean): void {
    this.sent.push({ method: 'sendFocus', args: [sessionId, focused] });
  }

  sendOutput(sessionId: string, data: Buffer, targetDeviceId: string): void {
    this.sent.push({ method: 'sendOutput', args: [sessionId, data, targetDeviceId] });
  }

  sendResized(sessionId: string, cols: number, rows: number, targetDeviceId: string): void {
    this.sent.push({ method: 'sendResized', args: [sessionId, cols, rows, targetDeviceId] });
  }

  sendSessionEnded(sessionId: string, exitCode: number, targetDeviceId: string): void {
    this.sent.push({ method: 'sendSessionEnded', args: [sessionId, exitCode, targetDeviceId] });
  }

  sendFocusChanged(sessionId: string, focused: boolean, targetDeviceId: string): void {
    this.sent.push({ method: 'sendFocusChanged', args: [sessionId, focused, targetDeviceId] });
  }

  disconnect(reason?: string): void {
    this.isReady = false;
    this.emit('disconnected', reason ?? 'disconnect');
  }

  dispose(): void {
    this.isReady = false;
    this.emit('disconnected', 'disposed');
    this.removeAllListeners();
  }

  announce(session: RemoteSessionAnnounce): void {
    this.emit('sessionAnnounced', session);
  }

  endSession(sessionId: string, exitCode = 0): void {
    this.emit('sessionEnded', sessionId, exitCode);
  }
}
