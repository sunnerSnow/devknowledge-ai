import type { Metadata } from "next";
import Link from "next/link";
import { CtaButton } from "@/components/ui/cta-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listRoutes, ROUTE_STAGE_LABELS, type RouteSummary } from "@/lib/services/routes";

export const metadata: Metadata = { title: "Routes" };

export default async function RoutesPage() {
  const user = await requireUser();
  const routes = await listRoutes(await getDb(), user.id);
  const active = routes.filter((r) => r.status !== "archived");
  const archived = routes.filter((r) => r.status === "archived");

  return (
    <div className="grid gap-12">
      <PageHeader
        eyebrow="學習路線"
        title="Routes"
        description="依職缺差距排出的 Day 制課程：先診斷程度，再一天一兩課；每課是一頁知識頁，小測驗全對才解鎖下一課。"
        actions={<CtaButton href="/jobs">從職缺產生路線</CtaButton>}
      />
      {routes.length === 0 ? (
        <EmptyState title="還沒有學習路線" description="到職缺頁的「學習路線」區塊，填剩餘天數與每天分鐘數就能產生。不用先自評，診斷會幫你估程度。" action={<CtaButton href="/jobs" size="lg">前往職缺</CtaButton>} />
      ) : (
        <>
          <RouteList routes={active} />
          {archived.length ? (
            <section className="grid gap-4">
              <p className="section-sub">已封存</p>
              <RouteList routes={archived} muted />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function RouteList({ routes, muted = false }: { routes: RouteSummary[]; muted?: boolean }) {
  if (!routes.length) return null;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {routes.map((r) => {
        const pct = r.totalLessons ? Math.round((r.passedLessons / r.totalLessons) * 100) : 0;
        return (
          <li key={r.id} className="flex">
            <Link href={`/routes/${r.id}`} className={`group flex flex-1 flex-col panel p-6 transition-colors hover:bg-card/70 ${muted ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3 text-xs tracking-[0.1em] text-muted-foreground">
                <span className="truncate">{r.jobTitle ?? "沒有對應職缺"}</span>
                <span className="shrink-0">{r.status === "archived" ? "已封存" : ROUTE_STAGE_LABELS[r.stage]}</span>
              </div>
              <h3 className="mt-4 text-xl font-medium tracking-[0.03em] group-hover:dotted-underline">{r.title}</h3>
              <div className="mt-auto pt-5">
                <div className="h-2 w-full overflow-hidden bg-muted">
                  <div className="h-2 bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs tracking-[0.06em] text-muted-foreground">
                  {r.days} 天・每天 {r.dailyMinutes} 分鐘・{r.totalLessons ? `${r.passedLessons} / ${r.totalLessons} 課通過` : "還沒排課"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
