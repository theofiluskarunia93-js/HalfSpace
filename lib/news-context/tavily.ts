// lib/news-context/tavily.ts
//
// Sumber konteks untuk tipe berita: KONFERENSI PERS, TRANSFER RUMOR, & INJURY UPDATE.
// Menggunakan Tavily Search API (web search real-time) — bukan Bzzoiro.
//
// OPTIMASI TOKEN (v2):
// - max_results dikurangi dari 8 → 4 per tipe
// - Format konteks diubah dari artikel penuh → ringkasan 3 kalimat per sumber
// - Estimasi token Tavily: 80-120 token/sumber × 4 sumber = ~320-480 token
//   (sebelumnya bisa 1500-3000 token untuk 8 sumber artikel penuh)
//
// Catatan API key:
// - TAVILY_API_KEY → dipakai untuk search Konpers & Transfer Rumor.

export interface TavilyContextResult {
  contextText: string
  sources: { title: string; url: string; publishedDate?: string }[]
  queryUsed: string
}

interface TavilyRawResult {
  title: string
  url: string
  content: string
  score: number
  published_date?: string
}

interface TavilyRawResponse {
  query: string
  answer?: string
  results: TavilyRawResult[]
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search"

// Window waktu pencarian per tipe berita.
const TAVILY_DAYS_WINDOW: Record<"konpers" | "transfer" | "cedera" | "preview" | "hasil", number> = {
  konpers:  2,
  transfer: 2,
  cedera:   2,
  preview:  1,
  hasil:    1,
}

// OPTIMASI: max_results dikurangi dari 8 → 4 untuk semua tipe
const TAVILY_MAX_RESULTS = 4

async function tavilySearch(apiKey: string, query: string, daysWindow: number): Promise<TavilyRawResponse> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      topic: "news",
      days: daysWindow,
      max_results: TAVILY_MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`❌ tavilySearch error ${res.status} — query: "${query}" — body: ${body.slice(0, 300)}`)
    throw new Error(`Tavily API error ${res.status}`)
  }

  return res.json()
}

// ─── Bangun query pencarian sesuai tipe berita ──────────────────────────────
function buildQuery(newsType: "konpers" | "transfer" | "cedera" | "preview" | "hasil", topic: string): string {
  if (newsType === "konpers") {
    return `${topic} konferensi pers press conference kutipan terbaru`
  }
  if (newsType === "cedera") {
    return `${topic} injury update cedera absen fitness latest`
  }
  if (newsType === "preview") {
    return `${topic} preview analisis pra-laga kondisi skuat head to head terbaru`
  }
  if (newsType === "hasil") {
    return `${topic} hasil pertandingan hari ini skor gol laporan terbaru`
  }
  return `${topic} transfer rumor terbaru update`
}

// ─── Format sumber: RINGKAS 3 kalimat per sumber (bukan artikel penuh) ──────
// Ini adalah perubahan kunci untuk menghemat token.
// Sebelum: kirim r.content.trim() penuh (bisa 500-700 kata per sumber)
// Sesudah: ambil 3 kalimat pertama saja → ~80-120 token per sumber
function formatSource(r: TavilyRawResult, index: number): string {
  const sentences = r.content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")

  return `[Sumber ${index + 1}]
Judul: ${r.title}

Poin Penting:
${sentences}`
}

// ─── Fetch konteks dari Tavily ───────────────────────────────────────────────
export async function fetchTavilyContext(
  newsType: "konpers" | "transfer" | "cedera" | "preview" | "hasil",
  topic: string,
): Promise<TavilyContextResult> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error("TAVILY_API_KEY tidak ditemukan di .env.local")

  const daysWindow = TAVILY_DAYS_WINDOW[newsType]
  const query = buildQuery(newsType, topic.trim())
  const json = await tavilySearch(apiKey, query, daysWindow)

  const results = (json.results ?? []).filter((r) => r.content?.trim())

  if (results.length === 0) {
    throw new Error(
      `Tavily tidak menemukan berita relevan dalam ${daysWindow} hari terakhir untuk topik ini. Coba perjelas topik atau gunakan konteks manual.`
    )
  }

  // OPTIMASI: format ringkas per sumber, bukan artikel penuh
  const contextText = results
    .map((r, i) => formatSource(r, i))
    .join("\n\n")

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
    publishedDate: r.published_date,
  }))

  return { contextText, sources, queryUsed: query }
}
