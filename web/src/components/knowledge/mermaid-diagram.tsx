"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * 以 mermaid 的 strict 安全等級渲染（會清掉 script 與事件屬性）。
 * mermaid 很大，只在客戶端需要時動態載入；解析失敗就改顯示原始碼。
 */
export function MermaidDiagram({ code, description }: { code: string; description: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", fontFamily: "inherit" });
        const { svg } = await mermaid.render(`dk-mermaid-${id}`, code);
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  return (
    <figure className="bg-card p-5">
      {state === "error" ? <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs leading-5 text-muted-foreground">{code}</pre> : null}
      {state === "loading" ? <p className="text-sm text-muted-foreground">載入架構圖…</p> : null}
      {/* 這個容器只由 mermaid 寫入 innerHTML，不能放 React 子元素，否則 React 更新時會找不到節點 */}
      <div ref={ref} hidden={state !== "ok"} className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" aria-busy={state === "loading"} />
      <figcaption className="mt-3 text-sm leading-6 text-muted-foreground">{description}</figcaption>
    </figure>
  );
}
