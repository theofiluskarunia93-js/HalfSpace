"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"
import { Loader2 } from "lucide-react"

const PAGE_SIZE = 10

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

// ─── Thumbnail — pakai <img> biasa bukan Next/Image fill ──────────────────
// Alasan: Next/Image fill butuh parent berukuran fixed + posisi relative.
// Saat artikel baru dimuat (load more), layout belum stabil sehingga
// gambar muncul hitam sebentar sebelum browser menghitung dimensinya.
// Dengan <img> + object-cover di container fixed, hal ini tidak terjadi.
function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false)

  if (!src || errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <svg className="h-8 w-8 opacity-30 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </svg>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      className="h-full w-full object-cover transition-transform group-hover:scale-105"
    />
  )
}

function ArticleRow({ article, onView }: { article: any; onView: (id: string, slug: string) => void }) {
  return (
    <article
      onClick={() => onView(article.id, article.slug)}
      className="group flex cursor-pointer gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 sm:gap-5"
    >
      {/* Thumbnail — ukuran fixed agar tidak ada layout shift */}
      <div
        className="flex-shrink-0 overflow-hidden rounded-lg bg-muted"
        style={{ width: 112, height: 80 }}    // w-28 h-20 dalam px — fixed, tidak collapse
      >
        <Thumbnail src={article.featured_image_url} alt={article.title} />
      </div>

      {/* Text */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          {article.categories?.name && (
            <span className="mb-1.5 inline-block rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {article.categories.name}
            </span>
          )}
          <h3
            className="font-bold leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2 sm:line-clamp-3"
            style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
          >
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2 hidden sm:block">
              {article.excerpt}
            </p>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{article.author}</span>
          <span>•</span>
          <span>{timeAgo(article.published_at || article.created_at)}</span>
        </div>
      </div>
    </article>
  )
}

function SkeletonRow() {
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-4 animate-pulse">
      <div className="flex-shrink-0 rounded-lg bg-muted" style={{ width: 112, height: 80 }} />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-16 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted rounded" />
        <div className="h-3 w-24 bg-muted rounded mt-2" />
      </div>
    </div>
  )
}

interface InfiniteArticleListProps {
  categorySlug: string
  title: string
}

export function InfiniteArticleList({ categorySlug, title }: InfiniteArticleListProps) {
  const [articles, setArticles]           = useState<any[]>([])
  const [totalCount, setTotalCount]       = useState(0)
  const [page, setPage]                   = useState(0)
  const [isLoading, setIsLoading]         = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [categoryId, setCategoryId]       = useState<string | null>(null)
  const router   = useRouter()
  const supabase = createClient()
  const isMounted = useRef(true)

  // Fetch category id once
  useEffect(() => {
    isMounted.current = true
    async function fetchCatId() {
      const { data } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .single()
      if (isMounted.current) setCategoryId(data?.id ?? null)
    }
    fetchCatId()
    return () => { isMounted.current = false }
  }, [categorySlug])

  // Initial load
  useEffect(() => {
    if (categoryId === null) return
    async function fetchInitial() {
      setIsLoading(true)
      const [{ count }, { data }] = await Promise.all([
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .eq("category_id", categoryId!),
        supabase
          .from("articles")
          .select("id, title, slug, excerpt, featured_image_url, author, views, published_at, created_at, categories(name, slug)")
          .eq("status", "published")
          .eq("category_id", categoryId!)
          .order("published_at", { ascending: false })
          .range(0, PAGE_SIZE - 1),
      ])
      if (isMounted.current) {
        setTotalCount(count ?? 0)
        setArticles(data || [])
        setPage(1)
        setIsLoading(false)
      }
    }
    fetchInitial()
  }, [categoryId])

  const loadMore = useCallback(async () => {
    if (!categoryId || isLoadingMore) return
    setIsLoadingMore(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    const { data } = await supabase
      .from("articles")
      .select("id, title, slug, excerpt, featured_image_url, author, views, published_at, created_at, categories(name, slug)")
      .eq("status", "published")
      .eq("category_id", categoryId)
      .order("published_at", { ascending: false })
      .range(from, to)
    if (isMounted.current) {
      setArticles((prev) => [...prev, ...(data || [])])
      setPage((p) => p + 1)
      setIsLoadingMore(false)
    }
  }, [categoryId, page, isLoadingMore])

  const handleView = async (id: string, slug: string) => {
    await trackArticleView(id)
    router.push(`/article/${slug}`)
  }

  const hasMore = articles.length < totalCount

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
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
    <div>
      {/* Article list */}
      <div className="space-y-4">
        {articles.map((article) => (
          <ArticleRow key={article.id} article={article} onView={handleView} />
        ))}
      </div>

      {/* Counter */}
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Menampilkan <span className="font-semibold text-foreground">{articles.length}</span> dari{" "}
        <span className="font-semibold text-foreground">{totalCount}</span> artikel
      </p>

      {/* Load more button */}
      {hasMore && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat...
              </>
            ) : (
              <>
                Muat Lebih Banyak
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
