import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { ParsedClipboard, parseClipboardContent } from "@/utils/dateParse";

export type ClipboardParseResult = {
  raw: string | null;
  parsed: ParsedClipboard | null;
  error: string | null;
};

const buildErrorResult = (raw: string | null, error: string): ClipboardParseResult => ({
  raw,
  parsed: null,
  error,
});

/**
 * クリップボードからテキストを取得し、日時情報をパースして返す。
 * 呼び出し側は戻り値を確認するだけでよい。
 */
export const readClipboardSchedule = async (): Promise<ClipboardParseResult> => {
  try {
    const raw = await readText();
    const hasText = Boolean(raw && raw.trim());

    if (!hasText) {
      return buildErrorResult(raw ?? null, "クリップボードにテキストがありませんでした。");
    }

    const parsed = parseClipboardContent(raw);
    if (!parsed) {
      return buildErrorResult(raw, "クリップボードから日時を読み取れませんでした。");
    }

    return { raw, parsed, error: null };
  } catch (e) {
    return buildErrorResult(null, e instanceof Error ? e.message : String(e));
  }
};
