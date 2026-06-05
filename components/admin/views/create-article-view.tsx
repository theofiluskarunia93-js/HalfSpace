"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { Extension } from "@tiptap/core"
import Blockquote from "@tiptap/extension-blockquote"
import Paragraph from "@tiptap/extension-paragraph"
import { StarterKit } from "@tiptap/starter-kit"
import { Image as TiptapImage } from "@tiptap/extension-image"
import { Link as TiptapLink } from "@tiptap/extension-link"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableCell } from "@tiptap/extension-table-cell"
import {
  ArrowLeft, Save, Image as ImageIcon, X, Plus, Eye,
  Bold, Italic, List, ListOrdered, Link2,
  Code2, Minus, Heading1, Heading2, Heading3,
  Undo2, Redo2, Table as TableIcon, Star,
  Pilcrow, MessageSquareQuote,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { ArticleBody } from "@/components/article/ArticleBody"
import { WidgetInserter } from "@/components/widgets/WidgetInserter"
import type { WidgetType } from "@/components/widgets/WidgetInserter"

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateArticleViewProps {
  onBack: () => void
  articleId?: string | null
}

// ─── Toolbar helpers ──────────────────────────────────────────────────────────

function ToolbarButton({
  onClick, active, title, disabled, children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-sm transition-all duration-100",
        "disabled:pointer-events-none disabled:opacity-30",
        active
          ? [
              "text-[#39FF14] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]",
              "bg-[#39FF14]/15 ring-1 ring-[#39FF14]/50",
              "translate-y-px",
            ].join(" ")
          : "text-muted-foreground hover:bg-secondary hover:text-foreground active:translate-y-px active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]",
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function ToolbarSeparator() {
  return <div className="mx-1 h-4 w-px bg-border" aria-hidden />
}

// ─── Shortcode placeholder builder ───────────────────────────────────────────
// Membangun HTML badge yang ditampilkan di editor sebagai representasi visual shortcode.
// Shortcode asli disimpan sebagai data attribute agar bisa diekstrak saat save.

function buildShortcodePlaceholder(widgetId: string, widgetType: WidgetType): string {
  const shortcodeMap: Record<WidgetType, string> = {
    jadwal:                  `[match_data id="${widgetId}"]`,
    klasemen:                `[klasemen_data id="${widgetId}"]`,
    transfer:                `[transfer_data id="${widgetId}"]`,
    peluang:                 `[peluang_data id="${widgetId}"]`,
    analisa_taktis:          `[analisa_taktis_data id="${widgetId}"]`,
    perbandingan_tim:        `[perbandingan_tim_data id="${widgetId}"]`,
    timeline_pertandingan:   `[timeline_pertandingan_data id="${widgetId}"]`,
    profil_stadion:          `[profil_stadion_data id="${widgetId}"]`,
    daftar_pemain:           `[daftar_pemain_data id="${widgetId}"]`,
    pemain_andalan:          `[pemain_andalan_data id="${widgetId}"]`,
  }
  const iconMap: Record<WidgetType, string> = {
    jadwal: "📅", klasemen: "🏆", transfer: "🔄", peluang: "⭐", analisa_taktis: "🧠",
    perbandingan_tim: "⚔️", timeline_pertandingan: "📋",
    profil_stadion: "🏟️", daftar_pemain: "👥", pemain_andalan: "⭐",
  }
  const labelMap: Record<WidgetType, string> = {
    jadwal: "Jadwal Pertandingan", klasemen: "Klasemen Grup",
    transfer: "Transfer Pemain", peluang: "Peluang Juara", analisa_taktis: "Analisa Taktis",
    perbandingan_tim: "Perbandingan Tim", timeline_pertandingan: "Timeline Pertandingan",
    profil_stadion: "Profil Stadion", daftar_pemain: "Daftar Pemain Tim", pemain_andalan: "Pemain Andalan",
  }
  const shortcode = shortcodeMap[widgetType] ?? shortcodeMap.jadwal
  const icon = iconMap[widgetType] ?? "📦"
  const label = labelMap[widgetType] ?? widgetType
  const shortId = widgetId.slice(0, 8)

  return (
    `<div class="widget-shortcode-badge" ` +
    `data-shortcode="${shortcode}" ` +
    `data-widget-id="${widgetId}" ` +
    `data-widget-type="${widgetType}" ` +
    `contenteditable="false" ` +
    `style="` +
      `background:#ffffff;` +
      `border:1.5px solid rgba(57,255,20,0.45);` +
      `border-radius:12px;` +
      `overflow:hidden;` +
      `margin:16px 0;` +
      `box-shadow:0 0 0 1px rgba(57,255,20,0.1),0 4px 16px rgba(57,255,20,0.08);` +
      `cursor:default;` +
      `font-family:inherit;` +
    `">` +
    // Header
    `<div style="` +
      `background:linear-gradient(135deg,#f8fff8 0%,#f0fff0 100%);` +
      `border-bottom:1.5px solid rgba(57,255,20,0.25);` +
      `padding:10px 14px;` +
      `display:flex;align-items:center;justify-content:space-between;` +
    `">` +
      `<div style="display:flex;align-items:center;gap:8px;">` +
        `<span style="font-size:16px;">${icon}</span>` +
        `<span style="font-size:12px;font-weight:800;color:#111;">${label}</span>` +
        `<span style="background:#39FF14;color:#111;font-size:8px;font-weight:900;padding:1px 6px;border-radius:20px;text-transform:uppercase;">WIDGET</span>` +
      `</div>` +
      `<div style="display:flex;align-items:center;gap:6px;">` +
        `<div style="width:6px;height:6px;border-radius:50%;background:#39FF14;box-shadow:0 0 6px #39FF14;"></div>` +
        `<span style="color:#39FF14;font-size:9px;font-weight:700;">AKTIF</span>` +
      `</div>` +
    `</div>` +
    // Body
    `<div style="padding:10px 14px;">` +
      `<code style="font-size:10px;color:#555;background:#f5f5f5;padding:3px 8px;border-radius:6px;">${shortcode}</code>` +
    `</div>` +
    // Footer
    `<div style="padding:4px 14px 10px;display:flex;align-items:center;justify-content:flex-end;gap:4px;">` +
      `<span style="color:#39FF14;font-size:9px;opacity:0.7;">ID: ${shortId}...</span>` +
    `</div>` +
    `</div>`
  )
}

// ─── Ekstrak shortcode dari HTML editor ──────────────────────────────────────
// Membaca shortcode dari badge placeholder (data-shortcode) dan
// juga dari shortcode mentah yang mungkin sudah ada di konten artikel lama.

function resolveShortcodesForSave(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  // Ganti setiap badge placeholder dengan shortcode teks
  doc.querySelectorAll<HTMLElement>(".widget-shortcode-badge").forEach((el) => {
    const shortcode = el.dataset.shortcode
    const p = doc.createElement("p")
    if (shortcode) {
      p.textContent = shortcode
    } else {
      // Fallback: coba ekstrak dari data-widget-id & data-widget-type
      const wId = el.dataset.widgetId
      const wType = el.dataset.widgetType
      if (wId && wType) {
        const scMap: Record<string, string> = {
          jadwal:   `[match_data id="${wId}"]`,
          klasemen: `[klasemen_data id="${wId}"]`,
          transfer: `[transfer_data id="${wId}"]`,
          peluang:  `[peluang_data id="${wId}"]`,
          analisa_taktis:        `[analisa_taktis_data id="${wId}"]`,
          perbandingan_tim:      `[perbandingan_tim_data id="${wId}"]`,
          timeline_pertandingan: `[timeline_pertandingan_data id="${wId}"]`,
        }
        p.textContent = scMap[wType] ?? `[match_data id="${wId}"]`
      } else {
        el.remove()
        return
      }
    }
    // Ganti elemen atau parent <p>-nya
    const parentP = el.closest("p")
    if (parentP && parentP !== el) parentP.replaceWith(p)
    else el.replaceWith(p)
  })

  return doc.body.innerHTML
}

// ─── Custom Blockquote — preserve class="pull-quote" ─────────────────────────
// StarterKit Blockquote default tidak menyimpan attribute class.
// Extension ini override parseHTML & renderHTML agar class pull-quote tetap ada.
const CustomBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (el) => el.getAttribute("class") || null,
        renderHTML: (attrs) => attrs.class ? { class: attrs.class } : {},
      },
    }
  },
})

// ─── Custom Paragraph — preserve class="section-label" ──────────────────────
// StarterKit Paragraph tidak menyimpan attribute class sama sekali.
// Extension ini membuatnya bisa menyimpan class agar section-label tetap ada.
const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (el) => el.getAttribute("class") || null,
        renderHTML: (attrs) => attrs.class ? { class: attrs.class } : {},
      },
    }
  },
})

// ─── Sanitasi HTML artikel — whitelist tag & attribute ───────────────────────
// Dijalankan SETELAH resolveShortcodesForSave agar shortcode sudah jadi teks
// bersih dan badge custom sudah hilang. Hanya tag + attribute yang dipakai
// konten artikel yang diizinkan — script, iframe, on* event diblokir total.
function sanitizeArticleHtml(html: string): string {
  if (typeof window === "undefined") return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  // Tag yang sama sekali tidak boleh ada
  const BLOCKED_TAGS = ["script","iframe","object","embed","form","input",
    "button","select","textarea","base","link","meta","style","svg","math"]

  // Tag yang diizinkan untuk konten artikel
  const ALLOWED_TAGS = new Set([
    "p","br","hr","h1","h2","h3","h4","h5","h6",
    "strong","b","em","i","u","s","del","mark","sup","sub","small","code","pre",
    "ul","ol","li","blockquote","a","img","figure","figcaption",
    "table","thead","tbody","tfoot","tr","th","td","caption","colgroup","col",
    "div","span","section","article","aside","header","footer","nav",
  ])

  // Attribute yang diizinkan per tag
  const ALLOWED_ATTRS: Record<string, string[]> = {
    "*":          ["class","id"],
    "a":          ["href","target","rel","title"],
    "img":        ["src","alt","width","height","loading"],
    "th":         ["colspan","rowspan","scope"],
    "td":         ["colspan","rowspan"],
    "col":        ["span"],
    "colgroup":   ["span"],
  }

  // Class yang diizinkan (whitelist eksplisit untuk custom styling artikel)
  const ALLOWED_CLASSES = new Set([
    "section-label","pull-quote",
    "card-table-block","card-table-card","card-table-field","card-table-label","card-table-value",
    "card-design","card-design-card","card-design-field","card-design-label","card-design-value",
    "modern-table",
    "group-standings-block",
    "gs-header","gs-header-icon","gs-header-title","gs-header-sub",
    "gs-table-wrap","gs-table","gs-thead-row","gs-th","gs-th-rank",
    "gs-tr","gs-td","gs-td-rank","gs-td-name","gs-td-stat",
    "gs-legend","gs-legend-item","gs-legend-qualify","gs-legend-candidate",
  ])

  function cleanNode(node: Element) {
    const tag = node.tagName.toLowerCase()

    // Hapus tag terblokir beserta seluruh isinya
    if (BLOCKED_TAGS.includes(tag)) { node.remove(); return }

    // Ganti tag tidak dikenal dengan span (pertahankan kontennya)
    if (!ALLOWED_TAGS.has(tag)) {
      const span = doc.createElement("span")
      span.innerHTML = node.innerHTML
      node.replaceWith(span)
      return
    }

    // Hapus semua attribute lalu pasang kembali yang diizinkan
    const allowed = [...(ALLOWED_ATTRS["*"] || []), ...(ALLOWED_ATTRS[tag] || [])]
    const attrNames = [...node.attributes].map(a => a.name)
    attrNames.forEach(attr => {
      // Blokir total event handler (onclick, onerror, dll)
      if (/^on/i.test(attr)) { node.removeAttribute(attr); return }
      // Blokir javascript: di href/src
      if ((attr === "href" || attr === "src")) {
        const val = node.getAttribute(attr) || ""
        if (/^\s*javascript:/i.test(val)) { node.removeAttribute(attr); return }
      }
      if (!allowed.includes(attr)) { node.removeAttribute(attr) }
    })

    // Sanitasi class — hanya izinkan class dari whitelist
    if (node.hasAttribute("class")) {
      const cleaned = node.getAttribute("class")!
        .split(/\s+/)
        .filter(c => ALLOWED_CLASSES.has(c))
        .join(" ")
      if (cleaned) node.setAttribute("class", cleaned)
      else node.removeAttribute("class")
    }

    // Rekursif ke child elements
    ;[...node.children].forEach(cleanNode)
  }

  ;[...doc.body.children].forEach(cleanNode)
  return doc.body.innerHTML
}

// ─── Bersihkan konten lama yang tersimpan sebagai HTML badge penuh ────────────
// Dipanggil saat fetchArticle — mendeteksi badge HTML yang terlanjur tersimpan
// di DB dan mengekstrak shortcode bersihnya agar bisa diproses normal.
function cleanLegacyBadgeContent(content: string): string {
  // Jika tidak ada badge HTML, return langsung
  if (!content.includes("widget-shortcode-badge")) return content

  const parser = new DOMParser()
  const doc = parser.parseFromString(content, "text/html")

  doc.querySelectorAll<HTMLElement>(".widget-shortcode-badge").forEach((el) => {
    const shortcode = el.dataset.shortcode
    const wId = el.dataset.widgetId
    const wType = el.dataset.widgetType
    const resolvedShortcode = shortcode ||
      (wId && wType
        ? ({
            jadwal:   `[match_data id="${wId}"]`,
            klasemen: `[klasemen_data id="${wId}"]`,
            transfer: `[transfer_data id="${wId}"]`,
            peluang:  `[peluang_data id="${wId}"]`,
            analisa_taktis:        `[analisa_taktis_data id="${wId}"]`,
            perbandingan_tim:      `[perbandingan_tim_data id="${wId}"]`,
            timeline_pertandingan: `[timeline_pertandingan_data id="${wId}"]`,
          }[wType] ?? null)
        : null)

    if (!resolvedShortcode) { el.remove(); return }

    const p = doc.createElement("p")
    p.textContent = resolvedShortcode
    const parentP = el.closest("p")
    if (parentP && parentP !== el) parentP.replaceWith(p)
    else el.replaceWith(p)
  })

  return doc.body.innerHTML
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CreateArticleView({ onBack, articleId }: CreateArticleViewProps) {
  const isEditMode = !!articleId
  const supabase   = createClient()

  const [title,           setTitle]           = useState("")
  const [savedSlug,       setSavedSlug]       = useState("")   // slug yang sudah tersimpan di DB (edit mode)
  const [category,        setCategory]        = useState("")
  const [excerpt,         setExcerpt]         = useState("")
  const [metaTitle,       setMetaTitle]       = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [categories,      setCategories]      = useState<{ id: string; name: string }[]>([])
  const [isLoading,       setIsLoading]       = useState(false)
  const [isFetching,      setIsFetching]      = useState(isEditMode)
  const [message,         setMessage]         = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isEditorChoice,  setIsEditorChoice]  = useState(false)
  const [scheduledAt,     setScheduledAt]     = useState<string>("")   // ISO string dari datetime-local input

  // ── Editor tab ──────────────────────────────────────────────────────────────
  const [editorTab,      setEditorTab]      = useState<"write" | "preview">("write")
  const [previewContent, setPreviewContent] = useState("")

  // ── Link Dialog ──────────────────────────────────────────────────────────────
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkText,       setLinkText]       = useState("")
  const [linkUrl,        setLinkUrl]        = useState("https://")

  // ── Featured image ────────────────────────────────────────────────────────
  const [featuredImagePreview, setFeaturedImagePreview] = useState<string | null>(null)
  const [featuredImageUrl,     setFeaturedImageUrl]     = useState<string | null>(null)
  const featuredImageRef = useRef<HTMLInputElement>(null)

  // ── Tags ──────────────────────────────────────────────────────────────────
  const [tags,            setTags]            = useState<string[]>([])
  const [tagInput,        setTagInput]        = useState("")
  const [tagSuggestions,  setTagSuggestions]  = useState<string[]>([])
  const [allTags,         setAllTags]         = useState<{ id: string; name: string; slug: string }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // ── Widget edit state ──────────────────────────────────────────────────────
  // Diisi saat admin klik "Edit Widget" pada badge di editor (edit mode)
  const [editWidgetId,   setEditWidgetId]   = useState<string | null>(null)
  const [editWidgetType, setEditWidgetType] = useState<WidgetType | null>(null)

  // ── Pre-loaded widgets (untuk artikel lama dari Posts → Edit) ──────────────
  // Diisi setelah fetchArticle parse shortcode dari konten artikel.
  const [preloadedWidgets, setPreloadedWidgets] = useState<{ widgetId: string; widgetType: WidgetType }[]>([])

  // Dengarkan custom event dari tombol Edit di panel WidgetInserter
  useEffect(() => {
    function handleWidgetRequestEdit(e: Event) {
      const { widgetId, widgetType } = (e as CustomEvent<{ widgetId: string; widgetType: WidgetType }>).detail
      setEditWidgetId(widgetId)
      setEditWidgetType(widgetType)
      document.getElementById("widget-inserter-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    window.addEventListener("widget-request-edit", handleWidgetRequestEdit)
    return () => window.removeEventListener("widget-request-edit", handleWidgetRequestEdit)
  }, [])

  // ── TipTap editor ─────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, blockquote: false, paragraph: false }),
      CustomBlockquote,
      CustomParagraph,
      TiptapImage,
      TiptapLink.configure({ openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    editorProps: {
      attributes: {
        class: [
          "min-h-[540px] focus:outline-none",
          "prose prose-invert prose-lg max-w-none",
          "prose-headings:text-foreground prose-headings:font-semibold",
          "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
          "prose-p:text-foreground/90 prose-p:leading-[1.8]",
          "prose-a:text-[#39FF14] prose-a:no-underline hover:prose-a:underline prose-a:font-semibold",
          "prose-strong:text-foreground",
          "prose-blockquote:border-l-primary prose-blockquote:text-foreground/70 prose-blockquote:italic",
          "prose-code:bg-secondary prose-code:text-primary prose-code:rounded prose-code:px-1",
          "prose-ul:text-foreground/90 prose-ol:text-foreground/90",
          "prose-hr:border-border",
          "prose-img:rounded-lg",
          // Widget shortcode badge styles
          "[&_.widget-shortcode-badge]:my-4 [&_.widget-shortcode-badge]:select-none",
          // Section label styling di dalam editor
          "[&_p.section-label]:text-[#39FF14] [&_p.section-label]:text-[0.68rem] [&_p.section-label]:font-bold [&_p.section-label]:uppercase [&_p.section-label]:tracking-[0.14em] [&_p.section-label]:mt-6 [&_p.section-label]:mb-0",
          // Pull quote styling di dalam editor
          "[&_blockquote.pull-quote]:border-l-[3px] [&_blockquote.pull-quote]:border-[#39FF14] [&_blockquote.pull-quote]:bg-[rgba(57,255,20,0.04)] [&_blockquote.pull-quote]:rounded-r-md [&_blockquote.pull-quote]:px-6 [&_blockquote.pull-quote]:py-3 [&_blockquote.pull-quote]:my-4 [&_blockquote.pull-quote]:not-italic",
          "[&_blockquote.pull-quote_p]:font-bold [&_blockquote.pull-quote_p]:italic [&_blockquote.pull-quote_p]:text-foreground [&_blockquote.pull-quote_p]:text-[1.1rem] [&_blockquote.pull-quote_p]:not-italic",
        ].join(" "),
      },
      // Klik badge di editor → masuk mode edit widget di sidebar
      handleClick(view, _pos, event) {
        const target = event.target as HTMLElement
        const badge = target.closest<HTMLElement>(".widget-shortcode-badge")
        if (!badge) return false
        const wId   = badge.dataset.widgetId
        const wType = badge.dataset.widgetType as WidgetType | undefined
        if (!wId || !wType) return false
        setEditWidgetId(wId)
        setEditWidgetType(wType)
        // Scroll ke widget inserter di sidebar
        document.getElementById("widget-inserter-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })
        return true
      },
    },
    content: "",
  })

  // ── Preview sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (editorTab !== "preview" || !editor) return
    const update = () => {
      const raw = editor.getHTML()
      const withSpacing = raw.replace(/<p><\/p>/g, "<p>&nbsp;</p>")
      setPreviewContent(resolveShortcodesForSave(withSpacing))
    }
    update()
    editor.on("update", update)
    return () => { editor.off("update", update) }
  }, [editorTab, editor])

  // ── Fetch meta (categories, tags) ────────────────────────────────────────
  useEffect(() => {
    async function fetchMeta() {
      const [catRes, tagRes] = await Promise.all([
        supabase.from("categories").select("*").order("name"),
        supabase.from("tags").select("*").order("name"),
      ])
      if (catRes.data) setCategories(catRes.data)
      if (tagRes.data)  setAllTags(tagRes.data)
    }
    fetchMeta()
  }, [])

  // ── Load article in edit mode ─────────────────────────────────────────────
  useEffect(() => {
    if (!articleId || !editor) return
    async function fetchArticle() {
      setIsFetching(true)
      const { data } = await supabase.from("articles").select("*").eq("id", articleId).single()
      if (data) {
        setTitle(data.title || "")
        setSavedSlug(data.slug || "")
        setExcerpt(data.excerpt || "")
        setCategory(data.category_id || "")
        setFeaturedImageUrl(data.featured_image_url || null)
        setFeaturedImagePreview(data.featured_image_url || null)
        setMetaTitle(data.meta_title || "")
        setMetaDescription(data.meta_description || "")
        setIsEditorChoice(data.is_editor_choice || false)

        // Load scheduled publish time if exists
        if (data.scheduled_at) {
          // Convert ISO string to local datetime-local format: "YYYY-MM-DDTHH:mm"
          const d = new Date(data.scheduled_at)
          const pad = (n: number) => String(n).padStart(2, "0")
          const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
          setScheduledAt(local)
        }

        // Konten sudah berupa shortcode teks: [match_data id="..."] dll
        // Kita konversi ke badge placeholder agar tampil visual di editor.
        // Bersihkan dulu jika ada badge HTML lama yang terlanjur tersimpan di DB
        let editorContent = cleanLegacyBadgeContent(data.content || "")

        // Helper: map shortcode type → WidgetType
        function rawToWidgetType(raw: string): WidgetType {
          if (raw === "match_data")              return "jadwal"
          if (raw === "klasemen_data")           return "klasemen"
          if (raw === "transfer_data")           return "transfer"
          if (raw === "analisa_taktis_data")     return "analisa_taktis"
          if (raw === "perbandingan_tim_data")   return "perbandingan_tim"
          if (raw === "timeline_pertandingan_data") return "timeline_pertandingan"
          return "peluang"
        }

        const ALL_SC = "(match_data|klasemen_data|transfer_data|peluang_data|analisa_taktis_data|perbandingan_tim_data|timeline_pertandingan_data)"

        // Ganti shortcode teks yang ada di dalam <p> dengan badge placeholder
        editorContent = editorContent.replace(
          new RegExp(`<p[^>]*>\\s*\\[${ALL_SC}\\s+id="([a-fA-F0-9-]{36})"\\]\\s*<\\/p>`, "g"),
          (_match, rawType: string, wId: string) => {
            const wType: WidgetType = rawToWidgetType(rawType)
            return buildShortcodePlaceholder(wId, wType)
          }
        )
        // Fallback: shortcode tanpa <p> wrapper
        editorContent = editorContent.replace(
          new RegExp(`\\[${ALL_SC}\\s+id="([a-fA-F0-9-]{36})"\\]`, "g"),
          (_match, rawType: string, wId: string) => {
            const wType: WidgetType = rawToWidgetType(rawType)
            return buildShortcodePlaceholder(wId, wType)
          }
        )

        editor.commands.setContent(editorContent || "")

        // Kumpulkan semua widget yang ada di artikel untuk panel Widget di Artikel
        const foundWidgets: { widgetId: string; widgetType: WidgetType }[] = []
        const widgetRegex = /\[(match_data|klasemen_data|transfer_data|peluang_data|analisa_taktis_data|perbandingan_tim_data|timeline_pertandingan_data)\s+id="([a-fA-F0-9-]{36})"\]/g
        let m
        // Gunakan konten yang sudah dibersihkan untuk ekstrak widget IDs
        const rawContent = cleanLegacyBadgeContent(data.content || "")
        while ((m = widgetRegex.exec(rawContent)) !== null) {
          foundWidgets.push({
            widgetId: m[2],
            widgetType: rawToWidgetType(m[1]),
          })
        }
        setPreloadedWidgets(foundWidgets)

        // Setelah load, refresh preview
        setTimeout(() => {
          const raw = editor.getHTML()
          setPreviewContent(resolveShortcodesForSave(raw))
        }, 150)
      }
      const { data: articleTags } = await supabase
        .from("article_tags").select("tags(name)").eq("article_id", articleId)
      if (articleTags) {
        setTags(articleTags.map((at: any) => at.tags?.name).filter(Boolean))
      }
      setIsFetching(false)
    }
    fetchArticle()
  }, [articleId, editor])

  // ── Tag autocomplete ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tagInput.trim()) { setTagSuggestions([]); setShowSuggestions(false); return }
    const filtered = allTags
      .map((t) => t.name)
      .filter((name) => name.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(name))
    setTagSuggestions(filtered)
    setShowSuggestions(true)
  }, [tagInput, allTags, tags])

  const addTag    = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || tags.includes(trimmed)) return
    setTags((prev) => [...prev, trimmed])
    setTagInput(""); setShowSuggestions(false)
    tagInputRef.current?.focus()
  }
  const removeTag = (name: string) => setTags((prev) => prev.filter((t) => t !== name))
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput) }
    else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) removeTag(tags[tags.length - 1])
  }

  // ── Image upload ──────────────────────────────────────────────────────────
  const handleFeaturedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setFeaturedImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    const fileExt  = file.name.split(".").pop()
    const fileName = `featured-${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from("media").upload(fileName, file, { upsert: true })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName)
      setFeaturedImageUrl(urlData.publicUrl)
    }
  }

  // ── Editor helpers ────────────────────────────────────────────────────────
  const handleInsertImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt("URL gambar:", "https://"); if (!url || url === "https://") return
    const alt = window.prompt("Alt text:", "") || ""
    editor.chain().focus().setImage({ src: url, alt }).run()
  }, [editor])

  const handleInsertLink = useCallback(() => {
    if (!editor) return
    const selectedText = editor.state.doc.cut(
      editor.state.selection.from,
      editor.state.selection.to,
    ).textContent
    setLinkText(selectedText || "")
    setLinkUrl("https://")
    setLinkDialogOpen(true)
  }, [editor])

  const handleConfirmLink = useCallback(() => {
    if (!editor) return
    const url   = linkUrl.trim()
    const label = linkText.trim()
    if (!url || url === "https://") { setLinkDialogOpen(false); return }
    if (label) {
      editor.chain().focus().insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).run()
    } else {
      editor.chain().focus().setLink({ href: url, target: "_blank" }).run()
    }
    setLinkDialogOpen(false)
    setLinkText("")
    setLinkUrl("https://")
  }, [editor, linkUrl, linkText])

  const handleInsertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  const handleInsertSectionLabel = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertContent(
      '<p class="section-label">Label Bagian · Sub-label</p><h2>Judul Bagian</h2>'
    ).run()
  }, [editor])

  const handleInsertPullQuote = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertContent(
      '<blockquote class="pull-quote"><p>Tulis kutipan penting di sini.</p></blockquote>'
    ).run()
  }, [editor])

  // ── Widget insert callback ────────────────────────────────────────────────
  // Dipanggil oleh WidgetInserter setelah data tersimpan ke Supabase
  function handleWidgetInsert(shortcode: string, widgetId: string, widgetType: WidgetType) {
    if (!editor) return
    const badge = buildShortcodePlaceholder(widgetId, widgetType)
    if (editWidgetId === widgetId) {
      // Mode edit: update badge yang sudah ada di editor
      const currentHtml = editor.getHTML()
      const parser = new DOMParser()
      const doc = parser.parseFromString(currentHtml, "text/html")
      const existing = doc.querySelector(`[data-widget-id="${widgetId}"]`)
      if (existing) {
        const newDoc = new DOMParser().parseFromString(badge, "text/html")
        const newNode = newDoc.body.firstChild
        if (newNode) {
          const parentP = existing.closest("p")
          if (parentP && parentP !== existing) parentP.replaceWith(newNode)
          else existing.replaceWith(newNode)
          editor.commands.setContent(doc.body.innerHTML, { emitUpdate: false })
        }
      }
    } else {
      // Mode insert baru: tambahkan ke posisi kursor
      editor.chain().focus().insertContent(badge + "<p></p>").run()
    }
    // Reset edit state
    setEditWidgetId(null)
    setEditWidgetType(null)
  }

  // ── Slug helper ───────────────────────────────────────────────────────────
  const generateSlug = (text: string) =>
    text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

  // ── Sync tags ─────────────────────────────────────────────────────────────
  const syncTags = async (artId: string) => {
    const tagIds: string[] = []
    for (const tagName of tags) {
      const slug = generateSlug(tagName)
      const { data: existing } = await supabase.from("tags").select("id").eq("slug", slug).single()
      if (existing) { tagIds.push(existing.id); continue }
      const { data: newTag } = await supabase.from("tags").insert({ name: tagName, slug }).select("id").single()
      if (newTag) tagIds.push(newTag.id)
    }
    await supabase.from("article_tags").delete().eq("article_id", artId)
    if (tagIds.length > 0) {
      await supabase.from("article_tags").insert(tagIds.map((tag_id) => ({ article_id: artId, tag_id })))
    }
  }

  // ── Save article ──────────────────────────────────────────────────────────
  const handleSave = async (publish: boolean, schedule = false) => {
    if (!title) { setMessage({ type: "error", text: "Judul artikel wajib diisi!" }); return }
    if (!editor) return

    // Validasi scheduled publish
    if (schedule) {
      if (!scheduledAt) { setMessage({ type: "error", text: "Pilih tanggal & waktu jadwal terlebih dahulu!" }); return }
      const schedDate = new Date(scheduledAt)
      if (schedDate <= new Date()) { setMessage({ type: "error", text: "Waktu jadwal harus di masa depan!" }); return }
    }

    setIsLoading(true); setMessage(null)

    const rawHtml = editor.getHTML()

    // 1. Konversi badge placeholder → shortcode teks
    const resolvedHtml = resolveShortcodesForSave(rawHtml)
    // 2. Sanitasi whitelist — blokir script/iframe/on* event, izinkan tag artikel
    const htmlContent = sanitizeArticleHtml(resolvedHtml)

    const now = new Date().toISOString()
    const articleSlug = isEditMode && savedSlug ? savedSlug : generateSlug(title)

    // Tentukan status & published_at berdasarkan mode simpan
    let status: string
    let published_at: string | null
    let scheduled_at: string | null = null

    if (schedule) {
      status = "scheduled"
      published_at = null
      scheduled_at = new Date(scheduledAt).toISOString()
    } else if (publish) {
      status = "published"
      published_at = now
      scheduled_at = null
    } else {
      status = "draft"
      published_at = null
      scheduled_at = null
    }

    const payload = {
      title,
      slug: articleSlug,
      excerpt,
      content: htmlContent,
      category_id: category || null,
      featured_image_url: featuredImageUrl,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      status,
      published_at,
      scheduled_at,
      updated_at: now,
      is_editor_choice: isEditorChoice,
    }

    let savedArticleId = articleId
    if (isEditMode) {
      const { error } = await supabase.from("articles").update(payload).eq("id", articleId)
      if (error) { setIsLoading(false); setMessage({ type: "error", text: error.message }); return }
    } else {
      const { data: inserted, error } = await supabase.from("articles").insert(payload).select("id").single()
      if (error || !inserted) { setIsLoading(false); setMessage({ type: "error", text: error?.message || "Gagal menyimpan" }); return }
      savedArticleId = inserted.id
      setSavedSlug(articleSlug)  // simpan slug agar save berikutnya tidak regenerate
    }

    if (savedArticleId) await syncTags(savedArticleId)
    setIsLoading(false)
    setMessage({
      type: "success",
      text: schedule
        ? `Artikel dijadwalkan terbit pada ${new Date(scheduledAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}!`
        : publish
          ? isEditMode ? "Artikel diupdate & dipublish!" : "Artikel berhasil dipublish!"
          : isEditMode ? "Draft diupdate!" : "Draft disimpan!",
    })
    if (publish && !schedule) setTimeout(onBack, 1500)
  }

  if (isFetching) {
    return (
      <div className="flex h-full items-center justify-center py-24 text-muted-foreground">
        Memuat artikel...
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="p-6">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Posts
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={isLoading}
            className="border-border text-foreground hover:border-primary hover:text-primary"
          >
            {isLoading ? "Menyimpan..." : isEditMode ? "Update Draft" : "Simpan Draft"}
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? "Menyimpan..." : isEditMode ? "Update & Publish" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={[
          "mb-6 rounded-lg px-4 py-3 text-sm",
          message.type === "success" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
        ].join(" ")}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Kolom utama: editor ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Title & Excerpt */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Judul Artikel
              </label>
              <input
                placeholder="Tulis judul yang menarik..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={[
                  "w-full rounded-md border border-border bg-secondary/50 px-3 py-2.5",
                  "text-xl font-semibold text-foreground placeholder:text-muted-foreground/40",
                  "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors",
                ].join(" ")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Excerpt
              </label>
              <textarea
                placeholder="Ringkasan singkat (untuk SEO dan preview)..."
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                className={[
                  "w-full resize-none rounded-md border border-border bg-secondary/50 px-3 py-2.5",
                  "text-sm text-foreground placeholder:text-muted-foreground/40 leading-relaxed",
                  "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors",
                ].join(" ")}
              />
            </div>
          </div>

          {/* Editor Card */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">

            {/* Tab bar */}
            <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
              <div className="flex gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setEditorTab("write")}
                  className={[
                    "rounded px-3 py-1.5 font-medium transition-colors",
                    editorTab === "write"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  ✏️ Tulis
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab("preview")}
                  className={[
                    "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors",
                    editorTab === "preview"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>
              </div>
              <span className="font-mono text-xs text-muted-foreground/50 tracking-tight">Markdown + HTML</span>
            </div>

            {editorTab === "write" ? (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-secondary/20 px-3 py-2">
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={editor?.isActive("heading", { level: 1 })} title="Heading 1">
                    <Heading1 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} title="Heading 2">
                    <Heading2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive("heading", { level: 3 })} title="Heading 3">
                    <Heading3 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarSeparator />
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold (Ctrl+B)">
                    <Bold className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic (Ctrl+I)">
                    <Italic className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleCode().run()} active={editor?.isActive("code")} title="Inline Code">
                    <Code2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarSeparator />
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullet List">
                    <List className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} title="Ordered List">
                    <ListOrdered className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarSeparator />
                  <ToolbarButton onClick={handleInsertSectionLabel} active={false} title="Section Label — label fase/babak di atas heading">
                    <Pilcrow className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={handleInsertPullQuote} active={editor?.isActive("blockquote", { class: "pull-quote" })} title="Pull Quote — kutipan menonjol Neon Green">
                    <MessageSquareQuote className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Garis Pemisah">
                    <Minus className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarSeparator />
                  <ToolbarButton onClick={handleInsertLink} active={editor?.isActive("link")} title="Sisipkan Link">
                    <Link2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={handleInsertImage} title="Sisipkan Gambar">
                    <ImageIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={handleInsertTable} title="Sisipkan Tabel">
                    <TableIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarSeparator />
                  <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Undo">
                    <Undo2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Redo">
                    <Redo2 className="h-4 w-4" />
                  </ToolbarButton>
                </div>

                {/* Area tulis */}
                <div className="min-h-[540px] bg-card px-10 py-8">
                  <EditorContent editor={editor} />
                </div>
              </>
            ) : (
              <div className="min-h-[540px] bg-card">
                {!previewContent.trim() ? (
                  <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                    Belum ada konten untuk dipreview.
                  </div>
                ) : (
                  <div className="px-10 py-8">
                    <ArticleBody
                      content={previewContent}
                      isAdmin={true}
                      className="prose-lg"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* ── Widget Inserter (Jadwal + Klasemen) ── */}
          <div id="widget-inserter-anchor">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Widget Artikel
              </span>
              {editWidgetId && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Mode Edit
                </span>
              )}
            </div>
            <WidgetInserter
              onInsert={handleWidgetInsert}
              editWidgetId={editWidgetId}
              editWidgetType={editWidgetType}
              onResetEdit={() => { setEditWidgetId(null); setEditWidgetType(null) }}
              initialWidgets={preloadedWidgets}
            />
          </div>

          {/* Editor Choice Toggle */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className={`h-4 w-4 ${isEditorChoice ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                <h3 className="text-sm font-semibold text-foreground">Editor Choice</h3>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isEditorChoice}
                onClick={() => setIsEditorChoice((v) => !v)}
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
                  isEditorChoice ? "bg-primary" : "bg-secondary",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    isEditorChoice ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {isEditorChoice
                ? "✅ Artikel ini akan tampil di bagian Editor Choice di halaman utama."
                : "Aktifkan untuk menampilkan artikel ini di bagian Editor Choice."}
            </p>
            {isEditorChoice && (
              <p className="mt-1 text-xs text-amber-500/80">
                ⚠️ Artikel Editor Choice tidak akan muncul di bagian Trending.
              </p>
            )}
          </div>

          {/* Category */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Kategori</h3>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Pilih kategori...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-0.5 text-sm font-semibold text-foreground">Tags</h3>
            <p className="mb-3 text-xs text-muted-foreground">Enter atau koma untuk menambah</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="text-primary/60 hover:text-primary">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Input
                ref={tagInputRef}
                placeholder="Tambah tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="border-border bg-secondary/50 text-sm"
              />
              {showSuggestions && tagSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
                  {tagSuggestions.slice(0, 6).map((s) => (
                    <button key={s} onMouseDown={() => addTag(s)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60">
                      <span className="text-primary">#</span>{s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {allTags.filter((t) => !tags.includes(t.name)).length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-muted-foreground">Tag tersedia:</p>
                <div className="flex flex-wrap gap-1">
                  {allTags.filter((t) => !tags.includes(t.name)).slice(0, 10).map((t) => (
                    <button key={t.id} onClick={() => addTag(t.name)}
                      className="flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                      <Plus className="h-2.5 w-2.5" />{t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Featured Image */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Gambar Unggulan</h3>
            <input ref={featuredImageRef} type="file" accept="image/*" className="hidden" onChange={handleFeaturedImageUpload} />
            <div
              onClick={() => featuredImageRef.current?.click()}
              className="flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-secondary/30 hover:border-primary/50 transition-colors"
            >
              {featuredImagePreview ? (
                <img src={featuredImagePreview} alt="Featured" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center">
                  <ImageIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Klik untuk upload</p>
                </div>
              )}
            </div>
            {featuredImagePreview && (
              <button onClick={() => { setFeaturedImagePreview(null); setFeaturedImageUrl(null) }} className="mt-2 text-xs text-destructive hover:underline">
                Hapus gambar
              </button>
            )}
          </div>

          {/* Schedule Publish */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-semibold text-foreground">Jadwal Terbit</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
              Atur waktu artikel terbit otomatis. Kosongkan jika ingin publish langsung.
            </p>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={(() => {
                const now = new Date(Date.now() + 60_000)
                const pad = (n: number) => String(n).padStart(2, "0")
                return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
              })()}
              className={[
                "w-full rounded-md border px-3 py-2 text-sm bg-secondary/50 text-foreground",
                "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors",
                scheduledAt ? "border-primary/50" : "border-border",
              ].join(" ")}
            />
            {scheduledAt && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-primary/80">
                  🕐 Terjadwal: {new Date(scheduledAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSave(false, true)}
                    disabled={isLoading}
                    className="flex-1 rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                  >
                    {isLoading ? "Menyimpan..." : "Simpan Jadwal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduledAt("")}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SEO */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-0.5 text-sm font-semibold text-foreground">SEO</h3>
            <p className="mb-4 text-xs text-muted-foreground">Kosongkan untuk pakai judul & excerpt</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Meta Title</label>
                <Input placeholder={title || "SEO title"} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} className="border-border bg-secondary/50 text-sm" />
                <p className="mt-1 text-right text-xs text-muted-foreground">{metaTitle.length}/60</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Meta Description</label>
                <textarea
                  placeholder={excerpt || "SEO description"}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{metaDescription.length}/160</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    {/* ── Link Dialog ── */}
    {linkDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Sisipkan Link</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Nama Artikel / Teks Link <span className="text-muted-foreground">(wajib)</span>
              </label>
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Contoh: Artikel tentang Messi"
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">URL Artikel</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmLink() }}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => { setLinkDialogOpen(false); setLinkText(""); setLinkUrl("https://") }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary"
            >
              Batal
            </button>
            <button
              onClick={handleConfirmLink}
              disabled={!linkText.trim() || !linkUrl.trim() || linkUrl === "https://"}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black hover:bg-primary/90 disabled:opacity-40"
            >
              Sisipkan
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
