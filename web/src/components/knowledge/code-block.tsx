"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CodeBlock({ code, language, title }: { code: string; language?: string | null; title?: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 瀏覽器不允許剪貼簿時就不做事
    }
  }

  return (
    <figure className="overflow-hidden rounded-lg border bg-primary text-white dark:bg-black/40">
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-1.5 text-xs">
        <span className="truncate">
          {title ? <span className="font-medium">{title}</span> : null}
          {language ? <span className="ml-2 font-mono text-white/60">{language}</span> : null}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={copy} className="text-white/80 hover:bg-white/10 hover:text-white" aria-label="複製程式碼">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "已複製" : "複製"}
        </Button>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
