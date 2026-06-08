"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"

const GROUP_SLUGS: Record<string, string[]> = {
  europe:        ["champions-league", "premier-league", "la-liga", "bundesliga", "serie-a"],
  international: ["world-cup", "euro", "copa-america", "afcon"],
  asia:          ["afc-cup", "aff-cup"],
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours   = Math.floor(diff / 3600000)
  const days    = Math.floor(diff / 86400000)
  if (minutes < 1)  return "Baru saja"
  if (minutes < 60) return `${minutes} menit yang lalu`
  if (hours < 24)   return `${hours} jam yang lalu`
  return `${days} hari yang lalu`
}

function ArticleCard({ article, onView }: { article: any; onView: (id: string, slug: string) => void }) {
  return (
    <article
      onClick={() => onView(article.id, article.slug)}
      // Fixed width so cards don't stretch; min-w keeps them from collapsing
      className="group cursor-pointer flex-shrink-0 w-72 sm:w-80 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="aspect-video overflow-hidden bg-muted relative">
        {article.featured_image_url ? (
          <img
            src={article.featured_image_url}
            alt={article.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <svg className="h-12 w-12 opacity-30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-4">
        {article.categories?.name && (
          <span className="mb-2 inline-block rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {article.categories.name}
          </span>
        )}
        <h3
          className="mb-2 font-bold leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-3"
          style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
        >
          {article.title}
        </h3>
        <p className="text-xs text-muted-foreground">{timeAgo(article.published_at || article.created_at)}</p>
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-72 sm:w-80 rounded-xl border border-border bg-card animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
      </div>
    </div>
  )
}

interface HorizontalArticleScrollProps {
  groupKey: string
  title: string
}

export function HorizontalArticleScroll({ groupKey, title }: HorizontalArticleScrollProps) {
  const [articles, setArticles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchArticles() {
      setIsLoading(true)
      const slugs = GROUP_SLUGS[groupKey] || [groupKey]

      const { data: cats } = await supabase
        .from("categories")
        .select("id")
        .in("slug", slugs)

      if (!cats || cats.length === 0) { setIsLoading(false); return }

      const catIds = cats.map((c) => c.id)

      const { data } = await supabase
        .from("articles")
        .select("id, title, slug, excerpt, featured_image_url, published_at, created_at, categories(name, slug)")
        .eq("status", "published")
        .in("category_id", catIds)
        .order("published_at", { ascending: false })
        .limit(20)

      setArticles(data || [])
      setIsLoading(false)
    }
    fetchArticles()
  }, [groupKey])

  const handleView = async (id: string, slug: string) => {
    await trackArticleView(id)
    router.push(`/article/${slug}`)
  }

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -340 : 340, behavior: "smooth" })
  }

  if (isLoading) {
    return (
      <div className="flex gap-5 overflow-hidden">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
        Belum ada artikel untuk {title}. Tambahkan artikel melalui CMS.
      </div>
    )
  }

  return (
    <div className="relative group/scroll">
      {/* Left button */}
      <button
        onClick={() => scroll("left")}
        aria-label="Scroll kiri"
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 -translate-x-3 hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md text-muted-foreground transition-colors hover:border-primary hover:text-primary opacity-0 group-hover/scroll:opacity-100"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto pb-3 scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} onView={handleView} />
        ))}
      </div>

      {/* Right button */}
      <button
        onClick={() => scroll("right")}
        aria-label="Scroll kanan"
        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-3 hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md text-muted-foreground transition-colors hover:border-primary hover:text-primary opacity-0 group-hover/scroll:opacity-100"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Mobile swipe hint — fades in briefly on mount */}
      <p className="mt-2 text-center text-xs text-muted-foreground sm:hidden">
        ← Geser untuk melihat lebih banyak →
      </p>
    </div>
  )
}
