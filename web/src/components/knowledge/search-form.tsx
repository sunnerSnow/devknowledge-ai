import { ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TOPIC_MAX_LENGTH } from "@/lib/knowledge/slug";
import { cn } from "@/lib/utils";

/** 全站搜尋框：白色直角輸入框＋青藍色送出鈕；純 GET 表單，不需要 JavaScript 也能用 */
export function SearchForm({ defaultValue = "", size = "default", autoFocus = false, className }: { defaultValue?: string; size?: "default" | "lg"; autoFocus?: boolean; className?: string }) {
  const large = size === "lg";
  return (
    <form action="/knowledge" method="get" role="search" className={cn("flex w-full", className)}>
      <label htmlFor="knowledge-search" className="sr-only">
        輸入技術名詞
      </label>
      <div className="relative flex-1">
        <Search className={cn("pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground", large ? "size-5" : "size-4")} aria-hidden="true" strokeWidth={1.5} />
        <Input
          id="knowledge-search"
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder="輸入技術名詞，例如 RAG、AWS、Docker"
          maxLength={TOPIC_MAX_LENGTH}
          autoComplete="off"
          autoFocus={autoFocus}
          className={cn("border-r-0 bg-card", large ? "h-14 pl-12 text-base" : "h-12 pl-11")}
        />
      </div>
      <button
        type="submit"
        aria-label="搜尋"
        className={cn("inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors outline-none hover:bg-primary-strong focus-visible:focus-ring", large ? "w-16" : "w-14")}
      >
        <ArrowRight className={large ? "size-5" : "size-4"} aria-hidden="true" strokeWidth={1.5} />
      </button>
    </form>
  );
}
