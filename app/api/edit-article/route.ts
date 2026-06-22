// app/api/edit-article/route.ts
//
// Tahap EDITOR — terpisah dari tahap draft (app/api/generate-article/route.ts).
//
// Sejak 22 Jun 2026, pipeline generate artikel dipecah jadi dua langkah yang
// independen di UI (dua tombol berbeda di create-article-view.tsx):
//   1. Generate Draft   → app/api/generate-article/route.ts (Groq, fixed)
//   2. Revisi Editor AI → route INI (Gemini 3.5 Flash)
//
// Route ini menerima draft (title + content + newsType) yang SUDAH ADA di
// editor — entah hasil langsung dari tahap 1, atau yang sudah diedit manual
// oleh admin — lalu mengirimkannya ke Gemini 3.5 Flash untuk direvisi sebagai
// editor senior. TIDAK menulis ulang dari nol.
//
// Model: gemini-3.5-flash (GA sejak 19 Mei 2026, Google I/O 2026)
//
// Streaming progress via SSE — kontrak event sama dengan route draft:
// ("progress" | "done" | "error"), supaya pola baca stream di frontend
// konsisten antara kedua route.
//
// Catatan API key:
// - GEMINI_API_KEY → dipakai untuk revisi editor.
//   OpenRouter TIDAK lagi dipakai di route ini.

import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { requireAdmin } from "@/lib/supabase/server-auth"
import {
  EDITOR_SYSTEM,
  extractJsonObject,
  sseEvent,
  type NewsType,
} from "@/lib/ai/article-prompts"

export const maxDuration = 60

const MODEL = "gemini-3.5-flash"

interface RequestBody {
  newsType: NewsType
  title:    string
  content:  string
}

interface DraftResult {
  title:   string
  content: string
}

// ─── Panggilan Gemini 3.5 Flash via @google/genai SDK ────────────────────────
async function geminiReviseJson(
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
      temperature:       0.7,
      maxOutputTokens:   5000,
      responseMimeType:  "application/json",
    },
  })

  return (response.text ?? "").trim()
}

async function tryReviseWithGemini(
  apiKey: string,
  userPrompt: string,
): Promise<DraftResult> {
  const raw = await geminiReviseJson(apiKey, EDITOR_SYSTEM, userPrompt)

  if (!raw) {
    throw new Error("Gemini 3.5 Flash tidak menghasilkan output.")
  }

  const result = extractJsonObject<DraftResult>(raw)

  if (!result?.title?.trim() || !result?.content?.trim()) {
    console.error("[edit-article] Gagal parse hasil Gemini. Raw:", raw.slice(0, 800))
    throw new Error("Gagal memproses hasil revisi dari Gemini 3.5 Flash.")
  }

  return { title: result.title.trim(), content: result.content.trim() }
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

  const { newsType, title, content } = body

  if (!newsType || !title?.trim() || !content?.trim()) {
    return NextResponse.json(
      { error: "newsType, title, dan content (draft yang ingin direvisi) wajib diisi." },
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

      const userPrompt = `Berikut draft artikel yang perlu kamu revisi sebagai editor senior.

TIPE BERITA: ${newsType}

DRAFT (judul):
${title.trim()}

DRAFT (isi, HTML):
${content.trim()}

Revisi draft di atas sesuai instruksi editor yang sudah diberikan. Kembalikan HASIL REVISI FINAL dalam format JSON:
{
  "title": "<judul hasil revisi: menarik, informatif, max 80 karakter, tanpa tanda tanya, tanpa clickbait>",
  "content": "<konten hasil revisi dalam HTML — gunakan <p> untuk paragraf dan <blockquote> untuk kutipan langsung. JANGAN gunakan tag HTML lain apapun, termasuk heading.>"
}`

      try {
        send("progress", { step: 1, label: "Revisi Editor dengan Gemini 3.5 Flash", model: "gemini-3.5-flash" })

        const final = await tryReviseWithGemini(geminiKey, userPrompt)

        send("progress", { step: 2, label: "Revisi Selesai (Gemini 3.5 Flash)" })
        send("done", { title: final.title, content: final.content, modelUsed: "gemini-3.5-flash" })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Terjadi error. Coba lagi."
        console.error("[edit-article] Gemini 3.5 Flash error:", err)

        send("error", { error: `Gagal merevisi draft dengan Gemini 3.5 Flash. ${message}` })
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
