"use client"

import { useEffect, useRef } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleRendererProps {
  content: string | null | undefined
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArticleRenderer({ content, className = "" }: ArticleRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Inisialisasi tab interaktif setiap kali konten berubah ──────────────────
  useEffect(() => {
    if (!content) return
    const el = containerRef.current
    if (!el) return
    const init = () => {
      el.querySelectorAll<HTMLElement>(".tabbed-block").forEach((block) => {
        if (block.dataset.tabInit) return
        block.dataset.tabInit = "1"
        block.querySelectorAll<HTMLElement>(".tbb").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = btn.dataset.tab
            block.querySelectorAll(".tbb").forEach((b) => b.classList.remove("tbb-active"))
            block.querySelectorAll(".tbp").forEach((p) => p.classList.remove("tbp-active"))
            btn.classList.add("tbb-active")
            block.querySelector(`.tbp[data-panel="${idx}"]`)?.classList.add("tbp-active")
          })
        })
      })
    }
    const timer = setTimeout(init, 80)
    return () => clearTimeout(timer)
  }, [content])

  if (!content) return null

  return (
    <div
      ref={containerRef}
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

        // ── Tabel ────────────────────────────────────────────────────────
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

        // ── Card Design Block (card-design & card-table-block) ────────────
        "[&_.card-design]:grid [&_.card-design]:gap-4 [&_.card-design]:my-6",
        "[&_.card-design]:[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]",
        "[&_.card-design-card]:rounded-xl [&_.card-design-card]:border [&_.card-design-card]:border-border [&_.card-design-card]:bg-card [&_.card-design-card]:p-4 [&_.card-design-card]:flex [&_.card-design-card]:flex-col [&_.card-design-card]:gap-2",
        "[&_.card-design-field]:flex [&_.card-design-field]:items-start [&_.card-design-field]:gap-2",
        "[&_.card-design-label]:text-[0.7rem] [&_.card-design-label]:font-bold [&_.card-design-label]:uppercase [&_.card-design-label]:tracking-wider [&_.card-design-label]:text-primary [&_.card-design-label]:min-w-[80px] [&_.card-design-label]:shrink-0 [&_.card-design-label]:pt-0.5",
        "[&_.card-design-value]:text-sm [&_.card-design-value]:text-foreground [&_.card-design-value]:leading-relaxed",
        // card-table-block (alias lama)
        "[&_.card-table-block]:grid [&_.card-table-block]:gap-4 [&_.card-table-block]:my-6",
        "[&_.card-table-block]:[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]",
        "[&_.card-table-card]:rounded-xl [&_.card-table-card]:border [&_.card-table-card]:border-border [&_.card-table-card]:bg-card [&_.card-table-card]:p-4 [&_.card-table-card]:flex [&_.card-table-card]:flex-col [&_.card-table-card]:gap-2",
        "[&_.card-table-field]:flex [&_.card-table-field]:items-start [&_.card-table-field]:gap-2",
        "[&_.card-table-label]:text-[0.7rem] [&_.card-table-label]:font-bold [&_.card-table-label]:uppercase [&_.card-table-label]:tracking-wider [&_.card-table-label]:text-primary [&_.card-table-label]:min-w-[90px] [&_.card-table-label]:shrink-0 [&_.card-table-label]:pt-0.5",
        "[&_.card-table-value]:text-sm [&_.card-table-value]:text-foreground [&_.card-table-value]:leading-relaxed",

        // ── Tabbed Block (MatchCard & GroupStandings) ─────────────────────
        "[&_.tabbed-block]:rounded-xl [&_.tabbed-block]:border [&_.tabbed-block]:border-border [&_.tabbed-block]:overflow-hidden [&_.tabbed-block]:my-6",
        "[&_.tb-nav]:flex [&_.tb-nav]:flex-wrap [&_.tb-nav]:gap-1.5 [&_.tb-nav]:p-2.5 [&_.tb-nav]:bg-secondary/40 [&_.tb-nav]:border-b [&_.tb-nav]:border-border",
        "[&_.tbb]:rounded-md [&_.tbb]:px-3 [&_.tbb]:py-1.5 [&_.tbb]:text-xs [&_.tbb]:font-semibold [&_.tbb]:cursor-pointer [&_.tbb]:border [&_.tbb]:border-border [&_.tbb]:bg-secondary [&_.tbb]:text-muted-foreground [&_.tbb]:transition-colors [&_.tbb]:select-none",
        "[&_.tbb-active]:bg-primary [&_.tbb-active]:border-primary [&_.tbb-active]:!text-black",
        "[&_.tb-content]:p-4 [&_.tb-content]:bg-card",
        // PENTING: !important agar tidak di-override prose display:block
        "[&_.tbp]:!hidden",
        "[&_.tbp-active]:!block",

        // ── Match Card ───────────────────────────────────────────────────
        "[&_.match-block]:my-6",
        "[&_.match-card-grid]:grid [&_.match-card-grid]:gap-4 [&_.match-card-grid]:my-2 [&_.match-card-grid]:grid-cols-1 sm:[&_.match-card-grid]:grid-cols-2",
        "[&_.match-card]:rounded-xl [&_.match-card]:border [&_.match-card]:border-border [&_.match-card]:bg-secondary/30 [&_.match-card]:p-4 [&_.match-card]:flex [&_.match-card]:flex-col [&_.match-card]:gap-2.5",
        "[&_.match-card-top]:flex [&_.match-card-top]:items-center [&_.match-card-top]:justify-between",
        "[&_.match-card-badge]:rounded-full [&_.match-card-badge]:bg-primary [&_.match-card-badge]:text-[10px] [&_.match-card-badge]:font-extrabold [&_.match-card-badge]:tracking-wide [&_.match-card-badge]:text-black [&_.match-card-badge]:px-2.5 [&_.match-card-badge]:py-0.5",
        "[&_.match-card-date]:text-xs [&_.match-card-date]:text-muted-foreground",
        "[&_.match-card-teams]:flex [&_.match-card-teams]:items-center [&_.match-card-teams]:justify-between [&_.match-card-teams]:gap-2",
        "[&_.match-card-team]:text-base [&_.match-card-team]:font-bold [&_.match-card-team]:text-foreground",
        "[&_.match-card-vs]:text-sm [&_.match-card-vs]:font-bold [&_.match-card-vs]:text-primary",
        "[&_.match-card-score]:flex [&_.match-card-score]:items-center [&_.match-card-score]:gap-1 [&_.match-card-score]:rounded-md [&_.match-card-score]:bg-primary/10 [&_.match-card-score]:px-2.5 [&_.match-card-score]:py-0.5 [&_.match-card-score]:text-base [&_.match-card-score]:font-extrabold [&_.match-card-score]:text-primary [&_.match-card-score]:tabular-nums",
        "[&_.match-card-score-sep]:text-muted-foreground [&_.match-card-score-sep]:font-normal",
        "[&_.match-card-bottom]:flex [&_.match-card-bottom]:items-center [&_.match-card-bottom]:justify-between [&_.match-card-bottom]:flex-wrap [&_.match-card-bottom]:gap-2",
        "[&_.match-card-time]:rounded [&_.match-card-time]:border [&_.match-card-time]:border-border [&_.match-card-time]:bg-black/30 [&_.match-card-time]:px-2 [&_.match-card-time]:py-1 [&_.match-card-time]:text-xs [&_.match-card-time]:font-bold [&_.match-card-time]:text-foreground",
        "[&_.match-card-stadium]:text-xs [&_.match-card-stadium]:text-muted-foreground",

        // ── Group Standings Block ────────────────────────────────────────
        "[&_.group-standings-block]:my-6",
        "[&_.gs-header]:flex [&_.gs-header]:items-center [&_.gs-header]:gap-2 [&_.gs-header]:px-4 [&_.gs-header]:py-3 [&_.gs-header]:border-b [&_.gs-header]:border-border [&_.gs-header]:bg-secondary/20",
        "[&_.gs-header-icon]:text-lg",
        "[&_.gs-header-title]:flex-1 [&_.gs-header-title]:font-bold [&_.gs-header-title]:text-foreground [&_.gs-header-title]:text-sm",
        "[&_.gs-header-sub]:text-xs [&_.gs-header-sub]:text-muted-foreground",
        "[&_.gs-table-wrap]:overflow-x-auto",
        "[&_.gs-table]:w-full [&_.gs-table]:border-collapse [&_.gs-table]:text-xs [&_.gs-table]:m-0",
        "[&_.gs-thead-row]:border-b [&_.gs-thead-row]:border-border",
        "[&_.gs-th]:px-2 [&_.gs-th]:py-2.5 [&_.gs-th]:text-[10px] [&_.gs-th]:font-bold [&_.gs-th]:uppercase [&_.gs-th]:tracking-wider [&_.gs-th]:text-muted-foreground",
        "[&_.gs-th-rank]:text-left [&_.gs-th-rank]:pl-3",
        "[&_.gs-th-team]:text-left",
        "[&_.gs-th-num]:text-center",
        "[&_.gs-th-pts]:text-center [&_.gs-th-pts]:text-primary",
        "[&_.gs-th-form]:text-center",
        "[&_.gs-row]:border-b [&_.gs-row]:border-border/40 [&_.gs-row]:transition-colors hover:[&_.gs-row]:bg-secondary/30",
        "[&_.gs-td]:px-2 [&_.gs-td]:py-2",
        "[&_.gs-td-rank]:pl-3",
        "[&_.gs-td-num]:text-center [&_.gs-td-num]:text-muted-foreground",
        "[&_.gs-td-pts]:text-center [&_.gs-td-pts]:font-bold [&_.gs-td-pts]:text-foreground",
        "[&_.gs-td-form]:text-center",
        "[&_.gs-td-team]:min-w-[130px]",
        "[&_.gs-rank]:inline-flex [&_.gs-rank]:h-5 [&_.gs-rank]:w-5 [&_.gs-rank]:items-center [&_.gs-rank]:justify-center [&_.gs-rank]:rounded [&_.gs-rank]:text-[10px] [&_.gs-rank]:font-bold",
        "[&_.gs-rank-qualify]:bg-primary/15 [&_.gs-rank-qualify]:text-primary [&_.gs-rank-qualify]:border-l-2 [&_.gs-rank-qualify]:border-l-primary",
        "[&_.gs-rank-candidate]:bg-yellow-500/15 [&_.gs-rank-candidate]:text-yellow-500",
        "[&_.gs-rank-out]:text-muted-foreground",
        "[&_.gs-flag]:inline-flex [&_.gs-flag]:items-center [&_.gs-flag]:justify-center [&_.gs-flag]:rounded [&_.gs-flag]:bg-secondary [&_.gs-flag]:px-1 [&_.gs-flag]:text-[10px] [&_.gs-flag]:font-bold [&_.gs-flag]:text-muted-foreground [&_.gs-flag]:mr-1.5 [&_.gs-flag]:shrink-0",
        "[&_.gs-team-name]:text-sm [&_.gs-team-name]:font-medium [&_.gs-team-name]:text-foreground",
        "[&_.gs-form]:flex [&_.gs-form]:gap-0.5 [&_.gs-form]:justify-center",
        "[&_.gs-form-badge]:inline-flex [&_.gs-form-badge]:h-4 [&_.gs-form-badge]:w-4 [&_.gs-form-badge]:items-center [&_.gs-form-badge]:justify-center [&_.gs-form-badge]:rounded-full [&_.gs-form-badge]:text-[8px] [&_.gs-form-badge]:font-bold",
        "[&_.gs-form-w]:bg-green-500/20 [&_.gs-form-w]:text-green-400",
        "[&_.gs-form-d]:bg-yellow-500/20 [&_.gs-form-d]:text-yellow-400",
        "[&_.gs-form-l]:bg-destructive/20 [&_.gs-form-l]:text-destructive",
        "[&_.gs-legend]:flex [&_.gs-legend]:flex-wrap [&_.gs-legend]:gap-4 [&_.gs-legend]:px-3 [&_.gs-legend]:py-2 [&_.gs-legend]:border-t [&_.gs-legend]:border-border/40",
        "[&_.gs-legend-item]:text-[10px] [&_.gs-legend-item]:text-muted-foreground",
        "[&_.gs-legend-qualify]:text-primary",
        "[&_.gs-legend-candidate]:text-yellow-500",

        className,
      ]
        .filter(Boolean)
        .join(" ")}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}

export default ArticleRenderer
