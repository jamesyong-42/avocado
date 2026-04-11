/**
 * SessionsList — lists PTY sessions (local + remote) from @avocado/react's
 * `usePTYSessions` hook. Selecting a session triggers the parent's
 * `onSelect` so it can create or look up a virtual terminal for it.
 */

import type { JSX } from 'react';
import type { PtySession } from '@avocado/types';

export interface SessionsListProps {
  sessions: PtySession[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

export function SessionsList({
  sessions,
  selectedSessionId,
  onSelect,
}: SessionsListProps): JSX.Element {
  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <h2>Sessions ({sessions.length})</h2>
      {sessions.length === 0 ? (
        <ul>
          <li className="empty">No sessions yet — spawn a shell</li>
        </ul>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li
              key={session.id}
              className={
                selectedSessionId === session.id ? 'active' : undefined
              }
              onClick={() => onSelect(session.id)}
              title={session.id}
            >
              <div>
                <strong>{session.command}</strong>
              </div>
              <div style={{ fontSize: 10, color: '#9aa0b0' }}>
                {session.source} · pid {session.pid} · {session.cols}×
                {session.rows}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
