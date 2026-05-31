"use client"

import { useRef, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface TrendingArticlesProps {
  widgetVisible?: boolean
}

export function TrendingArticles({ widgetVisible = true }: TrendingArticlesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [articles, setArticles] = useState<any[]>([])
  const supabase = createClient()
  const router = useRouter()

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 1) return "Baru saja"
    if (minutes < 60) return `${minutes} menit yang lalu`
    if (hours < 24) return `${hours} jam yang lalu`
    return `${days} hari yang lalu`
  }

  useEffect(() => {
    async function fetchTrending() {
      const { data } = await supabase
        .from("articles")
        .select("id, slug, title, excerpt, featured_image_url, author, views, published_at, created_at, categories(name)")
        .eq("status", "published")
        .or("is_editor_choice.is.null,is_editor_choice.eq.false")
        .order("created_at", { ascending: false })
        .limit(widgetVisible ? 10 : 12)
      if (data) setArticles(data)
    }
    fetchTrending()
  }, [widgetVisible])

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -400 : 400,
        behavior: "smooth",
      })
    }
  }

  if (articles.length === 0) return null

  // ── MODE GRID (widget disembunyikan) ──────────────────────────────────────
  if (!widgetVisible) {
    return (
      <section id="trending-section" className="bg-background py-14">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-8 flex items-center gap-4">
            <h2
              className="text-2xl font-bold uppercase tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-oswald)" }}
            >
              Trending Now
            </h2>
            <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {articles.map((article, idx) => (
              <article
                key={article.id}
                onClick={() => router.push(`/article/${article.slug}`)}
                className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50"
              >
                {/* Image — lebih tinggi karena 2 kolom */}
                <div className="relative h-56 overflow-hidden bg-muted sm:h-64">
                  {article.featured_image_url ? (
                    <img
                      src={article.featured_image_url}
                      alt={article.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <svg className="h-16 w-16 opacity-30" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                      </svg>
                    </div>
                  )}
                  {/* Nomor urut */}
                  <div className="absolute left-4 top-4 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white backdrop-blur-sm">
                      {idx + 1}
                    </span>
                    <span className="rounded bg-primary px-2 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
                      {article.categories?.name || "General"}
                    </span>
                  </div>
                  {/* Gradient overlay bawah */}
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
                </div>

                <div className="p-5">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {timeAgo(article.published_at || article.created_at)}
                  </p>
                  <h3
                    className="mb-3 line-clamp-2 text-xl font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-2xl"
                    style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
                  >
                    {article.title}
                  </h3>
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {article.excerpt}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      {timeAgo(article.published_at || article.created_at)}
                    </span>
                    <span className="text-xs font-semibold text-primary group-hover:underline">
                      Selengkapnya →
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // ── MODE HORIZONTAL SCROLL (widget aktif — tampilan semula) ───────────────
  return (
    <section id="trending-section" className="bg-background py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <h2
            className="text-2xl font-bold uppercase tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            Trending Now
          </h2>
          <div className="hidden gap-2 md:flex">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border hover:border-primary hover:text-primary"
              onClick={() => scroll("left")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border hover:border-primary hover:text-primary"
              onClick={() => scroll("right")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="hide-scrollbar flex gap-6 overflow-x-auto pb-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {articles.map((article) => (
            <article
              key={article.id}
              onClick={() => router.push(`/article/${article.slug}`)}
              className="group min-w-[300px] flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 sm:min-w-[380px] md:min-w-[420px]"
            >
              <div className="relative h-52 overflow-hidden bg-muted sm:h-56">
                {article.featured_image_url ? (
                  <img
                    src={article.featured_image_url}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <svg className="h-16 w-16 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                    </svg>
                  </div>
                )}
                <div className="absolute left-4 top-4">
                  <span className="rounded bg-primary px-2 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
                    {article.categories?.name || "General"}
                  </span>
                </div>
              </div>
              <div className="p-5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {timeAgo(article.published_at || article.created_at)}
                </p>
                <h3
                  className="mb-3 line-clamp-2 text-xl font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-2xl"
                  style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
                >
                  {article.title}
                </h3>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {article.excerpt}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {timeAgo(article.published_at || article.created_at)}
                  </span>
                  <span className="text-xs font-semibold text-primary group-hover:underline">
                    Selengkapnya →
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
