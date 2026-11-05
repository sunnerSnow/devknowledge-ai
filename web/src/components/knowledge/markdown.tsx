import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/**
 * 只允許安全的 Markdown：不渲染原始 HTML、連結另開新頁、不給 javascript: 協定。
 * 也不允許圖片：知識頁不需要，而且 AI 輸出若被注入影響，<img> 會讓瀏覽器向外部網址發請求。
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => t !== "img" && t !== "picture" && t !== "source"),
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/]],
  },
};

function Anchor(props: ComponentProps<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer nofollow" />;
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className ?? "prose-dk"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]} skipHtml components={{ a: Anchor }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
