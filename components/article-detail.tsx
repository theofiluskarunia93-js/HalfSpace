"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import {
  Clock, Eye, Calendar, ChevronRight, Home,
  Share2, Twitter, Facebook, Link2, Check,
  BookOpen, ArrowUp, User,
} from "lucide-react"
// ─── Types ─────────────────────────────────────────────────────────────────
interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  categories: { name: string; slug: string } | null
}

// Interface khusus untuk related articles (tanpa field content)
interface RelatedArticle {
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

interface TocItem {
  id: string
  text: string
  level: number
}

// ─── Font size steps ───────────────────────────────────────────────────────


// ─── Helpers ───────────────────────────────────────────────────────────────

// Konten sekarang selalu HTML dari Tiptap — langsung pakai, tidak perlu parse
function contentToHtml(content: string): string {
  return content || ""
}

function calcReadingTime(content: string): number {
  const text = content
    .replace(/<[^>]+>/g, "")
    .replace(/[#*_~`>[\]()!]/g, "")
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

function extractToc(html: string): TocItem[] {
  const withId = [...html.matchAll(/<h([2-3])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h[2-3]>/gi)]
  if (withId.length > 0) {
    return withId.map((m) => ({
      level: parseInt(m[1]),
      id: m[2],
      text: m[3].replace(/<[^>]+>/g, ""),
    }))
  }
  const raw = [...html.matchAll(/<h([2-3])[^>]*>(.*?)<\/h[2-3]>/gi)]
  return raw.map((m, i) => ({
    level: parseInt(m[1]),
    id: `heading-${i}`,
    text: m[2].replace(/<[^>]+>/g, ""),
  }))
}

function injectHeadingIds(html: string): string {
  let i = 0
  return html.replace(/<h([2-3])([^>]*)>/gi, (match, level, attrs) => {
    if (/id=/i.test(attrs)) return match
    const id = `heading-${i++}`
    return `<h${level}${attrs} id="${id}">`
  })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  })
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
  return `${date}, ${time}`
}

// ─── Schema Markup ─────────────────────────────────────────────────────────
function ArticleSchema({ article }: { article: Article }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": article.excerpt ?? "",
    "image": article.featured_image_url ? [article.featured_image_url] : [],
    "datePublished": article.published_at || article.created_at,
    "dateModified": article.created_at,
    "author": {
      "@type": "Organization",
      "name": "Redaksi HalfSpace",
      "url": typeof window !== "undefined" ? `${window.location.origin}/author/redaksi-halfspace` : "/author/redaksi-halfspace",
    },
    "publisher": {
      "@type": "Organization",
      "name": "HalfSpace",
      "logo": {
        "@type": "ImageObject",
        "url": typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "/logo.png",
      },
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": typeof window !== "undefined" ? window.location.href : "",
    },
    "articleSection": article.categories?.name ?? "Umum",
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

function BreadcrumbSchema({ article }: { article: Article }) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": origin + "/" },
      ...(article.categories
        ? [{ "@type": "ListItem", "position": 2, "name": article.categories.name, "item": `${origin}/${article.categories.slug}` }]
        : []),
      { "@type": "ListItem", "position": article.categories ? 3 : 2, "name": article.title, "item": typeof window !== "undefined" ? window.location.href : "" },
    ],
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// ─── Reading Progress Bar ──────────────────────────────────────────────────
function ReadingProgressBar() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const handler = () => {
      const el = document.documentElement
      const scrollTop = el.scrollTop || document.body.scrollTop
      const scrollHeight = el.scrollHeight - el.clientHeight
      setProgress(scrollHeight > 0 ? Math.min(100, (scrollTop / scrollHeight) * 100) : 0)
    }
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  return (
    <div
      className="fixed top-0 left-0 z-[60] h-[3px] bg-primary transition-all duration-100"
      style={{ width: `${progress}%`, boxShadow: "0 0 8px oklch(0.87 0.29 142 / 0.8)" }}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    />
  )
}

// ─── Breadcrumbs ───────────────────────────────────────────────────────────
function Breadcrumbs({ article }: { article: Article }) {
  const router = useRouter()
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-1 hover:text-primary transition-colors"
      >
        <Home className="h-3 w-3" aria-hidden="true" />
        <span>Home</span>
      </button>
      {article.categories && (
        <>
          <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <button
            onClick={() => router.push(`/${article.categories!.slug}`)}
            className="hover:text-primary transition-colors truncate max-w-[120px]"
          >
            {article.categories.name}
          </button>
        </>
      )}
      <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span className="text-foreground/70 truncate max-w-[200px] sm:max-w-xs" aria-current="page">
        {article.title}
      </span>
    </nav>
  )
}

// ─── Table of Contents ─────────────────────────────────────────────────────
function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("")
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    if (items.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    )
    items.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <aside
      aria-label="Table of contents"
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/50 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
          Daftar Isi
        </span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: isOpen ? `${items.length * 48 + 16}px` : "0px" }}
      >
        <nav className="px-2 pb-3">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                setActiveId(item.id)
              }}
              className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                item.level === 3 ? "pl-5" : ""
              } ${
                activeId === item.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <span
                className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors ${
                  activeId === item.id ? "bg-primary" : "bg-muted-foreground/40"
                }`}
                aria-hidden="true"
              />
              {item.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  )
}

// ─── Share Buttons ─────────────────────────────────────────────────────────
function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== "undefined" ? window.location.href : ""

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const shareTwitter = () =>
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
      "_blank", "noopener,noreferrer"
    )

  const shareFacebook = () =>
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      "_blank", "noopener,noreferrer"
    )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        Bagikan:
      </span>
      <button
        onClick={shareTwitter}
        aria-label="Bagikan ke X / Twitter"
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Twitter className="h-3.5 w-3.5" aria-hidden="true" />
        X
      </button>
      <button
        onClick={shareFacebook}
        aria-label="Bagikan ke Facebook"
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-blue-500 hover:text-blue-500"
      >
        <Facebook className="h-3.5 w-3.5" aria-hidden="true" />
        Facebook
      </button>
      <button
        onClick={copyLink}
        aria-label="Salin tautan artikel"
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
          copied
            ? "border-green-500 text-green-500"
            : "border-border text-foreground hover:border-primary hover:text-primary"
        }`}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied ? "Tersalin!" : "Salin tautan"}
      </button>
    </div>
  )
}



// ─── Author Card ───────────────────────────────────────────────────────────
function AuthorCard() {
  const router = useRouter()
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border border-border bg-card p-5">
      <button
        onClick={() => router.push("/author/redaksi-halfspace")}
        aria-label="Lihat profil Redaksi HalfSpace"
        className="flex-shrink-0"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 border-2 border-primary/30 hover:border-primary transition-colors">
          <span
            className="text-xl font-bold text-primary"
            style={{ fontFamily: "var(--font-oswald)" }}
            aria-hidden="true"
          >
            HS
          </span>
        </div>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => router.push("/author/redaksi-halfspace")}
            className="font-semibold text-foreground hover:text-primary transition-colors text-sm"
          >
            Redaksi HalfSpace
          </button>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Redaksi
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Tim jurnalis dan editor HalfSpace yang berdedikasi menghadirkan berita sepak bola terpercaya, mendalam, dan aktual untuk para penggemar di seluruh Indonesia.
        </p>
        <button
          onClick={() => router.push("/author/redaksi-halfspace")}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <User className="h-3 w-3" aria-hidden="true" />
          Lihat semua artikel
        </button>
      </div>
    </div>
  )
}

// ─── Related Articles ──────────────────────────────────────────────────────
function RelatedArticles({ currentId, categorySlug }: { currentId: string; categorySlug?: string }) {
  const [articles, setArticles] = useState<RelatedArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchRelated() {
      let query = supabase
        .from("articles")
        .select("id, title, slug, excerpt, featured_image_url, featured_image_alt, author, views, published_at, created_at, categories(name, slug)")
        .eq("status", "published")
        .neq("id", currentId)
        .order("published_at", { ascending: false })
        .limit(3)

      if (categorySlug) {
        const { data: cat } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle()
        if (cat) query = query.eq("category_id", cat.id)
      }

      const { data } = await query
      setArticles(((data as any[]) || []) as RelatedArticle[])
      setIsLoading(false)
    }
    fetchRelated()
  }, [currentId, categorySlug])

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border bg-card">
            <div className="aspect-video bg-muted rounded-t-xl" />
            <div className="p-4 space-y-2">
              <div className="h-3 w-16 bg-muted rounded" />
              <div className="h-4 w-full bg-muted rounded" />
              <div className="h-3 w-3/4 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (articles.length === 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <article
          key={article.id}
          onClick={async () => {
            await trackArticleView(article.id)
            router.push(`/article/${article.id}`)
          }}
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
                {(article.categories as any).name}
              </span>
            )}
            <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary line-clamp-2 text-sm">
              {article.title}
            </h3>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              <span>{formatDate(article.published_at || article.created_at)}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

// ─── Back to Top ───────────────────────────────────────────────────────────
function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 400)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Kembali ke atas"
      className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-primary/50 bg-card text-primary shadow-lg transition-all hover:bg-primary hover:text-primary-foreground"
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
function ArticleSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-3 w-48 rounded bg-muted" />
      <div className="mb-4 h-8 w-3/4 rounded bg-muted" />
      <div className="mb-2 h-8 w-1/2 rounded bg-muted" />
      <div className="mb-6 flex gap-4">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
      </div>
      <div className="aspect-video w-full rounded-xl bg-muted" />
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
interface ArticleDetailProps {
  articleId: string
}

export function ArticleDetail({ articleId }: ArticleDetailProps) {
  const [article, setArticle] = useState<Article | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [toc, setToc] = useState<TocItem[]>([])
  const [processedContent, setProcessedContent] = useState("")
  const contentRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // ── Inisialisasi tab interaktif setiap kali konten berubah ──────────────
  useEffect(() => {
    if (!processedContent) return
    const el = contentRef.current
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
    // Tunggu sampai DOM selesai di-render oleh dangerouslySetInnerHTML
    const timer = setTimeout(init, 80)
    return () => clearTimeout(timer)
  }, [processedContent])

  // Prose classes (always dark theme)
  const proseClass = [
    "max-w-none prose prose-lg prose-invert",
    // Heading — Oswald font for headings inside article body
    "prose-headings:font-black prose-headings:scroll-mt-24",
    "prose-headings:text-foreground prose-p:text-foreground/90",
    "prose-h1:text-3xl prose-h1:mt-8 prose-h1:mb-4",
    "prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:pb-2 prose-h2:border-border",
    "prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3",
    "prose-p:leading-relaxed prose-p:mb-5 prose-p:text-[17px] sm:prose-p:text-lg",
    // Links
    "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
    // Bold
    "prose-strong:text-foreground prose-strong:font-semibold",
    // Images
    "prose-img:rounded-xl prose-img:w-full prose-img:my-6",
    // Blockquote
    "prose-blockquote:border-l-primary prose-blockquote:border-l-2",
    "prose-blockquote:bg-secondary/50 prose-blockquote:text-foreground/70",
    "prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:not-italic",
    // Code
    "prose-code:text-primary prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:bg-secondary",
    "prose-code:before:content-none prose-code:after:content-none",
    // Lists
    "prose-ul:text-foreground/90 prose-ol:text-foreground/90",
    "prose-li:my-1",
    // Table
    "prose-table:w-full prose-table:border-collapse prose-table:my-6 prose-table:text-sm prose-table:overflow-hidden prose-table:rounded-lg",
    "prose-th:border prose-th:border-border prose-th:bg-secondary/80",
    "prose-th:text-foreground prose-th:font-semibold",
    "prose-td:border prose-td:border-border prose-td:text-foreground/80",
    "[&_tbody_tr:nth-child(even)]:bg-secondary/30",
    "prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:text-sm",
    "prose-td:px-4 prose-td:py-2.5 prose-td:align-top",
    // HR
    "prose-hr:border-border prose-hr:my-8",
  ].join(" ")



  useEffect(() => {
    async function fetchArticle() {
      let { data } = await supabase
        .from("articles")
        .select("*, categories(name, slug)")
        .eq("id", articleId)
        .eq("status", "published")
        .maybeSingle()

      if (!data) {
        const fallback = await supabase
          .from("articles")
          .select("*, categories(name, slug)")
          .eq("id", articleId)
          .maybeSingle()
        data = fallback.data
      }

      if (data) {
        setArticle(data as Article)
        await trackArticleView(articleId)

        if (data.content) {
          const html = contentToHtml(data.content)
          const injected = injectHeadingIds(html)
          setProcessedContent(injected)
          setToc(extractToc(injected))
        }
      }

      setIsLoading(false)
    }
    fetchArticle()
  }, [articleId])

  const readingTime = article?.content ? calcReadingTime(article.content) : 0

  // Article area background sesuai mode
  return (
    <>
      {article && (
        <>
          <ArticleSchema article={article} />
          <BreadcrumbSchema article={article} />
        </>
      )}

      <ReadingProgressBar />
      <BackToTop />

      <div className="min-h-screen bg-background">
        <NavbarStandalone />

        <main className="mx-auto max-w-7xl px-4 py-8">
          {isLoading ? (
            <div className="max-w-3xl mx-auto">
              <ArticleSkeleton />
            </div>
          ) : !article ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-xl font-semibold text-foreground">Artikel tidak ditemukan</p>
              <p className="mt-2 text-muted-foreground">Artikel ini mungkin telah dihapus atau URL tidak valid.</p>
            </div>
          ) : (
            <div className="flex gap-8 lg:items-start">

              {/* ── Main Article Column ── */}
              <article
                className="min-w-0 flex-1 rounded-2xl"
                itemScope
                itemType="https://schema.org/NewsArticle"
              >

                {/* Breadcrumbs */}
                <Breadcrumbs article={article} />

                {/* Header */}
                <header className="mt-4 mb-6">
                  {article.categories && (
                    <span className="mb-3 inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                      {article.categories.name}
                    </span>
                  )}

                  <h1
                    className="text-3xl font-black leading-tight sm:text-4xl lg:text-5xl xl:text-6xl text-foreground"
                    style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.02em" }}
                    itemProp="headline"
                  >
                    {article.title}
                  </h1>

                  {article.excerpt && (
                    <p className="mt-4 text-lg leading-relaxed text-muted-foreground sm:text-xl" itemProp="description">
                      {article.excerpt}
                    </p>
                  )}

                  {/* Meta row + Reading Controls */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs border-y py-3 text-muted-foreground border-border">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      <span itemProp="author" itemScope itemType="https://schema.org/Organization">
                        <span itemProp="name">Redaksi HalfSpace</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      <time
                        dateTime={article.published_at || article.created_at}
                        itemProp="datePublished"
                      >
                        {formatDateTime(article.published_at || article.created_at)}
                      </time>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      {readingTime} menit baca
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      {(article.views || 0).toLocaleString("id-ID")} views
                    </span>

                  </div>

                  {/* Share — top */}
                  <div className="mt-4">
                    <ShareButtons title={article.title} />
                  </div>
                </header>

                {/* TOC — mobile */}
                {toc.length > 0 && (
                  <div className="mb-6 lg:hidden">
                    <TableOfContents items={toc} />
                  </div>
                )}

                {/* Featured image */}
                {article.featured_image_url && (
                  <figure className="mb-8 overflow-hidden rounded-xl" itemProp="image" itemScope itemType="https://schema.org/ImageObject">
                    <picture>
                      <source
                        srcSet={article.featured_image_url.replace(/\.(jpg|jpeg|png)$/i, ".webp")}
                        type="image/webp"
                      />
                      <img
                        src={article.featured_image_url}
                        alt={article.featured_image_alt || article.title}
                        className="w-full object-cover max-h-[480px] rounded-xl"
                        loading="eager"
                        fetchPriority="high"
                        decoding="async"
                        width={1200}
                        height={630}
                        itemProp="url"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = "none"
                        }}
                      />
                    </picture>
                    {article.featured_image_alt && (
                      <figcaption className="mt-2 text-center text-xs italic text-muted-foreground">
                        {article.featured_image_alt}
                      </figcaption>
                    )}
                    <meta itemProp="width" content="1200" />
                    <meta itemProp="height" content="630" />
                  </figure>
                )}

                {/* Article content */}
                <div
                  className={[
                    proseClass,
                    // Card table grid (legacy class names)
                    "[&_.card-table-block]:grid [&_.card-table-block]:gap-4 [&_.card-table-block]:grid-cols-1 sm:[&_.card-table-block]:grid-cols-2",
                    "[&_.card-table-card]:border-border [&_.card-table-card]:bg-secondary/40 [&_.card-table-label]:text-primary [&_.card-table-value]:text-foreground/90",
                    // card-design class
                    "[&_.card-design]:grid [&_.card-design]:gap-4 [&_.card-design]:my-6 [&_.card-design]:grid-cols-1 sm:[&_.card-design]:grid-cols-2",
                    "[&_.card-design-card]:border-border [&_.card-design-card]:bg-secondary/40 [&_.card-design-label]:text-primary [&_.card-design-value]:text-foreground/90",
                  ].join(" ")}
                  dangerouslySetInnerHTML={{ __html: processedContent || article.content || "" }}
                  itemProp="articleBody"
                  ref={contentRef}
                />

                {/* Share — bottom */}
                <div className="mt-8 border-t pt-6 border-border">
                  <ShareButtons title={article.title} />
                </div>

                {/* Author card */}
                <div className="mt-6">
                  <AuthorCard />
                </div>

                {/* Related articles */}
                {article.categories && (
                  <section className="mt-10" aria-label="Artikel terkait">
                    <h2
                      className="mb-5 text-xl font-bold uppercase tracking-tight text-foreground"
                      style={{ fontFamily: "var(--font-oswald)" }}
                    >
                      Artikel Terkait
                    </h2>
                    <RelatedArticles
                      currentId={article.id}
                      categorySlug={article.categories.slug}
                    />
                  </section>
                )}
              </article>

              {/* ── Sidebar — Desktop ToC ── */}
              {toc.length > 0 && (
                <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-24 self-start">
                  <TableOfContents items={toc} />
                </aside>
              )}

            </div>
          )}
        </main>

        <FooterStandalone />
      </div>
    </>
  )
}
