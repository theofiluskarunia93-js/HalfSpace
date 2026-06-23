// lib/news-context/tavily.ts
//
// Sumber konteks untuk tipe berita: KONFERENSI PERS, TRANSFER RUMOR, & INJURY UPDATE.
// Menggunakan Tavily Search API (web search real-time) — bukan Bzzoiro,
// karena tipe-tipe berita ini butuh kutipan langsung & berita terbaru yang
// tidak tersedia di data pertandingan/statistik.
//
// Window waktu pencarian per tipe:
//   - konpers  → 2 hari terakhir
//   - transfer → 2 hari terakhir
//   - cedera   → 3 hari terakhir (update cedera dari klub sering datang setelah MRI 1-2 hari)
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
// Catatan untuk preview & hasil:
//   - preview  → 12 jam = Tavily tidak support sub-day, pakai days:1 (1 hari) supaya
//                berita pra-laga yang baru terbit tertangkap.
//   - hasil    → 30 menit = sama, Tavily minimum days:1. Tapi query dikombinasikan
//                dengan kata kunci "tadi malam / hari ini / baru" supaya hasil teratas
//                adalah laporan post-match terbaru.
const TAVILY_DAYS_WINDOW: Record<"konpers" | "transfer" | "cedera" | "preview" | "hasil", number> = {
  konpers:  2,
  transfer: 2,
  cedera:   3,
  preview:  1,   // efektif 12 jam — Tavily minimum = 1 hari
  hasil:    1,   // efektif 30 menit — Tavily minimum = 1 hari, query diperkuat kata "terbaru hari ini"
}

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
      max_results: 8,
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
    // Cari preview/analisis pra-laga: taktik, kondisi skuat, head-to-head terbaru
    return `${topic} preview analisis pra-laga kondisi skuat head to head terbaru`
  }
  if (newsType === "hasil") {
    // Kuatkan ke laporan post-match terbaru hari ini
    return `${topic} hasil pertandingan hari ini skor gol laporan terbaru`
  }
  return `${topic} transfer rumor terbaru update`
}

// ─── Fetch konteks dari Tavily untuk Konpers / Transfer Rumor / Injury Update /
//     Preview Pertandingan / Hasil Pertandingan ─────────────────────────────────
// Mengembalikan teks konteks gabungan (siap dipakai sebagai pengganti atau
// pelengkap data Bzzoiro) + daftar sumber untuk ditampilkan di UI.
//
// Window efektif:
//   preview  → 1 hari (Tavily minimum; query menargetkan berita pra-laga terbaru)
//   hasil    → 1 hari (Tavily minimum; query menargetkan laporan post-match hari ini)
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

  // Susun teks konteks: tiap sumber jadi satu blok berlabel, supaya Gemini
  // tahu fakta mana berasal dari mana dan bisa memilih kutipan paling kuat.
  const contextText = results
    .map((r, i) => {
      const dateLabel = r.published_date ? ` (${r.published_date})` : ""
      return `[Sumber ${i + 1}${dateLabel}] ${r.title}\n${r.content.trim()}`
    })
    .join("\n\n")

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
    publishedDate: r.published_date,
  }))

  return { contextText, sources, queryUsed: query }
}
