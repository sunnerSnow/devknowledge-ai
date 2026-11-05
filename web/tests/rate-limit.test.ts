import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withUser } from "@/lib/db/with-user";
import { clientIp, consumeRateLimit } from "@/lib/services/rate-limit";
import { createTestDb, createUser, expectDbRejects } from "./helpers/db";

describe("限流", () => {
  it("同一個 key 在視窗內最多 max 次；視窗過了重新計", async () => {
    const db = await createTestDb();
    for (let i = 0; i < 3; i++) expect(await consumeRateLimit(db, "login:ip:1.2.3.4", 3, 600)).toBe(true);
    expect(await consumeRateLimit(db, "login:ip:1.2.3.4", 3, 600)).toBe(false);
    // 別的 key 不受影響
    expect(await consumeRateLimit(db, "login:ip:5.6.7.8", 3, 600)).toBe(true);
    // 把視窗往前撥就重新計
    await db.execute(sql`update dk.rate_limits set window_start = now() - interval '11 minutes' where key = 'login:ip:1.2.3.4'`);
    expect(await consumeRateLimit(db, "login:ip:1.2.3.4", 3, 600)).toBe(true);
  });

  it("rate_limits 表對 authenticated 沒有權限", async () => {
    const db = await createTestDb();
    const alice = await createUser(db);
    expect(await expectDbRejects(withUser(db, alice, (tx) => tx.execute(sql`select * from dk.rate_limits`)))).toMatch(/permission denied/i);
  });

  it("clientIp 取 x-forwarded-for 的第一個", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
