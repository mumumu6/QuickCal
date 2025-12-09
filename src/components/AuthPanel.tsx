import AuthSection from "@/components/AuthSection";

export type AuthPanelProps = {
  initializing: boolean;
  loading: boolean;
  apiLoading: boolean;
  accessToken: string | null;
  error: string | null;
  onAuth: () => void;
  onCancel: () => void;
};

export default function AuthPanel({
  initializing,
  loading,
  apiLoading,
  accessToken,
  error,
  onAuth,
  onCancel,
}: AuthPanelProps) {
  return (
    <>
      <h1 style={{ marginTop: 0, marginBottom: 12 }}>Google OAuth (PKCE)</h1>
      <p style={{ marginTop: 0, marginBottom: 20, lineHeight: 1.5 }}>
        ブラウザで Google 同意画面を開き、キーチェーンに保存されたトークンを使って Google Calendar
        API を呼び出します。
      </p>

      <AuthSection
        initializing={initializing}
        loading={loading}
        apiLoading={apiLoading}
        accessToken={accessToken}
        onAuth={onAuth}
        onCancel={onCancel}
      />

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
    </>
  );
}
