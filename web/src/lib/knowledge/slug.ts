/**
 * 技術名詞 → slug。純函式，前後端共用。
 * - NFKC 正規化（全形英數變半形）、去頭尾空白、小寫
 * - 空白、底線、斜線變成 -
 * - 只保留字母（含中文）、數字、.、+、#、-：C#、Node.js、C++ 都能保留
 */
export const SLUG_MAX_LENGTH = 80;
export const TOPIC_MAX_LENGTH = 64;

export function normalizeSlug(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_/\\]+/g, "-")
    .replace(/[^\p{L}\p{N}.+#-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

/** 使用者輸入的主題：去掉控制字元與多餘空白（長度由 schema 檢查，這裡不截斷） */
export function cleanTopic(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
