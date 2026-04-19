"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { safeHref } from "@/lib/utils/safeHref";

interface MarkdownBodyProps {
  content: string;
  className?: string;
}

/**
 * Renders user-authored markdown safely.
 * - remark-gfm: GitHub Flavoured Markdown (tables, task lists, strikethrough)
 * - rehype-sanitize: strips disallowed HTML (default strict schema)
 * - urlTransform: safeHref allowlist (http / https / mailto only)
 * - NEVER uses rehype-raw or dangerouslySetInnerHTML
 */
export function MarkdownBody({ content, className }: MarkdownBodyProps) {
  return (
    <div
      className={[
        "prose prose-neutral max-w-none",
        "prose-headings:font-semibold prose-p:leading-relaxed",
        "prose-a:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded",
        className ?? "",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        urlTransform={safeHref}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
