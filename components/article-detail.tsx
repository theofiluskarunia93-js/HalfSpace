"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import { ArticleBody } from "@/components/article/ArticleBody"
import { RelatedArticles, type RelatedArticle } from "@/components/article/RelatedArticles"
import {
  Clock, Eye, Calendar, ChevronRight, Home,
  Share2, Twitter, Facebook, Link2, Check,
  BookOpen, ArrowUp, User, MessageSquare, Send, RefreshCw, Tag,
} from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────
interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content_type: string | null
  content: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  featured_image_caption: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  updated_at: string | null
  categories: { name: string; slug: string } | null
  article_tags: { tags: { name: string; slug: string } | null }[] | null
}

interface TocItem {
  id: string
  text: string
  level: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function contentToHtml(content: string): string {
  if (!content) return ""
  const cleaned = cleanLegacyBadgeContent(content)
  return cleaned.replace(/<p><\/p>/g, "<p>&nbsp;</p>")
}

// Deteksi apakah konten mengandung shortcode widget
function hasWidgetPlaceholder(content: string): boolean {
  return /\[(match_data|klasemen_data|transfer_data|peluang_data|analisa_taktis_data|perbandingan_tim_data|timeline_pertandingan_data|profil_stadion_data|daftar_pemain_data|pemain_andalan_data)\s+id="[a-fA-F0-9-]{36}"\]/.test(content)
}

// Bersihkan badge HTML editor yang terlanjur tersimpan di DB.
// Mengekstrak shortcode dari data-shortcode / data-widget-* attribute
// dan membuang seluruh elemen badge agar tidak tampil sebagai teks di artikel.
function cleanLegacyBadgeContent(content: string): string {
  if (!content.includes("widget-shortcode-badge")) return content

  function buildShortcode(wType: string, wId: string): string | null {
    const scMap: Record<string, string> = {
      jadwal:                  `[match_data id="${wId}"]`,
      klasemen:                `[klasemen_data id="${wId}"]`,
      transfer:                `[transfer_data id="${wId}"]`,
      peluang:                 `[peluang_data id="${wId}"]`,
      analisa_taktis:          `[analisa_taktis_data id="${wId}"]`,
      perbandingan_tim:        `[perbandingan_tim_data id="${wId}"]`,
      timeline_pertandingan:   `[timeline_pertandingan_data id="${wId}"]`,
      profil_stadion:          `[profil_stadion_data id="${wId}"]`,
      daftar_pemain:           `[daftar_pemain_data id="${wId}"]`,
      pemain_andalan:          `[pemain_andalan_data id="${wId}"]`,
    }
    return scMap[wType] ?? null
  }

  // ── SSR path (tidak ada DOMParser) ────────────────────────────────────────
  if (typeof window === "undefined") {
    // Hitung kedalaman tag <div> secara manual agar nested div bisa di-skip
    // dengan benar — regex greedy tidak bisa menangani ini.
    function extractNestedDiv(html: string, startIndex: number): { end: number } | null {
      let depth = 0
      let i = startIndex
      while (i < html.length) {
        // Case-insensitive & toleran whitespace: <div , <DIV>, dll
        if (/^<div[\s>]/i.test(html.slice(i, i + 5))) { depth++; i += 4; continue }
        if (/^<\/div>/i.test(html.slice(i, i + 6))) {
          depth--
          if (depth === 0) return { end: i + 6 }
          i += 6; continue
        }
        i++
      }
      return null
    }

    // Flag `i` agar cocok meski kapitalisasi berbeda
    const badgeStartRegex = /<div[^>]*class="[^"]*widget-shortcode-badge[^"]*"([^>]*)>/gi
    let result = ""
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = badgeStartRegex.exec(content)) !== null) {
      const matchStart = match.index
      result += content.slice(lastIndex, matchStart)

      // Ekstrak shortcode dari atribut div pembuka
      const attrsStr = match[0]
      const scMatch  = attrsStr.match(/data-shortcode="([^"]+)"/)
      const wIdMatch = attrsStr.match(/data-widget-id="([^"]+)"/)
      const wTpMatch = attrsStr.match(/data-widget-type="([^"]+)"/)

      const shortcode = scMatch?.[1] ?? (
        wIdMatch && wTpMatch
          ? buildShortcode(wTpMatch[1], wIdMatch[1])
          : null
      )

      // Skip seluruh badge (nested div) — gunakan lastIndex sebagai fallback
      const nested = extractNestedDiv(content, matchStart)
      const endIndex = nested ? nested.end : badgeStartRegex.lastIndex

      if (shortcode) result += `<p>${shortcode}</p>`
      lastIndex = endIndex
      badgeStartRegex.lastIndex = endIndex
    }

    result += content.slice(lastIndex)
    return result
  }

  // ── Client path (DOMParser tersedia) ─────────────────────────────────────
  const parser = new DOMParser()
  const doc = parser.parseFromString(content, "text/html")

  doc.querySelectorAll<HTMLElement>(".widget-shortcode-badge").forEach((el) => {
    const shortcode =
      el.dataset.shortcode ||
      (() => {
        const wId = el.dataset.widgetId
        const wType = el.dataset.widgetType
        if (!wId || !wType) return null
        return buildShortcode(wType, wId)
      })()

    // Naiki ke ancestor tertinggi yang masih merupakan anak tunggal dari parent-nya
    // agar semua wrapper div ikut terhapus — mencegah teks inner badge bocor ke DOM.
    let target: Element = el
    while (
      target.parentElement &&
      target.parentElement !== doc.body &&
      target.parentElement.children.length === 1
    ) {
      target = target.parentElement
    }

    if (shortcode) {
      const p = doc.createElement("p")
      p.textContent = shortcode
      target.replaceWith(p)
    } else {
      target.remove()
    }
  })

  return doc.body.innerHTML
}

function calcReadingTime(content: string): number {
  const text = content
    .replace(/<[^>]+>/g, "")
    .replace(/[#*_~`>[\]()!]/g, "")
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

function extractToc(html: string): TocItem[] {
  const withId = [...html.matchAll(/<h([1-3])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h[1-3]>/gi)]
  if (withId.length > 0) {
    return withId.map((m) => ({
      level: parseInt(m[1]),
      id: m[2],
      text: m[3].replace(/<[^>]+>/g, ""),
    }))
  }
  const raw = [...html.matchAll(/<h([1-3])[^>]*>(.*?)<\/h[1-3]>/gi)]
  return raw.map((m, i) => ({
    level: parseInt(m[1]),
    id: `heading-${i}`,
    text: m[2].replace(/<[^>]+>/g, ""),
  }))
}

function injectHeadingIds(html: string): string {
  let i = 0
  return html.replace(/<h([1-3])([^>]*)>/gi, (match, level, attrs) => {
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
                const el = document.getElementById(item.id)
                if (el) {
                  const navbarHeight = 80 // sticky navbar ~64px + extra padding
                  const top = el.getBoundingClientRect().top + window.scrollY - navbarHeight
                  window.scrollTo({ top, behavior: "smooth" })
                }
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

// ─── Excerpt Marquee Card ──────────────────────────────────────────────────
function ExcerptMarqueeCard({
  excerpt,
  category,
  contentType,
}: {
  excerpt: string
  category?: string
  contentType?: string | null
}) {
  // Build marquee items: category + contentType + HalfSpace brand, repeat for seamless loop
  const topicLabel = contentType || category || "ARTIKEL"
  const marqueeItems = [
    topicLabel,
    "HALFSPACE",
    topicLabel,
    "HALFSPACE",
    topicLabel,
    "HALFSPACE",
  ].filter(Boolean) as string[]

  return (
    <div className="mt-5 overflow-hidden rounded-xl" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
      {/* Marquee Label Bar */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "#00ff6a",
          padding: "10px 0",
        }}
        aria-hidden="true"
      >
        <div
          className="flex gap-8 whitespace-nowrap"
          style={{
            animation: "marquee-scroll 18s linear infinite",
            width: "max-content",
          }}
        >
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-6"
              style={{
                fontFamily: "var(--font-oswald)",
                fontSize: "0.75rem",
                fontWeight: 900,
                letterSpacing: "0.15em",
                color: "#0a0a0a",
                textTransform: "uppercase",
              }}
            >
              {item}
              <span style={{ fontSize: "0.6rem", opacity: 0.7 }}>◆</span>
            </span>
          ))}
        </div>
        <style>{`
          @keyframes marquee-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </div>

      {/* Display Quote Body */}
      <div className="px-6 py-8 sm:px-10 sm:py-12" itemProp="description">
        <p
          style={{
            fontFamily: "var(--font-oswald)",
            fontSize: "clamp(1rem, 2.5vw, 1.35rem)",
            fontWeight: 700,
            lineHeight: 1.15,
            color: "#ffffff",
            textAlign: "center",
          }}
        >
          <span style={{ color: "#d1d5db" }}>{excerpt}</span>
        </p>
      </div>
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

// ─── Comment Section (Supabase realtime) ───────────────────────────────────
interface Comment {
  id: string
  article_id: string
  name: string
  text: string
  created_at: string
}

function CommentSection({ articleId }: { articleId: string }) {
  const supabaseComments = createClient()
  const [comments, setComments] = useState<Comment[]>([])
  const [name, setName] = useState("")
  const [text, setText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch awal + subscribe realtime
  useEffect(() => {
    setIsLoading(true)
    setError(null)

    // Fetch komentar awal
    supabaseComments
      .from("comments")
      .select("*")
      .eq("article_id", articleId)
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError("Gagal memuat komentar.")
        else setComments((data as Comment[]) || [])
        setIsLoading(false)
      })

    // Subscribe realtime — komentar baru langsung muncul tanpa reload
    const channel = supabaseComments
      .channel(`comments:${articleId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `article_id=eq.${articleId}`,
        },
        (payload) => {
          setComments((prev) => [payload.new as Comment, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabaseComments.removeChannel(channel)
    }
  }, [articleId])

  const handleSubmit = async () => {
    if (!name.trim() || !text.trim()) return
    setIsSubmitting(true)
    setError(null)

    const { error: insertError } = await supabaseComments
      .from("comments")
      .insert({
        article_id: articleId,
        name: name.trim(),
        text: text.trim(),
      })

    if (insertError) {
      setError("Gagal mengirim komentar. Coba lagi.")
    } else {
      setName("")
      setText("")
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 3000)
    }
    setIsSubmitting(false)
  }

  return (
    <section className="mt-10 border-t border-border pt-8" aria-label="Komentar">
      <h2
        className="mb-6 flex items-center gap-2 text-xl font-bold uppercase tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-oswald)" }}
      >
        <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
        Komentar
        {!isLoading && comments.length > 0 && (
          <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary normal-case tracking-normal">
            {comments.length}
          </span>
        )}
      </h2>

      {/* Form komentar */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <p className="mb-4 text-sm font-semibold text-foreground">Tulis Komentar</p>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama Anda"
            maxLength={60}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis komentar Anda di sini..."
            rows={4}
            maxLength={1000}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted-foreground">
              Harap jaga sopan santun dalam berkomentar.
            </p>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !name.trim() || !text.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitted ? (
                <><Check className="h-3.5 w-3.5" />Terkirim!</>
              ) : isSubmitting ? (
                <>Mengirim...</>
              ) : (
                <><Send className="h-3.5 w-3.5" />Kirim Komentar</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Daftar komentar */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-card px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
              <div className="h-3 w-full rounded bg-muted" />
              <div className="mt-1 h-3 w-3/4 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Belum ada komentar. Jadilah yang pertama berkomentar!
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card px-5 py-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-foreground">{c.name}</span>
                <time
                  dateTime={c.created_at}
                  className="text-xs text-muted-foreground"
                >
                  {new Date(c.created_at).toLocaleDateString("id-ID", {
                    day: "numeric", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </time>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
interface ArticleDetailProps {
  articleId: string
  /** Data artikel dari server (SSR). Jika ada, skip loading state awal. */
  initialData?: {
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
    updated_at: string | null
    categories: { name: string; slug: string } | null
  } | null
  /** Artikel terkait (tag sama → fallback kategori sama), sudah di-resolve di server. */
  relatedArticles?: RelatedArticle[]
}

export function ArticleDetail({ articleId, initialData, relatedArticles = [] }: ArticleDetailProps) {
  const [article, setArticle] = useState<Article | null>(
    initialData ? { ...(initialData as any), article_tags: (initialData as any).article_tags ?? null } as Article : null
  )
  const [isLoading, setIsLoading] = useState(!initialData)
  const [toc, setToc] = useState<TocItem[]>([])
  const [processedContent, setProcessedContent] = useState("")
  // rawContent: konten asli dari DB, dipakai untuk ArticleBody agar
  // parseWidgetContent bisa mendeteksi marker widget tanpa terdistorsi DOMParser
  const [rawContent, setRawContent] = useState("")
  // fontSize: 0 = normal, -1 = kecil, 1 = besar
  const [fontSize, setFontSize] = useState<0 | -1 | 1>(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // ── Inisialisasi tab interaktif (hanya untuk konten non-widget) ──────────
  useEffect(() => {
    if (!processedContent) return
    // Jika konten mengandung widget placeholder, tab init dilewati
    // karena ArticleBody menangani renderingnya sendiri
    if (hasWidgetPlaceholder(processedContent)) return
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
    const timer = setTimeout(init, 80)
    return () => clearTimeout(timer)
  }, [processedContent])

  // Prose classes
  const proseClass = [
    "max-w-none prose prose-lg prose-invert",
    "prose-headings:font-black prose-headings:scroll-mt-24",
    "prose-headings:text-foreground prose-p:text-foreground/90",
    "prose-h1:text-3xl prose-h1:mt-8 prose-h1:mb-4",
    "prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:pb-2 prose-h2:border-border",
    "prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3",
    "prose-p:leading-relaxed prose-p:mb-5 prose-p:text-[17px] sm:prose-p:text-lg",
    "prose-a:text-[#39FF14] prose-a:no-underline hover:prose-a:underline prose-a:font-semibold",
    "prose-strong:text-foreground prose-strong:font-semibold",
    "prose-img:rounded-xl prose-img:w-full prose-img:my-6",
    "prose-blockquote:border-l-primary prose-blockquote:border-l-2",
    "prose-blockquote:bg-secondary/50 prose-blockquote:text-foreground/70",
    "prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:not-italic",
    "prose-code:text-primary prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:bg-secondary",
    "prose-code:before:content-none prose-code:after:content-none",
    "prose-ul:text-foreground/90 prose-ol:text-foreground/90",
    "prose-li:my-1",
    "prose-table:w-full prose-table:border-collapse prose-table:my-6 prose-table:text-sm prose-table:overflow-hidden prose-table:rounded-lg",
    "prose-th:border prose-th:border-border prose-th:bg-secondary/80",
    "prose-th:text-foreground prose-th:font-semibold",
    "prose-td:border prose-td:border-border prose-td:text-foreground/80",
    "[&_tbody_tr:nth-child(even)]:bg-secondary/30",
    "prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:text-sm",
    "prose-td:px-4 prose-td:py-2.5 prose-td:align-top",
    "prose-hr:border-border prose-hr:my-8",
    "[&_.tabbed-block]:rounded-xl [&_.tabbed-block]:border [&_.tabbed-block]:border-border [&_.tabbed-block]:overflow-hidden [&_.tabbed-block]:my-6",
    "[&_.tb-nav]:flex [&_.tb-nav]:flex-wrap [&_.tb-nav]:gap-1.5 [&_.tb-nav]:p-2.5 [&_.tb-nav]:bg-secondary/40 [&_.tb-nav]:border-b [&_.tb-nav]:border-border",
    "[&_.tbb]:rounded-md [&_.tbb]:px-3 [&_.tbb]:py-1.5 [&_.tbb]:text-xs [&_.tbb]:font-semibold [&_.tbb]:cursor-pointer [&_.tbb]:border [&_.tbb]:border-border [&_.tbb]:bg-secondary [&_.tbb]:text-muted-foreground [&_.tbb]:transition-colors [&_.tbb]:select-none",
    "[&_.tbb-active]:bg-primary [&_.tbb-active]:border-primary [&_.tbb-active]:!text-black",
    "[&_.tb-content]:p-4 [&_.tb-content]:bg-card",
    "[&_.tbp]:hidden",
    "[&_.tbp-active]:block",
    "[&_.match-block]:my-6",
    "[&_.match-card-grid]:grid [&_.match-card-grid]:gap-4 [&_.match-card-grid]:my-2 [&_.match-card-grid]:grid-cols-1 sm:[&_.match-card-grid]:grid-cols-2",
    "[&_.match-card]:rounded-xl [&_.match-card]:border [&_.match-card]:border-border [&_.match-card]:bg-secondary/30 [&_.match-card]:p-4 [&_.match-card]:flex [&_.match-card]:flex-col [&_.match-card]:gap-2.5",
    "[&_.match-card-top]:flex [&_.match-card-top]:items-center [&_.match-card-top]:justify-between",
    "[&_.match-card-badge]:rounded-full [&_.match-card-badge]:bg-primary [&_.match-card-badge]:text-[10px] [&_.match-card-badge]:font-extrabold [&_.match-card-badge]:tracking-wide [&_.match-card-badge]:text-black [&_.match-card-badge]:px-2.5 [&_.match-card-badge]:py-0.5",
    "[&_.match-card-date]:text-xs [&_.match-card-date]:text-muted-foreground",
    "[&_.match-card-teams]:flex [&_.match-card-teams]:items-center [&_.match-card-teams]:justify-between [&_.match-card-teams]:gap-2",
    "[&_.match-card-team]:text-base [&_.match-card-team]:font-bold [&_.match-card-team]:text-foreground",
    "[&_.match-card-vs]:text-sm [&_.match-card-vs]:font-bold [&_.match-card-vs]:text-primary",
    "[&_.match-card-score]:flex [&_.match-card-score]:items-center [&_.match-card-score]:gap-1 [&_.match-card-score]:rounded-md [&_.match-card-score]:bg-primary/10 [&_.match-card-score]:px-2.5 [&_.match-card-score]:py-0.5 [&_.match-card-score]:text-base [&_.match-card-score]:font-extrabold [&_.match-card-score]:text-primary [&_.match-card-score]:tabular-nums",
    "[&_.match-card-score-sep]:text-muted-foreground [&_.match-card-score-sep]:font-normal",
    "[&_.match-card-bottom]:flex [&_.match-card-bottom]:items-center [&_.match-card-bottom]:justify-between [&_.match-card-bottom]:flex-wrap [&_.match-card-bottom]:gap-2",
    "[&_.match-card-time]:rounded [&_.match-card-time]:border [&_.match-card-time]:border-border [&_.match-card-time]:bg-black/30 [&_.match-card-time]:px-2 [&_.match-card-time]:py-1 [&_.match-card-time]:text-xs [&_.match-card-time]:font-bold [&_.match-card-time]:text-foreground",
    "[&_.match-card-stadium]:text-xs [&_.match-card-stadium]:text-muted-foreground",
    "[&_.group-standings-block]:my-6",
    "[&_.gs-header]:flex [&_.gs-header]:items-center [&_.gs-header]:gap-2 [&_.gs-header]:px-4 [&_.gs-header]:py-3 [&_.gs-header]:border-b [&_.gs-header]:border-border [&_.gs-header]:bg-secondary/20",
    "[&_.gs-header-icon]:text-lg",
    "[&_.gs-header-title]:flex-1 [&_.gs-header-title]:font-bold [&_.gs-header-title]:text-foreground [&_.gs-header-title]:text-sm",
    "[&_.gs-header-sub]:text-xs [&_.gs-header-sub]:text-muted-foreground",
    "[&_.gs-table-wrap]:overflow-x-auto",
    "[&_.gs-table]:w-full [&_.gs-table]:border-collapse [&_.gs-table]:text-xs [&_.gs-table]:m-0",
    "[&_.gs-thead-row]:border-b [&_.gs-thead-row]:border-border",
    "[&_.gs-th]:px-2 [&_.gs-th]:py-2.5 [&_.gs-th]:text-[10px] [&_.gs-th]:font-bold [&_.gs-th]:uppercase [&_.gs-th]:tracking-wider [&_.gs-th]:text-muted-foreground",
    "[&_.gs-th-rank]:text-left [&_.gs-th-rank]:pl-3",
    "[&_.gs-th-team]:text-left",
    "[&_.gs-th-num]:text-center",
    "[&_.gs-th-pts]:text-center [&_.gs-th-pts]:text-primary",
    "[&_.gs-th-form]:text-center",
    "[&_.gs-row]:border-b [&_.gs-row]:border-border/40 [&_.gs-row]:transition-colors hover:[&_.gs-row]:bg-secondary/30",
    "[&_.gs-td]:px-2 [&_.gs-td]:py-2",
    "[&_.gs-td-rank]:pl-3",
    "[&_.gs-td-num]:text-center [&_.gs-td-num]:text-muted-foreground",
    "[&_.gs-td-pts]:text-center [&_.gs-td-pts]:font-bold [&_.gs-td-pts]:text-foreground",
    "[&_.gs-td-form]:text-center",
    "[&_.gs-td-team]:min-w-[130px]",
    "[&_.gs-rank]:inline-flex [&_.gs-rank]:h-5 [&_.gs-rank]:w-5 [&_.gs-rank]:items-center [&_.gs-rank]:justify-center [&_.gs-rank]:rounded [&_.gs-rank]:text-[10px] [&_.gs-rank]:font-bold",
    "[&_.gs-rank-qualify]:bg-primary/15 [&_.gs-rank-qualify]:text-primary [&_.gs-rank-qualify]:border-l-2 [&_.gs-rank-qualify]:border-l-primary",
    "[&_.gs-rank-candidate]:bg-yellow-500/15 [&_.gs-rank-candidate]:text-yellow-500",
    "[&_.gs-rank-out]:text-muted-foreground",
    "[&_.gs-flag]:inline-flex [&_.gs-flag]:items-center [&_.gs-flag]:justify-center [&_.gs-flag]:rounded [&_.gs-flag]:bg-secondary [&_.gs-flag]:px-1 [&_.gs-flag]:text-[10px] [&_.gs-flag]:font-bold [&_.gs-flag]:text-muted-foreground [&_.gs-flag]:mr-1.5 [&_.gs-flag]:shrink-0",
    "[&_.gs-team-name]:text-sm [&_.gs-team-name]:font-medium [&_.gs-team-name]:text-foreground",
    "[&_.gs-form]:flex [&_.gs-form]:gap-0.5 [&_.gs-form]:justify-center",
    "[&_.gs-form-badge]:inline-flex [&_.gs-form-badge]:h-4 [&_.gs-form-badge]:w-4 [&_.gs-form-badge]:items-center [&_.gs-form-badge]:justify-center [&_.gs-form-badge]:rounded-full [&_.gs-form-badge]:text-[8px] [&_.gs-form-badge]:font-bold",
    "[&_.gs-form-w]:bg-green-500/20 [&_.gs-form-w]:text-green-400",
    "[&_.gs-form-d]:bg-yellow-500/20 [&_.gs-form-d]:text-yellow-400",
    "[&_.gs-form-l]:bg-destructive/20 [&_.gs-form-l]:text-destructive",
    "[&_.gs-legend]:flex [&_.gs-legend]:flex-wrap [&_.gs-legend]:gap-4 [&_.gs-legend]:px-3 [&_.gs-legend]:py-2 [&_.gs-legend]:border-t [&_.gs-legend]:border-border/40",
    "[&_.gs-legend-item]:text-[10px] [&_.gs-legend-item]:text-muted-foreground",
    "[&_.gs-legend-qualify]:text-primary",
    "[&_.gs-legend-candidate]:text-yellow-500",
  ].join(" ")

  // Shared prose + card-table classes untuk kedua mode render
  const contentClassName = [
    proseClass,
    "[&_.card-table-block]:grid [&_.card-table-block]:gap-4 [&_.card-table-block]:grid-cols-1 sm:[&_.card-table-block]:grid-cols-2",
    "[&_.card-table-card]:border-border [&_.card-table-card]:bg-secondary/40 [&_.card-table-label]:text-primary [&_.card-table-value]:text-foreground/90",
    "[&_.card-design]:grid [&_.card-design]:gap-4 [&_.card-design]:my-6 [&_.card-design]:grid-cols-1 sm:[&_.card-design]:grid-cols-2",
    "[&_.card-design-card]:border-border [&_.card-design-card]:bg-secondary/40 [&_.card-design-label]:text-primary [&_.card-design-value]:text-foreground/90",
  ].join(" ")

  useEffect(() => {
    // Jika initialData sudah dikirim dari server, proses kontennya tanpa fetch ulang
    if (initialData) {
      if (initialData.content) {
        const cleanedContent = cleanLegacyBadgeContent(initialData.content)
        setRawContent(cleanedContent)
        const html = contentToHtml(cleanedContent)
        const injected = injectHeadingIds(html)
        setProcessedContent(injected)
        setToc(extractToc(injected))
      }
      trackArticleView(articleId).catch(() => {})
      return
    }

    async function fetchArticle() {
      let { data } = await supabase
        .from("articles")
        .select("*, categories(name, slug), article_tags(tags(name, slug))")
        .eq("id", articleId)
        .eq("status", "published")
        .maybeSingle()

      if (!data) {
        const fallback = await supabase
          .from("articles")
          .select("*, categories(name, slug), article_tags(tags(name, slug))")
          .eq("id", articleId)
          .maybeSingle()
        data = fallback.data
      }

      if (data) {
        setArticle(data as Article)
        await trackArticleView(articleId)

        if (data.content) {
          // Sanitasi badge HTML lama sebelum masuk ke state apapun
          const cleanedContent = cleanLegacyBadgeContent(data.content)
          // rawContent bersih dikirim ke ArticleBody untuk widget detection
          setRawContent(cleanedContent)
          const html = contentToHtml(cleanedContent)
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

  return (
    <>
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
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start">

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
                    <ExcerptMarqueeCard
                      excerpt={article.excerpt}
                      category={article.categories?.name}
                      contentType={article.content_type}
                    />
                  )}

                  {/* Meta row */}
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
                    {article.updated_at && article.updated_at !== article.published_at && article.updated_at !== article.created_at && (
                      <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        <RefreshCw className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                        <time
                          dateTime={article.updated_at}
                          itemProp="dateModified"
                          title="Artikel ini telah diperbarui"
                        >
                          Diperbarui: {formatDateTime(article.updated_at)}
                        </time>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      {readingTime} menit baca
                    </span>
                  </div>

                  {/* Share + Font Size control — top */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <ShareButtons title={article.title} />

                    {/* Font size control */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 px-2 py-1">
                      <button
                        onClick={() => setFontSize(fontSize === -1 ? 0 : -1)}
                        title="Perkecil tulisan"
                        className={[
                          "flex h-7 w-9 items-center justify-center rounded text-xs font-bold transition-colors",
                          fontSize === -1
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        ].join(" ")}
                      >
                        A-
                      </button>
                      <div className="h-4 w-px bg-border" />
                      <button
                        onClick={() => setFontSize(0)}
                        title="Ukuran normal"
                        className={[
                          "flex h-7 w-7 items-center justify-center rounded text-sm font-bold transition-colors",
                          fontSize === 0
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        ].join(" ")}
                      >
                        A
                      </button>
                      <div className="h-4 w-px bg-border" />
                      <button
                        onClick={() => setFontSize(fontSize === 1 ? 0 : 1)}
                        title="Perbesar tulisan"
                        className={[
                          "flex h-7 w-9 items-center justify-center rounded text-sm font-bold transition-colors",
                          fontSize === 1
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        ].join(" ")}
                      >
                        A+
                      </button>
                    </div>
                  </div>

                </header>

                {/* TOC mobile */}
                {toc.length > 0 && (
                  <div className="mb-6 lg:hidden">
                    <TableOfContents items={toc} />
                  </div>
                )}

                {/* Featured image */}
                {article.featured_image_url && (
                  <figure className="mb-8 rounded-xl" itemProp="image" itemScope itemType="https://schema.org/ImageObject">
                    <Image
                      src={article.featured_image_url}
                      alt={article.featured_image_alt || article.title}
                      width={1200}
                      height={630}
                      priority
                      className="w-full object-cover max-h-[480px] rounded-xl"
                      itemProp="url"
                    />
                    {(article.featured_image_caption || article.featured_image_alt) && (() => {
                      // Coba parse sebagai JSON structured caption
                      let structured: {
                        photoTitle?: string
                        photographer?: string; photographerUrl?: string
                        source?: string; sourceUrl?: string
                        license?: string; licenseUrl?: string
                      } | null = null
                      if (article.featured_image_caption) {
                        try { structured = JSON.parse(article.featured_image_caption) } catch { /* plain text lama */ }
                      }

                      return (
                        <figcaption className="mt-2 flex items-start gap-2 rounded-b-lg border border-t-0 border-primary/10 bg-[#0d1a0d]/80 px-3 py-2.5 text-xs text-muted-foreground backdrop-blur-sm">
                          <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="leading-relaxed">
                            {structured ? (
                              <>
                                <span className="font-semibold text-muted-foreground/80">Foto: </span>
                                {structured.photoTitle && (
                                  <span>{structured.photoTitle}</span>
                                )}
                                {structured.photographer && (
                                  <>{structured.photoTitle ? " oleh " : ""}{structured.photographerUrl
                                    ? <a href={structured.photographerUrl} target="_blank" rel="noopener noreferrer" className="text-primary/90 underline underline-offset-2 hover:text-primary transition-colors">{structured.photographer}</a>
                                    : <span>{structured.photographer}</span>
                                  }</>
                                )}
                                {structured.source && (
                                  <>{(structured.photoTitle || structured.photographer) ? " / " : ""}{structured.sourceUrl
                                    ? <a href={structured.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary/90 underline underline-offset-2 hover:text-primary transition-colors">{structured.source}</a>
                                    : <span>{structured.source}</span>
                                  }</>
                                )}
                                {structured.license && (
                                  <>{" — "}{structured.licenseUrl
                                    ? <a href={structured.licenseUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/20 transition-colors no-underline">{structured.license}</a>
                                    : <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-secondary text-muted-foreground ring-1 ring-border">{structured.license}</span>
                                  }</>
                                )}
                              </>
                            ) : (
                              // Fallback: plain text caption lama
                              <>
                                <span className="font-semibold text-muted-foreground/80">Foto: </span>
                                {article.featured_image_caption || article.featured_image_alt}
                              </>
                            )}
                          </span>
                        </figcaption>
                      )
                    })()}
                    <meta itemProp="width" content="1200" />
                    <meta itemProp="height" content="630" />
                  </figure>
                )}

                <div
                  style={{
                    fontSize:
                      fontSize === -1 ? "0.9em" :
                      fontSize === 1  ? "1.12em" :
                      undefined,
                  }}
                >
                  <ArticleBody
                    content={hasWidgetPlaceholder(rawContent) ? rawContent : (processedContent || rawContent || article.content || "")}
                    isAdmin={false}
                    className={contentClassName}
                  />
                </div>

                {/* Share — bottom */}
                <div className="mt-8 border-t pt-6 border-border">
                  <ShareButtons title={article.title} />
                </div>

                {/* Tags — bottom */}
                {article.article_tags && article.article_tags.length > 0 && (
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                    {article.article_tags.map(({ tags: tag }) => tag && (
                      <a
                        key={tag.slug}
                        href={`/tag/${tag.slug}`}
                        className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        #{tag.name}
                      </a>
                    ))}
                  </div>
                )}

                {/* Artikel Terkait — 3 artikel, prioritas tag sama lalu kategori sama */}
                <RelatedArticles articles={relatedArticles} />

                {/* Author card */}
                <div className="mt-6">
                  <AuthorCard />
                </div>

                {/* Comment section */}
                <CommentSection articleId={article.id} />
              </article>

              {/* ── Sidebar ToC desktop ── */}
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
