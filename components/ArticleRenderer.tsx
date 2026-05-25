"use client"

import { useEffect, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleRendererProps {
  content: string | null | undefined
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArticleRenderer({ content, className = "" }: ArticleRendererProps) {
  const [html, setHtml] = useState(content || "")

  useEffect(() => {
    setHtml(content || "")
  }, [content])

  if (!content) return null

  return (
    <div
      className={[
        // ── Base ──────────────────────────────────────────────────────────
        "prose prose-lg max-w-none",

        // ── Paragraf ──────────────────────────────────────────────────────
        "prose-p:text-foreground/90",
        "prose-p:leading-[1.85]",
        "prose-p:mb-5",

        // ── Headings ──────────────────────────────────────────────────────
        "prose-headings:text-foreground",
        "prose-headings:font-semibold",
        "prose-headings:tracking-tight",
        "prose-headings:scroll-mt-24",
        "prose-h1:text-3xl prose-h1:mt-10 prose-h1:mb-4",
        "prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4",
        "prose-h2:border-b prose-h2:border-border prose-h2:pb-3",
        "prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3",
        "prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-2",

        // ── Links ─────────────────────────────────────────────────────────
        "prose-a:text-primary",
        "prose-a:no-underline",
        "hover:prose-a:underline",
        "prose-a:transition-colors",
        "prose-a:font-medium",

        // ── Bold & Italic ─────────────────────────────────────────────────
        "prose-strong:text-foreground prose-strong:font-semibold",
        "prose-em:text-foreground/80",

        // ── Lists ─────────────────────────────────────────────────────────
        "prose-ul:text-foreground/90 prose-ol:text-foreground/90",
        "prose-li:my-1.5 prose-li:leading-[1.7]",
        "[&_ul>li::marker]:text-primary/60",
        "[&_ol>li::marker]:text-primary/60",

        // ── Blockquote ───────────────────────────────────────────────────
        "prose-blockquote:border-l-2 prose-blockquote:border-l-primary",
        "prose-blockquote:bg-secondary/60",
        "prose-blockquote:rounded-r-lg",
        "prose-blockquote:py-1 prose-blockquote:pl-5 prose-blockquote:pr-4",
        "prose-blockquote:text-foreground/70",
        "prose-blockquote:not-italic",
        "[&_blockquote_p]:italic [&_blockquote_p]:my-2",

        // ── Code inline ──────────────────────────────────────────────────
        "prose-code:bg-secondary",
        "prose-code:text-primary",
        "prose-code:text-[0.875em]",
        "prose-code:rounded prose-code:px-1.5 prose-code:py-0.5",
        "prose-code:before:content-none prose-code:after:content-none",

        // ── Code block ───────────────────────────────────────────────────
        "prose-pre:bg-card",
        "prose-pre:border prose-pre:border-border",
        "prose-pre:rounded-xl",
        "prose-pre:text-sm prose-pre:overflow-x-auto",

        // ── Gambar ──────────────────────────────────────────────────────
        "prose-img:rounded-xl prose-img:w-full prose-img:my-8",

        // ── Tabel modern ────────────────────────────────────────────────
        "prose-table:w-full prose-table:border-collapse prose-table:my-6 prose-table:text-sm",
        "prose-th:border prose-th:border-border",
        "prose-th:bg-secondary/60",
        "prose-th:px-4 prose-th:py-2.5",
        "prose-th:text-left prose-th:font-semibold prose-th:text-foreground",
        "prose-td:border prose-td:border-border",
        "prose-td:px-4 prose-td:py-2.5",
        "prose-td:text-foreground/80 prose-td:align-top",
        "[&_tbody_tr:nth-child(even)]:bg-secondary/30",

        // ── HR ────────────────────────────────────────────────────────────
        "prose-hr:border-border prose-hr:my-10",

        // ── Figcaption ───────────────────────────────────────────────────
        "prose-figcaption:text-center prose-figcaption:text-xs",
        "prose-figcaption:text-muted-foreground prose-figcaption:italic",

        className,
      ]
        .filter(Boolean)
        .join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default ArticleRenderer
