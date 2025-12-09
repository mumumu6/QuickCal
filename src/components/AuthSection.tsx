import React from "react";

export type AuthSectionProps = {
  initializing: boolean;
  loading: boolean;
  apiLoading: boolean;
  accessToken: string | null;
  onAuth: () => void;
  onCancel: () => void;
};

const AuthSection = ({
  initializing,
  loading,
  apiLoading,
  accessToken,
  onAuth,
  onCancel,
}: AuthSectionProps) => {
  return (
    <>
      {!accessToken && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onAuth}
            disabled={loading || apiLoading}
            style={{
              padding: "12px 16px",
              fontSize: 16,
              background: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: loading || apiLoading ? "not-allowed" : "pointer",
              flex: 1,
            }}
          >
            {loading ? "認証中..." : "Googleで認証"}
          </button>
          {loading && (
            <button
              onClick={onCancel}
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
      )}

      <div style={{ marginTop: 12, fontSize: 14, color: "#555" }}>
        {initializing
          ? "保存済みのアクセストークンを確認しています..."
          : accessToken
          ? "アクセストークンが利用できます"
          : "アクセストークンがありません。認証してください。"}
      </div>
    </>
  );
};

export default AuthSection;
