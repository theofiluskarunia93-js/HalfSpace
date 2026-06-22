// app/api/edit-article/route.ts
//
// Tahap EDITOR — terpisah dari tahap draft (app/api/generate-article/route.ts).
//
// Sejak 22 Jun 2026, pipeline generate artikel dipecah jadi dua langkah yang
// independen di UI (dua tombol berbeda di create-article-view.tsx):
//   1. Generate Draft   → app/api/generate-article/route.ts (Groq, fixed)
//   2. Revisi Editor AI → route INI (OpenRouter)
//
// Route ini menerima draft (title + content + newsType) yang SUDAH ADA di
// editor — entah hasil langsung dari tahap 1, atau yang sudah diedit manual
// oleh admin — lalu mengirimkannya ke OpenRouter untuk direvisi sebagai
// editor senior. TIDAK menulis ulang dari nol.
//
// Model & fallback:
//   Percobaan 1 : nvidia/nemotron-3-ultra-550b-a55b:free  (Nemotron 3 Ultra)
//   Percobaan 2 : nvidia/nemotron-3-super-120b-a12b:free  (Nemotron 3 Super)
//     ↳ dicoba HANYA kalau percobaan 1 gagal (timeout, rate limit, error API,
//       atau output tidak bisa diparse jadi JSON).
//
// Streaming progress via SSE — kontrak event sama dengan route draft:
// ("progress" | "done" | "error"), supaya pola baca stream di frontend
// konsisten antara kedua route.
//
// Catatan API key:
// - OPENROUTER_API_KEY → dipakai untuk kedua percobaan (Ultra & Super).
//   Groq TIDAK dipakai di route ini.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import {
  EDITOR_SYSTEM,
  extractJsonObject,
  sseEvent,
  type NewsType,
} from "@/lib/ai/article-prompts"

// Dua percobaan model berurutan (Ultra → Super) bisa makan waktu lebih dari
// 10 detik kalau percobaan pertama timeout. 60s aman di Vercel Hobby dengan
// Fluid Compute aktif.
export const maxDuration = 60

const MODEL_ULTRA = "nvidia/nemotron-3-ultra-550b-a55b:free"
const MODEL_SUPER = "nvidia/nemotron-3-super-120b-a12b:free"

interface RequestBody {
  newsType: NewsType
  title:    string
  content:  string
}

interface DraftResult {
  title:   string
  content: string
}

// ─── Panggilan OpenRouter (kompatibel OpenAI chat completions) ──────────────
async function openRouterReviseJson(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
      // Opsional, direkomendasikan OpenRouter untuk identifikasi aplikasi —
      // tidak wajib tapi membantu kalau perlu debug rate limit di dashboard.
      "HTTP-Referer": "https://halfspace.id",
      "X-Title":      "HalfSpace.id Editor AI",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens:  5000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new Error(`Rate limit tercapai di OpenRouter (${model}).`)
    if (res.status === 401) throw new Error("OPENROUTER_API_KEY tidak valid. Hubungi administrator.")
    if (res.status === 408 || res.status === 504) throw new Error(`Model ${model} timeout di OpenRouter.`)
    throw new Error(`OpenRouter error ${res.status} (${model}): ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[]
    error?:   { message?: string }
  }

  if (data.error) {
    throw new Error(`OpenRouter (${model}): ${data.error.message ?? "Error tidak diketahui."}`)
  }

  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// Coba satu model OpenRouter, parse hasilnya jadi { title, content }.
// Lempar error kalau request gagal ATAU hasilnya tidak bisa diparse —
// supaya caller bisa fallback ke model berikutnya.
async function tryReviseWithModel(
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<DraftResult> {
  const raw = await openRouterReviseJson(apiKey, model, EDITOR_SYSTEM, userPrompt)

  if (!raw) {
    throw new Error(`Model ${model} tidak menghasilkan output.`)
  }

  const result = extractJsonObject<DraftResult>(raw)

  if (!result?.title?.trim() || !result?.content?.trim()) {
    console.error(`[edit-article] Gagal parse hasil ${model}. Raw:`, raw.slice(0, 800))
    throw new Error(`Gagal memproses hasil revisi dari ${model}.`)
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

  const openRouterKey = process.env.OPENROUTER_API_KEY

  if (!openRouterKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY belum dikonfigurasi di environment variables." },
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
        // ── STEP 1: Coba Nemotron 3 Ultra ────────────────────────────────────
        send("progress", { step: 1, label: "Revisi Editor dengan Nemotron 3 Ultra", model: "ultra" })

        try {
          const final = await tryReviseWithModel(openRouterKey, MODEL_ULTRA, userPrompt)

          send("progress", { step: 2, label: "Revisi Selesai (Nemotron 3 Ultra)" })
          send("done", { title: final.title, content: final.content, modelUsed: "ultra" })
          return
        } catch (ultraErr) {
          console.error("[edit-article] Nemotron 3 Ultra gagal, fallback ke Super:", ultraErr)

          // ── STEP 2: Fallback ke Nemotron 3 Super ───────────────────────────
          send("progress", { step: 2, label: "Nemotron 3 Ultra gagal — fallback ke Nemotron 3 Super", model: "super" })

          const final = await tryReviseWithModel(openRouterKey, MODEL_SUPER, userPrompt)

          send("progress", { step: 3, label: "Revisi Selesai (Nemotron 3 Super)" })
          send("done", { title: final.title, content: final.content, modelUsed: "super" })
          return
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Terjadi error. Coba lagi."
        console.error("[edit-article] Error (Ultra & Super keduanya gagal):", err)

        send("error", { error: `Nemotron 3 Ultra dan Nemotron 3 Super gagal merevisi draft. ${message}` })
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
