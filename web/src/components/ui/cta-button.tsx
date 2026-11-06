import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "default" | "lg";

interface CtaProps {
  children: ReactNode;
  className?: string;
  size?: Size;
  icon?: ReactNode;
  /** 給了就渲染成連結 */
  href?: string;
  variant?: "default" | "secondary";
}

/**
 * 主要行動按鈕：青藍底直角、字距寬，右側一個細箭頭。
 * 用在每頁最多一兩個最重要的動作；一般按鈕用 Button。
 * 不用 Radix 的 asChild（內部有兩個子元素，Slot 不接受），所以連結用 href 參數。
 */
export function CtaButton({ children, className, size = "default", icon, href, variant = "default", ...props }: CtaProps & Omit<ComponentProps<"button">, "children" | "className">) {
  const classes = cn(
    "group/cta inline-flex items-center justify-between gap-4 text-sm font-medium tracking-[0.16em] whitespace-nowrap transition-colors select-none",
    "outline-none focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50",
    variant === "secondary" ? "border border-primary bg-card text-primary hover:bg-secondary hover:text-primary-strong" : "bg-primary text-primary-foreground hover:bg-primary-strong",
    size === "lg" ? "px-7 py-3.5 text-[15px]" : "px-5 py-2.5",
    className,
  );
  const inner = (
    <>
      <span className="inline-flex items-center gap-2 [&_svg]:size-4">{children}</span>
      <span className="inline-flex shrink-0 items-center" aria-hidden="true">
        {icon ?? <ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={1.5} />}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" {...props} className={classes}>
      {inner}
    </button>
  );
}
