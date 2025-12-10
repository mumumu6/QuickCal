import { useCallback, useEffect, useMemo, useState } from "react";
import React from "react";
import { listen } from "@tauri-apps/api/event";
import dayjs, { type Dayjs } from "dayjs";
import {
  addDays,
  addHours,
  formatDateOnly,
  formatDateTimeLocal,
  parseDateOnlyValue,
  parseDateTimeValue,
  type ParsedClipboard,
} from "@/utils/dateParse";
import { readClipboardSchedule } from "@/utils/clipboard";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import { useAuthStore } from "@/store/authStore";

const resolveEndFromParsed = (parsed: ParsedClipboard) => {
  if (parsed.allDay) {
    const startDate = parseDateOnlyValue(parsed.start);
    const resolvedEnd = parsed.end ?? (startDate ? formatDateOnly(addDays(startDate, 1)) : "");
    return { endText: resolvedEnd, endDirty: Boolean(parsed.end) };
  }

  const startDate = parseDateTimeValue(parsed.start);
  const resolvedEnd = parsed.end ?? (startDate ? formatDateTimeLocal(addHours(startDate, 1)) : "");
  return { endText: resolvedEnd, endDirty: Boolean(parsed.end) };
};

const buildEventBody = ({
  title,
  allDay,
  startText,
  endText,
}: {
  title: string;
  allDay: boolean;
  startText: string;
  endText: string;
}) => {
  if (!title.trim()) {
    throw new Error("タイトルを入力してください");
  }
  if (!startText) {
    throw new Error("開始日時を入力してください");
  }

  if (allDay) {
    const start = parseDateOnlyValue(startText);
    if (!start) {
      throw new Error("開始日の形式が不正です（例: 2024-12-01）");
    }
    let endDate = endText ? parseDateOnlyValue(endText) : addDays(start, 1);
    if (!endDate) {
      endDate = addDays(start, 1);
    }
    return {
      summary: title,
      start: {
        date: formatDateOnly(start),
      },
      end: {
        date: formatDateOnly(endDate),
      },
    };
  }

  const start = parseDateTimeValue(startText);
  if (!start) {
    throw new Error("開始日時の形式が不正です（例: 2024-12-01T10:00）");
  }

  let end = endText ? parseDateTimeValue(endText) : addHours(start, 1);
  if (!end) {
    end = addHours(start, 1);
  }

  return {
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
};

const combineDateAndTime = (date: Dayjs | null, time: Dayjs | null) => {
  if (!date) return null;
  const base = dayjs(date);
  if (!time) return base.toDate();
  return base.hour(time.hour()).minute(time.minute()).second(0).millisecond(0).toDate();
};

export default function EventRegisterPanel() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const initialStart = new Date();
  const [title, setTitle] = useState("カレンダー登録");
  const [allDay, setAllDay] = useState(false);
  const [endDirty, setEndDirty] = useState(false);
  const [startText, setStartText] = useState(formatDateTimeLocal(initialStart));
  const [endText, setEndText] = useState(formatDateTimeLocal(addHours(initialStart, 1)));
  const [loading, setLoading] = useState(false);
  const [clipboardRaw, setClipboardRaw] = useState<string | null>(null);
  const [clipboardParsed, setClipboardParsed] = useState<ParsedClipboard | null>(null);

  const highlightedClipboard = useMemo(() => {
    if (!clipboardRaw) return null;
    const spans = clipboardParsed?.highlights ?? [];
    if (!spans.length) return clipboardRaw;
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const nodes: Array<string | React.ReactElement | string> = [];
    let cursor = 0;
    sorted.forEach((h, idx) => {
      const start = Math.max(0, Math.min(h.start, clipboardRaw.length));
      const end = Math.max(start, Math.min(h.end, clipboardRaw.length));
      if (cursor < start) {
        nodes.push(clipboardRaw.slice(cursor, start));
      }
      if (start < end) {
        nodes.push(
          <Box
            key={`hl-${idx}`}
            component="span"
            sx={{ color: "error.main", fontWeight: 700, display: "inline" }}
          >
            {clipboardRaw.slice(start, end)}
          </Box>
        );
      }
      cursor = end;
    });
    if (cursor < clipboardRaw.length) {
      nodes.push(clipboardRaw.slice(cursor));
    }
    return nodes;
  }, [clipboardParsed?.highlights, clipboardRaw]);

  const pickerSlotProps = useMemo(
    () => ({
      popper: {
        placement: "bottom" as const,
        modifiers: [
          { name: "flip", enabled: false },
          { name: "preventOverflow", enabled: false },
          { name: "hide", enabled: false },
        ],
        sx: {
          "&.MuiPickersPopper-root": {
            position: "fixed !important",
            left: "50% !important",
            top: "50% !important",
            transform: "translate(-50%, -50%) !important",
            zIndex: 1300,
          },
        },
      },
      textField: {
        size: "small" as const,
        fullWidth: true as const,
        sx: {
          "& .MuiInputBase-root": { height: 40 },
          "& .MuiInputBase-input": { py: 0.5, fontSize: 14 },
        },
      },
    }),
    []
  );

  const parsedStart = useMemo(
    () => (allDay ? parseDateOnlyValue(startText) : parseDateTimeValue(startText)),
    [allDay, startText]
  );

  const startPickerValue = useMemo(() => {
    const parsed = allDay ? parseDateOnlyValue(startText) : parseDateTimeValue(startText);
    return parsed ? dayjs(parsed) : null;
  }, [allDay, startText]);

  const startTimeValue = useMemo(() => {
    if (allDay) return null;
    const parsed = parseDateTimeValue(startText);
    return parsed ? dayjs(parsed) : null;
  }, [allDay, startText]);

  const endPickerValue = useMemo(() => {
    const parsed = allDay ? parseDateOnlyValue(endText) : parseDateTimeValue(endText);
    return parsed ? dayjs(parsed) : null;
  }, [allDay, endText]);

  const endTimeValue = useMemo(() => {
    if (allDay) return null;
    const parsed = parseDateTimeValue(endText);
    return parsed ? dayjs(parsed) : null;
  }, [allDay, endText]);

  useEffect(() => {
    if (endDirty) return;
    if (!parsedStart) return;
    const next = allDay
      ? formatDateOnly(addDays(parsedStart, 1))
      : formatDateTimeLocal(addHours(parsedStart, 1));
    setEndText(next);
  }, [allDay, endDirty, parsedStart]);

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

  const handleStartDateChange = useCallback(
    (value: Dayjs | null) => {
      if (!value) {
        setStartText("");
        return;
      }
      if (allDay) {
        setStartText(formatDateOnly(value.toDate()));
        return;
      }
      const combined = combineDateAndTime(value, startTimeValue ?? value);
      setStartText(combined ? formatDateTimeLocal(combined) : "");
    },
    [allDay, startTimeValue]
  );

  const handleStartTimeChange = useCallback(
    (value: Dayjs | null) => {
      if (allDay) return;
      if (!value) {
        setStartText("");
        return;
      }
      const combined = combineDateAndTime(startPickerValue, value);
      setStartText(combined ? formatDateTimeLocal(combined) : "");
    },
    [allDay, startPickerValue]
  );

  const handleEndDateChange = useCallback(
    (value: Dayjs | null) => {
      setEndDirty(true);
      if (!value) {
        setEndText("");
        return;
      }
      if (allDay) {
        setEndText(formatDateOnly(value.toDate()));
        return;
      }
      const combined = combineDateAndTime(value, endTimeValue ?? value);
      setEndText(combined ? formatDateTimeLocal(combined) : "");
    },
    [allDay, endTimeValue]
  );

  const handleEndTimeChange = useCallback(
    (value: Dayjs | null) => {
      if (allDay) return;
      setEndDirty(true);
      if (!value) {
        setEndText("");
        return;
      }
      const combined = combineDateAndTime(endPickerValue, value);
      setEndText(combined ? formatDateTimeLocal(combined) : "");
    },
    [allDay, endPickerValue]
  );

  const applyParsedClipboard = useCallback(
    (parsed: ParsedClipboard) => {
      setAllDay(parsed.allDay);
      setStartText(parsed.start);

      const { endText: nextEnd, endDirty: nextDirty } = resolveEndFromParsed(parsed);
      setEndText(nextEnd);
      setEndDirty(nextDirty);

      if (parsed.title && title === "カレンダー登録") {
        setTitle(parsed.title);
      }
    },
    [title]
  );

  const handleClipboardImport = useCallback(async () => {
    const { parsed, raw } = await readClipboardSchedule();
    setClipboardRaw(raw ?? null);
    setClipboardParsed(parsed ?? null);

    if (!parsed) return;
    applyParsedClipboard(parsed);
  }, [applyParsedClipboard]);

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

    if (!accessToken) {
      setLoading(false);
      return;
    }

    try {
      const body = buildEventBody({ title, allDay, startText, endText });

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
    } catch (e) {
      console.error("Failed to register event:", e);
    } finally {
      setLoading(false);
    }
  }, [accessToken, allDay, endText, startText, title]);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{
          p: 3,
          background: "#f6f8ff",
          height: "100%",
        }}
      >
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
            <Box>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
                カレンダー登録
              </Typography>
            </Box>
            <Button
              variant="contained"
              onClick={registerEvent}
              disabled={loading}
              startIcon={
                loading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <EventAvailableRoundedIcon />
                )
              }
              sx={{
                minWidth: 180,
                borderRadius: 2,
                boxShadow: "0 10px 25px rgba(26,115,232,0.25)",
              }}
            >
              {loading ? "登録中..." : "この内容で登録する"}
            </Button>
          </Stack>

          {clipboardRaw && (
            <Card
              variant="outlined"
              sx={{
                borderColor: clipboardParsed ? "primary.light" : "error.light",
                bgcolor: "#fff",
              }}
            >
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2" fontWeight={700}>
                    貼り付けプレビュー
                  </Typography>
                  <Typography
                    variant="caption"
                    color={clipboardParsed ? "primary.main" : "error.main"}
                  >
                    {clipboardParsed ? "日時を検出しました" : "日時を検出できませんでした"}
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    fontSize: 13,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: "4lh",
                    overflowY: "auto",
                  }}
                >
                  {highlightedClipboard ?? clipboardRaw}
                </Box>
              </CardContent>
            </Card>
          )}

          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                label="タイトル"
                placeholder="予定タイトル"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>

            <Grid size={12}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 0.5 }}
              >
                <Typography variant="body2" color="text.secondary">
                  開始 {allDay ? "(日付のみ)" : "(日付と時刻)"}
                </Typography>
                <FormControlLabel
                  control={<Checkbox checked={allDay} onChange={handleToggleAllDay} size="small" />}
                  label="終日"
                  sx={{ ml: 0 }}
                />
              </Stack>
              {allDay ? (
                <DatePicker
                  value={startPickerValue}
                  onChange={handleStartDateChange}
                  format="YYYY-MM-DD"
                  sx={{ width: "100%" }}
                  slotProps={pickerSlotProps}
                />
              ) : (
                <Stack direction="row" spacing={1.25}>
                  <DatePicker
                    value={startPickerValue}
                    onChange={handleStartDateChange}
                    format="YYYY-MM-DD"
                    slotProps={pickerSlotProps}
                  />
                  <TimePicker
                    value={startTimeValue}
                    onChange={handleStartTimeChange}
                    minutesStep={5}
                    slotProps={pickerSlotProps}
                  />
                </Stack>
              )}
            </Grid>

            <Grid size={12}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                終了 {allDay ? "(未入力なら翌日扱い)" : "(空なら開始+1時間)"}
              </Typography>
              {allDay ? (
                <DatePicker
                  value={endPickerValue}
                  onChange={handleEndDateChange}
                  format="YYYY-MM-DD"
                  sx={{ width: "100%" }}
                  slotProps={pickerSlotProps}
                />
              ) : (
                <Stack direction="row" spacing={1.25}>
                  <DatePicker
                    value={endPickerValue}
                    onChange={handleEndDateChange}
                    format="YYYY-MM-DD"
                    slotProps={pickerSlotProps}
                  />
                  <TimePicker
                    value={endTimeValue}
                    onChange={handleEndTimeChange}
                    minutesStep={5}
                    slotProps={pickerSlotProps}
                  />
                </Stack>
              )}
            </Grid>
          </Grid>
        </Stack>
      </Box>
    </LocalizationProvider>
  );
}
