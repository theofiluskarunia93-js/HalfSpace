"use client"

// components/cms/generation-panel.tsx — v2
//
// PERUBAHAN DARI v1:
// + Quality score indicator setelah generate draft
// + Warning berbeda untuk draft_below_quality vs draft_failed
// + Tombol generate ulang muncul otomatis jika draft_failed
// + Brief inspector menampilkan data quality warnings jika ada

import { useState } from "react"
import { Button }   from "@/components/ui/button"
import { Badge }    from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label }    from "@/components/ui/label"
import {
  Loader2, FileText, PenLine, Wand2,
  CheckCircle2, AlertCircle, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react"
import type { EditorialBrief, NewsType } from "@/lib/editorial/types"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GenerationPanelProps {
  newsType:     NewsType
  topic:        string
  onDraftReady: (title: string, content: string) => void
  onFinalReady: (title: string, content: string) => void
}

type PipelineStatus =
  | "idle" | "generating_brief" | "brief_ready"
  | "generating_draft" | "draft_ready" | "draft_below_quality" | "draft_failed"
  | "polishing" | "final_ready" | "error"

interface QualityDetails {
  passed: boolean
  wordCount: number
  h2Count: number
  hasBlockquote: boolean
  forbiddenFound: string[]
  score: number
}

interface DoneEvent {
  title: string
  content: string
  wordCount: number
  qualityScore?: number
  qualityDetails?: QualityDetails
  draftStatus?: string
  tokenUsed?: number
  warning?: string
  editNotes?: string
  validationWarnings?: string[]
}

// ── SSE consumer ──────────────────────────────────────────────────────────────

async function consumeSSE(
  url: string,
  body: Record<string, unknown>,
  onProgress: (e: { step: number; total: number; label: string; [k: string]: unknown }) => void,
  onDone:     (data: DoneEvent) => void,
  onError:    (msg: string) => void,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.body) { onError("Tidak ada response body"); return }

  const reader = res.body.getReader()
  const dec    = new TextDecoder()
  let   buf    = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split("\n\n")
    buf = parts.pop() ?? ""
    for (const part of parts) {
      const ev   = part.match(/^event:\s*(.+)$/m)?.[1]?.trim()
      const data = part.match(/^data:\s*(.+)$/m)?.[1]?.trim()
      if (!ev || !data) continue
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(data) } catch {}
      if (ev === "progress") onProgress(parsed as any)
      if (ev === "done")     onDone(parsed as unknown as DoneEvent)
      if (ev === "error")    onError((parsed as { message?: string }).message ?? "Error")
    }
  }
}

// ── Quality Score Badge ───────────────────────────────────────────────────────

function QualityBadge({ score }: { score: number }) {
  if (score >= 70) return <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Score {score}/100 ✓</Badge>
  if (score >= 50) return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">Score {score}/100 ⚠</Badge>
  return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Score {score}/100 ✗</Badge>
}

// ── Quality Details Panel ─────────────────────────────────────────────────────

function QualityPanel({ qd }: { qd: QualityDetails }) {
  return (
    <div className="text-xs space-y-1 bg-muted/30 rounded p-3 border">
      <div className="flex gap-4 flex-wrap">
        <span className={qd.wordCount >= 450 ? "text-green-600" : "text-red-500"}>
          {qd.wordCount >= 450 ? "✓" : "✗"} {qd.wordCount} kata
        </span>
        <span className={qd.h2Count >= 3 ? "text-green-600" : "text-red-500"}>
          {qd.h2Count >= 3 ? "✓" : "✗"} {qd.h2Count} subheading
        </span>
        <span className={qd.hasBlockquote ? "text-green-600" : "text-muted-foreground"}>
          {qd.hasBlockquote ? "✓" : "–"} blockquote
        </span>
        <span className={qd.forbiddenFound.length === 0 ? "text-green-600" : "text-red-500"}>
          {qd.forbiddenFound.length === 0 ? "✓" : `✗ ${qd.forbiddenFound.length} frasa`}
        </span>
      </div>
      {qd.forbiddenFound.length > 0 && (
        <p className="text-red-500 mt-1">
          Frasa ditemukan: {qd.forbiddenFound.map((f) => `"${f}"`).join(", ")}
        </p>
      )}
    </div>
  )
}

// ── Brief Inspector ───────────────────────────────────────────────────────────

function BriefInspector({ brief }: { brief: EditorialBrief }) {
  const [open, setOpen] = useState(false)
  const hasWarnings = brief.meta.dataQualityWarnings.length > 0

  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
      >
        <span className="font-medium flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 shrink-0" />
          Editorial Brief
          <Badge variant="secondary" className="text-xs">~{brief.meta.tokenEstimate} token</Badge>
          <Badge variant="outline" className="text-xs capitalize">{brief.angle.primary.replace(/_/g, " ")}</Badge>
          {hasWarnings && <Badge className="text-xs bg-amber-500/15 text-amber-700 border-amber-500/30">⚠ Data warning</Badge>}
        </span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 bg-background border-t">

          {/* Data quality warnings */}
          {hasWarnings && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 space-y-1">
              <p className="text-xs font-semibold text-amber-700">Peringatan Data:</p>
              {brief.meta.dataQualityWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">• [{w.field}] {w.instruction}</p>
              ))}
            </div>
          )}

          {/* SEO */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">SEO</p>
            <p className="text-xs">Keyword: <span className="font-medium">{brief.seo.primaryKeyword}</span></p>
            <p className="text-xs text-muted-foreground">Format judul: {brief.seo.titleTemplate}</p>
          </div>

          {/* Angle */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Angle</p>
            <p className="text-xs">{brief.angle.headlineDirection}</p>
          </div>

          {/* Lead example */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Contoh Lead</p>
            <p className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2">{brief.storylines.leadExample}</p>
          </div>

          {/* Fakta wajib */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Fakta Wajib ({brief.keyFacts.mustUse.length})
            </p>
            <ul className="space-y-0.5">
              {brief.keyFacts.mustUse.map((f, i) => (
                <li key={i} className="text-xs flex gap-1.5">
                  <span className="text-green-500 shrink-0">[F{i + 1}]</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Subheadings */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subheading</p>
            {brief.structureHints.suggestedH2s.map((h, i) => (
              <div key={i} className="mb-1.5">
                <p className="text-xs font-medium">[H{i + 1}] {h.text}</p>
                <p className="text-xs text-muted-foreground ml-4">→ {h.focus}</p>
              </div>
            ))}
          </div>

          {/* Target */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Target</p>
            <p className="text-xs">{brief.wordTarget.min}–{brief.wordTarget.max} kata · min {brief.wordTarget.paragraphMin} paragraf · min {brief.wordTarget.h2Min} subheading</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, label, status }: {
  step: number; label: string; status: "idle" | "active" | "done" | "warn" | "error"
}) {
  const icons = {
    idle:   <span className="w-5 h-5 rounded-full border-2 border-muted flex items-center justify-center text-xs text-muted-foreground">{step}</span>,
    active: <Loader2 className="w-5 h-5 animate-spin text-primary" />,
    done:   <CheckCircle2 className="w-5 h-5 text-green-500" />,
    warn:   <AlertTriangle className="w-5 h-5 text-amber-500" />,
    error:  <AlertCircle className="w-5 h-5 text-destructive" />,
  }
  return (
    <div className="flex items-center gap-2">
      {icons[status]}
      <span className={`text-sm ${status === "active" ? "text-foreground font-medium" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function GenerationPanel({ newsType, topic, onDraftReady, onFinalReady }: GenerationPanelProps) {
  const [status,         setStatus]         = useState<PipelineStatus>("idle")
  const [progressLabel,  setProgressLabel]  = useState("")
  const [brief,          setBrief]          = useState<EditorialBrief | null>(null)
  const [generationId,   setGenerationId]   = useState<string | null>(null)
  const [draftWordCount, setDraftWordCount] = useState<number | null>(null)
  const [qualityDetails, setQualityDetails] = useState<QualityDetails | null>(null)
  const [qualityScore,   setQualityScore]   = useState<number | null>(null)
  const [finalWordCount, setFinalWordCount] = useState<number | null>(null)
  const [editNotes,      setEditNotes]      = useState<string | null>(null)
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null)
  const [warningMsg,     setWarningMsg]     = useState<string | null>(null)
  const [manualContext,  setManualContext]  = useState("")
  const [showContext,    setShowContext]    = useState(newsType === "trivia")

  function reset(full = false) {
    setStatus("idle")
    setProgressLabel("")
    setErrorMsg(null)
    setWarningMsg(null)
    setQualityDetails(null)
    setQualityScore(null)
    setDraftWordCount(null)
    setFinalWordCount(null)
    setEditNotes(null)
    if (full) { setBrief(null); setGenerationId(null) }
  }

  // ── STEP 1 ────────────────────────────────────────────────────────────────
  async function handleGenerateBrief() {
    if (!topic.trim()) return
    reset(true)
    setStatus("generating_brief")
    setProgressLabel("Mengambil data dari semua sumber...")

    try {
      const res  = await fetch("/api/generate-brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsType, topic, manualContext }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? "Gagal generate brief")
      setBrief(json.brief)
      setGenerationId(json.generationId)

      if (!json.generationId) {
        // Brief berhasil dibuat tapi gagal disimpan ke DB — tombol Generate Draft
        // tidak akan bisa jalan (butuh generationId). Tampilkan error JELAS,
        // jangan diam-diam lanjut ke brief_ready seolah semuanya normal.
        setErrorMsg(
          (json.sourceWarnings?.join(" | ") ?? "") ||
          "Brief berhasil dibuat tapi gagal disimpan ke database, sehingga langkah Generate Draft tidak bisa dilanjutkan. Cek log server / tabel article_generations di Supabase."
        )
        setStatus("brief_ready") // brief tetap ditampilkan, tapi error di atas akan kelihatan
        setProgressLabel("")
        return
      }

      if (json.sourceWarnings?.length) setWarningMsg(json.sourceWarnings.join(" | "))
      setStatus("brief_ready")
      setProgressLabel("")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error tidak diketahui")
      setStatus("error")
    }
  }

  // ── STEP 2 ────────────────────────────────────────────────────────────────
  async function handleGenerateDraft() {
    if (!generationId) return
    reset()
    setStatus("generating_draft")

    await consumeSSE(
      "/api/generate-draft",
      { generationId },
      (e) => {
        setProgressLabel(e.label)
        if (e.qualityScore !== undefined) setQualityScore(e.qualityScore as number)
      },
      (data) => {
        setDraftWordCount(data.wordCount)
        setQualityScore(data.qualityScore ?? null)
        setQualityDetails(data.qualityDetails ?? null)
        onDraftReady(data.title, data.content)

        const ds = data.draftStatus ?? "draft_ready"
        setStatus(ds as PipelineStatus)
        setProgressLabel("")
        if (data.warning) setWarningMsg(data.warning)
      },
      (msg) => { setErrorMsg(msg); setStatus("error") },
    )
  }

  // ── STEP 3 ────────────────────────────────────────────────────────────────
  async function handlePolish() {
    if (!generationId) return
    setStatus("polishing")
    setProgressLabel("Mempersiapkan editor...")
    setWarningMsg(null)

    await consumeSSE(
      "/api/polish-article",
      { generationId },
      (e) => setProgressLabel(e.label),
      (data) => {
        setFinalWordCount(data.wordCount)
        setEditNotes(data.editNotes ?? null)
        onFinalReady(data.title, data.content)
        setStatus("final_ready")
        setProgressLabel("")
        if (data.validationWarnings?.length) {
          setWarningMsg("Perhatian editor: " + data.validationWarnings.join(" · "))
        }
      },
      (msg) => { setErrorMsg(msg); setStatus("draft_ready") }, // rollback ke draft_ready jika polish gagal
    )
  }

  // ── Step status ───────────────────────────────────────────────────────────
  const step1Status = (): "idle" | "active" | "done" | "warn" | "error" => {
    if (status === "generating_brief") return "active"
    if (status === "error" && !brief)  return "error"
    if (brief)                         return "done"
    return "idle"
  }
  const step2Status = (): "idle" | "active" | "done" | "warn" | "error" => {
    if (status === "generating_draft")      return "active"
    if (status === "draft_below_quality")   return "warn"
    if (status === "draft_failed")          return "error"
    if (status === "error" && brief && !draftWordCount) return "error"
    if (draftWordCount)                     return "done"
    return "idle"
  }
  const step3Status = (): "idle" | "active" | "done" | "warn" | "error" => {
    if (status === "polishing")  return "active"
    if (finalWordCount)          return "done"
    return "idle"
  }

  const isDraftDone = ["draft_ready","draft_below_quality","draft_failed","polishing","final_ready"].includes(status)

  return (
    <div className="space-y-4">

      {/* Step indicators */}
      <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg border">
        <StepIndicator step={1} label="Editorial Brief (tanpa AI)" status={step1Status()} />
        <StepIndicator step={2} label="Draft artikel — Llama 4 Scout" status={step2Status()} />
        <StepIndicator step={3} label="Editor — GPT OSS 120B (opsional)" status={step3Status()} />
      </div>

      {/* Konteks manual */}
      <div>
        <button onClick={() => setShowContext((p) => !p)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {newsType === "trivia" ? "Fakta trivia (wajib diisi)" : "Tambah konteks manual (opsional)"}
        </button>
        {showContext && (
          <div className="mt-2">
            <Label htmlFor="mc" className="text-xs text-muted-foreground">
              {newsType === "trivia"
                ? "Fakta trivia — satu per baris"
                : "Konteks tambahan — satu poin per baris"}
            </Label>
            <Textarea id="mc" value={manualContext} onChange={(e) => setManualContext(e.target.value)}
              placeholder={newsType === "trivia" ? "Fakta 1\nFakta 2\n..." : "Konteks 1\nKonteks 2\n..."}
              rows={4} className="mt-1 text-sm font-mono" />
          </div>
        )}
      </div>

      {/* Progress */}
      {progressLabel && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />{progressLabel}
        </p>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{errorMsg}</span>
        </div>
      )}

      {/* Warning */}
      {warningMsg && !errorMsg && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{warningMsg}</span>
        </div>
      )}

      {/* STEP 1 BUTTON */}
      {(status === "idle" || status === "error") && (
        <Button onClick={handleGenerateBrief} disabled={!topic.trim() || (newsType === "trivia" && !manualContext.trim())} className="w-full gap-2">
          <FileText className="w-4 h-4" />
          {newsType === "trivia" && !manualContext.trim() ? "Isi fakta trivia dulu ↑" : "Generate Editorial Brief"}
        </Button>
      )}
      {status === "generating_brief" && (
        <Button disabled className="w-full gap-2"><Loader2 className="w-4 h-4 animate-spin" />Menyusun brief...</Button>
      )}

      {/* Brief Inspector + STEP 2 BUTTON */}
      {brief && (
        <div className="space-y-3">
          <BriefInspector brief={brief} />

          {status === "brief_ready" && (
            <Button onClick={handleGenerateDraft} className="w-full gap-2">
              <PenLine className="w-4 h-4" />Generate Draft — Llama 4 Scout
            </Button>
          )}
          {status === "generating_draft" && (
            <Button disabled className="w-full gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />Llama 4 Scout sedang menulis...
            </Button>
          )}
        </div>
      )}

      {/* Quality details setelah draft */}
      {qualityDetails && isDraftDone && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Kualitas draft:</span>
            {qualityScore !== null && <QualityBadge score={qualityScore} />}
          </div>
          <QualityPanel qd={qualityDetails} />
        </div>
      )}

      {/* STEP 3: Polish */}
      {(status === "draft_ready" || status === "draft_below_quality" || status === "draft_failed" || status === "polishing" || status === "final_ready") && (
        <div className="space-y-3 border-t pt-3">
          {draftWordCount && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Draft tersimpan</span>
              <Badge variant="outline">{draftWordCount} kata</Badge>
            </div>
          )}

          {/* Generate ulang jika draft_failed */}
          {status === "draft_failed" && (
            <Button onClick={() => handleGenerateDraft()} variant="destructive" className="w-full gap-2">
              <RefreshCw className="w-4 h-4" />Generate Ulang Draft
            </Button>
          )}

          {/* Polish button — muncul kecuali draft_failed dan belum ada final */}
          {(status === "draft_ready" || status === "draft_below_quality") && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {status === "draft_below_quality"
                  ? "Draft di bawah standar. Sangat disarankan polish dengan editor sebelum publish."
                  : "Draft sudah masuk editor. Bisa langsung publish atau polish dulu."}
              </p>
              <Button onClick={handlePolish} variant={status === "draft_below_quality" ? "default" : "outline"} className="w-full gap-2">
                <Wand2 className="w-4 h-4" />Polish dengan Editor (GPT OSS 120B)
              </Button>
            </div>
          )}

          {status === "polishing" && (
            <Button disabled variant="outline" className="w-full gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />GPT OSS 120B memoles...
            </Button>
          )}

          {status === "final_ready" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-3 h-3" />Artikel final siap
                </span>
                {finalWordCount && <Badge variant="outline">{finalWordCount} kata</Badge>}
              </div>
              {editNotes && (
                <div className="bg-muted/30 rounded p-2 text-xs text-muted-foreground">
                  <span className="font-medium">Perubahan:</span>{" "}
                  {editNotes.split("|").map((n, i, a) => (
                    <span key={i}>{n.trim()}{i < a.length - 1 ? " · " : ""}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reset */}
      {!["idle","generating_brief","generating_draft","polishing"].includes(status) && (
        <div className="flex gap-3">
          {status !== "brief_ready" && (
            <button onClick={() => { reset(); setStatus("brief_ready") }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ↺ Ulangi dari draft
            </button>
          )}
          <button onClick={() => reset(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ↺ Ulangi dari awal
          </button>
        </div>
      )}
    </div>
  )
}
