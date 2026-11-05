import { randomUUID } from "node:crypto";
import { createPGlite, type Db, ensureLocalAuthUser, openLocalDb } from "@/lib/db/local";
import { ensureProfile } from "@/lib/services/profiles";

/** 記憶體內的 PGlite：跑 auth 模擬＋全部 migration，跟正式 schema 相同（含 RLS） */
export async function createTestDb(): Promise<Db> {
  return openLocalDb(createPGlite());
}

export async function createUser(db: Db, email = `${randomUUID().slice(0, 8)}@example.test`): Promise<string> {
  const id = randomUUID();
  await ensureLocalAuthUser(db, id, email);
  await ensureProfile(db, id, email);
  return id;
}

/** 取出 drizzle execute 的 rows（PGlite 與 postgres.js 回傳形狀不同，統一處理） */
export function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] } | T[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/** 預期資料庫層直接拒絕（RLS、權限或約束），並回傳錯誤訊息 */
export async function expectDbRejects(p: Promise<unknown>): Promise<string> {
  const error = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (error === null) throw new Error("預期資料庫拒絕，但成功了");
  const cause = (error as { cause?: { message?: string } }).cause;
  return cause?.message ?? (error as Error).message;
}
