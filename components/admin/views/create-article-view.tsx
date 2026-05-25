"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { Image as TiptapImage } from "@tiptap/extension-image"
import { Link as TiptapLink } from "@tiptap/extension-link"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableCell } from "@tiptap/extension-table-cell"
import {
  ArrowLeft, Save, Image as ImageIcon, X, Plus, Eye,
  Bold, Italic, List, ListOrdered, Link2, Quote,
  Code2, Minus, Heading1, Heading2, Heading3,
  Undo2, Redo2, Table as TableIcon, Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateArticleViewProps {
  onBack: () => void
  articleId?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 8)
}

// ─── Match Card Widget ────────────────────────────────────────────────────────

interface MatchEntry {
  id: string
  homeTeam: string
  awayTeam: string
  date: string      // e.g. "Jumat, 12 Juni 2026"
  time: string      // e.g. "02.00 WIB"
  stadium: string
}

interface MatchTab {
  id: string
  label: string     // e.g. "Grup A"
  matches: MatchEntry[]
}

function makeMatch(): MatchEntry {
  return { id: generateId(), homeTeam: "", awayTeam: "", date: "", time: "", stadium: "" }
}

function makeMatchTab(index: number): MatchTab {
  return { id: generateId(), label: `Grup ${String.fromCharCode(65 + index)}`, matches: [makeMatch()] }
}

/** Render satu tab pertandingan menjadi HTML match-card-grid */
function renderMatchTabHtml(tab: MatchTab): string {
  const cards = tab.matches.map((m) => `
<div class="match-card">
  <div class="match-card-top">
    <span class="match-card-badge">${tab.label.toUpperCase()}</span>
    <span class="match-card-date">${m.date}</span>
  </div>
  <div class="match-card-teams">
    <span class="match-card-team">${m.homeTeam}</span>
    <span class="match-card-vs">vs</span>
    <span class="match-card-team">${m.awayTeam}</span>
  </div>
  <div class="match-card-bottom">
    <span class="match-card-time">⏰ ${m.time}</span>
    <span class="match-card-stadium">${m.stadium}</span>
  </div>
</div>`).join("")
  return `<div class="match-card-grid">${cards}</div>`
}

/** Bungkus semua tab jadwal menjadi tabbed-block HTML */
function buildMatchTabbedHtml(tabs: MatchTab[], blockId: string): string {
  const buttons = tabs
    .map((t, i) => `<button class="tbb${i === 0 ? " tbb-active" : ""}" data-tab="${i}">${t.label}</button>`)
    .join("")
  const panels = tabs
    .map((t, i) => `<div class="tbp${i === 0 ? " tbp-active" : ""}" data-panel="${i}">${renderMatchTabHtml(t)}</div>`)
    .join("")
  return (
    `<div class="tabbed-block" data-block-id="${blockId}">` +
    `<div class="tb-nav">${buttons}</div>` +
    `<div class="tb-content">${panels}</div>` +
    `</div>`
  )
}

function MatchCardWidget({ onInsert }: { onInsert: (html: string, blockId: string) => void }) {
  const [tabs, setTabs] = useState<MatchTab[]>([makeMatchTab(0)])
  const [activeTab, setActiveTab] = useState<string>(() => "")

  useEffect(() => {
    if (!activeTab && tabs.length > 0) setActiveTab(tabs[0].id)
  }, [tabs, activeTab])

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0]

  const updateTab = (id: string, patch: Partial<MatchTab>) =>
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const addTab = () => {
    const t = makeMatchTab(tabs.length)
    setTabs((prev) => [...prev, t])
    setActiveTab(t.id)
  }

  const removeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeTab === id && next.length > 0) setActiveTab(next[0].id)
      return next
    })
  }

  const updateMatch = (tabId: string, matchId: string, patch: Partial<MatchEntry>) => {
    setTabs((prev) => prev.map((t) => t.id !== tabId ? t : {
      ...t,
      matches: t.matches.map((m) => m.id === matchId ? { ...m, ...patch } : m),
    }))
  }

  const addMatch = (tabId: string) =>
    setTabs((prev) => prev.map((t) => t.id !== tabId ? t : { ...t, matches: [...t.matches, makeMatch()] }))

  const removeMatch = (tabId: string, matchId: string) =>
    setTabs((prev) => prev.map((t) => t.id !== tabId ? t : {
      ...t, matches: t.matches.filter((m) => m.id !== matchId),
    }))

  const handleInsert = () => {
    const blockId = generateId()
    const validTabs = tabs.filter((t) => t.matches.some((m) => m.homeTeam || m.awayTeam))
    if (!validTabs.length) return
    // Selalu wrap dengan data-block-id agar restore saat edit bisa menemukan blok ini
    const html = validTabs.length === 1
      ? `<div class="match-block" data-block-id="${blockId}">${renderMatchTabHtml(validTabs[0])}</div>`
      : buildMatchTabbedHtml(validTabs, blockId)
    onInsert(html, blockId)
  }

  if (!currentTab) return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Jadwal Pertandingan</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">Tab = Grup / Ronde</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-secondary/20 px-3 py-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              tab.id === activeTab
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            ].join(" ")}
          >
            <input
              value={tab.label}
              onChange={(e) => { e.stopPropagation(); updateTab(tab.id, { label: e.target.value }) }}
              onClick={(e) => e.stopPropagation()}
              className="w-14 bg-transparent text-inherit outline-none text-xs font-semibold"
            />
            {tabs.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); removeTab(tab.id) }}
                className="text-muted-foreground/50 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addTab}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-primary transition-colors">
          <Plus className="h-3 w-3" /> Grup
        </button>
      </div>

      {/* Match list */}
      <div className="max-h-72 overflow-y-auto p-3 space-y-2">
        {currentTab.matches.map((match, idx) => (
          <div key={match.id} className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Pertandingan {idx + 1}</span>
              {currentTab.matches.length > 1 && (
                <button onClick={() => removeMatch(currentTab.id, match.id)}
                  className="text-muted-foreground/50 hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Teams row */}
            <div className="flex items-center gap-1.5">
              <input
                value={match.homeTeam}
                onChange={(e) => updateMatch(currentTab.id, match.id, { homeTeam: e.target.value })}
                placeholder="Tim Kandang"
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
              <span className="text-[10px] font-bold text-primary shrink-0">VS</span>
              <input
                value={match.awayTeam}
                onChange={(e) => updateMatch(currentTab.id, match.id, { awayTeam: e.target.value })}
                placeholder="Tim Tamu"
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
            </div>
            {/* Date & time & stadium */}
            <div className="grid grid-cols-3 gap-1.5">
              <input
                value={match.date}
                onChange={(e) => updateMatch(currentTab.id, match.id, { date: e.target.value })}
                placeholder="Jumat, 12 Juni 2026"
                className="col-span-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
              <input
                value={match.time}
                onChange={(e) => updateMatch(currentTab.id, match.id, { time: e.target.value })}
                placeholder="02.00 WIB"
                className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
              <input
                value={match.stadium}
                onChange={(e) => updateMatch(currentTab.id, match.id, { stadium: e.target.value })}
                placeholder="Nama Stadion"
                className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
            </div>
          </div>
        ))}
        <button
          onClick={() => addMatch(currentTab.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
          <Plus className="h-3.5 w-3.5" /> Tambah Pertandingan
        </button>
      </div>

      {/* Insert button */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {tabs.length > 1 ? `${tabs.length} grup · tab interaktif` : "1 grup · tanpa tab"}
        </span>
        <button
          onClick={handleInsert}
          className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
          <TableIcon className="h-3.5 w-3.5" />
          Insert ke Artikel
        </button>
      </div>
    </div>
  )
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

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
        "flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-sm transition-colors",
        "disabled:pointer-events-none disabled:opacity-30",
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function ToolbarSeparator() {
  return <div className="mx-1 h-4 w-px bg-border" aria-hidden />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CreateArticleView({ onBack, articleId }: CreateArticleViewProps) {
  const isEditMode = !!articleId
  const supabase   = createClient()

  const [title,           setTitle]           = useState("")
  const [category,        setCategory]        = useState("")
  const [excerpt,         setExcerpt]         = useState("")
  const [metaTitle,       setMetaTitle]       = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [categories,      setCategories]      = useState<{ id: string; name: string }[]>([])
  const [isLoading,       setIsLoading]       = useState(false)
  const [isFetching,      setIsFetching]      = useState(isEditMode)
  const [message,         setMessage]         = useState<{ type: "success" | "error"; text: string } | null>(null)

  // ── Editor Choice toggle ──────────────────────────────────────────────────
  const [isEditorChoice, setIsEditorChoice] = useState(false)

  // ── Card Style toggle — tersinkron dengan toolbar insert table ────────────
  const [isCardStyle, setIsCardStyle] = useState(false)

  const [featuredImagePreview, setFeaturedImagePreview] = useState<string | null>(null)
  const [featuredImageUrl,     setFeaturedImageUrl]     = useState<string | null>(null)
  const featuredImageRef = useRef<HTMLInputElement>(null)

  const [tags,           setTags]           = useState<string[]>([])
  const [tagInput,       setTagInput]       = useState("")
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [allTags,        setAllTags]        = useState<{ id: string; name: string; slug: string }[]>([])
  const [showSuggestions,setShowSuggestions]= useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const [editorTab,   setEditorTab]   = useState<"write" | "preview">("write")
  const [previewHtml, setPreviewHtml] = useState("")
  // Card HTML disimpan di Map (id → html) karena Tiptap strip custom class.
  // Di Tiptap cukup insert placeholder teks [[CARD:id]], lalu replace saat preview/save.
  const cardMapRef = useRef<Map<string, string>>(new Map())

  // ── Tiptap editor ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TiptapImage,
      TiptapLink.configure({ openOnClick: false }),
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
          "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
          "prose-strong:text-foreground",
          "prose-blockquote:border-l-primary prose-blockquote:text-foreground/70 prose-blockquote:italic",
          "prose-code:bg-secondary prose-code:text-primary prose-code:rounded prose-code:px-1",
          "prose-ul:text-foreground/90 prose-ol:text-foreground/90",
          "prose-hr:border-border",
          "prose-img:rounded-lg",
        ].join(" "),
      },
    },
    content: "",
  })

  // ── Listen for modern table insert (JSON node — reliable untuk Tiptap) ────
  useEffect(() => {
    const handler = (e: Event) => {
      const node = (e as CustomEvent<object>).detail
      if (editor && node) {
        editor.chain().focus().insertContent(node).run()
      }
    }
    window.addEventListener("insert-table-node", handler)
    return () => window.removeEventListener("insert-table-node", handler)
  }, [editor])

  // ── Listen for card placeholder insert ───────────────────────────────────
  // Insert teks placeholder [[CARD:id]] ke posisi kursor di Tiptap.
  // Placeholder ini di-replace dengan HTML card saat preview/save.
  useEffect(() => {
    const handler = (e: Event) => {
      const cardId = (e as CustomEvent<string>).detail
      if (!editor || !cardId) return
      editor.chain().focus().insertContent({
        type: "paragraph",
        content: [{ type: "text", text: `[[CARD:${cardId}]]` }],
      }).run()
    }
    window.addEventListener("insert-card-placeholder", handler)
    return () => window.removeEventListener("insert-card-placeholder", handler)
  }, [editor])

  // ── Fetch meta (kategori + tags) ───────────────────────────────────────────
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

  // ── Fetch artikel (edit mode) ──────────────────────────────────────────────
  useEffect(() => {
    if (!articleId || !editor) return
    async function fetchArticle() {
      setIsFetching(true)
      const { data } = await supabase.from("articles").select("*").eq("id", articleId).single()
      if (data) {
        setTitle(data.title || "")
        setExcerpt(data.excerpt || "")
        setCategory(data.category_id || "")
        setFeaturedImageUrl(data.featured_image_url || null)
        setFeaturedImagePreview(data.featured_image_url || null)
        setMetaTitle(data.meta_title || "")
        setMetaDescription(data.meta_description || "")
        setIsEditorChoice(data.is_editor_choice || false)
        // Restore semua blok berdasarkan data-block-id
        // Strategi: scan HTML untuk semua elemen dengan data-block-id, simpan ke cardMapRef
        const raw = data.content || ""

        // Parse HTML di sisi client untuk ekstrak blok dengan data-block-id
        const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null
        let restored = raw

        if (parser) {
          const doc = parser.parseFromString(raw, "text/html")
          // Cari semua elemen top-level yang punya data-block-id
          doc.querySelectorAll("[data-block-id]").forEach((el) => {
            const id = el.getAttribute("data-block-id")
            if (!id) return
            cardMapRef.current.set(id, el.outerHTML)
            // Ganti di string restored dengan placeholder
            restored = restored.replace(el.outerHTML, `[[CARD:${id}]]`)
          })

          // Fallback: modern-table tanpa data-block-id
          restored = restored.replace(/(<table class="modern-table">[\s\S]*?<\/table>)/g,
            (match: string) => {
              const id = generateId()
              cardMapRef.current.set(id, match)
              return `[[CARD:${id}]]`
            })

          // Fallback: card-design standalone tanpa data-block-id
          restored = restored.replace(/(<div class="card-design">[\s\S]*?<\/div>)/g,
            (match: string) => {
              const id = generateId()
              cardMapRef.current.set(id, match)
              return `[[CARD:${id}]]`
            })
        } else {
          // SSR fallback — regex sederhana
          restored = raw
            .replace(/(<div[^>]+data-block-id="([^"]+)"[\s\S]*?<\/div>)/g,
              (match: string, _full: string, id: string) => {
                cardMapRef.current.set(id, match)
                return `[[CARD:${id}]]`
              })
        }
        editor.commands.setContent(restored || "")
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

  // ── Tag autocomplete ───────────────────────────────────────────────────────
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

  // ── Resolve card placeholders → HTML card sesungguhnya ──────────────────
  const resolveCards = (html: string): string => {
    return html.replace(/\[\[CARD:([a-z0-9]+)\]\]/g, (_, id) => {
      return cardMapRef.current.get(id) ?? ""
    })
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (editorTab !== "preview" || !editor) return
    const raw = editor.getHTML()
    setPreviewHtml(resolveCards(raw))
  }, [editorTab, editor])

  // ── Featured image ─────────────────────────────────────────────────────────
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

  // ── Toolbar actions ────────────────────────────────────────────────────────
  const handleInsertImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt("URL gambar:", "https://"); if (!url || url === "https://") return
    const alt = window.prompt("Alt text:", "") || ""
    editor.chain().focus().setImage({ src: url, alt }).run()
  }, [editor])

  const handleInsertLink = useCallback(() => {
    if (!editor) return
    const url = window.prompt("URL:", "https://"); if (!url || url === "https://") return
    editor.chain().focus().setLink({ href: url }).run()
  }, [editor])

  const handleInsertTable = useCallback(() => {
    if (!editor) return
    if (isCardStyle) {
      // Insert card design placeholder — format card-design HTML
      const cardHtml = `<div class="card-design"><div class="card-design-card"><div class="card-design-field"><span class="card-design-label">Label</span><span class="card-design-value">Nilai</span></div></div></div>`
      const blockId = generateId()
      cardMapRef.current.set(blockId, cardHtml)
      editor.chain().focus().insertContent({
        type: "paragraph",
        content: [{ type: "text", text: `[[CARD:${blockId}]]` }],
      }).run()
    } else {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    }
  }, [editor, isCardStyle])

  // ── Save / Publish ─────────────────────────────────────────────────────────
  const generateSlug = (text: string) =>
    text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

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

  const handleSave = async (publish: boolean) => {
    if (!title) { setMessage({ type: "error", text: "Judul artikel wajib diisi!" }); return }
    if (!editor) return
    setIsLoading(true); setMessage(null)

    const htmlContent = resolveCards(editor.getHTML())
    const payload = {
      title, slug: generateSlug(title), excerpt, content: htmlContent,
      category_id: category || null, featured_image_url: featuredImageUrl,
      meta_title: metaTitle || null, meta_description: metaDescription || null,
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
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
    }

    if (savedArticleId) await syncTags(savedArticleId)
    setIsLoading(false)
    setMessage({
      type: "success",
      text: publish
        ? isEditMode ? "Artikel diupdate & dipublish!" : "Artikel berhasil dipublish!"
        : isEditMode ? "Draft diupdate!" : "Draft disimpan!",
    })
    if (publish) setTimeout(onBack, 1500)
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

          {/* ── Editor Card ── */}
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
                {/* ── Toolbar ── */}
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

                  <ToolbarButton onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive("blockquote")} title="Blockquote">
                    <Quote className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Garis Pemisah">
                    <Minus className="h-4 w-4" />
                  </ToolbarButton>

                  <ToolbarSeparator />

                  <ToolbarButton onClick={handleInsertLink}  title="Sisipkan Link">
                    <Link2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={handleInsertImage} title="Sisipkan Gambar">
                    <ImageIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={handleInsertTable} title="Sisipkan Tabel Cepat (Markdown)">
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

                {/* ── Area tulis ── */}
                <div className="px-10 py-8 bg-card min-h-[540px]">
                  <EditorContent editor={editor} />
                </div>
              </>
            ) : (
              <div className="min-h-[540px] bg-card">
                {!previewHtml.trim() ? (
                  <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                    Belum ada konten untuk dipreview.
                  </div>
                ) : (
                  <div
                    className={[
                      "px-10 py-8",
                      "prose prose-invert prose-lg max-w-none",
                      "prose-p:text-foreground/90 prose-p:leading-[1.85]",
                      "prose-headings:text-foreground prose-headings:font-semibold",
                      "prose-h2:border-b prose-h2:border-border prose-h2:pb-3",
                      "prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:font-medium",
                      "prose-strong:text-foreground",
                      "prose-blockquote:border-l-2 prose-blockquote:border-l-primary",
                      "prose-blockquote:bg-secondary/60 prose-blockquote:rounded-r-lg prose-blockquote:not-italic",
                      "prose-code:bg-secondary prose-code:text-primary prose-code:rounded prose-code:px-1.5",
                      "prose-code:before:content-none prose-code:after:content-none",
                      "prose-img:rounded-xl prose-img:w-full",
                      // Modern table styles
                      "prose-table:w-full prose-table:border-collapse prose-table:my-6 prose-table:text-sm",
                      "prose-th:border prose-th:border-border prose-th:bg-secondary/80 prose-th:px-4 prose-th:py-2.5 prose-th:font-semibold prose-th:text-foreground prose-th:text-left",
                      "prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2.5 prose-td:text-foreground/80 prose-td:align-top",
                      "[&_tbody_tr:nth-child(even)]:bg-secondary/30",
                      "prose-hr:border-border",
                      // Card table styles (legacy class names)
                      "[&_.card-table-block]:grid [&_.card-table-block]:gap-4 [&_.card-table-block]:my-6",
                      "[&_.card-table-block]:grid-cols-1 sm:[&_.card-table-block]:grid-cols-2",
                      "[&_.card-table-card]:rounded-xl [&_.card-table-card]:border [&_.card-table-card]:border-border [&_.card-table-card]:bg-secondary/40 [&_.card-table-card]:p-4 [&_.card-table-card]:flex [&_.card-table-card]:flex-col [&_.card-table-card]:gap-2",
                      "[&_.card-table-field]:flex [&_.card-table-field]:items-start [&_.card-table-field]:gap-2",
                      "[&_.card-table-label]:text-[10px] [&_.card-table-label]:font-bold [&_.card-table-label]:uppercase [&_.card-table-label]:tracking-wide [&_.card-table-label]:text-primary [&_.card-table-label]:min-w-[90px] [&_.card-table-label]:pt-0.5 [&_.card-table-label]:shrink-0",
                      "[&_.card-table-value]:text-sm [&_.card-table-value]:text-foreground/90 [&_.card-table-value]:leading-snug",
                      // card-design class (format baru dari TableStyleWidget)
                      "[&_.card-design]:grid [&_.card-design]:gap-4 [&_.card-design]:my-6 [&_.card-design]:grid-cols-1",
                      "[&_.card-design-card]:rounded-xl [&_.card-design-card]:border [&_.card-design-card]:border-border [&_.card-design-card]:bg-secondary/40 [&_.card-design-card]:p-4 [&_.card-design-card]:flex [&_.card-design-card]:flex-col [&_.card-design-card]:gap-2",
                      "[&_.card-design-field]:flex [&_.card-design-field]:items-start [&_.card-design-field]:gap-2",
                      "[&_.card-design-label]:text-[10px] [&_.card-design-label]:font-bold [&_.card-design-label]:uppercase [&_.card-design-label]:tracking-wide [&_.card-design-label]:text-primary [&_.card-design-label]:min-w-[90px] [&_.card-design-label]:pt-0.5 [&_.card-design-label]:shrink-0",
                      "[&_.card-design-value]:text-sm [&_.card-design-value]:text-foreground/90 [&_.card-design-value]:leading-snug",
                      // match-card styles (jadwal pertandingan)
                      "[&_.match-block]:my-6",
                      "[&_.match-card-grid]:grid [&_.match-card-grid]:gap-4 [&_.match-card-grid]:my-4 [&_.match-card-grid]:grid-cols-1 sm:[&_.match-card-grid]:grid-cols-2",
                      "[&_.match-card]:rounded-xl [&_.match-card]:border [&_.match-card]:border-border [&_.match-card]:bg-secondary/30 [&_.match-card]:p-4 [&_.match-card]:flex [&_.match-card]:flex-col [&_.match-card]:gap-2.5",
                      "[&_.match-card-top]:flex [&_.match-card-top]:items-center [&_.match-card-top]:justify-between",
                      "[&_.match-card-badge]:rounded-full [&_.match-card-badge]:bg-primary [&_.match-card-badge]:text-[10px] [&_.match-card-badge]:font-extrabold [&_.match-card-badge]:tracking-wide [&_.match-card-badge]:text-black [&_.match-card-badge]:px-2.5 [&_.match-card-badge]:py-0.5",
                      "[&_.match-card-date]:text-xs [&_.match-card-date]:text-muted-foreground",
                      "[&_.match-card-teams]:flex [&_.match-card-teams]:items-center [&_.match-card-teams]:gap-2 [&_.match-card-teams]:flex-wrap",
                      "[&_.match-card-team]:text-base [&_.match-card-team]:font-bold [&_.match-card-team]:text-foreground",
                      "[&_.match-card-vs]:text-sm [&_.match-card-vs]:font-bold [&_.match-card-vs]:text-primary",
                      "[&_.match-card-bottom]:flex [&_.match-card-bottom]:items-center [&_.match-card-bottom]:justify-between [&_.match-card-bottom]:flex-wrap [&_.match-card-bottom]:gap-2",
                      "[&_.match-card-time]:rounded [&_.match-card-time]:border [&_.match-card-time]:border-border [&_.match-card-time]:bg-black/30 [&_.match-card-time]:px-2 [&_.match-card-time]:py-1 [&_.match-card-time]:text-xs [&_.match-card-time]:font-bold [&_.match-card-time]:text-foreground",
                      "[&_.match-card-stadium]:text-xs [&_.match-card-stadium]:text-muted-foreground",
                      // tabbed-block nav styles
                      "[&_.tabbed-block]:rounded-xl [&_.tabbed-block]:border [&_.tabbed-block]:border-border [&_.tabbed-block]:overflow-hidden [&_.tabbed-block]:my-6",
                      "[&_.tb-nav]:flex [&_.tb-nav]:flex-wrap [&_.tb-nav]:gap-1.5 [&_.tb-nav]:p-2.5 [&_.tb-nav]:bg-secondary/40 [&_.tb-nav]:border-b [&_.tb-nav]:border-border",
                      "[&_.tbb]:rounded-md [&_.tbb]:px-3 [&_.tbb]:py-1 [&_.tbb]:text-xs [&_.tbb]:font-semibold [&_.tbb]:cursor-pointer [&_.tbb]:border [&_.tbb]:border-border [&_.tbb]:bg-secondary [&_.tbb]:text-muted-foreground [&_.tbb]:transition-colors",
                      "[&_.tbb-active]:bg-primary [&_.tbb-active]:border-primary [&_.tbb-active]:text-black",
                      "[&_.tb-content]:p-4 [&_.tb-content]:bg-card",
                      "[&_.tbp]:hidden",
                      "[&_.tbp-active]:block",
                    ].join(" ")}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  ref={(el) => {
                    if (!el) return
                    setTimeout(() => {
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
                    }, 50)
                  }}
                  />
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* ── Card Style Toggle ── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TableIcon className={`h-4 w-4 ${isCardStyle ? "text-primary" : "text-muted-foreground"}`} />
                <h3 className="text-sm font-semibold text-foreground">Card Style</h3>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isCardStyle}
                onClick={() => setIsCardStyle((v) => !v)}
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
                  isCardStyle ? "bg-primary" : "bg-secondary",
                ].join(" ")}
              >
                <span className={[
                  "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  isCardStyle ? "translate-x-6" : "translate-x-1",
                ].join(" ")} />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {isCardStyle
                ? "✅ Tabel akan dimasukkan dalam format Card Design."
                : "Aktifkan untuk mengubah tabel menjadi tampilan Card Design."}
            </p>
          </div>

          {/* ── Match Card Widget — hanya muncul saat Card Style OFF ── */}
          {!isCardStyle && (
            <MatchCardWidget
              onInsert={(html, blockId) => {
                if (!editor) return
                cardMapRef.current.set(blockId, html)
                editor.chain().focus().insertContent({
                  type: "paragraph",
                  content: [{ type: "text", text: `[[CARD:${blockId}]]` }],
                }).run()
              }}
            />
          )}

          {/* ── Editor Choice Toggle ── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className={`h-4 w-4 ${isEditorChoice ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                <h3 className="text-sm font-semibold text-foreground">Editor Choice</h3>
              </div>
              {/* Toggle switch */}
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
  )
}
