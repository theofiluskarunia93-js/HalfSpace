"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"

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

function ArticleCard({ article, onView }: { article: Article; onView: (id: string) => void }) {
  return (
    <article
      onClick={() => onView(article.id)}
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
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </div>
        )}
      </div>
      <div className="p-4">
        {article.categories && (
          <span className="mb-2 inline-block rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
            {article.categories.name}
          </span>
        )}
        <h3 className="mb-2 font-semibold text-foreground transition-colors group-hover:text-primary line-clamp-2">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-2">{article.excerpt}</p>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{article.author}</span>
          <span>•</span>
          <span>{article.views || 0} views</span>
          <span>•</span>
          <span>{new Date(article.published_at || article.created_at).toLocaleDateString("id-ID")}</span>
        </div>
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
        <div className="h-3 w-1/2 bg-muted rounded" />
      </div>
    </div>
  )
}

interface ArticleGridProps {
  categorySlug: string
  title: string
  limit?: number
}

export function ArticleGrid({ categorySlug, title, limit = 9 }: ArticleGridProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchArticles() {
      setIsLoading(true)

      const { data: cat } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .single()

      if (!cat) {
        setIsLoading(false)
        return
      }

      const { data } = await supabase
        .from("articles")
        .select("*, categories(name, slug)")
        .eq("status", "published")
        .eq("category_id", cat.id)
        .order("published_at", { ascending: false })
        .limit(limit)

      setArticles((data as Article[]) || [])
      setIsLoading(false)
    }

    fetchArticles()
  }, [categorySlug, limit])

  const handleView = async (id: string) => {
    await trackArticleView(id)
    router.push(`/article/${id}`)
  }

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <svg className="h-8 w-8 text-muted-foreground opacity-50" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
        </div>
        <p className="text-muted-foreground">Belum ada artikel untuk {title}.</p>
        <p className="mt-1 text-sm text-muted-foreground/70">Tambahkan artikel melalui Admin CMS.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} onView={handleView} />
      ))}
    </div>
  )
}
