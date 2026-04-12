/**
 * AuthGate — full-screen overlay shown when Tailscale needs authentication.
 *
 * Displayed when the truffle node reports `auth_required`. The user can
 * click "Open in Browser" to launch the auth URL, or copy it manually.
 * The overlay dismisses automatically once the node transitions to `running`.
 */

import { useEffect, useRef, useState, type JSX } from 'react';

interface AuthGateProps {
  authUrl: string;
}

export function AuthGate({ authUrl }: AuthGateProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    openButtonRef.current?.focus();
  }, [authUrl]);

  const handleOpen = (): void => {
    void window.avocado.lifecycle.openAuthUrl(authUrl);
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may not be available
    }
  };

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="auth-card">
        <div className="auth-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>

        <h2 id="auth-title" className="auth-title">Tailscale authentication required</h2>

        <p className="auth-description">
          This device needs to join your Tailscale network before it can
          connect to the mesh. Open the link below in your browser to
          authenticate. This screen will dismiss automatically once
          authentication completes.
        </p>

        <div className="auth-url-row">
          <div className="auth-url-box">{authUrl}</div>
          <button type="button" className="auth-btn-secondary" onClick={() => void handleCopy()}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="auth-actions">
          <button
            ref={openButtonRef}
            type="button"
            className="auth-btn-primary"
            onClick={handleOpen}
          >
            Open in Browser
          </button>
          <span className="auth-waiting">Waiting for authentication...</span>
        </div>
      </div>
    </div>
  );
}
