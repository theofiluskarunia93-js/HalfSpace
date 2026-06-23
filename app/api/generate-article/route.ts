// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic menggunakan Gemini 3.5 Flash.
// Satu langkah — tidak ada tahap editor terpisah.
//
// Pipeline:
//   Step 1 : Ambil data pendukung otomatis sesuai tipe berita (lihat di bawah)
//   Step 2 : Susun system prompt per tipe berita + user prompt dari topic & context gabungan
//   Step 3 : Gemini 3.5 Flash menulis artikel final (title + content HTML)
//   Step 4 : Kirim hasil ke client via SSE
//
// ━━━ SUMBER DATA OTOMATIS PER TIPE BERITA ━━━
// Supaya artikel minim halusinasi, sebagian tipe berita sekarang mengambil
// data FAKTUAL secara otomatis sebelum dikirim ke Gemini, alih-alih murni
// mengandalkan ketikan manual admin di kolom "context":
//
//   - hasil   (Hasil Pertandingan)   → Bzzoiro Sports Data API (skor, insiden, statistik)
//   - preview (Preview Pertandingan) → Bzzoiro Sports Data API (jadwal, prediksi ML)
//   - cedera  (Injury Update)        → Bzzoiro (profil & statistik pemain per match) +
//                                       Tavily Search (berita cedera resmi, window 3 hari)
//   - konpers (Konferensi Pers)      → Tavily Search, window 2 hari terakhir
//   - transfer (Transfer Rumor)      → Tavily Search, window 2 hari terakhir
//   - trivia  (Trivia)               → TIDAK diubah, tetap murni konteks manual admin
//
// Konteks manual admin TETAP dikirim dan digabung sebagai "[CATATAN TAMBAHAN
// ADMIN]" — bukan diganti. Kalau fetch data otomatis gagal/tidak ketemu,
// generate TETAP berjalan memakai konteks manual saja (lihat fallback di
// fetchAutoContext), supaya admin tidak terblokir total saat API eksternal
// down atau topiknya belum ada datanya.
//
// Input : newsType + topic + context
// Output: SSE stream → { event: "progress"|"done"|"error", data: ... }
//
// Catatan API key:
// - GEMINI_API_KEY   → dipakai untuk generate artikel. Model: gemini-3.5-flash.
// - BZZOIRO_API_KEY  → dipakai untuk konteks Hasil/Preview/Injury (sudah ada,
//                       sebelumnya hanya dipakai live-scores & standings).
// - TAVILY_API_KEY   → dipakai untuk konteks Konpers & Transfer Rumor.

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
import {
  fetchHasilContext,
  fetchPreviewContext,
  fetchCederaContext,
} from "@/lib/news-context/bzzoiro"
import { fetchTavilyContext } from "@/lib/news-context/tavily"

export type { NewsType }

export const maxDuration = 60

const MODEL = "gemini-3.5-flash"

interface RequestBody {
  newsType: NewsType
  topic:    string
  context:  string
  model?:   string  // tidak dipakai — dipertahankan untuk kompatibilitas UI
}

// ─── Label sumber data otomatis per tipe — dipakai untuk progress UI ───────
const AUTO_SOURCE_LABEL: Record<NewsType, string> = {
  hasil:    "Bzzoiro Sports Data API",
  preview:  "Bzzoiro Sports Data API",
  cedera:   "Bzzoiro (profil & statistik pemain) + Tavily Search (berita cedera 3 hari)",
  konpers:  "Tavily Search (2 hari terakhir)",
  transfer: "Tavily Search (2 hari terakhir)",
  trivia:   "Tidak ada — konteks manual admin",
}

// ─── Ambil konteks otomatis sesuai tipe berita ─────────────────────────────
// Mengembalikan teks konteks gabungan: [DATA API TERVERIFIKASI] + [CATATAN
// TAMBAHAN ADMIN]. Kalau fetch otomatis gagal, fallback ke konteks manual
// admin saja (dengan warning yang diteruskan ke event "progress").
async function fetchAutoContext(
  newsType: NewsType,
  topic: string,
  manualContext: string,
): Promise<{ combinedContext: string; warning?: string; sourceUsed: string }> {
  const manualBlock = manualContext.trim()
    ? `[CATATAN TAMBAHAN ADMIN]\n${manualContext.trim()}`
    : ""

  try {
    let apiBlock = ""
    let warning: string | undefined

    if (newsType === "hasil") {
      const r = await fetchHasilContext(topic)
      if (r.contextText) apiBlock = `[DATA API TERVERIFIKASI — Bzzoiro Sports Data API]\n${r.contextText}`
      warning = r.warning
    } else if (newsType === "preview") {
      const r = await fetchPreviewContext(topic)
      if (r.contextText) apiBlock = `[DATA API TERVERIFIKASI — Bzzoiro Sports Data API]\n${r.contextText}`
      warning = r.warning
    } else if (newsType === "cedera") {
      const r = await fetchCederaContext(topic)
      if (r.contextText) apiBlock = r.contextText
      warning = r.warning
    } else if (newsType === "konpers" || newsType === "transfer") {
      const r = await fetchTavilyContext(newsType, topic)
      apiBlock = `[DATA API TERVERIFIKASI — Tavily Search, 2 hari terakhir]\n${r.contextText}`
    }
    // trivia → tidak ada apiBlock, tetap pakai manualBlock saja

    const combinedContext = [apiBlock, manualBlock].filter(Boolean).join("\n\n")

    if (!combinedContext.trim()) {
      throw new Error("Tidak ada data API maupun konteks manual yang tersedia.")
    }

    return { combinedContext, warning, sourceUsed: AUTO_SOURCE_LABEL[newsType] }
  } catch (err: unknown) {
    // Fetch otomatis gagal total → fallback ke konteks manual admin saja.
    const message = err instanceof Error ? err.message : "Gagal mengambil data otomatis."
    console.error(`[generate-article] Auto-context gagal untuk newsType="${newsType}":`, message)

    if (!manualBlock.trim()) {
      // Tidak ada fallback sama sekali — lempar error supaya admin tahu harus isi manual.
      throw new Error(
        `Gagal mengambil data otomatis dari ${AUTO_SOURCE_LABEL[newsType]} (${message}), dan kolom konteks manual masih kosong. Isi konteks manual lalu coba lagi.`
      )
    }

    return {
      combinedContext: manualBlock,
      warning: `Data otomatis dari ${AUTO_SOURCE_LABEL[newsType]} gagal diambil (${message}). Artikel digenerate hanya dari catatan manual admin.`,
      sourceUsed: "Konteks manual admin (fallback)",
    }
  }
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

  if (!newsType || !topic?.trim()) {
    return NextResponse.json(
      { error: "newsType dan topic wajib diisi." },
      { status: 400 }
    )
  }

  const validTypes: NewsType[] = ["transfer", "konpers", "cedera", "preview", "hasil", "trivia"]
  if (!validTypes.includes(newsType)) {
    return NextResponse.json({ error: "newsType tidak valid." }, { status: 400 })
  }

  // Untuk trivia, context manual tetap wajib (tidak ada sumber data otomatis).
  if (newsType === "trivia" && !context?.trim()) {
    return NextResponse.json(
      { error: "context wajib diisi untuk tipe berita Trivia (tidak ada sumber data otomatis untuk tipe ini)." },
      { status: 400 }
    )
  }

  // ── SSE Stream ───────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // ── STEP 1: Ambil data pendukung otomatis ────────────────────────────
        send("progress", {
          step: 1,
          label: `Mengambil Data dari ${AUTO_SOURCE_LABEL[newsType]}`,
          source: AUTO_SOURCE_LABEL[newsType],
        })

        const { combinedContext, warning, sourceUsed } = await fetchAutoContext(
          newsType,
          topic.trim(),
          context ?? "",
        )

        if (warning) {
          send("progress", { step: 1, label: warning, source: sourceUsed, warning: true })
        }

        // ── STEP 2: Susun prompt ──────────────────────────────────────────────
        send("progress", { step: 2, label: "Menyusun Prompt Editorial", source: sourceUsed })

        const userPrompt = `${TYPE_INSTRUCTION[newsType]}

TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${combinedContext}

Tulis artikel berdasarkan topik dan konteks di atas.
Gunakan HANYA informasi yang ada di konteks — jangan tambahkan fakta, nama, skor, atau angka yang tidak disebutkan.
Pilih angle paling menarik dari konteks, dan biarkan narasi berkembang sesuai struktur tipe berita di atas.

Kembalikan HANYA JSON dengan format berikut (tidak ada teks di luar JSON):
{
  "title": "<judul artikel: menarik, max 80 karakter, tanpa tanda tanya, tanpa clickbait, bukan format 'Tim A vs Tim B'>",
  "content": "<konten artikel dalam HTML — gunakan <h2> untuk judul bagian, <p> untuk paragraf, <blockquote> untuk kutipan langsung dari narasumber. JANGAN gunakan tag HTML lain apapun.>"
}`

        // ── STEP 3: Gemini 3.5 Flash menulis artikel ─────────────────────────
        send("progress", { step: 3, label: "Menulis Artikel dengan Gemini 3.5 Flash", source: sourceUsed })

        const raw = await geminiGenerateJson(geminiKey, BASE_SYSTEM, userPrompt)

        if (!raw) {
          throw new Error("Gemini 3.5 Flash tidak menghasilkan output. Coba lagi.")
        }

        const result = extractJsonObject<{ title: string; content: string }>(raw)

        if (!result?.title?.trim() || !result?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil Gemini. Raw:", raw.slice(0, 800))
          throw new Error("Gagal memproses hasil Gemini 3.5 Flash. Coba lagi dalam beberapa detik.")
        }

        // ── STEP 4: Done ──────────────────────────────────────────────────────
        send("progress", { step: 4, label: "Artikel Selesai", source: sourceUsed })

        send("done", {
          title:      result.title.trim(),
          content:    result.content.trim(),
          sourceUsed,
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
