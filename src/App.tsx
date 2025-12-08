import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type AuthResult = {
  access_token: string;
  refresh_token?: string | null;
  scope: string[];
  token_type: string;
  expires_in?: number | null;
};

function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // scopes を省略すると Rust 側デフォルト(email, profile)を使用
      const res = await invoke<AuthResult>("start_google_auth");
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f7f7",
        color: "#222",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          padding: 24,
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 12 }}>Google OAuth (PKCE)</h1>
        <p style={{ marginTop: 0, marginBottom: 20, lineHeight: 1.5 }}>
          ブラウザで Google 同意画面を開いて、コードをローカルで受け取ります。
        </p>
        <button
          onClick={handleAuth}
          disabled={loading}
          style={{
            padding: "12px 16px",
            fontSize: 16,
            background: "#1a73e8",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: loading ? "not-allowed" : "pointer",
            width: "100%",
          }}
        >
          {loading ? "認証中..." : "Googleで認証"}
        </button>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: "#fdecea",
              color: "#b71c1c",
              fontSize: 14,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: "#f1f3f4",
              color: "#202124",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <div>
              <strong>token_type:</strong> {result.token_type}
            </div>
            <div>
              <strong>access_token:</strong> {result.access_token}
            </div>
            {result.refresh_token && (
              <div>
                <strong>refresh_token:</strong> {result.refresh_token}
              </div>
            )}
            {result.expires_in != null && (
              <div>
                <strong>expires_in (s):</strong> {result.expires_in}
              </div>
            )}
            {result.scope?.length > 0 && (
              <div>
                <strong>scopes:</strong> {result.scope.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
