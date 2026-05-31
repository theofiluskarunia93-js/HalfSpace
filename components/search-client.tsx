"use client"

import { useState, useEffect, useRef, useCallback, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Search, X, Loader2, ChevronLeft } from "lucide-react"

interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  author: string
  published_at: string
  created_at: string
  categories: { name: string; slug: string } | null
}

interface Props {
  initialQuery: string
  initialResults: Article[]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return "Baru saja"
  if (minutes < 60) return `${minutes} menit yang lalu`
  if (hours < 24) return `${hours} jam yang lalu`
  return `${days} hari yang lalu`
}

async function searchArticles(query: string): Promise<Article[]> {
  if (!query || query.trim().length < 2) return []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  try {
    const q = encodeURIComponent(`%${query.trim()}%`)
    const res = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.published&or=(title.ilike.${q},excerpt.ilike.${q})&select=id,title,slug,excerpt,featured_image_url,featured_image_alt,author,published_at,created_at,categories(name,slug)&order=published_at.desc&limit=30`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/article/${article.slug}`}>
      <article className="group flex gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 sm:gap-5">
        {/* Thumbnail */}
        <div className="relative h-24 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-muted sm:h-28 sm:w-44">
          {article.featured_image_url ? (
            <Image
              src={article.featured_image_url}
              alt={article.featured_image_alt || article.title}
              fill
              sizes="(max-width: 640px) 128px, 176px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <svg className="h-8 w-8 text-muted-foreground opacity-30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            {article.categories && (
              <span className="mb-1.5 inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
                {article.categories.name}
              </span>
            )}
            <h2
              className="mb-1.5 line-clamp-2 font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-lg"
              style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
            >
              {article.title}
            </h2>
            {article.excerpt && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {article.excerpt}
              </p>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{article.author}</span>
            <span>·</span>
            <span>{timeAgo(article.published_at || article.created_at)}</span>
          </div>
        </div>
      </article>
    </Link>
  )
}

export function SearchClient({ initialQuery, initialResults }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Article[]>(initialResults)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(initialQuery.length > 0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input on mount
  useEffect(() => {
    if (!initialQuery) inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string) => {
    setHasSearched(true)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setIsSearching(true)
    const data = await searchArticles(q)
    setResults(data)
    setIsSearching(false)

    // Update URL tanpa reload (replaceState) agar bisa di-share
    const url = new URL(window.location.href)
    url.searchParams.set("q", q.trim())
    window.history.replaceState({}, "", url.toString())
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 400)
  }

  const handleClear = () => {
    setQuery("")
    setResults([])
    setHasSearched(false)
    const url = new URL(window.location.href)
    url.searchParams.delete("q")
    window.history.replaceState({}, "", url.toString())
    inputRef.current?.focus()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    doSearch(query)
  }

  return (
    <main className="mx-auto min-h-[60vh] max-w-4xl px-4 py-10">
      {/* Back link */}
      <Link
        href="/"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Beranda
      </Link>

      {/* Heading */}
      <div className="mb-8">
        <h1
          className="mb-2 text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl"
          style={{ fontFamily: "var(--font-oswald)" }}
        >
          Cari Artikel
        </h1>
        <div className="h-1 w-16 bg-primary" />
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="relative flex items-center">
          <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={query}
            onChange={handleInput}
            placeholder="Cari berita, liga, pemain..."
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-card py-4 pl-12 pr-12 text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 text-base transition-colors"
          />
          {/* Clear / loading indicator */}
          <div className="absolute right-4">
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : query ? (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Hapus pencarian"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </form>

      {/* Results */}
      {!hasSearched && (
        <div className="py-12 text-center text-muted-foreground">
          <Search className="mx-auto mb-4 h-12 w-12 opacity-20" />
          <p>Ketik minimal 2 karakter untuk mulai mencari.</p>
        </div>
      )}

      {hasSearched && !isSearching && query.trim().length >= 2 && results.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <Search className="mx-auto mb-4 h-12 w-12 opacity-20" />
          <p className="text-lg font-medium text-foreground">Tidak ada hasil untuk &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-sm">Coba kata kunci lain atau topik yang lebih umum.</p>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <p className="mb-5 text-sm text-muted-foreground">
            {results.length} artikel ditemukan
            {query.trim() && ` untuk "${query.trim()}"`}
          </p>
          <div className="flex flex-col gap-4">
            {results.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
