/**
 * 種子知識頁：把 mock provider 的四份範例內容（RAG、LLM、AWS、Docker）寫成正式的知識頁，
 * 讓新環境一開始就有東西可看，不用先花免費額度生成。內容是固定的範例文字，不是 AI 產生，之後想要真正的內容就在頁面上按「重新生成」。
 *
 *   npm run db:seed -- <使用者 Email>
 *
 * - 以指定使用者的身分走正常的生成流程（generateKnowledge），只是 provider 換成 mock，不會呼叫真正的 AI；
 *   使用量會記在這位使用者名下（4 次），已存在且已發布的主題會略過。
 *   共用資料用 withService（連線角色是表的擁有者）寫入、個人資料用 withUser 設定 RLS 身分，都在服務層裡處理。
 * - 有 DATABASE_URL 就寫進 Postgres（.env.local 會先載入），沒有就寫本機示範模式的 PGlite（PGLITE_DATA_DIR，預設 web/.data/pglite）；
 *   PGlite 沒有跨程序鎖，跑之前先停掉 next dev。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createMockProvider } from "../src/lib/ai/providers/mock";
import { createPGlite, type Db, openLocalDb } from "../src/lib/db/local";
import { schema } from "../src/lib/db/schema";
import { generateKnowledge } from "../src/lib/services/knowledge";

const TOPICS = ["RAG", "LLM", "AWS", "Docker"];

async function main(): Promise<void> {
  const envFile = path.join(process.cwd(), ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("用法：npm run db:seed -- <使用者 Email>");

  const url = process.env.DATABASE_URL;
  if (url && !URL.canParse(url)) throw new Error("DATABASE_URL 不是合法的連線字串");
  const client = url ? postgres(url, { max: 1, prepare: false, onnotice: () => {} }) : null;
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const pglite = client ? null : createPGlite(dataDir);
  const db: Db = client ? drizzlePostgres(client, { schema }) : await openLocalDb(pglite!);
  console.log(url ? `連線到 ${new URL(url).hostname}` : "本機示範模式（PGlite）");

  try {
    const rows = await db.execute(sql`select id from auth.users where lower(email) = ${email} limit 1`);
    const list = (Array.isArray(rows) ? rows : ((rows as { rows?: { id: string }[] }).rows ?? [])) as { id: string }[];
    const userId = list[0]?.id;
    if (!userId) throw new Error(`找不到使用者：${email}（請先在網站註冊）`);

    const deps = { provider: createMockProvider({ delayMs: 0 }), hourlyLimit: 1000, dailyLimit: 0 };
    for (const topic of TOPICS) {
      process.stdout.write(`  ${topic} … `);
      const result = await generateKnowledge(db, userId, { topic }, deps);
      console.log(result.existing ? `已存在（/knowledge/${result.node.slug}）` : `建立（/knowledge/${result.node.slug}）`);
    }
  } finally {
    // 不關連線的話 Node 不會結束（PGlite 的 worker 會一直活著）
    await client?.end();
    await pglite?.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
