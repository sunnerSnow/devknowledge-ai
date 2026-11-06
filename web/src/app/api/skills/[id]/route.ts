import { ok, readJson, withSession } from "@/lib/api/http";
import { deleteUserSkill, updateUserSkillById } from "@/lib/services/skills";

/** PATCH /api/skills/[id] 更新技能等級、來源、備註、目標權重 */
export const PATCH = withSession<RouteContext<"/api/skills/[id]">>(async ({ request, ctx, user, db }) => {
  const { id } = await ctx.params;
  const body = await readJson(request, 8 * 1024);
  return ok(await updateUserSkillById(db, user.id, id, body));
});

/** DELETE /api/skills/[id] */
export const DELETE = withSession<RouteContext<"/api/skills/[id]">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  await deleteUserSkill(db, user.id, id);
  return ok({ deleted: true });
});
