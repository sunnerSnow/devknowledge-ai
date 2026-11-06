/**
 * 重設某個 Email 帳號的密碼（忘記密碼、還沒有寄信服務時用）。
 * 密碼在資料庫只存 scrypt 雜湊，查不回明文；這裡直接寫入新雜湊，並登出該帳號所有裝置。
 *
 *   $env:NEW_PASSWORD = "新密碼（至少 8 碼）"
 *   npm run auth:reset-password -- you@example.com
 *
 * 新密碼走環境變數，不放在指令列上，避免留在 shell 歷史。
 * 連線字串：DATABASE_URL_UNPOOLED 優先，否則 DATABASE_URL（.env.local 會自動載入）。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

async function main(): Promise<void> {
  const envFile = path.join(process.cwd(), ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.env.NEW_PASSWORD ?? "";
  if (!email.includes("@")) throw new Error("用法：npm run auth:reset-password -- <email>（新密碼放在環境變數 NEW_PASSWORD）");
  if (password.length < 8 || password.length > 72) throw new Error("NEW_PASSWORD 長度須在 8–72 字元之間");

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("請在 .env.local 或環境變數設定 DATABASE_URL（或 DATABASE_URL_UNPOOLED）");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const hash = await hashPassword(password);
    const result = await sql.begin(async (tx) => {
      const users = await tx<{ id: string }[]>`select id from auth.users where lower(email) = ${email}`;
      if (users.length !== 1) return null;
      const userId = users[0].id;
      const updated = await tx`update auth.accounts set password = ${hash}, updated_at = now()
                               where user_id = ${userId}::uuid and provider_id = 'credential'`;
      if (updated.count !== 1) {
        // 沒有密碼帳號（例如之後接了 OAuth 才註冊的）就補一筆
        await tx`insert into auth.accounts (user_id, account_id, provider_id, password)
                 values (${userId}::uuid, ${userId}, 'credential', ${hash})`;
      }
      const sessions = await tx`delete from auth.sessions where user_id = ${userId}::uuid`;
      return { userId, sessions: sessions.count };
    });
    if (!result) throw new Error(`找不到帳號 ${email}`);
    console.log(`已重設 ${email} 的密碼，並登出 ${result.sessions} 個 session。`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
