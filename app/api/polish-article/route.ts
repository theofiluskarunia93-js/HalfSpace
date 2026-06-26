// app/api/polish-article/route.ts
//
// STEP 3: Ambil draft dari Supabase, kirim ke GPT OSS 120B via Groq,
// stream hasilnya ke CMS via SSE, simpan final ke Supabase.
//
// Dijalankan MANUAL via tombol "Polish dengan Editor" di CMS.
// Tidak berjalan otomatis setelah generate-draft selesai.

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildEditorSystem, buildEditorUser, validateEditorOutput } from "@/lib/ai/gpt-editor-prompt"
import Groq from "groq-sdk"

const encoder = new TextEncoder()

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function countWordsFromHTML(html: string): number {
  return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length
}

function extractJsonFromEditorResponse(raw: string): {
  title: string
  content: string
  editNotes: string
} {
  try {
    const parsed = JSON.parse(raw)
    if (parsed.title && parsed.content) return { editNotes: "", ...parsed }
  } catch {}

  const jsonBlock = raw.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1].trim())
      if (parsed.title && parsed.content) return { editNotes: "", ...parsed }
    } catch {}
  }

  const firstBrace = raw.indexOf("{")
  const lastBrace  = raw.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
      if (parsed.title && parsed.content) return { editNotes: "", ...parsed }
    } catch {}
  }

  throw new Error("GPT Editor tidak mengembalikan JSON yang valid. Raw: " + raw.slice(0, 300))
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
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // ── Ambil draft dari Supabase ───────────────────────────────────
        send("progress", { step: 1, total: 3, label: "Mengambil draft artikel..." })

        const supabase = await createClient()
        const { data: generation, error: fetchError } = await supabase
          .from("article_generations")
          .select("draft_title, draft_content, draft_word_count, status")
          .eq("id", generationId)
          .single()

        if (fetchError || !generation) {
          send("error", { message: "Generation tidak ditemukan di database" })
          controller.close()
          return
        }

        if (!generation.draft_content) {
          send("error", { message: "Draft belum tersedia. Jalankan Step 2 (generate-draft) dulu." })
          controller.close()
          return
        }

        send("progress", {
          step: 2,
          total: 3,
          label: `Draft siap (${generation.draft_word_count ?? "?"} kata). Mengirim ke GPT OSS 120B...`,
        })

        // ── Panggil GPT OSS 120B via Groq ──────────────────────────────
        const groqKey = process.env.GROQ_API_KEY
        if (!groqKey) throw new Error("GROQ_API_KEY tidak ditemukan di .env.local")

        const groq = new Groq({ apiKey: groqKey })

        const completion = await groq.chat.completions.create({
          model:    "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: buildEditorSystem() },
            { role: "user",   content: buildEditorUser(generation.draft_title, generation.draft_content) },
          ],
          max_tokens:       4096,
          temperature:      0.2,    // editor harus konservatif
          response_format:  { type: "json_object" },
        })

        const rawResponse = completion.choices[0]?.message?.content ?? ""

        if (!rawResponse) throw new Error("GPT Editor tidak mengembalikan response")

        // ── Parse & validasi output editor ─────────────────────────────
        const result = extractJsonFromEditorResponse(rawResponse)

        const validation = validateEditorOutput(
          { title: generation.draft_title, content: generation.draft_content },
          { title: result.title,           content: result.content },
        )

        if (!validation.isValid) {
          // Log warning tapi jangan batalkan — tampilkan ke admin
          console.warn("⚠️ Editor validation warnings:", validation.warnings)
        }

        const finalWordCount = countWordsFromHTML(result.content)

        // ── Simpan final ke Supabase ────────────────────────────────────
        send("progress", { step: 3, total: 3, label: "Menyimpan artikel final ke database..." })

        const { error: updateError } = await supabase
          .from("article_generations")
          .update({
            final_title:          result.title,
            final_content:        result.content,
            final_word_count:     finalWordCount,
            edit_notes:           result.editNotes,
            editor_model:         "openai/gpt-oss-120b",
            final_generated_at:   new Date().toISOString(),
            status:               "final_ready",
          })
          .eq("id", generationId)

        if (updateError) {
          console.error("❌ Supabase update error:", updateError)
        }

        send("done", {
          title:             result.title,
          content:           result.content,
          wordCount:         finalWordCount,
          editNotes:         result.editNotes,
          validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
        })

      } catch (err) {
        console.error("❌ polish-article error:", err)
        send("error", {
          message: err instanceof Error ? err.message : "Error tidak diketahui",
        })
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
