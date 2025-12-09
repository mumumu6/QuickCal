import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AuthPanel from "@/components/AuthPanel";
import EventRegisterPanel from "@/components/EventRegisterPanel";

function App() {
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSaved = async () => {
      setInitializing(true);
      setError(null);
      try {
        const token = await invoke<string | null>("check_saved_auth");
        setAccessToken(token);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setInitializing(false);
      }
    };
    checkSaved();
  }, []);

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
          paddingTop: 16,
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          marginTop: 0,
        }}
      >
        {!accessToken && (
          <AuthPanel
            initializing={initializing}
            loading={loading}
            apiLoading={false}
            accessToken={accessToken}
            error={error}
            onAuth={handleAuth}
            onCancel={handleCancel}
          />
        )}

        {accessToken && <EventRegisterPanel accessToken={accessToken} />}
      </div>
    </main>
  );
}

export default App;
