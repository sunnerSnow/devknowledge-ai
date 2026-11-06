import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
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
 * 主要行動按鈕：黑底直角，右側虛線分隔＋箭頭。
 * 用在每頁最多一兩個最重要的動作；一般按鈕用 Button。
 * 不用 Radix 的 asChild（內部有兩個子元素，Slot 不接受），所以連結用 href 參數。
 */
export function CtaButton({ children, className, size = "default", icon, href, variant = "default", ...props }: CtaProps & Omit<ComponentProps<"button">, "children" | "className">) {
  const classes = cn(buttonVariants({ variant, size: "default" }), "group/cta h-auto gap-0 px-0 py-0 font-medium tracking-[0.04em]", className);
  const divider = variant === "secondary" ? "border-foreground/30" : "border-white/50";
  const inner = (
    <>
      <span className={cn("inline-flex items-center gap-2", size === "lg" ? "px-6 py-3.5 text-[15px]" : "px-4 py-2.5 text-sm")}>{children}</span>
      <span className={cn("inline-flex items-center self-stretch border-l border-dotted", divider, size === "lg" ? "px-4" : "px-3")} aria-hidden="true">
        {icon ?? <ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" />}
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
