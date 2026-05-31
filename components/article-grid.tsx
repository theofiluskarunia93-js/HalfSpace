"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"
import { ChevronLeft, ChevronRight } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
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

interface ArticleGridProps {
  categorySlug: string
  title: string
  /** Jumlah artikel per halaman. Default 9. Jika diset, pagination aktif. */
  pageSize?: number
  /** Jika limit diset (tanpa pagination), pakai mode lama — kompatibel backward. */
  limit?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return "Baru saja"
  if (minutes < 60) return `${minutes} menit yang lalu`
  if (hours < 24) return `${hours} jam yang lalu`
  return `${days} hari yang lalu`
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ArticleCard({ article, onView }: { article: Article; onView: (id: string, slug: string) => void }) {
  return (
    <article
      onClick={() => onView(article.id, article.slug)}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="aspect-video bg-muted overflow-hidden relative">
        {article.featured_image_url ? (
          <Image
            src={article.featured_image_url}
            alt={article.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-105"
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
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
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
      <div className="p-4 space-y-3">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
        <div className="h-3 w-1/2 bg-muted rounded" />
      </div>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null

  // Tampilkan max 5 nomor halaman di sekitar halaman aktif
  const start = Math.max(0, page - 2)
  const end = Math.min(totalPages, start + 5)
  const pages = Array.from({ length: end - start }, (_, i) => start + i)

  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        {/* Prev */}
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* First page jika tidak terlihat */}
        {start > 0 && (
          <>
            <button
              onClick={() => onChange(0)}
              className="h-9 min-w-[36px] rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              1
            </button>
            {start > 1 && <span className="text-muted-foreground text-sm">…</span>}
          </>
        )}

        {/* Halaman tengah */}
        {pages.map(i => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`h-9 min-w-[36px] rounded-lg border px-3 text-sm font-medium transition-colors ${
              i === page
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {i + 1}
          </button>
        ))}

        {/* Last page jika tidak terlihat */}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="text-muted-foreground text-sm">…</span>}
            <button
              onClick={() => onChange(totalPages - 1)}
              className="h-9 min-w-[36px] rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {totalPages}
            </button>
          </>
        )}

        {/* Next */}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export function ArticleGrid({ categorySlug, title, pageSize = 9, limit }: ArticleGridProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  // Jika limit dipakai (mode lama / tanpa pagination), pakai limit itu
  const effectivePageSize = limit ?? pageSize
  const paginationEnabled = !limit
  const totalPages = Math.ceil(totalCount / effectivePageSize)

  const fetchArticles = useCallback(async () => {
    setIsLoading(true)

    // Resolve category id
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .single()

    if (!cat) {
      setArticles([])
      setTotalCount(0)
      setIsLoading(false)
      return
    }

    const from = page * effectivePageSize
    const to = from + effectivePageSize - 1

    // Jalankan count dan data query secara paralel
    const [{ count }, { data }] = await Promise.all([
      supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("category_id", cat.id),
      supabase
        .from("articles")
        .select("*, categories(name, slug)")
        .eq("status", "published")
        .eq("category_id", cat.id)
        .order("published_at", { ascending: false })
        .range(from, to),
    ])

    setTotalCount(count ?? 0)
    setArticles((data as Article[]) ?? [])
    setIsLoading(false)
  }, [supabase, categorySlug, page, effectivePageSize])

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  // Reset ke halaman 0 saat category berubah
  useEffect(() => {
    setPage(0)
  }, [categorySlug])

  const handleView = async (id: string, slug: string) => {
    await trackArticleView(id)
    router.push(`/article/${slug}`)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: effectivePageSize > 6 ? 6 : effectivePageSize }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────
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

  // ── Artikel + pagination ───────────────────────────────────────────────────
  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {articles.map(article => (
          <ArticleCard key={article.id} article={article} onView={handleView} />
        ))}
      </div>

      {paginationEnabled && (
        <>
          <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
          {totalCount > effectivePageSize && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Halaman {page + 1} dari {totalPages} &middot; {totalCount} artikel
            </p>
          )}
        </>
      )}
    </div>
  )
}
