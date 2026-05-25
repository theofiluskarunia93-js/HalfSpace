"use client"

import { useEffect, useState } from "react"
import { marked, Tokens } from "marked"

// ─── Konfigurasi marked ──────────────────────────────────────────────────────
// Identik dengan tab Preview di CMS editor — dipasang sekali di module level.

// ─── Konfigurasi marked ──────────────────────────────────────────────────────
// Identik dengan tab Preview di CMS editor — dipasang sekali di module level.

const renderer = new marked.Renderer()

renderer.image = ({ href, title, text }: Tokens.Image) => {
  if (!href || href === "null" || href === "undefined") return ""
  const safeHref = href.trim()
  const safeAlt  = text || ""
  const titleAttr = title ? ` title="${title}"` : ""
  return `<figure class="article-figure">
  <img src="${safeHref}" alt="${safeAlt}"${titleAttr} class="article-img" loading="lazy" decoding="async" />
  ${safeAlt ? `<figcaption>${safeAlt}</figcaption>` : ""}
</figure>`
}

renderer.heading = ({ text, depth }: Tokens.Heading) => {
  const cleanText = text.replace(/<[^>]+>/g, "")
  const id = cleanText
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
  return `<h${depth} id="${id}">${text}</h${depth}>\n`
}

renderer.link = ({ href, title, text }: Tokens.Link) => {
  const isExternal = href?.startsWith("http://") || href?.startsWith("https://")
  const titleAttr    = title ? ` title="${title}"` : ""
  const externalAttr = isExternal ? ` target="_blank" rel="noopener noreferrer"` : ""
  return `<a href="${href}"${titleAttr}${externalAttr}>${text}</a>`
}

marked.use({ renderer })
marked.setOptions({ gfm: true, breaks: true })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isHtml(content: string): boolean {
  return /^<(p|div|h[1-6]|ul|ol|li|blockquote|pre|table|section|article|header|footer|main|figure)[\s>]/i.test(
    content.trim()
  )
}

function contentToHtml(content: string): string {
  if (!content) return ""
  if (isHtml(content)) return content

  // Pisahkan card-table-block dari markdown agar tidak diparse marked
  const CARD_PLACEHOLDER = "%%CARD_BLOCK_%%"
  const cardBlocks: string[] = []
  const sanitized = content.replace(
    /<div class="card-table-block">[\s\S]*?<\/div>/g,
    (match) => { cardBlocks.push(match); return CARD_PLACEHOLDER }
  )

  try {
    let parsed = marked.parse(sanitized, { async: false }) as string
    cardBlocks.forEach((block) => {
      parsed = parsed.replace(CARD_PLACEHOLDER, block)
    })
    return parsed
  } catch (err) {
    console.error("[ArticleRenderer] marked parse error:", err)
    return content.split("\n\n").map((p) => `<p>${p}</p>`).join("")
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleRendererProps {
  content: string | null | undefined
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArticleRenderer({ content, className = "" }: ArticleRendererProps) {
  const [html, setHtml] = useState(() =>
    typeof window === "undefined" ? contentToHtml(content || "") : ""
  )

  useEffect(() => {
    setHtml(contentToHtml(content || ""))
  }, [content])

  if (!content) return null

  return (
    <div
      className={[
        // ── Base ──────────────────────────────────────────────────────────
        "prose prose-lg max-w-none",

        // ── Paragraf ──────────────────────────────────────────────────────
        // Warna teks mengikuti --foreground/90 dari tema dark
        "prose-p:text-foreground/90",
        "prose-p:leading-[1.85]",
        "prose-p:mb-5",

        // ── Headings ──────────────────────────────────────────────────────
        "prose-headings:text-foreground",
        "prose-headings:font-semibold",
        "prose-headings:tracking-tight",
        "prose-headings:scroll-mt-24",
        "prose-h1:text-3xl prose-h1:mt-10 prose-h1:mb-4",
        // H2: border bawah pakai --border dari tema
        "prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4",
        "prose-h2:border-b prose-h2:border-border prose-h2:pb-3",
        "prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3",
        "prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-2",

        // ── Links — neon green ─────────────────────────────────────────────
        // Pakai --primary (neon green) sebagai warna link
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
        // Marker ikut warna --primary
        "[&_ul>li::marker]:text-primary/60",
        "[&_ol>li::marker]:text-primary/60",

        // ── Blockquote ───────────────────────────────────────────────────
        // Border kiri neon green tipis, background secondary gelap
        "prose-blockquote:border-l-2 prose-blockquote:border-l-primary",
        "prose-blockquote:bg-secondary/60",
        "prose-blockquote:rounded-r-lg",
        "prose-blockquote:py-1 prose-blockquote:pl-5 prose-blockquote:pr-4",
        "prose-blockquote:text-foreground/70",
        "prose-blockquote:not-italic",
        "[&_blockquote_p]:italic [&_blockquote_p]:my-2",

        // ── Code inline ──────────────────────────────────────────────────
        "prose-code:bg-secondary",
        "prose-code:text-primary",                // neon green untuk code
        "prose-code:text-[0.875em]",
        "prose-code:rounded prose-code:px-1.5 prose-code:py-0.5",
        "prose-code:before:content-none prose-code:after:content-none",

        // ── Code block ───────────────────────────────────────────────────
        "prose-pre:bg-card",
        "prose-pre:border prose-pre:border-border",
        "prose-pre:rounded-xl",
        "prose-pre:text-sm prose-pre:overflow-x-auto",

        // ── Gambar (inline img fallback) ──────────────────────────────────
        "prose-img:rounded-xl prose-img:w-full prose-img:my-8",

        // ── Tabel ────────────────────────────────────────────────────────
        "prose-table:w-full prose-table:border-collapse prose-table:my-6 prose-table:text-sm",
        "prose-th:border prose-th:border-border",
        "prose-th:bg-secondary/60",
        "prose-th:px-4 prose-th:py-2.5",
        "prose-th:text-left prose-th:font-semibold prose-th:text-foreground",
        "prose-td:border prose-td:border-border",
        "prose-td:px-4 prose-td:py-2.5",
        "prose-td:text-foreground/80 prose-td:align-top",
        // Striped rows — secondary sangat tipis
        "[&_tbody_tr:nth-child(even)]:bg-secondary/30",

        // ── HR ────────────────────────────────────────────────────────────
        "prose-hr:border-border prose-hr:my-10",

        // ── Figcaption (dari custom renderer) ────────────────────────────
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
