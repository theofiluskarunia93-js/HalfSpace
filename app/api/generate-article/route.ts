// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic menggunakan Gemini 3.5 Flash.
// Satu langkah — tidak ada tahap editor terpisah.
//
// Pipeline:
//   Step 1 : Susun system prompt per tipe berita + user prompt dari topic & context
//   Step 2 : Gemini 3.5 Flash menulis artikel final (title + content HTML)
//   Step 3 : Kirim hasil ke client via SSE
//
// Input : newsType + topic + context
// Output: SSE stream → { event: "progress"|"done"|"error", data: ... }
//
// Catatan API key:
// - GEMINI_API_KEY → dipakai untuk generate artikel. Model: gemini-3.5-flash.

import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { requireAdmin } from "@/lib/supabase/server-auth"
import {
  BASE_SYSTEM,
  TYPE_INSTRUCTION,
  extractJsonObject,
  sseEvent,
  type NewsType,
} from "@/lib/ai/article-prompts"

export type { NewsType }

export const maxDuration = 60

const MODEL = "gemini-3.5-flash"

interface RequestBody {
  newsType: NewsType
  topic:    string
  context:  string
  model?:   string  // tidak dipakai — dipertahankan untuk kompatibilitas UI
}

// ─── Gemini 3.5 Flash: generate artikel ──────────────────────────────────────
async function geminiGenerateJson(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const genai = new GoogleGenAI({ apiKey })

  const response = await genai.models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature:       0.85,
      maxOutputTokens:   8000,
      responseMimeType:  "application/json",
    },
  })

  return (response.text ?? "").trim()
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY belum dikonfigurasi di environment variables." },
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
        // ── STEP 1: Susun prompt ──────────────────────────────────────────────
        send("progress", { step: 1, label: "Menyusun Prompt Editorial" })

        const userPrompt = `${TYPE_INSTRUCTION[newsType]}

TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${context.trim()}

Tulis artikel berdasarkan topik dan konteks di atas.
Gunakan HANYA informasi yang ada di konteks — jangan tambahkan fakta, nama, skor, atau angka yang tidak disebutkan.
Pilih angle paling menarik dari konteks, dan biarkan narasi berkembang sesuai struktur tipe berita di atas.

Kembalikan HANYA JSON dengan format berikut (tidak ada teks di luar JSON):
{
  "title": "<judul artikel: menarik, max 80 karakter, tanpa tanda tanya, tanpa clickbait, bukan format 'Tim A vs Tim B'>",
  "content": "<konten artikel dalam HTML — gunakan <h2> untuk judul bagian, <p> untuk paragraf, <blockquote> untuk kutipan langsung dari narasumber. JANGAN gunakan tag HTML lain apapun.>"
}`

        // ── STEP 2: Gemini 3.5 Flash menulis artikel ─────────────────────────
        send("progress", { step: 2, label: "Menulis Artikel dengan Gemini 3.5 Flash" })

        const raw = await geminiGenerateJson(geminiKey, BASE_SYSTEM, userPrompt)

        if (!raw) {
          throw new Error("Gemini 3.5 Flash tidak menghasilkan output. Coba lagi.")
        }

        const result = extractJsonObject<{ title: string; content: string }>(raw)

        if (!result?.title?.trim() || !result?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil Gemini. Raw:", raw.slice(0, 800))
          throw new Error("Gagal memproses hasil Gemini 3.5 Flash. Coba lagi dalam beberapa detik.")
        }

        // ── STEP 3: Done ──────────────────────────────────────────────────────
        send("progress", { step: 3, label: "Artikel Selesai" })

        send("done", {
          title:   result.title.trim(),
          content: result.content.trim(),
        })

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Terjadi error. Coba lagi."
        console.error("[generate-article] Gemini error:", err)
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
