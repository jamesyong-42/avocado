/**
 * PeersList — shows mesh peers discovered via truffle.
 *
 * Pulls the initial list from `window.avocado.peers.list()` then stays in
 * sync via `peers.onChanged`. Renders a compact list with display name +
 * connection state (RFC 022 peer handles).
 */

import { useEffect, useState, type JSX } from 'react';
import type { PeerInfo } from '@shared/ipc';

export function PeersList(): JSX.Element {
  const [peers, setPeers] = useState<PeerInfo[]>([]);

  useEffect(() => {
    let cancelled = false;

    void window.avocado.peers.list().then((initial) => {
      if (!cancelled) setPeers(initial);
    });

    const unsubscribe = window.avocado.peers.onChanged((next) => {
      setPeers(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="panel" style={{ minHeight: 120 }}>
      <h2>Peers ({peers.length})</h2>
      {peers.length === 0 ? (
        <ul>
          <li className="empty">No peers on the mesh yet…</li>
        </ul>
      ) : (
        <ul>
          {peers.map((peer) => (
            <li
              key={peer.peerRef}
              title={
                peer.deviceId
                  ? `deviceId ${peer.deviceId}`
                  : `identity pending · ${peer.tailscaleId}`
              }
            >
              <strong>{peer.displayName}</strong>
              <div
                style={{
                  fontSize: 10,
                  color: peer.wsConnected ? '#7be490' : '#9aa0b0',
                }}
              >
                {peer.wsConnected ? 'WS connected' : 'offline'} ·{' '}
                {peer.connectionType}
                {peer.deviceId ? '' : ' · id pending'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
