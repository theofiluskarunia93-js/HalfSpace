"use client"

import { useState, useEffect } from "react"
import {
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  Download,
  Instagram,
  Facebook,
  RefreshCw,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  AlertCircle,
  Wand2,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import type { ContentType, OverlayData } from "@/app/api/generate-image/route"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialMediaViewProps {
  onBack: () => void
  articleId: string
}

interface Article {
  id: string
  title: string
  excerpt: string
  featured_image_url: string | null
  slug: string
}

interface Captions {
  instagram: string
  tiktok: string
  x: string
  facebook: string
  threads: string
}

type Platform = keyof Captions
type CopyState = Partial<Record<Platform, boolean>>

// ─── Ekstrak kalimat pertama dari konten artikel ───────────────────────────────
// Dipakai sebagai hook literal untuk caption X (aturan: "hook = kalimat pertama
// dari artikel sendiri, tanpa basa-basi").

function extractFirstSentence(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return ""
  const match = text.match(/^.*?[.!?](?:\s|$)/)
  return (match ? match[0] : text.slice(0, 160)).trim()
}

// Bersihkan HTML dan potong excerpt ke maks 300 karakter sebelum dikirim ke API.
// Ini mencegah error 400 akibat total token prompt terlalu panjang.
function sanitizeExcerpt(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

// ─── Content type meta ────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  tournament_table:   "Tabel Turnamen",
  match_preview:      "Preview Pertandingan",
  match_result:       "Hasil Pertandingan",
  transfer_rumor:     "Transfer Rumor",
  transfer_done_deal: "Transfer Done Deal",
}

const ALL_CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABELS) as ContentType[]

// ─── Detect content type (mirrors server logic) ───────────────────────────────

function detectContentType(title: string): ContentType {
  const t = title.toLowerCase()
  if (/hasil|skor|menang|kalah|imbang|gol|FT|HT/.test(t))                  return "match_result"
  if (/preview|prediksi laga|head.to.head|pertemuan|lawan/.test(t))        return "match_preview"
  if (/bracket|tabel turnamen|jadwal turnamen|semifinal|perempat final|babak 8|klasemen grup/.test(t))
                                                                            return "tournament_table"
  if (/resmi|done deal|sah|teken kontrak|diumumkan|tanda tangan/.test(t))  return "transfer_done_deal"
  if (/transfer|rumor|kabar|pindah|rekrut|kontrak|bursa|diminati|incar/.test(t))
                                                                            return "transfer_rumor"
  return "match_preview"
}

// ─── Parse overlay data from article title ────────────────────────────────────

function parseOverlayFromTitle(title: string, ct: ContentType): OverlayData {
  const base: OverlayData = { contentType: ct }

  if (ct === "match_preview" || ct === "match_result") {
    // Pattern: "Tim A vs Tim B" or "Tim A x Tim B"
    const vsMatch = title.match(/(.+?)\s+(?:vs\.?|x|melawan)\s+(.+?)(?:\s*[,:\-|]|$)/i)
    if (vsMatch) {
      base.teamHome = vsMatch[1].trim()
      base.teamAway = vsMatch[2].trim()
    }
    // Pattern skor: "3-1" or "3:1"
    const scoreMatch = title.match(/(\d+)\s*[-:]\s*(\d+)/)
    if (scoreMatch) {
      base.scoreHome = scoreMatch[1]
      base.scoreAway = scoreMatch[2]
    }
    // Competition hints
    const compMatch = title.match(/(Liga Champions|Premier League|La Liga|Serie A|Bundesliga|Ligue 1|Liga 1|World Cup|Euro|Copa America|AFCON|AFF Cup|AFC Cup)/i)
    if (compMatch) base.competition = compMatch[1]
  }

  if (ct === "transfer_rumor" || ct === "transfer_done_deal") {
    // Pattern: "Nama Pemain ke Klub" or "Nama Pemain dari Klub ke Klub"
    const toMatch   = title.match(/(.+?)\s+(?:ke|bergabung dengan|menuju)\s+(.+?)(?:\s*[,:\-|]|$)/i)
    const fromMatch = title.match(/dari\s+(.+?)\s+ke/i)
    if (toMatch) {
      base.playerName = toMatch[1].trim()
      base.toClub     = toMatch[2].trim()
    }
    if (fromMatch) base.fromClub = fromMatch[1].trim()
    // Fee — dipakai sebagai "Rumoured Fee" (done deal) atau dibiarkan kosong utk rumor
    const feeMatch = title.match(/(?:senilai|seharga|€|£|\$)?\s*(\d+[\d.,]*\s*(?:juta|miliar|M|B)?)/i)
    if (feeMatch) base.transferFee = feeMatch[0].trim()
  }

  if (ct === "tournament_table") {
    const compMatch = title.match(/(Liga Champions|Premier League|La Liga|Serie A|Bundesliga|Ligue 1|Liga 1|World Cup|Piala Dunia|Euro|Copa America|AFCON|AFF Cup|AFC Cup)/i)
    if (compMatch) base.tournamentName = compMatch[1]
    const stageMatch = title.match(/(semifinal|perempat final|babak 8|babak 16|final|grup [A-H])/i)
    if (stageMatch) base.tournamentStage = stageMatch[1]
  }

  return base
}

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORMS: {
  id: Platform
  label: string
  icon: React.ReactNode
  color: string
  maxChars: number
  manual: boolean
}[] = [
  { id: "instagram", label: "Instagram", icon: <Instagram className="h-4 w-4" />, color: "#E1306C", maxChars: 2200, manual: true },
  {
    id: "tiktok", label: "TikTok",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.28 8.28 0 004.84 1.55V6.79a4.85 4.85 0 01-1.07-.1z" />
      </svg>
    ),
    color: "#69C9D0", maxChars: 2200, manual: true,
  },
  {
    id: "x", label: "X / Twitter",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    color: "#1DA1F2", maxChars: 280, manual: true,
  },
  { id: "facebook", label: "Facebook", icon: <Facebook className="h-4 w-4" />, color: "#1877F2", maxChars: 63206, manual: true },
  {
    id: "threads", label: "Threads",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 192 192" fill="currentColor">
        <path d="M141.537 88.988a66.667 66.667 0 00-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.05l13.863 8.532c5.764-8.7 14.848-10.566 21.957-10.566h.232c8.48.054 14.87 2.521 18.986 7.334 3.012 3.517 5.018 8.364 5.978 14.465a99.978 99.978 0 00-24.4-2.952c-24.48 0-40.22 13.107-40.22 34.765 0 22.172 17.108 34.556 40.22 34.556 19.91 0 36.512-8.222 40.987-35.72a71.998 71.998 0 014.654 7.878c-6.474 9.987-16.553 17.08-31.79 20.087C129.965 139.29 144 121.01 144 99.04c0-3.44-.317-6.8-.907-10.052zm-47.437 40.54c-13.4 0-22.07-6.367-22.07-16.072 0-9.948 8.836-15.885 22.07-15.885 7.3 0 14.223 1.024 20.337 2.955-1.842 17.256-9.67 29.002-20.337 29.002z" />
      </svg>
    ),
    color: "#000000", maxChars: 500, manual: true,
  },
]

// ─── Overlay field definitions per content type ───────────────────────────────

interface FieldDef {
  key: keyof OverlayData
  label: string
  placeholder: string
  required?: boolean
  /** Default "input" (single line). Pakai "textarea" untuk field multi-baris (mis. daftar laga turnamen). */
  type?: "input" | "textarea"
}

const OVERLAY_FIELDS: Partial<Record<ContentType, FieldDef[]>> = {
  tournament_table: [
    { key: "tournamentName",  label: "Nama Turnamen", placeholder: "Piala Dunia 2026",  required: true },
    { key: "tournamentStage", label: "Babak",         placeholder: "Semifinal" },
    {
      key: "matchupsText",
      label: "Daftar Laga (1 baris = 1 laga, format: Tim A vs Tim B)",
      placeholder: "Argentina vs Brasil\nPortugal vs Spanyol",
      required: true,
      type: "textarea",
    },
  ],
  match_preview: [
    { key: "teamHome",    label: "Tim Kandang",  placeholder: "Real Madrid",     required: true },
    { key: "teamAway",    label: "Tim Tandang",  placeholder: "Barcelona",        required: true },
    { key: "competition", label: "Kompetisi",    placeholder: "Liga Champions" },
    { key: "matchDate",   label: "Tanggal",      placeholder: "Sabtu, 14 Jun 2025" },
    { key: "venue",       label: "Venue",        placeholder: "Santiago Bernabéu" },
  ],
  match_result: [
    { key: "teamHome",    label: "Tim Kandang",  placeholder: "Real Madrid",  required: true },
    { key: "scoreHome",   label: "Skor Kandang", placeholder: "3",            required: true },
    { key: "scoreAway",   label: "Skor Tandang", placeholder: "1",            required: true },
    { key: "teamAway",    label: "Tim Tandang",  placeholder: "Barcelona",    required: true },
    { key: "competition", label: "Kompetisi",    placeholder: "Liga Champions" },
    { key: "matchDate",   label: "Tanggal",      placeholder: "14 Jun 2025" },
  ],
  transfer_rumor: [
    { key: "playerName",       label: "Nama Pemain",          placeholder: "Kylian Mbappé",  required: true },
    { key: "fromClub",         label: "Klub Saat Ini",        placeholder: "PSG" },
    { key: "toClub",           label: "Klub Tujuan (Rumor)",  placeholder: "Real Madrid",    required: true },
    { key: "transferFee",      label: "Nilai Transfer (opsional)",  placeholder: "€80 Juta" },
    { key: "rumorProbability", label: "Peluang Transfer (opsional)", placeholder: "70%" },
  ],
  transfer_done_deal: [
    { key: "playerName",  label: "Nama Pemain",     placeholder: "Kylian Mbappé",   required: true },
    { key: "fromClub",    label: "Dari Klub",       placeholder: "PSG",             required: true },
    { key: "toClub",      label: "Ke Klub",         placeholder: "Real Madrid",     required: true },
    { key: "transferFee", label: "Rumoured/Nilai Transfer", placeholder: "€180 Juta" },
    { key: "marketValue", label: "Market Value",   placeholder: "€2.5 Juta" },
    { key: "position",    label: "Posisi",          placeholder: "Centre-Back" },
  ],
}

// ─── Caption Card ─────────────────────────────────────────────────────────────

function CaptionCard({
  platform, value, onChange, copied, onCopy,
}: {
  platform: (typeof PLATFORMS)[number]
  value: string
  onChange: (val: string) => void
  copied: boolean
  onCopy: () => void
}) {
  const charCount = value.length
  const overLimit = charCount > platform.maxChars

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border" style={{ borderLeft: `3px solid ${platform.color}` }}>
        <div className="flex items-center gap-2">
          <span style={{ color: platform.color }}>{platform.icon}</span>
          <span className="text-sm font-semibold text-foreground">{platform.label}</span>
        </div>
        <span className={`text-xs tabular-nums ${overLimit ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          {charCount} / {platform.maxChars}
        </span>
      </div>

      <div className="p-4">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Caption untuk ${platform.label}...`}
          rows={platform.id === "x" ? 3 : 5}
          className="resize-none border-border bg-secondary/30 text-sm leading-relaxed focus-visible:ring-primary"
        />
      </div>

      <div className="flex items-center justify-end gap-2 px-4 pb-4">
        <Button size="sm" variant="outline" onClick={onCopy} disabled={!value} className="gap-1.5 h-8 text-xs">
          {copied ? <><Check className="h-3 w-3 text-primary" />Tersalin</> : <><Copy className="h-3 w-3" />Salin</>}
        </Button>
        <Button size="sm" variant="outline" disabled={!value} onClick={onCopy} className="gap-1.5 h-8 text-xs border-dashed">
          <ExternalLink className="h-3 w-3" />Buka {platform.label}
        </Button>
      </div>
    </div>
  )
}

// ─── Overlay Form ─────────────────────────────────────────────────────────────

function OverlayForm({
  overlay,
  onChange,
  onContentTypeChange,
}: {
  overlay: OverlayData
  onChange: (patch: Partial<OverlayData>) => void
  onContentTypeChange: (ct: ContentType) => void
}) {
  const fields = OVERLAY_FIELDS[overlay.contentType] ?? OVERLAY_FIELDS.match_preview!

  return (
    <div className="space-y-3">
      {/* Content type selector */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
          Tipe Konten
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CONTENT_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => onContentTypeChange(ct)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                overlay.contentType === ct
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {CONTENT_TYPE_LABELS[ct]}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic fields */}
      <div className="grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <div key={field.key} className={field.type === "textarea" ? "col-span-2" : ""}>
            <label className="text-xs text-muted-foreground mb-1 block">
              {field.label}
              {field.required && <span className="text-primary ml-0.5">*</span>}
            </label>
            {field.type === "textarea" ? (
              <Textarea
                value={(overlay[field.key] as string) ?? ""}
                onChange={(e) => onChange({ [field.key]: e.target.value })}
                placeholder={field.placeholder}
                rows={4}
                className="text-xs border-border bg-secondary/30 focus-visible:ring-primary resize-none"
              />
            ) : (
              <Input
                value={(overlay[field.key] as string) ?? ""}
                onChange={(e) => onChange({ [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className="h-8 text-xs border-border bg-secondary/30 focus-visible:ring-primary"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SocialMediaView({ onBack, articleId }: SocialMediaViewProps) {
  const supabase = createClient()

  const [article, setArticle]           = useState<Article | null>(null)
  const [loadingArticle, setLoadingArticle] = useState(true)

  // Section 1 — Caption
  const [firstSentence, setFirstSentence] = useState("")
  const [captions, setCaptions] = useState<Captions>({ instagram: "", tiktok: "", x: "", facebook: "", threads: "" })
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [captionStep, setCaptionStep] = useState<string | null>(null)
  const [captionError, setCaptionError] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopyState>({})

  // Section 2 — Image Generator
  const [imagePrompt, setImagePrompt]           = useState("")
  const [overlay, setOverlay]                   = useState<OverlayData>({ contentType: "match_preview" })
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [generatingImage, setGeneratingImage]   = useState(false)
  const [imageError, setImageError]             = useState<string | null>(null)
  const [showOverlayForm, setShowOverlayForm]   = useState(true)

  // ── Load article ───────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadArticle() {
      setLoadingArticle(true)
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, excerpt, content, featured_image_url, slug")
        .eq("id", articleId)
        .single()

      if (!error && data) {
        setArticle({
          id: data.id,
          title: data.title,
          excerpt: data.excerpt,
          featured_image_url: data.featured_image_url,
          slug: data.slug,
        })
        setFirstSentence(extractFirstSentence(data.content || ""))

        // Auto-detect & parse overlay from title
        const ct = detectContentType(data.title)
        const parsed = parseOverlayFromTitle(data.title, ct)
        setOverlay(parsed)
        setImagePrompt(data.title)
      }
      setLoadingArticle(false)
    }
    loadArticle()
  }, [articleId])

  // ── Caption ────────────────────────────────────────────────────────────────

  async function handleGenerateCaptions() {
    if (!article || generatingCaptions) return
    setGeneratingCaptions(true)
    setCaptionError(null)
    setCaptionStep("Mengirim data artikel ke Gemini 3.5 Flash...")
    try {
      setCaptionStep("Gemini 3.5 Flash sedang menyusun caption untuk 5 platform...")
      const response = await fetch("/api/generate-social-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          excerpt: sanitizeExcerpt(article.excerpt),
          firstSentence,
          slug: article.slug,
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Gagal generate caption")
      }
      setCaptionStep("Memproses hasil dari Gemini...")
      setCaptions(await response.json())
      setCaptionStep(null)
    } catch (err: any) {
      setCaptionStep(null)
      setCaptionError(err.message || "Gagal generate caption. Coba lagi.")
    } finally {
      setGeneratingCaptions(false)
    }
  }

  async function handleCopy(platform: Platform) {
    if (!captions[platform]) return
    await navigator.clipboard.writeText(captions[platform])
    setCopied((prev) => ({ ...prev, [platform]: true }))
    setTimeout(() => setCopied((prev) => ({ ...prev, [platform]: false })), 2000)
  }

  // ── Image ──────────────────────────────────────────────────────────────────

  async function handleGenerateImage() {
    if (!imagePrompt.trim() || generatingImage) return
    setGeneratingImage(true)
    setImageError(null)
    setGeneratedImageUrl(null)

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt, overlay }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Gagal generate gambar")
      }
      const blob = await response.blob()
      setGeneratedImageUrl(URL.createObjectURL(blob))
    } catch (err: any) {
      setImageError(err.message || "Gagal generate gambar. Coba lagi.")
    } finally {
      setGeneratingImage(false)
    }
  }

  function handleDownloadImage() {
    if (!generatedImageUrl) return
    const a = document.createElement("a")
    a.href = generatedImageUrl
    a.download = `halfspace-infografis-${Date.now()}.jpg`
    a.click()
  }

  function handleOverlayContentTypeChange(ct: ContentType) {
    // Re-parse from current prompt when user switches type
    const parsed = parseOverlayFromTitle(imagePrompt, ct)
    setOverlay(parsed)
    setGeneratedImageUrl(null)
  }

  function handleOverlayChange(patch: Partial<OverlayData>) {
    setOverlay((prev) => ({ ...prev, ...patch }))
    setGeneratedImageUrl(null)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loadingArticle) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!article) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertCircle className="mx-auto mb-3 h-8 w-8" />
        <p>Artikel tidak ditemukan.</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Kembali</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 backdrop-blur px-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Social Media</p>
          <p className="text-sm font-semibold text-foreground truncate">{article.title}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-8">

        {/* Article preview */}
        <div className="rounded-xl border border-border bg-card p-4 flex gap-4">
          {article.featured_image_url && (
            <img src={article.featured_image_url} alt={article.title} className="h-16 w-24 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-primary font-bold mb-1">Artikel</p>
            <h2 className="text-sm font-bold text-foreground leading-tight mb-1 line-clamp-2">{article.title}</h2>
            <p className="text-xs text-muted-foreground line-clamp-2">{article.excerpt}</p>
          </div>
        </div>

        {/* ── SECTION 1 — Caption Generator ── */}
        <section>
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">1</span>
                Caption Generator
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Generate caption untuk semua platform sekaligus — powered by Gemini 3.5 Flash.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleGenerateCaptions}
                disabled={generatingCaptions}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {generatingCaptions
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
                  : <><Sparkles className="h-4 w-4" />Generate Semua</>}
              </Button>
            </div>
          </div>

          {/* Step indicator saat generating */}
          {generatingCaptions && captionStep && (
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              <span>{captionStep}</span>
            </div>
          )}

          {captionError && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />{captionError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {PLATFORMS.map((platform) => (
              <CaptionCard
                key={platform.id}
                platform={platform}
                value={captions[platform.id]}
                onChange={(val) => setCaptions((prev) => ({ ...prev, [platform.id]: val }))}
                copied={!!copied[platform.id]}
                onCopy={() => handleCopy(platform.id)}
              />
            ))}
          </div>
        </section>

        {/* ── SECTION 2 — Image Generator ── */}
        <section>
          <div className="mb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">2</span>
              Image / Infografis Generator
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Background dihasilkan AI · Teks overlay disesuaikan tipe konten artikel
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">

            {/* Prompt */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Background Prompt
              </label>
              <div className="flex gap-2">
                <Input
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Deskripsikan background gambar..."
                  className="border-border bg-secondary/30 text-sm focus-visible:ring-primary"
                />
              </div>
            </div>

            {/* Overlay form collapsible */}
            <div>
              <button
                type="button"
                onClick={() => setShowOverlayForm((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors mb-2"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Data Overlay Teks
                <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold">
                  {CONTENT_TYPE_LABELS[overlay.contentType]}
                </span>
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showOverlayForm ? "rotate-90" : ""}`} />
              </button>

              {showOverlayForm && (
                <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                  <OverlayForm
                    overlay={overlay}
                    onChange={handleOverlayChange}
                    onContentTypeChange={handleOverlayContentTypeChange}
                  />
                </div>
              )}
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerateImage}
              disabled={generatingImage || !imagePrompt.trim()}
              className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {generatingImage
                ? <><Loader2 className="h-4 w-4 animate-spin" />Generating...</>
                : <><ImageIcon className="h-4 w-4" />Generate Infografis</>}
            </Button>

            {imageError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />{imageError}
              </p>
            )}

            {generatingImage && (
              <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-border bg-secondary/20">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-xs text-muted-foreground">Generating background + overlay teks...</p>
                </div>
              </div>
            )}

            {generatedImageUrl && !generatingImage && (
              <div className="space-y-3">
                <img
                  src={generatedImageUrl}
                  alt="Generated infografis"
                  className="w-full max-w-sm mx-auto rounded-xl border border-border object-cover"
                  onError={() => setImageError("Gambar gagal dimuat. Coba generate ulang.")}
                />
                <div className="flex justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setGeneratedImageUrl(null); handleGenerateImage() }}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />Generate Ulang
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDownloadImage}
                    className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Download className="h-3.5 w-3.5" />Download
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 3 — Status Publish ── */}
        <section>
          <div className="mb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">3</span>
              Status Publish
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {[
              { label: "Instagram", url: "https://www.instagram.com/" },
              { label: "TikTok",    url: "https://www.tiktok.com/" },
              { label: "X / Twitter", url: "https://x.com/" },
              { label: "Facebook",  url: "https://www.facebook.com/" },
              { label: "Threads",   url: "https://www.threads.net/" },
            ].map((p) => (
              <a
                key={p.label}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className="text-[10px] bg-secondary text-muted-foreground font-medium px-2 py-0.5 rounded-full">Manual</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Salin caption → buka {p.label}<ExternalLink className="h-3 w-3" />
                </p>
              </a>
            ))}
          </div>
        </section>

        <div className="h-8" />
      </div>
    </div>
  )
}
