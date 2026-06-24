// lib/news-context/tavily.ts
//
// Peran BARU dalam pipeline: BACKUP & berita tambahan — bukan sumber utama lagi.
// Urutan pipeline: Bzzoiro (data & statistik) → Serper (media: ESPN/Sky Sports/dll) →
// Tavily (backup + berita tambahan yang belum tertangkap Serper) → LLM.
//
// Karena Serper sudah menangani kutipan & narasi dari media spesifik, Tavily HANYA
// dipakai untuk menambah informasi yang terlewat (cedera kecil, info latihan, validasi
// tambahan, dll) — bukan sumber informasi utama. max_results diturunkan 4 → 2.

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

export type TavilyNewsType = "konpers" | "transfer" | "cedera" | "preview" | "hasil" | "trivia"

const TAVILY_ENDPOINT = "https://api.tavily.com/search"

// Window waktu pencarian per tipe berita.
const TAVILY_DAYS_WINDOW: Record<TavilyNewsType, number> = {
  konpers:  2,
  transfer: 2,
  cedera:   2,
  preview:  1,
  hasil:    1,
  trivia:   2,
}

// Data yang dicari Tavily per tipe — SUPLEMEN, bukan sumber utama (lihat serper.ts utk sumber utama).
export const TAVILY_BACKUP_DATA: Record<TavilyNewsType, string> = {
  preview:  "cedera terbaru, update latihan, berita minor",
  hasil:    "reaksi pemain, reaksi media, statistik tambahan",
  transfer: "validasi tambahan atas rumor yang sudah didapat dari Serper",
  konpers:  "informasi pelengkap di luar yang sudah didapat dari Serper",
  cedera:   "informasi tambahan yang tidak ada di Serper",
  trivia:   "sejarah, rekor, milestone, fakta unik",
}

// OPTIMASI: max_results diturunkan 4 → 2. Serper sudah jadi sumber media utama,
// Tavily hanya menambahkan informasi — bukan sumber informasi.
const TAVILY_MAX_RESULTS = 2

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

// ─── Bangun query pencarian — fokus ke gap yang BELUM ditangani Serper ──────
function buildQuery(newsType: TavilyNewsType, topic: string): string {
  if (newsType === "preview")  return `${topic} cedera terbaru update latihan berita minor`
  if (newsType === "hasil")    return `${topic} reaksi pemain reaksi media setelah pertandingan`
  if (newsType === "transfer") return `${topic} konfirmasi validasi transfer terbaru`
  if (newsType === "konpers")  return `${topic} konferensi pers informasi tambahan`
  if (newsType === "cedera")   return `${topic} update cedera informasi tambahan`
  return `${topic} sejarah rekor milestone fakta unik` // trivia
}

// ─── Format sumber — ringkas, 3 kalimat per sumber (Tavily kini hanya suplemen) ─
function formatSource(r: TavilyRawResult, index: number, maxSentences = 3): string {
  const sentences = r.content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxSentences)

  const bulletPoints = sentences.map((s) => `* ${s}`).join("\n")

  return `[Sumber Tambahan ${index + 1}]
Judul: ${r.title}

Poin Penting:
${bulletPoints}`
}

// ─── Fetch konteks dari Tavily ────────────────────────────────────────────────
export async function fetchTavilyContext(
  newsType: TavilyNewsType,
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
      `Tavily tidak menemukan berita tambahan dalam ${daysWindow} hari terakhir untuk topik ini.`
    )
  }

  const contextText = results
    .map((r, i) => formatSource(r, i, 3))
    .join("\n\n")

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
    publishedDate: r.published_date,
  }))

  return { contextText, sources, queryUsed: query }
}
