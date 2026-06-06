"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featured_image_url: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  categories: { name: string; slug: string } | null
}

interface TrendingArticlesProps {
  widgetVisible?: boolean
  initialArticles: Article[]
}

export function TrendingArticles({ widgetVisible = true, initialArticles }: TrendingArticlesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [articles] = useState<Article[]>(initialArticles)
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

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -380 : 380,
        behavior: "smooth",
      })
    }
  }

  // Selalu tampil 5 artikel terbaru dalam mode horizontal scroll,
  // baik widget aktif maupun tersembunyi
  const displayArticles = articles.slice(0, 5)

  if (displayArticles.length === 0) return null

  return (
    <section id="trending-section" className="bg-background py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3" style={{ fontFamily: "var(--font-oswald)" }}>
            <h2 className="text-2xl font-bold uppercase tracking-tight text-foreground">
              Trending Now
            </h2>
            <div className="h-px w-16 bg-gradient-to-r from-primary/60 to-transparent" />
          </div>

          {/* Nav buttons — desktop */}
          <div className="hidden gap-2 md:flex">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border hover:border-primary hover:text-primary"
              onClick={() => scroll("left")}
              aria-label="Scroll kiri"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border hover:border-primary hover:text-primary"
              onClick={() => scroll("right")}
              aria-label="Scroll kanan"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Horizontal scroll container */}
        <div
          ref={scrollRef}
          className="hide-scrollbar flex gap-5 overflow-x-auto pb-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {displayArticles.map((article, idx) => (
            <article
              key={article.id}
              onClick={() => router.push(`/article/${article.slug}`)}
              className="group min-w-[280px] flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 sm:min-w-[320px] md:min-w-[360px]"
            >
              {/* Image */}
              <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                {article.featured_image_url ? (
                  <Image
                    src={article.featured_image_url}
                    alt={article.title}
                    fill
                    sizes="(max-width: 640px) 280px, (max-width: 768px) 320px, 360px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <svg className="h-14 w-14 opacity-30" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                    </svg>
                  </div>
                )}

                {/* Rank badge + category */}
                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[11px] font-bold text-white backdrop-blur-sm">
                    {idx + 1}
                  </span>
                  {article.categories?.name && (
                    <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                      {article.categories.name}
                    </span>
                  )}
                </div>

                {/* Bottom gradient */}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent" />
              </div>

              {/* Content */}
              <div className="p-4">
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {timeAgo(article.published_at || article.created_at)}
                </p>
                <h3
                  className="mb-2 line-clamp-2 text-lg font-bold leading-snug text-foreground transition-colors group-hover:text-primary"
                  style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
                >
                  {article.title}
                </h3>
                {article.excerpt && (
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {article.excerpt}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-end">
                  <span className="text-xs font-semibold text-primary group-hover:underline">
                    Selengkapnya →
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Mobile scroll hint */}
        <p className="mt-2 text-center text-[11px] text-muted-foreground md:hidden">
          Geser ke kiri / kanan untuk melihat lebih banyak
        </p>
      </div>
    </section>
  )
}
