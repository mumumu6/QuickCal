import React from "react";

export type ApiConsoleProps = {
  apiUrl: string;
  httpMethod: "GET" | "POST";
  requestBody: string;
  apiLoading: boolean;
  apiResponse: string | null;
  prettyResponse: string | null;
  onChangeUrl: (v: string) => void;
  onChangeMethod: (v: "GET" | "POST") => void;
  onChangeBody: (v: string) => void;
  onPaste: () => void;
  onCall: () => void;
};

const ApiConsole = ({
  apiUrl,
  httpMethod,
  requestBody,
  apiLoading,
  apiResponse,
  prettyResponse,
  onChangeUrl,
  onChangeMethod,
  onChangeBody,
  onPaste,
  onCall,
}: ApiConsoleProps) => {
  return (
    <div
      style={{
        marginTop: 20,
        padding: 14,
        borderRadius: 10,
        background: "#f1f3f4",
        color: "#202124",
        fontSize: 14,
        lineHeight: 1.6,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontWeight: 600, minWidth: 90 }}>リクエスト</label>
        <select
          value={httpMethod}
          onChange={(e) => onChangeMethod(e.target.value === "POST" ? "POST" : "GET")}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
        <input
          value={apiUrl}
          onChange={(e) => onChangeUrl(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            fontFamily: "monospace",
            fontSize: 13,
          }}
          placeholder="https://www.googleapis.com/calendar/v3/..."
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={requestBody}
          onChange={(e) => onChangeBody(e.target.value)}
          style={{
            flex: 1,
            minHeight: 120,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
            fontFamily: "monospace",
            fontSize: 13,
          }}
          placeholder="POST 時の JSON ボディ（GET は空で OK）"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onPaste}
            style={{
              padding: "10px 12px",
              fontSize: 14,
              background: "#6c757d",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              minWidth: 140,
            }}
          >
            クリップボード反映
          </button>
          <button
            onClick={onCall}
            disabled={apiLoading}
            style={{
              padding: "10px 12px",
              fontSize: 14,
              background: "#198754",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: apiLoading ? "not-allowed" : "pointer",
              minWidth: 140,
            }}
          >
            {apiLoading ? "実行中..." : "API を叩く"}
          </button>
        </div>
      </div>

      {apiResponse && (
        <div
          style={{
            marginTop: 4,
            padding: 12,
            borderRadius: 10,
            background: "#fff",
            border: "1px solid #e0e0e0",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
            fontSize: 13,
          }}
        >
          {prettyResponse}
        </div>
      )}
    </div>
  );
};

export default ApiConsole;
