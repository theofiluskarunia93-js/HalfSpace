"use client"

import { useState, useEffect, useRef } from "react"
import { ArrowLeft, Save, Image as ImageIcon, Bold, Italic, List, Link2, X, Plus, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

interface CreateArticleViewProps {
  onBack: () => void
  articleId?: string | null
}

export function CreateArticleView({ onBack, articleId }: CreateArticleViewProps) {
  const isEditMode = !!articleId

  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [excerpt, setExcerpt] = useState("")
  const [content, setContent] = useState("")
  const [metaTitle, setMetaTitle] = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [categories, setCategories] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(isEditMode)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [featuredImagePreview, setFeaturedImagePreview] = useState<string | null>(null)
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null)

  // Tab state: "write" | "preview"
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write")
  const [previewHtml, setPreviewHtml] = useState("")

  // Tag states
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [allTags, setAllTags] = useState<{ id: string; name: string; slug: string }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const featuredImageRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchCategories() {
      const { data } = await supabase.from("categories").select("*").order("name")
      if (data) setCategories(data)
    }
    async function fetchAllTags() {
      const { data } = await supabase.from("tags").select("*").order("name")
      if (data) setAllTags(data)
    }
    fetchCategories()
    fetchAllTags()
  }, [])

  useEffect(() => {
    if (!articleId) return

    async function fetchArticle() {
      setIsFetching(true)
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("id", articleId)
        .single()

      if (!error && data) {
        setTitle(data.title || "")
        setExcerpt(data.excerpt || "")
        setContent(data.content || "")
        setCategory(data.category_id || "")
        setFeaturedImageUrl(data.featured_image_url || null)
        setFeaturedImagePreview(data.featured_image_url || null)
        setMetaTitle(data.meta_title || "")
        setMetaDescription(data.meta_description || "")
      }

      const { data: articleTags } = await supabase
        .from("article_tags")
        .select("tags(name)")
        .eq("article_id", articleId)

      if (articleTags) {
        const tagNames = articleTags.map((at: any) => at.tags?.name).filter(Boolean)
        setTags(tagNames)
      }

      setIsFetching(false)
    }

    fetchArticle()
  }, [articleId])

  // Filter tag suggestions
  useEffect(() => {
    if (tagInput.trim().length === 0) {
      setTagSuggestions([])
      setShowSuggestions(false)
      return
    }
    const filtered = allTags
      .map((t) => t.name)
      .filter(
        (name) =>
          name.toLowerCase().includes(tagInput.toLowerCase()) &&
          !tags.includes(name)
      )
    setTagSuggestions(filtered)
    setShowSuggestions(true)
  }, [tagInput, allTags, tags])

  // Generate markdown preview ketika tab Preview dibuka
  useEffect(() => {
    if (editorTab !== "preview") return
    // Lazy load marked hanya saat preview dibuka
    import("marked").then(({ marked }) => {
      try {
        const html = marked.parse(content || "") as string
        setPreviewHtml(html)
      } catch {
        setPreviewHtml("<p>Gagal merender preview.</p>")
      }
    })
  }, [editorTab, content])

  const generateSlug = (text: string) =>
    text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

  const addTag = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || tags.includes(trimmed)) return
    setTags([...tags, trimmed])
    setTagInput("")
    setShowSuggestions(false)
    tagInputRef.current?.focus()
  }

  const removeTag = (name: string) => {
    setTags(tags.filter((t) => t !== name))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(tagInput)
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  // ─── Rich text toolbar handlers ────────────────────────────────────────
  const wrapSelection = (before: string, after: string) => {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.slice(start, end)
    const newContent = content.slice(0, start) + before + selected + after + content.slice(end)
    setContent(newContent)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  const insertAtLineStart = (prefix: string) => {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart
    // Cari awal baris
    const lineStart = content.lastIndexOf("\n", start - 1) + 1
    const newContent = content.slice(0, lineStart) + prefix + content.slice(lineStart)
    setContent(newContent)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length)
    }, 0)
  }

  const insertAtCursor = (text: string) => {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart
    const newContent = content.slice(0, start) + text + content.slice(start)
    setContent(newContent)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    }, 0)
  }

  const handleBold = () => wrapSelection("**", "**")
  const handleItalic = () => wrapSelection("_", "_")
  const handleList = () => insertAtCursor("\n- ")
  const handleLink = () => {
    const el = contentRef.current
    if (!el) return
    const selected = content.slice(el.selectionStart, el.selectionEnd)
    const url = window.prompt("Masukkan URL:", "https://")
    if (!url) return
    const linkText = selected || "teks link"
    if (selected) {
      wrapSelection(`[${linkText}](`, `${url})`)
    } else {
      insertAtCursor(`[${linkText}](${url})`)
    }
  }
  const handleImageInsert = () => {
    const url = window.prompt("Masukkan URL gambar:", "https://")
    if (!url) return
    const alt = window.prompt("Deskripsi gambar (alt text):", "deskripsi gambar") || "gambar"
    insertAtCursor(`\n![${alt}](${url})\n`)
  }

  // Heading: insert di awal baris jika sudah ada teks, atau insert baru
  const handleH1 = () => insertAtLineStart("# ")
  const handleH2 = () => insertAtLineStart("## ")
  const handleH3 = () => insertAtLineStart("### ")
  const handleTable = () =>
    insertAtCursor(
      "\n| Kolom 1 | Kolom 2 | Kolom 3 |\n|---------|---------|----------|\n| Data 1  | Data 2  | Data 3   |\n| Data 4  | Data 5  | Data 6   |\n"
    )
  const handleQuote = () => insertAtLineStart("> ")
  const handleCode = () => wrapSelection("`", "`")
  const handleHr = () => insertAtCursor("\n\n---\n\n")

  const headingButtons = [
    { label: "H1", title: "Heading 1 (judul besar)", action: handleH1 },
    { label: "H2", title: "Heading 2 (sub judul)", action: handleH2 },
    { label: "H3", title: "Heading 3 (sub-sub judul)", action: handleH3 },
  ]

  const iconButtons = [
    { icon: Bold,      label: "Bold (teks tebal)",   action: handleBold },
    { icon: Italic,    label: "Italic (teks miring)", action: handleItalic },
    { icon: List,      label: "Bullet list",          action: handleList },
    { icon: Link2,     label: "Sisipkan link",        action: handleLink },
    { icon: ImageIcon, label: "Sisipkan gambar",      action: handleImageInsert },
  ]

  const handleFeaturedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => setFeaturedImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    const fileExt = file.name.split(".").pop()
    const fileName = `featured-${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from("media").upload(fileName, file, { upsert: true })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName)
      setFeaturedImageUrl(urlData.publicUrl)
    }
  }

  const syncTags = async (articleId: string) => {
    const tagIds: string[] = []

    for (const tagName of tags) {
      const slug = generateSlug(tagName)
      const { data: existing } = await supabase
        .from("tags")
        .select("id")
        .eq("slug", slug)
        .single()

      if (existing) {
        tagIds.push(existing.id)
      } else {
        const { data: newTag } = await supabase
          .from("tags")
          .insert({ name: tagName, slug })
          .select("id")
          .single()
        if (newTag) tagIds.push(newTag.id)
      }
    }

    await supabase.from("article_tags").delete().eq("article_id", articleId)

    if (tagIds.length > 0) {
      await supabase.from("article_tags").insert(
        tagIds.map((tag_id) => ({ article_id: articleId, tag_id }))
      )
    }
  }

  const handleSave = async (publish: boolean) => {
    if (!title) {
      setMessage({ type: "error", text: "Judul artikel wajib diisi!" })
      return
    }

    setIsLoading(true)
    setMessage(null)

    let savedArticleId = articleId

    const payload = {
      title,
      slug: generateSlug(title),
      excerpt,
      content,
      category_id: category || null,
      featured_image_url: featuredImageUrl,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
    }

    if (isEditMode) {
      const { error: updateError } = await supabase
        .from("articles")
        .update(payload)
        .eq("id", articleId)

      if (updateError) {
        setIsLoading(false)
        setMessage({ type: "error", text: updateError.message })
        return
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("articles")
        .insert(payload)
        .select("id")
        .single()

      if (insertError || !inserted) {
        setIsLoading(false)
        setMessage({ type: "error", text: insertError?.message || "Gagal menyimpan artikel" })
        return
      }

      savedArticleId = inserted.id
    }

    if (savedArticleId) {
      await syncTags(savedArticleId)
    }

    setIsLoading(false)
    setMessage({
      type: "success",
      text: publish
        ? isEditMode ? "Artikel berhasil diupdate dan dipublish!" : "Artikel berhasil dipublish!"
        : isEditMode ? "Artikel berhasil diupdate!" : "Draft berhasil disimpan!",
    })
    setTimeout(() => {
      if (publish) onBack()
    }, 1500)
  }

  if (isFetching) {
    return (
      <div className="flex h-full items-center justify-center py-24 text-muted-foreground">
        Loading article...
      </div>
    )
  }

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
            {isLoading ? "Saving..." : isEditMode ? "Update Draft" : "Save Draft"}
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? "Saving..." : isEditMode ? "Update & Publish" : "Publish"}
          </Button>
        </div>
      </div>

      {message && (
        <div className={`mb-6 rounded-lg px-4 py-3 text-sm ${
          message.type === "success"
            ? "bg-primary/10 text-primary"
            : "bg-destructive/10 text-destructive"
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-6 text-2xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
              {isEditMode ? "Edit Article" : "Create New Article"}
            </h2>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-foreground">Article Title</label>
              <Input
                placeholder="Enter a compelling title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-border bg-secondary/50 text-lg text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-foreground">Excerpt</label>
              <textarea
                placeholder="Write a brief summary..."
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Content</label>
                {/* Write / Preview toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setEditorTab("write")}
                    className={`px-3 py-1.5 transition-colors ${
                      editorTab === "write"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    ✏️ Tulis
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("preview")}
                    className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${
                      editorTab === "preview"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                </div>
              </div>

              {editorTab === "write" ? (
                <>
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-b-0 border-border bg-secondary/50 p-2">
                    {/* Heading buttons */}
                    {headingButtons.map(({ label, title, action }) => (
                      <button
                        key={label}
                        type="button"
                        title={title}
                        onClick={action}
                        className="h-8 min-w-[2rem] px-2 rounded text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
                      >
                        {label}
                      </button>
                    ))}

                    <div className="w-px h-5 bg-border mx-1" />

                    {/* Icon buttons */}
                    {iconButtons.map(({ icon: Icon, label, action }) => (
                      <Button
                        key={label}
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={label}
                        onClick={action}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    ))}

                    <div className="w-px h-5 bg-border mx-1" />

                    {/* Extra buttons */}
                    <button
                      type="button"
                      title="Insert Table"
                      onClick={handleTable}
                      className="h-8 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
                    >
                      ⊞ Tabel
                    </button>
                    <button
                      type="button"
                      title="Blockquote"
                      onClick={handleQuote}
                      className="h-8 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
                    >
                      ❝ Quote
                    </button>
                    <button
                      type="button"
                      title="Inline code"
                      onClick={handleCode}
                      className="h-8 px-2 rounded text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
                    >
                      {"</>"}
                    </button>
                    <button
                      type="button"
                      title="Garis pembatas (HR)"
                      onClick={handleHr}
                      className="h-8 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
                    >
                      — HR
                    </button>

                    <div className="w-px h-5 bg-border mx-1" />
                    <span className="flex items-center text-xs text-muted-foreground/60 italic">Markdown</span>
                  </div>

                  {/* Textarea */}
                  <textarea
                    ref={contentRef}
                    placeholder={`Tulis konten artikel di sini... (format Markdown)\n\nContoh:\n# Judul Besar\n## Sub Judul\n\nParagraf teks biasa di sini.\n\n| Kolom 1 | Kolom 2 |\n|---------|----------|\n| Data 1  | Data 2  |\n\n![alt text](https://url-gambar.com/gambar.jpg)`}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={20}
                    className="w-full rounded-b-md border border-border bg-secondary/50 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  />

                  {/* Markdown quick-reference */}
                  <div className="mt-2 rounded-lg border border-border bg-secondary/30 px-4 py-3">
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Panduan Markdown:</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-muted-foreground font-mono">
                      <span># Judul H1</span>
                      <span>**teks tebal**</span>
                      <span>## Judul H2</span>
                      <span>_teks miring_</span>
                      <span>### Judul H3</span>
                      <span>[link](https://url)</span>
                      <span>- item list</span>
                      <span>![alt](https://img)</span>
                      <span>{'| A | B |'} + {'|---|---|'}</span>
                      <span>{'> blockquote'}</span>
                    </div>
                  </div>
                </>
              ) : (
                /* Preview panel */
                <div className="rounded-b-md border border-border bg-background min-h-[400px]">
                  {!content.trim() ? (
                    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                      Belum ada konten untuk dipreview.
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none p-6
                        prose-headings:font-bold prose-headings:text-foreground
                        prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                        prose-h2:border-b prose-h2:border-border prose-h2:pb-2
                        prose-p:text-foreground/90 prose-p:leading-relaxed
                        prose-a:text-primary prose-strong:font-semibold
                        prose-img:rounded-xl prose-img:w-full
                        prose-table:w-full prose-table:border-collapse
                        prose-th:border prose-th:border-border prose-th:bg-secondary/60 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-sm prose-th:font-semibold
                        prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-sm
                        prose-tr:even:bg-secondary/20
                        prose-blockquote:border-l-primary prose-blockquote:bg-secondary/50 prose-blockquote:rounded-r-lg"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Category */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-4 font-semibold text-foreground">Category</h3>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-1 font-semibold text-foreground">Tags</h3>
            <p className="mb-3 text-xs text-muted-foreground">Tekan Enter atau koma untuk menambah tag</p>

            <div className="mb-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
                >
                  #{tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-1 rounded-full text-primary/70 hover:text-primary"
                  >
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
                className="border-border bg-secondary/50 text-sm text-foreground placeholder:text-muted-foreground"
              />
              {showSuggestions && tagSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
                  {tagSuggestions.slice(0, 6).map((s) => (
                    <button
                      key={s}
                      onMouseDown={() => addTag(s)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60"
                    >
                      <span className="text-primary">#</span>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {allTags.filter((t) => !tags.includes(t.name)).length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-muted-foreground">Tag yang ada:</p>
                <div className="flex flex-wrap gap-1.5">
                  {allTags
                    .filter((t) => !tags.includes(t.name))
                    .slice(0, 10)
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => addTag(t.name)}
                        className="flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {t.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Featured Image */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-4 font-semibold text-foreground">Featured Image</h3>
            <input
              ref={featuredImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFeaturedImageUpload}
            />
            <div
              onClick={() => featuredImageRef.current?.click()}
              className="flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-secondary/50 transition-colors hover:border-primary/50"
            >
              {featuredImagePreview ? (
                <img src={featuredImagePreview} alt="Featured" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center">
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to upload</p>
                  <p className="text-xs text-muted-foreground">atau drag and drop</p>
                </div>
              )}
            </div>
            {featuredImagePreview && (
              <button
                onClick={() => { setFeaturedImagePreview(null); setFeaturedImageUrl(null) }}
                className="mt-2 text-xs text-destructive hover:underline"
              >
                Remove image
              </button>
            )}
          </div>

          {/* SEO Settings */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-1 font-semibold text-foreground">SEO Settings</h3>
            <p className="mb-4 text-xs text-muted-foreground">Kosongkan untuk menggunakan judul & excerpt artikel</p>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Meta Title</label>
                <Input
                  placeholder={title || "SEO title"}
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className="border-border bg-secondary/50 text-sm text-foreground placeholder:text-muted-foreground/50"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{metaTitle.length}/60</p>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Meta Description</label>
                <textarea
                  placeholder={excerpt || "SEO description"}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
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
