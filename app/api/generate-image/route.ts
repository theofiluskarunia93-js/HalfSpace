// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic menggunakan Cloudflare Workers AI
// (@cf/meta/llama-4-scout-17b-16e-instruct), satu langkah, tanpa tahap editor terpisah.
//
// Migrasi dari Groq gpt-oss-120b (TPM 8K free tier, sering 413 "Request too large")
// ke Cloudflare Llama 4 Scout — context window 131K (vs TPM Groq 8K) dan rate limit
// Text Generation 300 RPM (vs 30 RPM Groq free tier). Verifikasi limit aktual akun
// di dashboard Cloudflare (Workers AI → Limits) sebelum mengandalkan angka publik ini.
//
// ━━━ PIPELINE DATA (v3 — Bzzoiro + Serper + Tavily) ━━━
//
//   Bzzoiro (data & statistik terverifikasi)
//     ↓
//   Serper  (media: ESPN, Sky Sports, Detik Sport, CNN Indonesia, BBC, FIFA.com, dll —
//            tergantung tipe berita)
//     ↓
//   Tavily  (backup + berita tambahan yang belum tertangkap Serper — max_results 2)
//     ↓
//   LLM (Cloudflare Workers AI — Llama 4 Scout, context window ~131.000 token)
//     ↓
//   Artikel SEO
//
// BOBOT SUMBER PER TIPE BERITA:
//
//   - preview  → Bzzoiro 60% (H2H 5, form 5, win probability, odds, klasemen) +
//                Serper 25% (ESPN, Sky Sports, Detik Sport, CNN Indonesia — prediksi
//                media, kondisi skuad, quote pelatih, pemain kunci, narasi) +
//                Tavily 15% (backup: cedera terbaru, update latihan, berita minor)
//
//   - hasil    → Bzzoiro (skor, xG, shots, SOT, possession, momentum, insiden) +
//                Serper (ESPN, Sky Sports, Detik Sport, CNN Indonesia — player ratings,
//                MOTM, analisis, komentar pelatih) +
//                Tavily (backup: reaksi pemain, reaksi media, statistik tambahan)
//
//   - transfer → Bzzoiro (profil & statistik pemain) +
//                Serper (Sky Sports, The Athletic, BBC Sport, ESPN, Fabrizio Romano —
//                status negosiasi, nilai transfer, sumber rumor, komentar agen/pelatih) +
//                Tavily (validasi tambahan)
//
//   - konpers  → Bzzoiro (form tim, posisi klasemen, 5 laga terakhir) +
//                Serper (ESPN, Sky Sports, FIFA.com — quote pelatih, quote pemain,
//                pernyataan penting) +
//                Tavily (pelengkap)
//
//   - cedera   → Bzzoiro (profil pemain, kontribusi, menit, gol, assist) +
//                Serper (ESPN, BBC, Sky Sports, situs resmi klub — injury update,
//                official statement) +
//                Tavily (pelengkap, info yang tidak ada di Serper, max_results 2)
//
//   - trivia   → TIDAK ada sumber otomatis, tetap pakai konteks manual admin
//
// Konteks manual admin TETAP dikirim & digabung sebagai "[CATATAN TAMBAHAN ADMIN]".
// Fallback ke manual jika SEMUA fetch otomatis gagal.

import { NextRequest, NextResponse } from "next/server"
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
  fetchTransferContext,
  fetchKonpersContext,
  type BzzoiroContextResult,
} from "@/lib/news-context/bzzoiro"
import {
  fetchSerperContext,
  SERPER_DATA_NEEDED,
  serperSourceLabel,
  type SerperNewsType,
} from "@/lib/news-context/serper"
import { fetchTavilyContext, TAVILY_BACKUP_DATA } from "@/lib/news-context/tavily"

export type { NewsType }

export const maxDuration = 120

// ─── Cloudflare Workers AI — Llama 4 Scout ───────────────────────────────────
// Model dipanggil lewat REST API native Cloudflare (bukan SDK npm), karena route
// ini sudah jalan di server Next.js — fetch biasa ke endpoint Workers AI sudah cukup.
export const CF_MODEL       = "@cf/meta/llama-4-scout-17b-16e-instruct" as const
export const CF_MODEL_LABEL = "Llama 4 Scout (Cloudflare Workers AI)" as const

// Target artikel 500-700 kata = ~900-1300 token output. Context window Llama 4 Scout
// di Workers AI ~131.000 token (input+output gabungan) — jauh lebih lega dari Groq (8K TPM),
// tapi max_tokens tetap dibatasi di sini supaya output konsisten & tidak melebar tanpa kendali.
const CF_MAX_TOKENS = 2000

interface RequestBody {
  newsType: NewsType
  topic:    string
  context:  string
}

// Tipe berita yang punya pipeline otomatis 3-sumber (semua kecuali trivia).
type AutoNewsType = SerperNewsType // "preview" | "hasil" | "transfer" | "konpers" | "cedera"

// ─── Bzzoiro fetcher per tipe — map agar orkestrasi di bawah seragam ─────────
const BZZOIRO_FETCHERS: Record<AutoNewsType, (topic: string) => Promise<BzzoiroContextResult>> = {
  hasil:    fetchHasilContext,
  preview:  fetchPreviewContext,
  cedera:   fetchCederaContext,
  transfer: fetchTransferContext,
  konpers:  fetchKonpersContext,
}

// ─── Label sumber data otomatis per tipe — dipakai untuk progress UI ─────────
const AUTO_SOURCE_LABEL: Record<NewsType, string> = {
  preview:  "Bzzoiro 60% (H2H, form, win probability, odds, klasemen) + Serper 25% (ESPN, Sky Sports, Detik Sport, CNN Indonesia) + Tavily 15% (backup)",
  hasil:    "Bzzoiro (data & statistik pertandingan) + Serper (ESPN, Sky Sports, Detik Sport, CNN Indonesia) + Tavily (backup)",
  cedera:   "Bzzoiro (profil & kontribusi pemain) + Serper (ESPN, BBC, Sky Sports, situs resmi klub) + Tavily (pelengkap, max 2)",
  konpers:  "Bzzoiro (form & klasemen tim) + Serper (ESPN, Sky Sports, FIFA.com) + Tavily (pelengkap)",
  transfer: "Bzzoiro (profil & statistik pemain) + Serper (Sky Sports, The Athletic, BBC Sport, ESPN, Fabrizio Romano) + Tavily (validasi tambahan)",
  trivia:   "Tidak ada — konteks manual admin",
}

// ─── Ambil konteks otomatis sesuai tipe berita ───────────────────────────────
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

    if (newsType === "trivia") {
      // Tidak ada sumber otomatis — tetap pakai konteks manual admin saja.
    } else {
      const autoType: AutoNewsType = newsType
      const warnParts: string[] = []
      const parts: string[] = []

      // Bzzoiro, Serper, dan Tavily dipanggil PARALEL — independen satu sama lain.
      const [bzzoiroResult, serperResult, tavilyResult] = await Promise.allSettled([
        BZZOIRO_FETCHERS[autoType](topic),
        fetchSerperContext(autoType, topic),
        fetchTavilyContext(autoType, topic),
      ])

      // ── 1. Bzzoiro — data & statistik terverifikasi ───────────────────
      if (bzzoiroResult.status === "fulfilled" && bzzoiroResult.value.contextText) {
        parts.push(bzzoiroResult.value.contextText)
        if (bzzoiroResult.value.warning) warnParts.push(bzzoiroResult.value.warning)
      } else {
        const reason = bzzoiroResult.status === "rejected"
          ? (bzzoiroResult.reason?.message ?? "error tidak diketahui")
          : "tidak ada data ditemukan"
        warnParts.push(`Bzzoiro gagal: ${reason}.`)
      }

      // ── 2. Serper — media (ESPN, Sky Sports, dll sesuai tipe) ──────────
      if (serperResult.status === "fulfilled") {
        parts.push(
          `[SUMBER MEDIA — Serper Search: ${serperSourceLabel(autoType)}]\n` +
          `Ambil: ${SERPER_DATA_NEEDED[autoType]}.\n` +
          serperResult.value.contextText
        )
      } else {
        warnParts.push(
          `Serper tidak menemukan berita media untuk "${topic}" ` +
          `(${serperResult.reason?.message ?? "error tidak diketahui"}).`
        )
      }

      // ── 3. Tavily — backup + berita tambahan ───────────────────────────
      if (tavilyResult.status === "fulfilled") {
        parts.push(
          `[BACKUP & BERITA TAMBAHAN — Tavily Search]\n` +
          `Ambil: ${TAVILY_BACKUP_DATA[autoType]}.\n` +
          tavilyResult.value.contextText
        )
      } else {
        warnParts.push(
          `Tavily tidak menemukan info tambahan untuk "${topic}" ` +
          `(${tavilyResult.reason?.message ?? "error tidak diketahui"}).`
        )
      }

      apiBlock = parts.join("\n\n")
      warning  = warnParts.length > 0 ? warnParts.join(" | ") : undefined
    }

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
        `Gagal mengambil data otomatis dari ${AUTO_SOURCE_LABEL[newsType]} (${message}), ` +
        `dan kolom konteks manual masih kosong. Isi konteks manual lalu coba lagi.`
      )
    }

    return {
      combinedContext: manualBlock,
      warning: `Data otomatis dari ${AUTO_SOURCE_LABEL[newsType]} gagal diambil (${message}). ` +
               `Artikel digenerate hanya dari catatan manual admin.`,
      sourceUsed: "Konteks manual admin (fallback)",
    }
  }
}

// ─── Cloudflare Workers AI: generate artikel ─────────────────────────────────
async function cfGenerateJson(
  accountId: string,
  apiToken: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ raw: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      max_tokens: CF_MAX_TOKENS,
      // Llama 4 Scout tidak punya native json_object mode seperti gpt-oss di Groq —
      // kepatuhan format JSON murni mengandalkan instruksi tegas di BASE_SYSTEM/userPrompt.
    }),
    signal: AbortSignal.timeout(110_000),
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "")
    console.error(`[generate-article] Cloudflare Workers AI error ${res.status}:`, bodyText.slice(0, 500))
    throw new Error(`Cloudflare Workers AI error ${res.status}: ${bodyText.slice(0, 300)}`)
  }

  const json = await res.json()

  if (json.success === false) {
    const errMsg = (json.errors ?? []).map((e: any) => e.message).join("; ") || "Error tidak diketahui."
    throw new Error(`Cloudflare Workers AI gagal: ${errMsg}`)
  }

  const raw = (json.result?.response ?? "").trim()

  // Cloudflare Workers AI mengembalikan usage di beberapa model — field & nama bisa
  // berbeda dari Groq (prompt_tokens/completion_tokens vs format lain), jadi dibaca
  // secara defensif. Kalau tidak ada, dicatat sebagai undefined (bukan error).
  const u = json.result?.usage
  const usage = u
    ? {
        promptTokens:     u.prompt_tokens     ?? u.input_tokens  ?? 0,
        completionTokens: u.completion_tokens ?? u.output_tokens ?? 0,
        totalTokens:      u.total_tokens      ?? ((u.prompt_tokens ?? u.input_tokens ?? 0) + (u.completion_tokens ?? u.output_tokens ?? 0)),
      }
    : undefined

  // LOG token aktual dari Cloudflare — dicatat untuk SETIAP generate (sukses maupun
  // mendekati limit), supaya konsumsi nyata diketahui dibandingkan context window ~131K.
  if (usage) {
    console.log(
      `[generate-article] Token usage — prompt: ${usage.promptTokens}, ` +
      `completion: ${usage.completionTokens}, total: ${usage.totalTokens} ` +
      `(context window Llama 4 Scout: ~131.000)`
    )
  } else {
    console.log("[generate-article] Token usage tidak tersedia di response Cloudflare (field 'usage' kosong).")
  }

  return { raw, usage }
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const cfApiToken  = process.env.CLOUDFLARE_API_TOKEN
  if (!cfAccountId || !cfApiToken) {
    return NextResponse.json(
      { error: "CLOUDFLARE_ACCOUNT_ID dan/atau CLOUDFLARE_API_TOKEN belum dikonfigurasi di environment variables." },
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
    return NextResponse.json({ error: "newsType dan topic wajib diisi." }, { status: 400 })
  }

  const validTypes: NewsType[] = ["transfer", "konpers", "cedera", "preview", "hasil", "trivia"]
  if (!validTypes.includes(newsType)) {
    return NextResponse.json({ error: "newsType tidak valid." }, { status: 400 })
  }

  if (newsType === "trivia" && !context?.trim()) {
    return NextResponse.json(
      { error: "context wajib diisi untuk tipe berita Trivia (tidak ada sumber data otomatis)." },
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
        // ── STEP 1: Ambil data pendukung otomatis (Bzzoiro + Serper + Tavily) ──
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

        // ── STEP 2: Susun prompt ─────────────────────────────────────────
        send("progress", { step: 2, label: "Menyusun Prompt Editorial", source: sourceUsed })

        const userPrompt = `${TYPE_INSTRUCTION[newsType]}

TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${combinedContext}

Tulis artikel berdasarkan topik dan konteks di atas.
Gunakan HANYA informasi yang ada di konteks — jangan tambahkan fakta, nama, skor, atau angka yang tidak disebutkan.
Pilih angle paling menarik dari konteks, dan biarkan narasi berkembang sesuai struktur tipe berita di atas.

INSTRUKSI PANJANG (WAJIB DIPATUHI):
- WAJIB 500-700 kata. Hitung kata sebelum selesai menulis.
- WAJIB minimal 8 paragraf. Setiap paragraf harus membawa satu ide atau momen baru.
- WAJIB minimal 3 subheading <h2>.
- Setiap subheading WAJIB diikuti minimal 2 paragraf sebelum subheading berikutnya.
- Setiap fakta dari konteks WAJIB dikembangkan menjadi analisis, bukan sekadar disebutkan.
- Artikel pendek TIDAK DITERIMA. Jika terasa selesai sebelum 500 kata, tambahkan analisis implikasi, konteks historis, atau elaborasi taktis dari data yang ada.

Kembalikan HANYA JSON dengan format berikut (tidak ada teks di luar JSON):
{
  "title": "<judul artikel: menarik, max 80 karakter, tanpa tanda tanya, tanpa clickbait, bukan format 'Tim A vs Tim B'>",
  "content": "<konten artikel dalam HTML — gunakan <h2> untuk judul bagian, <p> untuk paragraf, <blockquote> untuk kutipan langsung dari narasumber. JANGAN gunakan tag HTML lain apapun.>"
}`

        // ── STEP 3: Llama 4 Scout menulis artikel ────────────────────────
        send("progress", {
          step: 3,
          label: `Menulis Artikel dengan ${CF_MODEL_LABEL}`,
          source: sourceUsed,
          model: CF_MODEL,
        })

        const { raw, usage } = await cfGenerateJson(cfAccountId, cfApiToken, BASE_SYSTEM, userPrompt)

        if (!raw) {
          throw new Error(
            `${CF_MODEL_LABEL} tidak menghasilkan output. ` +
            `Kemungkinan timeout, request diblokir safety filter, atau kuota Workers AI habis.`
          )
        }

        const result = extractJsonObject<{ title: string; content: string }>(raw)

        if (!result?.title?.trim() || !result?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil Cloudflare. Raw:", raw.slice(0, 800))
          throw new Error(`Gagal memproses hasil dari ${CF_MODEL_LABEL}. Coba lagi.`)
        }

        // ── STEP 4: Done ─────────────────────────────────────────────────
        send("progress", { step: 4, label: "Artikel Selesai", source: sourceUsed })

        send("done", {
          title:      result.title.trim(),
          content:    result.content.trim(),
          sourceUsed,
          modelUsed:  CF_MODEL,
          modelLabel: CF_MODEL_LABEL,
          // Token aktual dari Cloudflare — berguna utk memantau jarak ke context window ~131K
          // tanpa harus menunggu error/limit terjadi dulu.
          tokenUsage: usage,
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
