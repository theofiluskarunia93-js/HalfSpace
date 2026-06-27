"use client"

// components/editor/AIRewritePopup.tsx — BARU
//
// Pengganti Step 3 ("Polish dengan Editor — GPT OSS 120B") yang dulu ada di
// Generation Panel. Sekarang TipTap-nya AI-native: highlight paragraf →
// muncul tombol "Tulis Ulang dengan AI" mengambang → popup kecil dengan
// instruksi opsional → Groq GPT-OSS-120B menulis ulang HANYA bagian yang
// di-highlight → user Terapkan / Tulis Ulang Lagi / Batal.
//
// Tidak menambah dependency baru (tidak pakai @tiptap/extension-bubble-menu)
// — posisi popup dihitung manual dari koordinat seleksi TipTap, supaya tidak
// menambah risiko ke proses build Vercel yang sudah pernah rapuh.
//
// CARA PAKAI (lihat INTEGRATION_NOTES.md untuk detail penempatan):
//   <div className="relative">
//     <EditorContent editor={editor} />
//     <AIRewritePopup editor={editor} articleContext={title} />
//   </div>

import { useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Sparkles, Check, X, RotateCcw } from "lucide-react"

interface AIRewritePopupProps {
  editor: Editor | null
  /** Opsional: judul/konteks artikel, dikirim ke AI supaya gaya & fakta konsisten. */
  articleContext?: string
}

type Mode = "hidden" | "trigger" | "panel"
type PanelStatus = "idle" | "loading" | "result" | "error"

interface Position {
  top: number
  left: number
}

export function AIRewritePopup({ editor, articleContext }: AIRewritePopupProps) {
  const [mode, setMode] = useState<Mode>("hidden")
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 })
  const [instruction, setInstruction] = useState("")
  const [status, setStatus] = useState<PanelStatus>("idle")
  const [rewrittenHtml, setRewrittenHtml] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Snapshot range & teks asli SAAT popup dibuka — supaya tidak ikut bergeser
  // kalau user lanjut mengetik di bagian lain dokumen sebelum klik Terapkan.
  const rangeRef = useRef<{ from: number; to: number } | null>(null)
  const originalTextRef = useRef<string>("")

  // ── Ikuti seleksi user selama popup belum dibuka penuh ("panel") ────────
  useEffect(() => {
    if (!editor) return
    // Alias ke const: TypeScript TIDAK membawa hasil narrowing "if (!editor) return"
    // ke dalam nested function declaration di bawah (gotcha closure klasik TS).
    // Dengan di-alias ke const di sini, "ed" tetap ter-narrow non-null di mana pun
    // dipakai, termasuk di dalam updateFromSelection().
    const ed = editor

    function updateFromSelection() {
      if (mode === "panel") return // sedang dibuka — jangan ganggu posisi/snapshot

      const { from, to, empty } = ed.state.selection
      const text = ed.state.doc.textBetween(from, to, "\n\n").trim()

      if (empty || text.length < 4) {
        setMode("hidden")
        return
      }

      try {
        const coords = ed.view.coordsAtPos(to)
        const editorRect = ed.view.dom.getBoundingClientRect()
        setPosition({
          top: coords.bottom - editorRect.top + 8,
          left: Math.max(0, coords.left - editorRect.left),
        })
        setMode("trigger")
      } catch {
        setMode("hidden")
      }
    }

    ed.on("selectionUpdate", updateFromSelection)
    ed.on("blur", () => {
      // Beri sedikit delay supaya klik tombol trigger (yang juga mem-blur
      // editor) tidak langsung menutup popup sebelum onClick-nya jalan.
      window.setTimeout(() => {
        if (mode !== "panel") setMode("hidden")
      }, 120)
    })

    return () => {
      ed.off("selectionUpdate", updateFromSelection)
    }
  }, [editor, mode])

  function openPanel() {
    if (!editor) return
    const { from, to } = editor.state.selection
    rangeRef.current = { from, to }
    originalTextRef.current = editor.state.doc.textBetween(from, to, "\n\n").trim()
    setInstruction("")
    setStatus("idle")
    setRewrittenHtml("")
    setErrorMsg(null)
    setMode("panel")
  }

  function closePanel() {
    setMode("hidden")
    rangeRef.current = null
    setStatus("idle")
    setRewrittenHtml("")
    setErrorMsg(null)
  }

  async function handleGenerate() {
    if (!originalTextRef.current) return
    setStatus("loading")
    setErrorMsg(null)

    try {
      const res = await fetch("/api/rewrite-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: originalTextRef.current,
          instruction: instruction.trim() || undefined,
          articleContext: articleContext?.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? "Gagal menulis ulang teks")

      setRewrittenHtml(json.rewritten)
      setStatus("result")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error tidak diketahui")
      setStatus("error")
    }
  }

  function handleApply() {
    if (!editor || !rangeRef.current || !rewrittenHtml) return
    const { from, to } = rangeRef.current
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, rewrittenHtml).run()
    closePanel()
  }

  if (!editor || mode === "hidden") return null

  // ── Tombol mengambang kecil — muncul begitu user selesai highlight ──────
  if (mode === "trigger") {
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // jangan rebut fokus dari editor sebelum onClick
        onClick={openPanel}
        style={{ position: "absolute", top: position.top, left: position.left, zIndex: 30 }}
        className="flex items-center gap-1.5 rounded-full border border-[#39FF14]/40 bg-card px-3 py-1.5 text-xs font-medium text-[#39FF14] shadow-lg hover:bg-[#39FF14]/10 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Tulis Ulang dengan AI
      </button>
    )
  }

  // ── Panel penuh ───────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: "absolute", top: position.top, left: position.left, zIndex: 30 }}
      className="w-80 rounded-lg border border-border bg-card p-3 shadow-xl space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-[#39FF14]" />
          Tulis Ulang dengan AI · GPT OSS 120B
        </span>
        <button onClick={closePanel} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-24 overflow-y-auto rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground italic">
        {originalTextRef.current}
      </div>

      {status === "idle" && (
        <>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Instruksi opsional — mis. 'lebih ringkas', 'lebih analitis', 'tambah ketegangan'..."
            rows={2}
            className="text-xs"
          />
          <Button onClick={handleGenerate} className="w-full gap-2" size="sm">
            <Sparkles className="h-3.5 w-3.5" />Tulis Ulang
          </Button>
        </>
      )}

      {status === "loading" && (
        <Button disabled className="w-full gap-2" size="sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />GPT OSS 120B menulis ulang...
        </Button>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{errorMsg}</p>
          <Button onClick={handleGenerate} variant="outline" className="w-full gap-2" size="sm">
            <RotateCcw className="h-3.5 w-3.5" />Coba Lagi
          </Button>
        </div>
      )}

      {status === "result" && (
        <div className="space-y-2">
          <div
            className="max-h-40 overflow-y-auto rounded border border-[#39FF14]/30 bg-[rgba(57,255,20,0.04)] px-2 py-1.5 text-xs prose-p:my-1"
            dangerouslySetInnerHTML={{ __html: rewrittenHtml }}
          />
          <div className="flex gap-2">
            <Button onClick={handleApply} className="flex-1 gap-1.5" size="sm">
              <Check className="h-3.5 w-3.5" />Terapkan
            </Button>
            <Button onClick={handleGenerate} variant="outline" size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />Lagi
            </Button>
            <Button onClick={closePanel} variant="ghost" size="sm">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
