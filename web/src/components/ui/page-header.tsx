import type { ReactNode } from "react";

/** 頁首：小字中文標籤在上、大字英文標題在下（eyebrow 是中文、title 是英文） */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
        <h1 className="section-title mt-2">{title}</h1>
        {description ? <div className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** 頁內區塊標題（同樣的標籤＋標題結構，字級較小） */
export function SectionHeader({ eyebrow, title, id, aside }: { eyebrow: string; title: string; id?: string; aside?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="section-label">{eyebrow}</p>
        <h2 id={id} className="mt-1 text-2xl leading-none font-medium tracking-[0.02em] sm:text-3xl">
          {title}
        </h2>
      </div>
      {aside ? <div className="text-sm">{aside}</div> : null}
    </div>
  );
}
