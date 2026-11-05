import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/local";
import { profiles } from "@/lib/db/schema";
import { withService, withUser } from "@/lib/db/with-user";
import { issuesFromZod, validationFailed } from "@/lib/errors";

export interface Profile {
  id: string;
  email: string | null;
  displayName: string | null;
  targetRole: string | null;
  weeklyLearningMinutes: number;
}

/** 第一次登入時建立 profile（以伺服器身分：此時還沒有可用的 RLS 身分） */
export async function ensureProfile(db: Db, userId: string, email: string | null): Promise<void> {
  await withService(db, (tx) => tx.insert(profiles).values({ id: userId, email }).onConflictDoNothing({ target: profiles.id }));
}

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const row = await withUser(db, userId, (tx) => tx.query.profiles.findFirst({ where: eq(profiles.id, userId) }));
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
