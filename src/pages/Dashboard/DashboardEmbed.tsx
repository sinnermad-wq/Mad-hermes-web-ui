import { useEffect, useRef, useState } from 'react';
import './DashboardEmbed.css';

/**
 * XAUUSD Dashboard — Streamlit embedded view.
 *
 * ── SECURITY POLICY ──────────────────────────────────────────────────────
 * The XAUUSD Dashboard (Streamlit on :8501) is STRICTLY LAN-ONLY.
 * It is NOT port-forwarded and CANNOT be accessed from the internet.
 * Access matrix:
 *   Same WiFi  → http://192.168.31.233:8501     ✅ iframe works
 *   External   → Not reachable                   ❌ LAN notice shown
 *   VPN        → http://<server-lan-ip>:8501     ✅ if VPN bridges LAN
 *
 * The Web UI (port 80) IS the sole internet-facing entry point.
 * ───────────────────────────────────────────────────────────────────────
 */

const SERVER_IP = import.meta.env.VITE_SERVER_IP ?? '192.168.31.233';
const DASHBOARD_PORT = '8501';

export function DashboardEmbed() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadError, setLoadError] = useState(false);
  const [isInternal, setIsInternal] = useState<boolean | null>(null);

  // ── LAN detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    fetch(`http://localhost:${DASHBOARD_PORT}/`, { mode: 'no-cors', signal: controller.signal })
      .then(() => setIsInternal(true))
      .catch(() => setIsInternal(false))
      .finally(() => clearTimeout(timer));
  }, []);

  // ── Iframe handlers ───────────────────────────────────────────────────────
  const handleIframeLoad = () => setLoadError(false);
  const handleIframeError = () => setLoadError(true);

  // ── Retry ────────────────────────────────────────────────────────────────
  const handleRetry = () => {
    setLoadError(false);
    iframeRef.current?.contentWindow?.location.reload();
  };

  return (
    <div className="dashboard-embed">
      <div className="dashboard-embed-header">
        <h2>XAUUSD Dashboard</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isInternal === false && (
            <span className="dashboard-embed-badge warn">LAN only</span>
          )}
          {isInternal === true && (
            <span className="dashboard-embed-badge ok">🌐 LAN</span>
          )}
          {isInternal === null && (
            <span className="dashboard-embed-badge">…</span>
          )}
        </div>
      </div>

      {/* ── External user — show LAN access notice ── */}
      {isInternal === false && (
        <div className="dashboard-embed-lan-notice">
          <div className="lan-notice-card">
            <h3>🌐 LAN Access Required</h3>
            <p>
              The <strong>XAUUSD Dashboard runs on <code>localhost:{DASHBOARD_PORT}</code></strong> —
              a <em>private, non-Internet-routable</em> address.
              It is <strong>not exposed to the internet</strong> by design.
            </p>
            <div className="lan-notice-divider" />
            <div className="lan-notice-steps">
              <h4>Option A — Same WiFi (recommended)</h4>
              <ol>
                <li>Connect your device to the same network as the server</li>
                <li>Open your browser and go to:</li>
                <li className="lan-url">
                  <code>http://{SERVER_IP}:{DASHBOARD_PORT}</code>
                </li>
              </ol>
            </div>
            <div className="lan-notice-divider" />
            <div className="lan-notice-steps">
              <h4>Option B — VPN remote access</h4>
              <p>
                Connect via VPN to bridge onto the LAN. Once connected,
                the URL above will work from anywhere.
              </p>
            </div>
            <p className="lan-notice-note">
              💡 The Web UI at port 80 is the <strong>sole external entry point</strong>.
              This boundary cannot be bypassed without exposing Streamlit directly.
            </p>
          </div>
        </div>
      )}

      {/* ── LAN but Streamlit unreachable — error ── */}
      {isInternal === true && loadError && (
        <div className="dashboard-embed-error">
          <h3>⚠️ Dashboard Unavailable</h3>
          <p>
            You appear to be on the LAN, but <code>localhost:{DASHBOARD_PORT}</code>{' '}
            is not responding.
          </p>
          <p>Ensure the dashboard process is running:</p>
          <div className="code-block" style={{ textAlign: 'left', marginTop: '0.5rem' }}>
{`python -m streamlit run src/daily_xauusd_brief/dashboard.py \\
  --server.port 8501 --server.address 0.0.0.0 \\
  --server.enableCORS true --server.enableXsrfProtection false`}
          </div>
          <button className="retry-btn" onClick={handleRetry}>Retry</button>
        </div>
      )}

      {/* ── LAN and reachable — show iframe ── */}
      {isInternal === true && !loadError && (
        <div className="iframe-container">
          <iframe
            ref={iframeRef}
            src={`http://localhost:${DASHBOARD_PORT}/?embed=true&hide_top_bar=true&embed_options=light`}
            title="XAUUSD Dashboard"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            allow="fullscreen"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>
      )}

      {/* ── Still detecting — loading state ── */}
      {isInternal === null && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary, #888)' }}>
          Checking LAN access…
        </div>
      )}
    </div>
  );
}