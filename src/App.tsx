import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessToken(null);
    try {
      // Rust 側はアクセストークン文字列のみ返却
      const token = await invoke<string>("get_access_token");
      setAccessToken(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    try {
      await invoke("cancel_auth");
    } catch (e) {
      // キャンセル失敗時は特に何もしない（認証プロセスが実行されていない場合など）
      console.warn("Cancel auth failed:", e);
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
        <div style={{ display: "flex", gap: 8 }}>
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
              flex: 1,
            }}
          >
            {loading ? "認証中..." : "Googleで認証"}
          </button>
          {loading && (
            <button
              onClick={handleCancel}
              style={{
                padding: "12px 16px",
                fontSize: 16,
                background: "#dc3545",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                minWidth: 80,
              }}
            >
              やめる
            </button>
          )}
        </div>

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

        {accessToken && (
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
              <strong>access_token:</strong> {accessToken}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
