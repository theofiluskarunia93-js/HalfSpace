// app/api/generate-article/route.ts
//
// Generate DRAFT artikel sepak bola bergaya The Athletic — HANYA Tahap 1
// (Penulis). Sejak 22 Jun 2026, tahap editor (revisi) DIPISAH ke route
// tersendiri: app/api/edit-article/route.ts (Gemini 3.5 Flash). Route ini TIDAK lagi memanggil tahap editor
// secara otomatis — klien (create-article-view.tsx) memanggil endpoint
// editor lewat tombol terpisah, setelah draft ini selesai dan (kalau perlu)
// sudah diedit manual oleh admin.
//
// Pipeline:
//   Step 1 : Menyusun prompt editorial (gaya penulisan + tipe berita + topik/konteks)
//   Step 2 : Groq menulis draft (judul + isi) via openai/gpt-oss-120b
//   Step 3 : Draft dikirim ke editor artikel (BELUM final, belum direvisi)
//
// Streaming progress via SSE (Server-Sent Events) ke client — kontrak event
// SSE ("progress" | "done" | "error") dipertahankan sama seperti sebelumnya
// agar frontend tidak perlu mengubah cara baca stream.
//
// Input : newsType + topic + context
// Output: SSE stream → { event: "progress"|"done"|"error", data: ... }
//
// Catatan API key:
// - GROQ_API_KEY → dipakai untuk tahap draft. Model: openai/gpt-oss-120b.
//   Gemini TIDAK dipakai di route ini — Gemini 3.5 Flash hanya dipakai di
//   app/api/edit-article/route.ts (tahap editor).

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import {
  BASE_SYSTEM,
  TYPE_INSTRUCTION,
  extractJsonObject,
  sseEvent,
  type NewsType,
} from "@/lib/ai/article-prompts"

export type { NewsType }

// Draft-only sekarang jauh lebih cepat dari pipeline lama (tidak lagi
// menunggu tahap editor di request yang sama), tapi maxDuration tetap
// dipertahankan di 60s sebagai jaga-jaga kalau Groq lambat merespons.
export const maxDuration = 60

interface RequestBody {
  newsType: NewsType
  topic:    string
  context:  string
  model?:   string  // tidak dipakai — draft fixed ke Groq, dipertahankan untuk kompatibilitas UI lama
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── TAHAP 1 (Penulis): Groq menulis draft pertama ───────────────────────────
// Memakai Groq REST API (kompatibel OpenAI chat completions).
// Model: openai/gpt-oss-120b. Groq free tier jauh lebih longgar (umumnya 6000
// RPM, 500K tokens/menit), sehingga jarang kena rate limit.
async function groqGenerateJson(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       "openai/gpt-oss-120b",
      temperature: 0.85,
      max_tokens:  6000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new Error("Groq API rate limit tercapai. Tunggu beberapa detik lalu coba lagi.")
    if (res.status === 401) throw new Error("GROQ_API_KEY tidak valid. Hubungi administrator.")
    if (res.status === 400) throw new Error("Request ke Groq gagal (400). Coba kurangi panjang konteks.")
    throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const groqKey = process.env.GROQ_API_KEY

  if (!groqKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY belum dikonfigurasi di environment variables." },
      { status: 500 }
    )
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const { newsType, topic, context } = body

  if (!newsType || !topic?.trim() || !context?.trim()) {
    return NextResponse.json(
      { error: "newsType, topic, dan context wajib diisi." },
      { status: 400 }
    )
  }

  const validTypes: NewsType[] = ["transfer", "konpers", "cedera", "preview", "hasil", "trivia"]
  if (!validTypes.includes(newsType)) {
    return NextResponse.json({ error: "newsType tidak valid." }, { status: 400 })
  }

  // ── SSE Stream ───────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // ── STEP 1: Susun prompt editorial ───────────────────────────────────
        send("progress", { step: 1, label: "Menyusun Prompt Editorial" })

        const userPrompt = `${TYPE_INSTRUCTION[newsType]}

TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${context.trim()}

Tulis artikel berdasarkan topik dan konteks di atas.
Ingat: kamu jurnalis senior — bukan generator teks. Pilih angle yang paling menarik dari konteks yang diberikan, dan biarkan narasi berkembang secara organik mengikuti struktur yang sudah ditentukan di atas.

Kembalikan HANYA JSON dengan format berikut (tidak ada teks di luar JSON):
{
  "title": "<judul artikel: menarik, informatif, max 80 karakter, tanpa tanda tanya, tanpa clickbait>",
  "content": "<konten artikel dalam HTML — gunakan <p> untuk paragraf dan <blockquote> untuk kutipan langsung dari narasumber. JANGAN gunakan tag HTML lain apapun, termasuk heading.>"
}`

        // ── STEP 2: Groq menulis draft pertama (GPT-OSS-120B) ───────────────
        send("progress", { step: 2, label: "Menulis Draft dengan Groq (GPT-OSS-120B)" })

        const rawDraft = await groqGenerateJson(groqKey, BASE_SYSTEM, userPrompt)

        if (!rawDraft) {
          throw new Error("Groq tidak menghasilkan output. Coba lagi.")
        }

        const draft = extractJsonObject<{ title: string; content: string }>(rawDraft)

        if (!draft?.title?.trim() || !draft?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil Groq. Raw:", rawDraft.slice(0, 800))
          throw new Error("Gagal memproses hasil Groq. Coba lagi dalam beberapa detik.")
        }

        // ── STEP 3: Done — draft mentah, BELUM melalui editor ────────────────
        send("progress", { step: 3, label: "Draft Selesai" })

        send("done", {
          title:   draft.title.trim(),
          content: draft.content.trim(),
        })

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Terjadi error. Coba lagi."
        console.error("[generate-article] Error:", err)

        send("error", { error: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  })
}
