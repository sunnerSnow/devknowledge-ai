/**
 * 本機示範模式的兩位固定使用者（可用來測試資料互相看不到）。
 * 啟動時由 Better Auth 建立帳號，登入頁可一鍵登入；密碼只在本機 PGlite 有意義。
 */
export const LOCAL_USERS = [
  { key: "a", email: "demo-a@devknowledge.local", password: "demo-a-password", label: "示範使用者 A" },
  { key: "b", email: "demo-b@devknowledge.local", password: "demo-b-password", label: "示範使用者 B" },
] as const;
