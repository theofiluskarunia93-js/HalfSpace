// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic menggunakan Groq API
// LANGSUNG (GroqCloud) — TIDAK lagi lewat Gemini/Google AI Studio maupun
// OpenRouter. Satu langkah — tidak ada tahap editor terpisah.
//
// Pipeline:
//   Step 1 : Ambil data pendukung otomatis sesuai tipe berita (lihat di bawah)
//   Step 2 : Susun system prompt per tipe berita + user prompt dari topic & context gabungan
//   Step 3 : Groq GPT-OSS-120B menulis artikel final (title + content HTML)
//   Step 4 : Kirim hasil ke client via SSE
//
// ━━━ MODEL YANG DIPAKAI ━━━
// Sebelumnya pipeline ini lewat Gemini API langsung (Google AI Studio).
// Gemini DIHAPUS SEPENUHNYA — request sekarang dikirim langsung ke Groq API
// pakai SDK resmi (groq-sdk), yang OpenAI-compatible:
//   - openai/gpt-oss-120b → GPT-OSS 120B (OpenAI open-weight, dihosting di GroqCloud)
//
// Catatan: butuh GROQ_API_KEY dari GroqCloud Console (https://console.groq.com/keys),
// BUKAN lagi GEMINI_API_KEY. GPT-OSS-120B di Groq adalah model reasoning
// (Harmony format) dengan parameter reasoning_effort low/medium/high — di
// pipeline ini di-set "low" karena GPT-OSS-120B hanya bertugas MENULIS draft
// dari data yang sudah difetch (Bzzoiro + Tavily), bukan melakukan reasoning
// berat. Ini juga menghemat token: reasoning trace model ikut menghitung ke
// kuota max_tokens, jadi reasoning_effort rendah memastikan kuota token lebih
// banyak tersisa untuk konten artikel itu sendiri, bukan habis untuk "berpikir".
//
// ━━━ SUMBER DATA OTOMATIS PER TIPE BERITA ━━━
// Supaya artikel minim halusinasi, sebagian tipe berita mengambil data
// FAKTUAL secara otomatis sebelum dikirim ke Groq, alih-alih murni
// mengandalkan ketikan manual admin di kolom "context":
//
//   - hasil   (Hasil Pertandingan)   → Bzzoiro (skor, insiden, statistik) +
//                                       Tavily Search (laporan post-match hari ini — efektif ~30 menit)
//   - preview (Preview Pertandingan) → Bzzoiro (jadwal, prediksi ML) +
//                                       Tavily Search (analisis pra-laga — efektif ~12 jam)
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
// - GROQ_API_KEY    → dipakai untuk generate artikel via Groq API langsung (GPT-OSS-120B).
// - BZZOIRO_API_KEY → dipakai untuk konteks Hasil/Preview/Injury.
// - TAVILY_API_KEY  → dipakai untuk konteks Konpers & Transfer Rumor.

import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"
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

// maxDuration tetap 120s. Request langsung ke Groq API (inference Groq
// terkenal cepat — biasanya hitungan detik untuk artikel sepanjang ini),
// tapi durasi tetap dilonggarkan untuk jaga-jaga saat traffic tinggi.
// CATATAN: di Vercel Hobby plan, maxDuration di-cap di 60s — nilai di bawah
// ini hanya efektif kalau project memakai Pro/Enterprise plan (atau platform
// lain yang mendukung durasi lebih lama).
export const maxDuration = 120

// ━━━ MODEL GROQ YANG DIPAKAI ━━━
// Hanya satu model — tidak ada lagi dropdown pemilihan model di UI.
export const GROQ_MODEL = "openai/gpt-oss-120b" as const
export const GROQ_MODEL_LABEL = "GPT-OSS 120B (Groq)" as const

// Reasoning effort di-set rendah: tugas model di sini murni menulis draft
// artikel dari data yang SUDAH difetch (Bzzoiro + Tavily), bukan melakukan
// riset atau penalaran berat. Reasoning effort tinggi hanya membuang kuota
// token (reasoning trace ikut menghitung ke max_tokens) tanpa menambah
// kualitas tulisan untuk task sejenis ini.
const GROQ_REASONING_EFFORT = "low" as const

// Batas token completion. 8000 jauh lebih dari cukup untuk artikel + JSON
// overhead (kebutuhan riil biasanya ~1200-2500 token untuk artikel
// 500-900 kata), tapi tetap diberi keleluasaan untuk artikel yang lebih
// panjang dari data yang kaya (mis. hasil pertandingan dengan banyak insiden).
const GROQ_MAX_TOKENS = 8000

interface RequestBody {
  newsType: NewsType
  topic:    string
  context:  string
}

// ─── Label sumber data otomatis per tipe — dipakai untuk progress UI ───────
const AUTO_SOURCE_LABEL: Record<NewsType, string> = {
  hasil:    "Bzzoiro Sports Data API (skor & insiden) + Tavily Search (laporan post-match hari ini)",
  preview:  "Bzzoiro Sports Data API (jadwal & prediksi ML) + Tavily Search (analisis pra-laga 12 jam)",
  cedera:   "Bzzoiro (profil & statistik pemain) + Tavily Search (berita cedera 3 hari)",
  konpers:  "Tavily Search (2 hari terakhir)",
  transfer: "Tavily Search (2 hari terakhir)",
  trivia:   "Tidak ada — konteks manual admin",
}

// ─── Ambil konteks otomatis sesuai tipe berita ─────────────────────────────
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
    const message = err instanceof Error ? err.message : "Gagal mengambil data otomatis."
    console.error(`[generate-article] Auto-context gagal untuk newsType="${newsType}":`, message)

    if (!manualBlock.trim()) {
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

// ─── Groq API langsung: generate artikel ───────────────────────────────────
// TIDAK lagi lewat Gemini/Google AI Studio — request dikirim langsung ke
// Groq API pakai SDK resmi (groq-sdk), yang kompatibel dengan format
// OpenAI Chat Completions. Model fix GPT-OSS-120B, tidak ada lagi pilihan
// model dari admin.
//
// Catatan reasoning_effort: GPT-OSS-120B adalah model reasoning (Harmony
// format) — reasoning trace-nya ikut menghitung ke kuota max_tokens kalau
// tidak dibatasi. Karena task di sini hanya menulis draft dari data yang
// sudah tersedia (bukan riset/penalaran kompleks), reasoning_effort di-set
// "low" supaya kuota token tersisa maksimal untuk konten artikel itu sendiri
// dan menghindari output JSON terpotong di tengah karena reasoning yang
// terlalu panjang menghabiskan max_tokens duluan.
async function groqGenerateJson(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const client = new Groq({ apiKey })

  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: GROQ_MAX_TOKENS,
    reasoning_effort: GROQ_REASONING_EFFORT,
    response_format: { type: "json_object" },
  })

  return (completion.choices[0]?.message?.content ?? "").trim()
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
      { error: "GROQ_API_KEY belum dikonfigurasi di environment variables. Ambil API key dari GroqCloud Console (https://console.groq.com/keys)." },
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

  // Model fix GPT-OSS-120B (Groq) — tidak ada lagi pemilihan model dari client.

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

        // ── STEP 3: GPT-OSS-120B menulis artikel (Groq API langsung) ─────────
        send("progress", {
          step: 3,
          label: `Menulis Artikel dengan ${GROQ_MODEL_LABEL}`,
          source: sourceUsed,
          model: GROQ_MODEL,
        })

        const raw = await groqGenerateJson(groqKey, BASE_SYSTEM, userPrompt)

        if (!raw) {
          throw new Error(`${GROQ_MODEL_LABEL} tidak menghasilkan output. Kemungkinan timeout, request diblokir safety filter, atau kuota/billing Groq API habis. Coba lagi.`)
        }

        const result = extractJsonObject<{ title: string; content: string }>(raw)

        if (!result?.title?.trim() || !result?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil Groq. Raw:", raw.slice(0, 800))
          throw new Error(`Gagal memproses hasil dari ${GROQ_MODEL_LABEL}. Coba lagi dalam beberapa detik.`)
        }

        // ── STEP 4: Done ──────────────────────────────────────────────────────
        send("progress", { step: 4, label: "Artikel Selesai", source: sourceUsed })

        send("done", {
          title:      result.title.trim(),
          content:    result.content.trim(),
          sourceUsed,
          modelUsed:  GROQ_MODEL,
          modelLabel: GROQ_MODEL_LABEL,
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
