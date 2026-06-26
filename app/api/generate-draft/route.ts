// app/api/generate-draft/route.ts — v2
//
// PERUBAHAN DARI v1 (berdasarkan audit):
// ✓ [FIX #10] Quality gate sebelum simpan ke Supabase:
//             - checkQuality() dari types.ts menilai word count, H2 count,
//               blockquote presence, dan forbidden phrases
//             - status "draft_ready" hanya jika score ≥ 70
//             - status "draft_below_quality" jika score 50-69 (bisa dipublish manual)
//             - status "draft_failed" jika score < 50 (perlu generate ulang)
//             - Retry logic diperbaiki: retry dengan instruksi berbeda berdasarkan kegagalan spesifik

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildLlamaWriterSystem, buildLlamaWriterUser, estimatePromptTokens } from "@/lib/ai/llama-writer-prompt"
import { checkQuality } from "@/lib/editorial/types"
import type { EditorialBrief } from "@/lib/editorial/types"

const encoder = new TextEncoder()

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function countWordsFromHTML(html: string): number {
  return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length
}

function extractJsonFromLlama(raw: string): { title: string; content: string } {
  try { const p = JSON.parse(raw); if (p.title && p.content) return p } catch {}

  const block = raw.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (block) { try { const p = JSON.parse(block[1].trim()); if (p.title && p.content) return p } catch {} }

  const i = raw.indexOf("{"), j = raw.lastIndexOf("}")
  if (i !== -1 && j !== -1) { try { const p = JSON.parse(raw.slice(i, j + 1)); if (p.title && p.content) return p } catch {} }

  throw new Error("Llama tidak mengembalikan JSON valid. Snippet: " + raw.slice(0, 200))
}

// ── Bangun instruksi retry berdasarkan kegagalan spesifik ───────────────────
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

// ── Panggil Cloudflare Workers AI ────────────────────────────────────────────
async function callCloudflareAI(
  cfUrl: string,
  cfToken: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const res = await fetch(cfUrl, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      max_tokens:  2048,
      temperature: 0.4,
      stream:      false,
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Cloudflare AI error ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = await res.json()
  const raw  = json?.result?.response ?? json?.response ?? json?.choices?.[0]?.message?.content ?? ""
  if (!raw) throw new Error("Cloudflare AI tidak mengembalikan response")
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

        const supabase = createClient()
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
          label: `Brief siap (estimasi ${tokenEst.totalTokens} token). Mengirim ke Llama 4 Scout...`,
          tokenEstimate: tokenEst,
        })

        const cfToken = process.env.CF_API_TOKEN
        const cfAccId = process.env.CF_ACCOUNT_ID
        if (!cfToken || !cfAccId) throw new Error("CF_API_TOKEN atau CF_ACCOUNT_ID tidak ditemukan")

        const cfUrl = process.env.CF_AI_GATEWAY_URL
          ?? `https://api.cloudflare.com/client/v4/accounts/${cfAccId}/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct`

        const systemPrompt = buildLlamaWriterSystem()
        const userPrompt   = buildLlamaWriterUser(brief)

        // ── 3. Generate pertama ──────────────────────────────────────────
        send("progress", { step: 3, total: 5, label: "Llama 4 Scout menulis artikel..." })

        const rawFirst = await callCloudflareAI(cfUrl, cfToken, [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ])

        let parsed = extractJsonFromLlama(rawFirst)

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
            const rawRetry = await callCloudflareAI(cfUrl, cfToken, [
              { role: "system",    content: systemPrompt },
              { role: "user",      content: userPrompt   },
              { role: "assistant", content: rawFirst      },
              { role: "user",      content: retryInstruction },
            ])

            const parsedRetry = extractJsonFromLlama(rawRetry)
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
        else if (qc.score >= 50) draftStatus = "draft_below_quality"   // bisa publish manual
        else                     draftStatus = "draft_failed"           // perlu generate ulang

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
            draft_quality_data:  qc,              // kolom baru di v2
            draft_model:         "llama-4-scout-17b-16e-instruct",
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
