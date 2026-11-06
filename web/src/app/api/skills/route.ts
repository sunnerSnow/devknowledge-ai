import { ok, readJson, withSession } from "@/lib/api/http";
import { listUserSkills, upsertUserSkill } from "@/lib/services/skills";

/** GET /api/skills?category= 技能清單 */
export const GET = withSession(async ({ request, user, db }) => {
  const category = new URL(request.url).searchParams.get("category");
  return ok(await listUserSkills(db, user.id, { category: category || null }));
});

/** POST /api/skills  body: { skillName, level?, evidenceType?, evidenceNote?, goalWeight?, category? }（以名稱 upsert） */
export const POST = withSession(async ({ request, user, db }) => {
  const body = await readJson(request, 8 * 1024);
  return ok(await upsertUserSkill(db, user.id, body), { status: 201 });
});
