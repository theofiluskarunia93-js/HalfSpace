"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"

const GROUP_SLUGS: Record<string, string[]> = {
  europe: ["champions-league", "premier-league", "la-liga", "bundesliga", "serie-a"],
  international: ["world-cup", "euro", "copa-america", "afcon"],
  asia: ["afc-cup", "aff-cup"],
}

function ArticleCard({ article, onView }: { article: any; onView: (id: string, slug: string) => void }) {
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

  return (
    <article
      onClick={() => onView(article.id, article.slug)}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="aspect-video bg-muted overflow-hidden">
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
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {timeAgo(article.published_at || article.created_at)}
        </p>
        <h3
          className="mb-2 font-bold leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-3 text-lg sm:text-xl"
          style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
        >
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2 sm:text-[15px]">
            {article.excerpt}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {timeAgo(article.published_at || article.created_at)}
            </span>
          </div>
          <span className="text-xs font-semibold text-primary group-hover:underline">
            Selengkapnya →
          </span>
        </div>
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
      </div>
    </div>
  )
}

interface GroupArticleGridProps {
  groupKey: string
  title: string
}

export function GroupArticleGrid({ groupKey, title }: GroupArticleGridProps) {
  const [articles, setArticles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchArticles() {
      const slugs = GROUP_SLUGS[groupKey] || []

      const { data: cats } = await supabase
        .from("categories")
        .select("id")
        .in("slug", slugs)

      if (!cats || cats.length === 0) {
        setIsLoading(false)
        return
      }

      const catIds = cats.map((c) => c.id)

      const { data } = await supabase
        .from("articles")
        .select("*, categories(name, slug)")
        .eq("status", "published")
        .in("category_id", catIds)
        .order("published_at", { ascending: false })
        .limit(6)

      setArticles(data || [])
      setIsLoading(false)
    }
    fetchArticles()
  }, [groupKey])

  // FIX: router.push ditambahkan
  const handleView = async (id: string, slug: string) => {
    await trackArticleView(id)
    router.push(`/article/${slug}`)
  }

  if (isLoading)
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
    )

  if (articles.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
        Belum ada artikel untuk {title}. Tambahkan artikel melalui CMS.
      </div>
    )

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} onView={handleView} />
      ))}
    </div>
  )
}
