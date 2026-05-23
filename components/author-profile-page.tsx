"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import {
  Calendar, Eye, Clock, FileText,
  Instagram, ChevronRight, Home, ArrowRight
} from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────
interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  categories: { name: string; slug: string } | null
}

// ─── Schema Markup ─────────────────────────────────────────────────────────
function AuthorSchema() {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Redaksi HalfSpace",
    "url": `${origin}/author/redaksi-halfspace`,
    "logo": {
      "@type": "ImageObject",
      "url": `${origin}/logo.png`,
    },
    "description":
      "Tim jurnalis dan editor HalfSpace yang berdedikasi menghadirkan berita sepak bola terpercaya, mendalam, dan aktual untuk para penggemar di seluruh Indonesia.",
    "sameAs": [
      "https://instagram.com/halfspace.id",
      "https://tiktok.com/@halfspace.id",
    ],
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  })
}

function calcReadingTime(content?: string | null): number {
  if (!content) return 1
  const text = content.replace(/<[^>]+>/g, "")
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

// ─── Article Card ──────────────────────────────────────────────────────────
function ArticleCard({ article, onView }: { article: Article; onView: (id: string) => void }) {
  return (
    <article
      onClick={() => onView(article.id)}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="aspect-video overflow-hidden bg-muted">
        {article.featured_image_url ? (
          <picture>
            <source
              srcSet={article.featured_image_url.replace(/\.(jpg|jpeg|png)$/i, ".webp")}
              type="image/webp"
            />
            <img
              src={article.featured_image_url}
              alt={article.featured_image_alt || article.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              width={400}
              height={225}
            />
          </picture>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/30">
            <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </div>
        )}
      </div>

      <div className="p-4">
        {article.categories && (
          <span className="mb-2 inline-block rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
            {article.categories.name}
          </span>
        )}
        <h3 className="mb-2 font-semibold text-foreground transition-colors group-hover:text-primary line-clamp-2 text-sm leading-snug">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{article.excerpt}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {formatDate(article.published_at || article.created_at)}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {(article.views || 0).toLocaleString("id-ID")}
          </span>
        </div>
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card animate-pulse">
      <div className="aspect-video bg-muted rounded-t-xl" />
      <div className="p-4 space-y-2">
        <div className="h-3 w-16 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
        <div className="h-3 w-1/2 bg-muted rounded" />
      </div>
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-5 text-center">
      <Icon className="h-5 w-5 text-primary mb-1" aria-hidden="true" />
      <span className="text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
        {typeof value === "number" ? value.toLocaleString("id-ID") : value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export function AuthorProfilePage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalViews, setTotalViews] = useState(0)
  const router = useRouter()
  const supabase = createClient()
  const PAGE_SIZE = 9

  useEffect(() => {
    fetchArticles(0, true)
  }, [])

  async function fetchArticles(pageNum: number, reset = false) {
    setIsLoading(true)
    const from = pageNum * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data } = await supabase
      .from("articles")
      .select("id, title, slug, excerpt, featured_image_url, featured_image_alt, author, views, published_at, created_at, categories(name, slug)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(from, to)

    const fetched = (data as Article[]) || []
    if (reset) {
      setArticles(fetched)
      const views = fetched.reduce((sum, a) => sum + (a.views || 0), 0)
      setTotalViews(views)
    } else {
      setArticles((prev) => {
        const merged = [...prev, ...fetched]
        setTotalViews(merged.reduce((sum, a) => sum + (a.views || 0), 0))
        return merged
      })
    }
    setHasMore(fetched.length === PAGE_SIZE)
    setPage(pageNum)
    setIsLoading(false)
  }

  const handleView = async (id: string) => {
    await trackArticleView(id)
    router.push(`/article/${id}`)
  }

  const loadMore = () => fetchArticles(page + 1)

  return (
    <>
      <AuthorSchema />

      <div className="min-h-screen bg-background">
        <NavbarStandalone />

        <main className="mx-auto max-w-7xl px-4 py-8">

          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
            <button onClick={() => router.push("/")} className="flex items-center gap-1 hover:text-primary transition-colors">
              <Home className="h-3 w-3" aria-hidden="true" />
              Home
            </button>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="text-foreground/70" aria-current="page">Redaksi HalfSpace</span>
          </nav>

          {/* Author Hero */}
          <section
            className="mb-10 overflow-hidden rounded-2xl border border-border bg-card"
            aria-label="Profil penulis"
            itemScope
            itemType="https://schema.org/Organization"
          >
            {/* Accent bar */}
            <div
              className="h-1.5 w-full bg-primary"
              style={{ boxShadow: "0 0 12px oklch(0.87 0.29 142 / 0.6)" }}
              aria-hidden="true"
            />

            <div className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start sm:p-8">
              {/* Avatar */}
              <div
                className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 border-4 border-primary/30"
                role="img"
                aria-label="Logo Redaksi HalfSpace"
              >
                <span
                  className="text-4xl font-bold text-primary"
                  style={{ fontFamily: "var(--font-oswald)" }}
                  aria-hidden="true"
                >
                  HS
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h1
                    className="text-2xl font-bold text-foreground sm:text-3xl"
                    style={{ fontFamily: "var(--font-oswald)" }}
                    itemProp="name"
                  >
                    Redaksi HalfSpace
                  </h1>
                  <span className="rounded-full bg-primary/15 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                    Redaksi
                  </span>
                </div>

                <p
                  className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed"
                  itemProp="description"
                >
                  Tim jurnalis dan editor HalfSpace yang berdedikasi menghadirkan berita sepak bola terpercaya, mendalam, dan aktual untuk para penggemar di seluruh Indonesia. Kami meliput liga-liga top Eropa, kompetisi internasional, serta berita lokal Liga 1 dengan standar jurnalistik yang tinggi.
                </p>

                {/* Social */}
                <div className="mt-4 flex items-center justify-center gap-3 sm:justify-start">
                  <a
                    href="https://instagram.com/halfspace.id"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram HalfSpace"
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-pink-500 hover:text-pink-500"
                  >
                    <Instagram className="h-3.5 w-3.5" aria-hidden="true" />
                    @halfspace.id
                  </a>
                  <a
                    href="https://tiktok.com/@halfspace.id"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="TikTok HalfSpace"
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <TikTokIcon className="h-3.5 w-3.5" />
                    @halfspace.id
                  </a>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="border-t border-border px-6 py-5 sm:px-8">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-3 max-w-lg">
                <StatCard
                  label="Total Artikel"
                  value={articles.length + (hasMore ? "+" : "")}
                  icon={FileText}
                />
                <StatCard
                  label="Total Views"
                  value={totalViews}
                  icon={Eye}
                />
                <StatCard
                  label="Menit Baca Rata-rata"
                  value="4"
                  icon={Clock}
                />
              </div>
            </div>
          </section>

          {/* Articles section */}
          <section aria-label="Daftar artikel oleh Redaksi HalfSpace">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className="text-xl font-bold uppercase tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-oswald)" }}
              >
                Semua Artikel
              </h2>
              <span className="text-sm text-muted-foreground">
                {articles.length} artikel
              </span>
            </div>

            {/* Grid */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} onView={handleView} />
              ))}
              {isLoading && [1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>

            {/* Load more */}
            {!isLoading && hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMore}
                  className="flex items-center gap-2 rounded-xl border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  Muat lebih banyak
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Empty */}
            {!isLoading && articles.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center">
                <p className="text-muted-foreground">Belum ada artikel yang dipublikasikan.</p>
              </div>
            )}
          </section>
        </main>

        <FooterStandalone />
      </div>
    </>
  )
}
