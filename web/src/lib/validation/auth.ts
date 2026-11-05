import { z } from "zod";

/** 登入／註冊表單：前端（RHF）與 Server Action 共用同一份 */
export const credentialsSchema = z.object({
  email: z.email("請輸入有效的 Email"),
  password: z.string().min(8, "密碼至少 8 個字元").max(72, "密碼最多 72 個字元"),
});
export type Credentials = z.infer<typeof credentialsSchema>;
