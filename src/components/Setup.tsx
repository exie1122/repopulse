import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { GitHubUser } from "../types";

interface Props {
  onDone: (user: GitHubUser) => void;
}

type Mode = "choose" | "oauth" | "pat";

export default function Setup({ onDone }: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const [oauthConfigured, setOauthConfigured] = useState(false);

  useEffect(() => {
    api.isDeviceFlowConfigured().then(setOauthConfigured).catch(() => {});
  }, []);

  return (
    <div className="setup-root">
      <div className="setup-card">
        <div className="setup-logo">
          <span className="logo-icon">&#9679;</span>
          <span className="logo-text">RepoPulse</span>
        </div>

        {mode === "choose" && (
          <ChooseMode
            oauthConfigured={oauthConfigured}
            onOAuth={() => setMode("oauth")}
            onPat={() => setMode("pat")}
          />
        )}
        {mode === "oauth" && (
          <OAuthFlow onDone={onDone} onBack={() => setMode("choose")} />
        )}
        {mode === "pat" && (
          <PatFlow onDone={onDone} onBack={() => setMode("choose")} />
        )}
      </div>
    </div>
  );
}

function ChooseMode({
  oauthConfigured,
  onOAuth,
  onPat,
}: {
  oauthConfigured: boolean;
  onOAuth: () => void;
  onPat: () => void;
}) {
  return (
    <>
      <h1 className="setup-title">Connect your GitHub account</h1>
      <p className="setup-subtitle">
        RepoPulse stores all data locally — your credentials never leave this machine.
      </p>

      <div className="setup-auth-options">
        {oauthConfigured && (
          <button className="btn btn-primary btn-full" onClick={onOAuth}>
            Sign in with GitHub
          </button>
        )}
        <button
          className={`btn btn-full ${oauthConfigured ? "btn-secondary" : "btn-primary"}`}
          onClick={onPat}
        >
          Use a Personal Access Token
        </button>
      </div>

      <p className="privacy-note">
        All data is stored locally. No cloud account required.
      </p>
    </>
  );
}

function OAuthFlow({
  onDone,
  onBack,
}: {
  onDone: (u: GitHubUser) => void;
  onBack: () => void;
}) {
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Initializing…");
  const deviceCodeRef = useRef<string>("");
  const intervalRef = useRef<number>(5);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const flow = await api.startDeviceFlow();
        if (cancelled) return;
        setUserCode(flow.user_code);
        setVerificationUri(flow.verification_uri);
        setStatus("Waiting for authorization…");
        deviceCodeRef.current = flow.device_code;
        api.openUrl(flow.verification_uri).catch(() => {});
        intervalRef.current = flow.interval || 5;
        schedulePoll(flow.device_code, flow.interval || 5, cancelled);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };

    const schedulePoll = (code: string, interval: number, dead: boolean) => {
      pollingRef.current = setTimeout(async () => {
        if (dead) return;
        try {
          const result = await api.pollDeviceFlow(code);
          if (result.access_token) {
            await api.saveToken(result.access_token);
            const user = await api.verifyToken();
            onDone(user);
            return;
          }
          const err = result.error;
          if (err === "authorization_pending" || err === "slow_down") {
            const next = err === "slow_down" ? interval + 5 : interval;
            schedulePoll(code, next, dead);
          } else if (err === "expired_token") {
            setError("Authorization timed out. Please try again.");
          } else if (err === "access_denied") {
            setError("Access denied. Please try again.");
          } else {
            schedulePoll(code, interval, dead);
          }
        } catch (e) {
          if (!dead) setError(String(e));
        }
      }, interval * 1000);
    };

    start();
    return () => {
      cancelled = true;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  return (
    <>
      <h1 className="setup-title">Sign in with GitHub</h1>

      {error ? (
        <>
          <p className="form-error">{error}</p>
          <button className="btn btn-secondary" onClick={onBack}>Back</button>
        </>
      ) : userCode ? (
        <div className="oauth-flow">
          <p className="setup-subtitle">
            Open <strong>{verificationUri}</strong> in your browser and enter this code:
          </p>
          <div className="device-code">{userCode}</div>
          <p className="oauth-status">{status}</p>
          <button className="btn-ghost" onClick={onBack}>Cancel</button>
        </div>
      ) : (
        <div className="loading-row">
          <div className="spinner" /> {status}
        </div>
      )}
    </>
  );
}

function PatFlow({
  onDone,
  onBack,
}: {
  onDone: (u: GitHubUser) => void;
  onBack: () => void;
}) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.saveToken(token.trim());
      const user = await api.verifyToken();
      onDone(user);
    } catch (err) {
      setError(String(err));
      await api.deleteToken().catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="setup-title">Personal Access Token</h1>
      <p className="setup-subtitle">
        Create a token with the <code>repo</code> scope at{" "}
        <strong>GitHub → Settings → Developer settings → Personal access tokens</strong>.
        Traffic data requires push access to each repo.
      </p>

      <form onSubmit={handleSubmit} className="setup-form">
        <label htmlFor="pat" className="form-label">
          Token
        </label>
        <input
          id="pat"
          type="password"
          className="form-input"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
        />
        {error && <p className="form-error">{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !token.trim()}
        >
          {loading ? "Verifying…" : "Connect"}
        </button>
      </form>

      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={onBack}>
        ← Back
      </button>

      <p className="privacy-note">
        Stored securely in your OS keychain — never sent anywhere.
      </p>
    </>
  );
}
