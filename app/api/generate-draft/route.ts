// app/api/generate-draft/route.ts — v3
//
// PERUBAHAN DARI v2:
// ✓ Ganti Cloudflare Workers AI (Llama 4 Scout) → OpenRouter (Google Gemma 4 31B IT)
// ✓ Model: google/gemma-4-31b-it:free via api.openrouter.ai
// ✓ Import prompt builder dari gemma-writer-prompt (rename dari llama-writer-prompt)
// ✓ Semua referensi "Llama" di label progress & draft_model diupdate ke Gemma

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildGemmaWriterSystem, buildGemmaWriterUser, estimatePromptTokens } from "@/lib/ai/gemma-writer-prompt"
import { checkQuality } from "@/lib/editorial/types"
import type { EditorialBrief } from "@/lib/editorial/types"

const encoder = new TextEncoder()

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function countWordsFromHTML(html: string): number {
  return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length
}

// Sanitizer JSON: escape newline/tab mentah di dalam string JSON
function sanitizeJsonControlChars(raw: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue }
      if (ch === "\\") { out += ch; escaped = true; continue }
      if (ch === '"') { out += ch; inString = false; continue }
      if (ch === "\n") { out += "\\n"; continue }
      if (ch === "\r") { continue }
      if (ch === "\t") { out += "\\t"; continue }
      out += ch
    } else {
      if (ch === '"') inString = true
      out += ch
    }
  }
  return out
}

// Auto-repair JSON dengan tanda kutip mentah di dalam string
function parseJsonWithAutoRepair(text: string): unknown {
  let current = text
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return JSON.parse(current)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const m = msg.match(/position (\d+)/)
      if (!m) throw e
      const pos = Number(m[1])
      let quoteIdx = -1
      for (let k = pos; k >= 0; k--) {
        if (current[k] === '"') { quoteIdx = k; break }
      }
      if (quoteIdx === -1) throw e
      current = current.slice(0, quoteIdx) + "\\" + current.slice(quoteIdx)
    }
  }
  throw new Error("Auto-repair JSON melebihi batas percobaan")
}

function extractJsonFromResponse(rawInput: string): { title: string; content: string } {
  const raw = typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput) ?? String(rawInput)

  const clean = sanitizeJsonControlChars(raw)
  let lastErr = ""

  try { const p = parseJsonWithAutoRepair(clean) as any; if (p.title && p.content) return p } catch (e) { lastErr = e instanceof Error ? e.message : String(e) }

  const block = clean.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (block) { try { const p = parseJsonWithAutoRepair(block[1].trim()) as any; if (p.title && p.content) return p } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  const i = clean.indexOf("{"), j = clean.lastIndexOf("}")
  if (i !== -1 && j !== -1) { try { const p = parseJsonWithAutoRepair(clean.slice(i, j + 1)) as any; if (p.title && p.content) return p } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  throw new Error(
    `Model tidak mengembalikan JSON valid (panjang respons: ${raw.length} karakter). ` +
    `Parse error: ${lastErr}. ` +
    `Awal: ${raw.slice(0, 150)} ||| Akhir: ${raw.slice(-150)}`
  )
}

// Bangun instruksi retry berdasarkan kegagalan spesifik
function buildRetryInstruction(
  qc: ReturnType<typeof checkQuality>,
  brief: EditorialBrief,
): string {
  const issues: string[] = []

  if (qc.wordCount < brief.wordTarget.min) {
    const gap = brief.wordTarget.min - qc.wordCount
    issues.push(`Artikel masih ${qc.wordCount} kata — kurang ${gap} kata dari target ${brief.wordTarget.min}. Perluas analisis di setiap subheading: tambahkan konteks "mengapa ini terjadi" dan "apa konsekuensinya" untuk setiap fakta yang sudah ada.`)
  }
  if (qc.h2Count < brief.wordTarget.h2Min) {
    issues.push(`Hanya ada ${qc.h2Count} subheading <h2> — harus ${brief.wordTarget.h2Min}. Tambahkan subheading yang hilang sesuai structureHints.`)
  }
  if (brief.quotes.length > 0 && !qc.hasBlockquote) {
    issues.push("Kutipan dari brief belum dimasukkan dengan tag <blockquote>. Tambahkan sekarang di posisi yang sesuai.")
  }
  if (qc.forbiddenFound.length > 0) {
    issues.push(`Frasa yang harus dihapus atau diganti: ${qc.forbiddenFound.map((f) => `"${f}"`).join(", ")}`)
  }

  return issues.join("\n\n") + "\n\nKembalikan artikel LENGKAP dalam JSON yang sama. Jangan potong konten yang sudah bagus."
}

// Normalizer respons AI ke string
function normalizeAiText(value: unknown): string {
  if (typeof value === "string") return value

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>
          if (typeof p.text === "string") return p.text
        }
        return ""
      })
      .join("")
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (typeof obj.text === "string") return obj.text
    if (typeof obj.content === "string") return obj.content
  }

  return ""
}

// ── Panggil OpenRouter (Google Gemma 4 31B IT) ────────────────────────────────
async function callOpenRouter(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id",
      "X-Title": "HalfSpace Draft Generator",
    },
    body: JSON.stringify({
      model: "google/gemma-4-31b-it:free",
      messages,
      max_tokens:  4096,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`OpenRouter error ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = await res.json()
  const rawValue = json?.choices?.[0]?.message?.content
  const raw = normalizeAiText(rawValue)

  if (!raw.trim()) {
    throw new Error(
      `OpenRouter tidak mengembalikan teks dari Gemma 4 31B. ` +
      `Raw shape: ${JSON.stringify(rawValue)?.slice(0, 300)}`
    )
  }

  return raw
}

export async function POST(req: NextRequest) {
  const { generationId } = await req.json()

  if (!generationId) {
    return new Response(
      sseEvent("error", { message: "generationId wajib diisi" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    )
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)))

      try {
        // ── 1. Ambil brief dari Supabase ────────────────────────────────
        send("progress", { step: 1, total: 5, label: "Mengambil editorial brief..." })

        const supabase = await createClient()
        const { data: generation, error } = await supabase
          .from("article_generations")
          .select("editorial_brief, news_type, topic")
          .eq("id", generationId)
          .single()

        if (error || !generation?.editorial_brief) {
          send("error", { message: "Brief tidak ditemukan. Jalankan generate-brief dulu." })
          controller.close(); return
        }

        const brief = generation.editorial_brief as EditorialBrief

        // ── 2. Siapkan prompt dan env ────────────────────────────────────
        const tokenEst = estimatePromptTokens(brief)
        send("progress", {
          step: 2, total: 5,
          label: `Brief siap (estimasi ${tokenEst.totalTokens} token). Mengirim ke Gemma 4 31B...`,
          tokenEstimate: tokenEst,
        })

        const openRouterKey = process.env.OPENROUTER_API_KEY
        if (!openRouterKey) throw new Error("OPENROUTER_API_KEY tidak ditemukan di environment")

        const systemPrompt = buildGemmaWriterSystem()
        const userPrompt   = buildGemmaWriterUser(brief)

        // ── 3. Generate pertama ──────────────────────────────────────────
        send("progress", { step: 3, total: 5, label: "Gemma 4 31B menulis artikel..." })

        const rawFirst = await callOpenRouter(openRouterKey, [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ])

        let parsed = extractJsonFromResponse(rawFirst)

        // ── 4. Quality check ─────────────────────────────────────────────
        let qc = checkQuality(
          parsed.content,
          brief.qualityGate,
          brief.quotes.length > 0,
        )

        // Auto-retry jika quality score < 70 atau word count terlalu pendek
        if (!qc.passed || qc.score < 70) {
          const retryInstruction = buildRetryInstruction(qc, brief)
          send("progress", {
            step: 3, total: 5,
            label: `Draft pertama score ${qc.score}/100 (${qc.wordCount} kata). Retry dengan instruksi spesifik...`,
            qualityScore: qc.score,
          })

          try {
            const rawRetry = await callOpenRouter(openRouterKey, [
              { role: "system",    content: systemPrompt },
              { role: "user",      content: userPrompt   },
              { role: "assistant", content: rawFirst      },
              { role: "user",      content: retryInstruction },
            ])

            const parsedRetry = extractJsonFromResponse(rawRetry)
            const qcRetry = checkQuality(parsedRetry.content, brief.qualityGate, brief.quotes.length > 0)

            // Ambil hasil terbaik antara percobaan pertama dan retry
            if (qcRetry.score > qc.score) {
              parsed = parsedRetry
              qc     = qcRetry
            }
          } catch (retryErr) {
            console.warn("⚠️ Retry gagal, pakai hasil pertama:", retryErr)
          }
        }

        // ── 5. Tentukan status berdasarkan quality score ─────────────────
        let draftStatus: string
        if (qc.score >= 70)      draftStatus = "draft_ready"
        else if (qc.score >= 50) draftStatus = "draft_below_quality"
        else                     draftStatus = "draft_failed"

        send("progress", {
          step: 4, total: 5,
          label: `Quality score: ${qc.score}/100. Menyimpan ke database...`,
          qualityScore:    qc.score,
          qualityDetails:  qc,
          draftStatus,
        })

        // ── 6. Simpan ke Supabase ────────────────────────────────────────
        const { error: updateError } = await supabase
          .from("article_generations")
          .update({
            draft_title:         parsed.title,
            draft_content:       parsed.content,
            draft_word_count:    qc.wordCount,
            draft_quality_score: qc.score,
            draft_quality_data:  qc,
            draft_model:         "google/gemma-4-31b-it",
            draft_generated_at:  new Date().toISOString(),
            status:              draftStatus,
          })
          .eq("id", generationId)

        if (updateError) console.error("❌ Supabase update error:", updateError)

        // ── 7. Kirim hasil ke CMS ────────────────────────────────────────
        send("done", {
          title:          parsed.title,
          content:        parsed.content,
          wordCount:      qc.wordCount,
          qualityScore:   qc.score,
          qualityDetails: qc,
          draftStatus,
          tokenUsed:      tokenEst.totalTokens,
          warning: draftStatus !== "draft_ready"
            ? draftStatus === "draft_below_quality"
              ? `Draft di bawah standar kualitas (score ${qc.score}/100). Disarankan polish dengan editor sebelum publish.`
              : `Draft gagal memenuhi standar minimum (score ${qc.score}/100). Pertimbangkan generate ulang.`
            : undefined,
        })

      } catch (err) {
        console.error("❌ generate-draft error:", err)
        send("error", { message: err instanceof Error ? err.message : "Error tidak diketahui" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
