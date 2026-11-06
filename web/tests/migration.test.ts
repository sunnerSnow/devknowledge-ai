import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPGlite, bootstrapLocal } from "@/lib/db/local";
import { withUser } from "@/lib/db/with-user";
import { createTestDb, createUser, expectDbRejects, rowsOf } from "./helpers/db";

describe("migration", () => {
  it("可以重複執行", async () => {
    const client = createPGlite();
    await bootstrapLocal(client);
    await bootstrapLocal(client);
    const tables = await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'dk' order by 1");
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "ai_usage",
      "job_postings",
      "job_skills",
      "knowledge_contents",
      "knowledge_nodes",
      "knowledge_relations",
      "learning_plans",
      "learning_tasks",
      "profiles",
      "rate_limits",
      "user_knowledge_progress",
      "user_skills",
    ]);
    const authTables = await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'auth' order by 1");
    expect(authTables.rows.map((r) => r.table_name)).toEqual(["accounts", "sessions", "users", "verifications"]);
    await client.close();
  });

  it("authenticated 對 auth schema 的表沒有任何權限，但能呼叫 auth.uid()", async () => {
    const db = await createTestDb();
    const alice = await createUser(db);
    const msg = await expectDbRejects(withUser(db, alice, (tx) => tx.execute(sql`select * from auth.users`)));
    expect(msg).toMatch(/permission denied/i);
    const uid = rowsOf<{ uid: string }>(await withUser(db, alice, (tx) => tx.execute(sql`select auth.uid()::text as uid`)));
    expect(uid[0].uid).toBe(alice);
  });

  it("authenticated 對知識表只有 SELECT；anon 沒有任何權限", async () => {
    const db = await createTestDb();
    const grants = rowsOf<{ grantee: string; table_name: string; privs: string }>(
      await db.execute(sql`select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) privs
                           from information_schema.role_table_grants where table_schema = 'dk' and grantee in ('authenticated', 'anon')
                           group by 1, 2 order by 2, 1`),
    );
    expect(grants.every((g) => g.grantee === "authenticated")).toBe(true);
    const byTable = Object.fromEntries(grants.map((g) => [g.table_name, g.privs]));
    expect(byTable.knowledge_nodes).toBe("SELECT");
    expect(byTable.knowledge_contents).toBe("SELECT");
    expect(byTable.knowledge_relations).toBe("SELECT");
    expect(byTable.user_knowledge_progress).toBe("DELETE, INSERT, SELECT, UPDATE");
  });

  it("search_text 由 trigger 維護，pg_trgm 索引可用", async () => {
    const db = await createTestDb();
    await db.execute(sql`insert into dk.knowledge_nodes (slug, name, english_name, aliases, summary)
                         values ('rag', 'RAG', 'Retrieval-Augmented Generation', array['檢索增強生成'], '讓模型先檢索再生成')`);
    const rows = rowsOf<{ search_text: string; hit: boolean }>(
      await db.execute(sql`select search_text, search_text ilike '%檢索增強%' as hit from dk.knowledge_nodes where slug = 'rag'`),
    );
    expect(rows[0].hit).toBe(true);
    expect(rows[0].search_text).toContain("retrieval-augmented generation");
    const fts = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.knowledge_nodes where search_vector @@ plainto_tsquery('simple', 'retrieval')`));
    expect(fts[0].n).toBe(1);
  });

  it("RLS：使用者看不到也改不了別人的進度；知識節點大家都能讀但不能寫", async () => {
    const db = await createTestDb();
    const alice = await createUser(db);
    const bob = await createUser(db);
    await db.execute(sql`insert into dk.knowledge_nodes (slug, name) values ('docker', 'Docker')`);
    const [node] = rowsOf<{ id: string }>(await db.execute(sql`select id from dk.knowledge_nodes where slug = 'docker'`));

    await withUser(db, alice, (tx) => tx.execute(sql`insert into dk.user_knowledge_progress (user_id, knowledge_node_id, status) values (${alice}, ${node.id}, 'learning')`));

    const bobSees = rowsOf<{ n: number }>(await withUser(db, bob, (tx) => tx.execute(sql`select count(*)::int n from dk.user_knowledge_progress`)));
    expect(bobSees[0].n).toBe(0);
    const aliceSees = rowsOf<{ n: number }>(await withUser(db, alice, (tx) => tx.execute(sql`select count(*)::int n from dk.user_knowledge_progress`)));
    expect(aliceSees[0].n).toBe(1);

    // bob 冒用 alice 的 user_id 寫入
    const msg = await expectDbRejects(
      withUser(db, bob, (tx) => tx.execute(sql`insert into dk.user_knowledge_progress (user_id, knowledge_node_id, status) values (${alice}, ${node.id}, 'learning')`)),
    );
    expect(msg).toMatch(/row-level security/i);

    // 知識節點：能讀，不能寫
    const nodes = rowsOf<{ n: number }>(await withUser(db, bob, (tx) => tx.execute(sql`select count(*)::int n from dk.knowledge_nodes`)));
    expect(nodes[0].n).toBe(1);
    expect(await expectDbRejects(withUser(db, bob, (tx) => tx.execute(sql`update dk.knowledge_nodes set name = 'x'`)))).toMatch(/permission denied/i);
    expect(await expectDbRejects(withUser(db, bob, (tx) => tx.execute(sql`insert into dk.knowledge_nodes (slug, name) values ('x', 'x')`)))).toMatch(/permission denied/i);

    // anon 什麼都看不到
    const anonMsg = await expectDbRejects(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local role anon`);
        await tx.execute(sql`select * from dk.knowledge_nodes`);
      }),
    );
    expect(anonMsg).toMatch(/permission denied/i);
  });

  it("關聯不能連到自己", async () => {
    const db = await createTestDb();
    await db.execute(sql`insert into dk.knowledge_nodes (slug, name) values ('llm', 'LLM')`);
    const [node] = rowsOf<{ id: string }>(await db.execute(sql`select id from dk.knowledge_nodes where slug = 'llm'`));
    const msg = await expectDbRejects(
      db.execute(sql`insert into dk.knowledge_relations (from_node_id, to_node_id, relation_type) values (${node.id}, ${node.id}, 'related')`),
    );
    expect(msg).toMatch(/check constraint/i);
  });
});
