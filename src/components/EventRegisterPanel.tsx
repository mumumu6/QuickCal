import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (num: number) => String(num).padStart(2, "0");

const formatDateTimeLocal = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const formatDateOnly = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDateOnlyValue = (value: string) => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(date.getTime()) ? null : date;
};

const parseDateTimeValue = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR_MS);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

type ParsedClipboard = {
  start: string;
  end?: string;
  allDay: boolean;
  title?: string;
};

const parseClipboardContent = (raw: string): ParsedClipboard | null => {
  const text = raw.trim();
  if (!text) return null;

  const fullDate = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  const jpDate = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  const shortDate = text.match(/(\d{1,2})[\/\-](\d{1,2})/);

  let baseDate: Date | null = null;
  if (fullDate) {
    const [, y, m, d] = fullDate;
    baseDate = new Date(Number(y), Number(m) - 1, Number(d));
  } else if (jpDate) {
    const [, m, d] = jpDate;
    const now = new Date();
    baseDate = new Date(now.getFullYear(), Number(m) - 1, Number(d));
  } else if (shortDate) {
    const [, m, d] = shortDate;
    const now = new Date();
    baseDate = new Date(now.getFullYear(), Number(m) - 1, Number(d));
  }

  if (!baseDate || isNaN(baseDate.getTime())) return null;

  const timeMatches = [...text.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  const headline = text.split(/\r?\n/)[0]?.trim() || undefined;

  if (timeMatches.length >= 2) {
    const [h1, min1] = timeMatches[0];
    const [h2, min2] = timeMatches[1];
    const start = new Date(baseDate);
    start.setHours(h1, min1, 0, 0);
    const end = new Date(baseDate);
    end.setHours(h2, min2, 0, 0);
    if (end <= start) {
      end.setTime(start.getTime() + HOUR_MS);
    }
    return {
      allDay: false,
      start: formatDateTimeLocal(start),
      end: formatDateTimeLocal(end),
      title: headline,
    };
  }

  if (timeMatches.length === 1) {
    const [h1, min1] = timeMatches[0];
    const start = new Date(baseDate);
    start.setHours(h1, min1, 0, 0);
    return {
      allDay: false,
      start: formatDateTimeLocal(start),
      title: headline,
    };
  }

  return {
    allDay: true,
    start: formatDateOnly(baseDate),
    title: headline,
  };
};

type EventRegisterPanelProps = {
  accessToken: string;
};

export default function EventRegisterPanel({ accessToken }: EventRegisterPanelProps) {
  const initialStart = new Date();
  const [title, setTitle] = useState("カレンダー登録");
  const [allDay, setAllDay] = useState(false);
  const [endDirty, setEndDirty] = useState(false);
  const [startText, setStartText] = useState(formatDateTimeLocal(initialStart));
  const [endText, setEndText] = useState(formatDateTimeLocal(addHours(initialStart, 1)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const startPreview = useMemo(() => {
    if (!startText) return "未入力";
    return allDay ? `${startText} (終日)` : startText;
  }, [allDay, startText]);

  const endPreview = useMemo(() => {
    if (endText) return endText;
    const base = allDay ? parseDateOnlyValue(startText) : parseDateTimeValue(startText);
    if (!base) return allDay ? "未入力（自動で翌日）" : "未入力（自動で+1時間）";
    const end = allDay ? addDays(base, 1) : addHours(base, 1);
    return allDay ? formatDateOnly(end) : formatDateTimeLocal(end);
  }, [allDay, endText, startText]);

  useEffect(() => {
    if (endDirty) return;
    const base = allDay ? parseDateOnlyValue(startText) : parseDateTimeValue(startText);
    if (!base) return;
    const next = allDay ? formatDateOnly(addDays(base, 1)) : formatDateTimeLocal(addHours(base, 1));
    setEndText(next);
  }, [allDay, endDirty, startText]);

  const handleToggleAllDay = useCallback(() => {
    setAllDay((prev) => {
      const next = !prev;
      setEndDirty(false);
      if (next) {
        const parsed = parseDateTimeValue(startText);
        if (parsed) {
          setStartText(formatDateOnly(parsed));
        }
      } else {
        const parsed = parseDateOnlyValue(startText) || new Date();
        const withTime = new Date(
          parsed.getFullYear(),
          parsed.getMonth(),
          parsed.getDate(),
          9,
          0,
          0,
          0
        );
        setStartText(formatDateTimeLocal(withTime));
      }
      return next;
    });
  }, [startText]);

  const handleClipboardImport = useCallback(async () => {
    setMessage(null);
    try {
      const clipboardText = await readText();
      if (!clipboardText) {
        setError("クリップボードにテキストがありませんでした。");
        return;
      }

      const parsed = parseClipboardContent(clipboardText);
      if (!parsed) {
        setError("クリップボードから日時を読み取れませんでした。");
        return;
      }

      setAllDay(parsed.allDay);
      setStartText(parsed.start);

      if (parsed.allDay) {
        const startDate = parseDateOnlyValue(parsed.start);
        const resolvedEnd = parsed.end ?? (startDate ? formatDateOnly(addDays(startDate, 1)) : "");
        setEndText(resolvedEnd);
        setEndDirty(Boolean(parsed.end));
      } else {
        const startDate = parseDateTimeValue(parsed.start);
        const resolvedEnd =
          parsed.end ?? (startDate ? formatDateTimeLocal(addHours(startDate, 1)) : "");
        setEndText(resolvedEnd);
        setEndDirty(Boolean(parsed.end));
      }

      if (parsed.title && title === "カレンダー登録") {
        setTitle(parsed.title);
      }

      setError(null);
      setMessage("クリップボードの内容を反映しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [title]);

  useEffect(() => {
    const unlistenPromise = listen("shortcut-triggered", () => {
      handleClipboardImport();
    });
    handleClipboardImport();
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, [handleClipboardImport]);

  const registerEvent = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (!title.trim()) {
        throw new Error("タイトルを入力してください");
      }
      if (!startText) {
        throw new Error("開始日時を入力してください");
      }

      let body: Record<string, unknown>;

      if (allDay) {
        const start = parseDateOnlyValue(startText);
        if (!start) {
          throw new Error("開始日の形式が不正です（例: 2024-12-01）");
        }
        let endDate = endText ? parseDateOnlyValue(endText) : addDays(start, 1);
        if (!endDate) {
          endDate = addDays(start, 1);
        }
        body = {
          summary: title,
          start: {
            date: formatDateOnly(start),
          },
          end: {
            date: formatDateOnly(endDate),
          },
        };
      } else {
        const start = parseDateTimeValue(startText);
        if (!start) {
          throw new Error("開始日時の形式が不正です（例: 2024-12-01T10:00）");
        }

        let end = endText ? parseDateTimeValue(endText) : addHours(start, 1);
        if (!end) {
          end = addHours(start, 1);
        }

        body = {
          summary: title,
          start: {
            dateTime: start.toISOString(),
            timeZone: "Asia/Tokyo",
          },
          end: {
            dateTime: end.toISOString(),
            timeZone: "Asia/Tokyo",
          },
        };
      }

      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`登録に失敗しました (${res.status}): ${text}`);
      }

      setMessage("カレンダーに登録しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [accessToken, endText, startText, title]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "#f1f3f4",
        padding: 16,
        borderRadius: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>カレンダー登録</h2>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
        タイトル
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            fontSize: 14,
          }}
          placeholder="予定タイトル"
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <span>開始 {allDay ? "(日付のみ)" : "(例: 2024-12-01T10:00)"}</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={allDay} onChange={handleToggleAllDay} />
            終日
          </label>
        </div>
        <input
          type={allDay ? "date" : "datetime-local"}
          value={startText}
          onChange={(e) => setStartText(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            fontSize: 14,
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
        終了 ({allDay ? "未入力なら翌日扱い" : "空なら開始+1時間"})
        <input
          type={allDay ? "date" : "datetime-local"}
          value={endText}
          onChange={(e) => {
            setEndDirty(true);
            setEndText(e.target.value);
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            fontSize: 14,
          }}
        />
      </label>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 12,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <div>この内容で登録しますか？</div>
        <div style={{ marginTop: 6 }}>
          <strong>タイトル:</strong> {title || "(未入力)"}
        </div>
        <div>
          <strong>開始:</strong> {startPreview}
        </div>
        <div>
          <strong>終了:</strong> {endPreview}
        </div>
      </div>

      <button
        onClick={registerEvent}
        disabled={loading}
        style={{
          padding: "12px 16px",
          fontSize: 15,
          background: "#1a73e8",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "登録中..." : "この内容で登録する"}
      </button>

      {message && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: "#e6f4ea",
            color: "#1e7e34",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: "#fdecea",
            color: "#b71c1c",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
