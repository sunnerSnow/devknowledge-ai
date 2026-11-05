import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOPIC_MAX_LENGTH } from "@/lib/knowledge/slug";
import { cn } from "@/lib/utils";

/** 全站搜尋框：純 GET 表單，不需要 JavaScript 也能用 */
export function SearchForm({ defaultValue = "", size = "default", autoFocus = false, className }: { defaultValue?: string; size?: "default" | "lg"; autoFocus?: boolean; className?: string }) {
  const large = size === "lg";
  return (
    <form action="/knowledge" method="get" role="search" className={cn("flex w-full gap-2", className)}>
      <label htmlFor="knowledge-search" className="sr-only">
        輸入技術名詞
      </label>
      <div className="relative flex-1">
        <Search className={cn("pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground", large ? "size-5" : "size-4")} aria-hidden="true" />
        <Input
          id="knowledge-search"
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder="輸入技術名詞，例如 RAG、AWS、Docker"
          maxLength={TOPIC_MAX_LENGTH}
          autoComplete="off"
          autoFocus={autoFocus}
          className={cn("bg-card", large ? "h-12 pl-10 text-base" : "pl-9")}
        />
      </div>
      <Button type="submit" size={large ? "lg" : "default"} className={cn(large && "h-12 px-5")}>
        搜尋
      </Button>
    </form>
  );
}
