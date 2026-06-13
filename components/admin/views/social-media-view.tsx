"use client"

import { useState, useEffect } from "react"
import {
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  Download,
  Send,
  Instagram,
  Twitter,
  Facebook,
  RefreshCw,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  AlertCircle,
  ChevronDown,
  Bot,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

// ─── Model list (sinkron dengan route) ───────────────────────────────────────

const MODELS = [
  { id: "anthropic/claude-sonnet-4-5",        label: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-3-5-haiku",         label: "Claude Haiku 3.5" },
  { id: "google/gemini-2.0-flash-001",        label: "Gemini 2.0 Flash" },
  { id: "google/gemini-2.5-pro",              label: "Gemini 2.5 Pro" },
  { id: "openai/gpt-4o-mini",                 label: "GPT-4o Mini" },
  { id: "openai/gpt-4o",                      label: "GPT-4o" },
  { id: "meta-llama/llama-3.3-70b-instruct",  label: "Llama 3.3 70B" },
  { id: "mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1" },
  { id: "deepseek/deepseek-chat-v3-0324",     label: "DeepSeek V3" },
]

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

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORMS: {
  id: Platform
  label: string
  icon: React.ReactNode
  color: string
  maxChars: number
  manual: boolean
}[] = [
  {
    id: "instagram",
    label: "Instagram",
    icon: <Instagram className="h-4 w-4" />,
    color: "#E1306C",
    maxChars: 2200,
    manual: true,
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.28 8.28 0 004.84 1.55V6.79a4.85 4.85 0 01-1.07-.1z" />
      </svg>
    ),
    color: "#69C9D0",
    maxChars: 2200,
    manual: true,
  },
  {
    id: "x",
    label: "X / Twitter",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    color: "#1DA1F2",
    maxChars: 280,
    manual: false,
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: <Facebook className="h-4 w-4" />,
    color: "#1877F2",
    maxChars: 63206,
    manual: true,
  },
  {
    id: "threads",
    label: "Threads",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 192 192" fill="currentColor">
        <path d="M141.537 88.988a66.667 66.667 0 00-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.05l13.863 8.532c5.764-8.7 14.848-10.566 21.957-10.566h.232c8.48.054 14.87 2.521 18.986 7.334 3.012 3.517 5.018 8.364 5.978 14.465a99.978 99.978 0 00-24.4-2.952c-24.48 0-40.22 13.107-40.22 34.765 0 22.172 17.108 34.556 40.22 34.556 19.91 0 36.512-8.222 40.987-35.72a71.998 71.998 0 014.654 7.878c-6.474 9.987-16.553 17.08-31.79 20.087C129.965 139.29 144 121.01 144 99.04c0-3.44-.317-6.8-.907-10.052zm-47.437 40.54c-13.4 0-22.07-6.367-22.07-16.072 0-9.948 8.836-15.885 22.07-15.885 7.3 0 14.223 1.024 20.337 2.955-1.842 17.256-9.67 29.002-20.337 29.002z" />
      </svg>
    ),
    color: "#000000",
    maxChars: 500,
    manual: true,
  },
]

// ─── Model Selector ───────────────────────────────────────────────────────────

function ModelSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = MODELS.find((m) => m.id === value) ?? MODELS[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground hover:border-primary/50 hover:bg-secondary/70 transition-colors"
      >
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">{selected.label}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Pilih Model AI
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onChange(model.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-secondary ${
                    model.id === value
                      ? "text-primary font-semibold bg-primary/5"
                      : "text-foreground"
                  }`}
                >
                  {model.id === value && (
                    <Check className="h-3 w-3 text-primary flex-shrink-0" />
                  )}
                  {model.id !== value && <span className="w-3 flex-shrink-0" />}
                  {model.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Caption Editor Card ──────────────────────────────────────────────────────

function CaptionCard({
  platform,
  value,
  onChange,
  copied,
  onCopy,
  isPublishing,
  onPublish,
}: {
  platform: (typeof PLATFORMS)[number]
  value: string
  onChange: (val: string) => void
  copied: boolean
  onCopy: () => void
  isPublishing?: boolean
  onPublish?: () => void
}) {
  const charCount = value.length
  const overLimit = charCount > platform.maxChars

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border"
        style={{ borderLeft: `3px solid ${platform.color}` }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: platform.color }}>{platform.icon}</span>
          <span className="text-sm font-semibold text-foreground">{platform.label}</span>
          {!platform.manual && (
            <span className="text-[10px] bg-primary/15 text-primary font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
              Auto Post
            </span>
          )}
        </div>
        <span
          className={`text-xs tabular-nums ${
            overLimit ? "text-destructive font-semibold" : "text-muted-foreground"
          }`}
        >
          {charCount} / {platform.maxChars}
        </span>
      </div>

      {/* Textarea */}
      <div className="p-4">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Caption untuk ${platform.label}...`}
          rows={platform.id === "x" ? 3 : 5}
          className="resize-none border-border bg-secondary/30 text-sm leading-relaxed focus-visible:ring-primary"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 pb-4">
        <Button
          size="sm"
          variant="outline"
          onClick={onCopy}
          disabled={!value}
          className="gap-1.5 h-8 text-xs"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-primary" />
              Tersalin
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Salin
            </>
          )}
        </Button>

        {platform.manual ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!value}
            onClick={onCopy}
            className="gap-1.5 h-8 text-xs border-dashed"
          >
            <ExternalLink className="h-3 w-3" />
            Buka {platform.label}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onPublish}
            disabled={!value || overLimit || isPublishing}
            className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isPublishing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Post Sekarang
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SocialMediaView({ onBack, articleId }: SocialMediaViewProps) {
  const supabase = createClient()

  const [article, setArticle] = useState<Article | null>(null)
  const [loadingArticle, setLoadingArticle] = useState(true)

  // Section 1 — Caption Generator
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id)
  const [captions, setCaptions] = useState<Captions>({
    instagram: "",
    tiktok: "",
    x: "",
    facebook: "",
    threads: "",
  })
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [captionError, setCaptionError] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopyState>({})

  // Section 2 — Image Generator
  const [imagePrompt, setImagePrompt] = useState("")
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)

  // Section 3 — Publish X
  const [publishingX, setPublishingX] = useState(false)
  const [publishStatus, setPublishStatus] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  // ── Load article ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadArticle() {
      setLoadingArticle(true)
      const { data, error } = await supabase
        .from("articles")
        .select("id, title, excerpt, featured_image_url, slug")
        .eq("id", articleId)
        .single()

      if (!error && data) {
        setArticle(data)
        setImagePrompt(`Infografis bertema: ${data.title}`)
      }
      setLoadingArticle(false)
    }
    loadArticle()
  }, [articleId])

  // ── Generate Captions ──────────────────────────────────────────────────────

  async function handleGenerateCaptions() {
    if (!article) return
    setGeneratingCaptions(true)
    setCaptionError(null)

    try {
      const response = await fetch("/api/generate-social-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          excerpt: article.excerpt,
          model: selectedModel,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Gagal generate caption")
      }

      const data = await response.json()
      setCaptions(data)
    } catch (err: any) {
      setCaptionError(err.message || "Gagal generate caption. Coba lagi.")
    } finally {
      setGeneratingCaptions(false)
    }
  }

  // ── Copy caption ───────────────────────────────────────────────────────────

  async function handleCopy(platform: Platform) {
    if (!captions[platform]) return
    await navigator.clipboard.writeText(captions[platform])
    setCopied((prev) => ({ ...prev, [platform]: true }))
    setTimeout(() => setCopied((prev) => ({ ...prev, [platform]: false })), 2000)
  }

  // ── Generate Image ─────────────────────────────────────────────────────────

  async function handleGenerateImage() {
    if (!imagePrompt.trim()) return
    setGeneratingImage(true)
    setImageError(null)
    setGeneratedImageUrl(null)

    try {
      const encoded = encodeURIComponent(
        `${imagePrompt}, infografis, desain modern, warna kontras, tipografi jelas, gaya editorial olahraga`
      )
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&seed=${Date.now()}&nologo=true`
      setGeneratedImageUrl(url)
    } catch {
      setImageError("Gagal generate gambar. Coba lagi.")
    } finally {
      setGeneratingImage(false)
    }
  }

  async function handleDownloadImage() {
    if (!generatedImageUrl) return
    const response = await fetch(generatedImageUrl)
    const blob = await response.blob()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `halfspace-infografis-${Date.now()}.jpg`
    a.click()
  }

  // ── Publish ke X ──────────────────────────────────────────────────────────

  async function handlePublishX() {
    if (!captions.x) return
    setPublishingX(true)
    setPublishStatus(null)

    try {
      const response = await fetch("/api/publish-to-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: captions.x, articleSlug: article?.slug }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Gagal publish")
      }

      setPublishStatus({ type: "success", text: "✅ Berhasil diposting ke X!" })
    } catch (err: any) {
      setPublishStatus({ type: "error", text: `❌ ${err.message}` })
    } finally {
      setPublishingX(false)
    }
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
        <Button variant="outline" onClick={onBack} className="mt-4">
          Kembali
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 backdrop-blur px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Social Media</p>
          <p className="text-sm font-semibold text-foreground truncate">{article.title}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-8">

        {/* ── Article Preview (Read-Only) ── */}
        <div className="rounded-xl border border-border bg-card p-4 flex gap-4">
          {article.featured_image_url && (
            <img
              src={article.featured_image_url}
              alt={article.title}
              className="h-16 w-24 rounded-lg object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-primary font-bold mb-1">
              Artikel
            </p>
            <h2 className="text-sm font-bold text-foreground leading-tight mb-1 line-clamp-2">
              {article.title}
            </h2>
            <p className="text-xs text-muted-foreground line-clamp-2">{article.excerpt}</p>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 1 — Caption Generator                                      */}
        {/* ─────────────────────────────────────────────────────────────────── */}

        <section>
          <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">
                  1
                </span>
                Caption Generator
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate caption untuk semua platform sekaligus, lalu edit sesuai kebutuhan.
              </p>
            </div>

            {/* Controls: model selector + generate button */}
            <div className="flex items-center gap-2 flex-wrap">
              <ModelSelector value={selectedModel} onChange={setSelectedModel} />
              <Button
                onClick={handleGenerateCaptions}
                disabled={generatingCaptions}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {generatingCaptions ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Semua
                  </>
                )}
              </Button>
            </div>
          </div>

          {captionError && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {captionError}
            </div>
          )}

          {publishStatus && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm flex items-center gap-2 ${
                publishStatus.type === "success"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {publishStatus.text}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {PLATFORMS.map((platform) => (
              <CaptionCard
                key={platform.id}
                platform={platform}
                value={captions[platform.id]}
                onChange={(val) =>
                  setCaptions((prev) => ({ ...prev, [platform.id]: val }))
                }
                copied={!!copied[platform.id]}
                onCopy={() => handleCopy(platform.id)}
                isPublishing={platform.id === "x" ? publishingX : false}
                onPublish={platform.id === "x" ? handlePublishX : undefined}
              />
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 2 — Image Generator                                        */}
        {/* ─────────────────────────────────────────────────────────────────── */}

        <section>
          <div className="mb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">
                2
              </span>
              Image / Infografis Generator
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generate infografis otomatis via Pollinations.ai — gratis, tanpa API key.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex gap-3">
              <Textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe infografis yang ingin dibuat..."
                rows={2}
                className="resize-none border-border bg-secondary/30 text-sm flex-1"
              />
              <Button
                onClick={handleGenerateImage}
                disabled={generatingImage || !imagePrompt.trim()}
                className="self-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {generatingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                Generate
              </Button>
            </div>

            {imageError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" />
                {imageError}
              </p>
            )}

            {generatingImage && (
              <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-border bg-secondary/20">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-xs text-muted-foreground">Generating gambar...</p>
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
                    onClick={() => {
                      setGeneratedImageUrl(null)
                      handleGenerateImage()
                    }}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Generate Ulang
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDownloadImage}
                    className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 3 — Status Publish                                         */}
        {/* ─────────────────────────────────────────────────────────────────── */}

        <section>
          <div className="mb-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-black">
                3
              </span>
              Status Publish
            </h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-sm font-semibold">X / Twitter</span>
                <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">
                  AUTO
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Gunakan tombol <strong>"Post Sekarang"</strong> di caption X di atas.
              </p>
            </div>

            {[
              { label: "Instagram", url: "https://www.instagram.com/" },
              { label: "TikTok", url: "https://www.tiktok.com/" },
              { label: "Facebook", url: "https://www.facebook.com/" },
              { label: "Threads", url: "https://www.threads.net/" },
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
                  <span className="text-[10px] bg-secondary text-muted-foreground font-medium px-2 py-0.5 rounded-full">
                    Manual
                  </span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Salin caption → buka {p.label}
                  <ExternalLink className="h-3 w-3" />
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
