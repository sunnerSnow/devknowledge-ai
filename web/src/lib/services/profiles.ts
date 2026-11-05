import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/local";
import { profiles, users } from "@/lib/db/schema";
import { withService, withUser } from "@/lib/db/with-user";
import { issuesFromZod, validationFailed } from "@/lib/errors";

export interface Profile {
  id: string;
  email: string | null;
  displayName: string | null;
  targetRole: string | null;
  weeklyLearningMinutes: number;
}

/** 第一次登入時建立 profile（以伺服器身分：此時還沒有可用的 RLS 身分）；顯示名稱預設用註冊時的名字 */
export async function ensureProfile(db: Db, userId: string, email: string | null, displayName: string | null = null): Promise<void> {
  await withService(db, (tx) =>
    tx
      .insert(profiles)
      .values({ id: userId, email, displayName: displayName?.trim().slice(0, 60) || null })
      .onConflictDoNothing({ target: profiles.id }),
  );
}

/**
 * 取得個人資料。profile 平常在註冊時由 Better Auth 的 hook 建立；
 * 若當時失敗（例如資料庫暫時斷線），這裡會補建一列，流程不會永遠卡住。
 */
export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const read = () => withUser(db, userId, (tx) => tx.query.profiles.findFirst({ where: eq(profiles.id, userId) }));
  let row = await read();
  if (!row) {
    const [user] = await withService(db, (tx) => tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1));
    if (!user) return null;
    await ensureProfile(db, userId, user.email, user.name);
    row = await read();
  }
  return row ? toProfile(row) : null;
}

const profileInput = z.object({
  displayName: z.string().trim().max(60, "顯示名稱最多 60 個字").optional(),
  targetRole: z.string().trim().max(80, "目標職務最多 80 個字").optional(),
  weeklyLearningMinutes: z.coerce.number().int("請輸入整數").min(0, "不能是負數").max(10080, "一週最多 10080 分鐘").optional(),
});
export type ProfileInput = z.input<typeof profileInput>;

export async function updateProfile(db: Db, userId: string, input: unknown): Promise<Profile> {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { displayName, targetRole, weeklyLearningMinutes } = parsed.data;
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .update(profiles)
      .set({
        ...(displayName !== undefined ? { displayName: displayName || null } : {}),
        ...(targetRole !== undefined ? { targetRole: targetRole || null } : {}),
        ...(weeklyLearningMinutes !== undefined ? { weeklyLearningMinutes } : {}),
      })
      .where(eq(profiles.id, userId))
      .returning(),
  );
  if (!row) throw new Error("找不到個人資料");
  return toProfile(row);
}

function toProfile(row: typeof profiles.$inferSelect): Profile {
  return { id: row.id, email: row.email, displayName: row.displayName, targetRole: row.targetRole, weeklyLearningMinutes: row.weeklyLearningMinutes };
}
