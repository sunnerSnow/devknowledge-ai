import type { ReactNode } from "react";

/**
 * 頁首：英文襯線大字（title）在上、中文小字（eyebrow）在下，都是青藍色；
 * 再往下是深灰的說明文字。參數名沿用：eyebrow 是中文、title 是英文。
 */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="section-label">{title}</h1>
        {eyebrow ? <p className="section-sub mt-3">{eyebrow}</p> : null}
        {description ? <div className="mt-6 max-w-2xl text-[15px] leading-8 tracking-[0.1em] text-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** 頁內區塊標題：同樣的英文大字＋中文小字，字級較小 */
export function SectionHeader({ eyebrow, title, id, aside }: { eyebrow: string; title: string; id?: string; aside?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="font-display text-2xl leading-none font-normal tracking-[0.04em] text-primary">
          {title}
        </h2>
        <p className="section-sub mt-2 text-xs">{eyebrow}</p>
      </div>
      {aside ? <div className="text-sm tracking-[0.1em]">{aside}</div> : null}
    </div>
  );
}
