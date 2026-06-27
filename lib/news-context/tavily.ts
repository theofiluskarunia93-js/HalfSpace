// lib/news-context/tavily.ts
//
// Peran dalam pipeline: KONTEKS NARATIF & ANALISIS MENDALAM.
// Urutan pipeline: Bzzoiro (data & statistik) → Serper (media: ESPN/Sky Sports/dll) →
// Tavily (konteks naratif, analisis mendalam, latar belakang historis) → LLM.
//
// Tavily BUKAN sumber berita terkini (itu tugas Serper). Tavily dipakai untuk menambahkan
// lapisan konteks yang tidak dimiliki Serper: rivalitas historis, analisis taktis mendalam,
// rekam jejak transfer, konteks finansial klub, riwayat cedera, dan narasi di balik angka.
//
// PERAN PER TIPE BERITA (sesuai PDF Bzzoiro Data Mapping):
//
//   PREVIEW  → konteks rivalitas historis kedua tim, analisis taktis mendalam dari sumber
//              spesialis, rekor pertemuan di kompetisi yang sama
//
//   HASIL    → konteks dampak hasil pada klasemen & persaingan, analisis keputusan taktis
//              pelatih selama pertandingan, perbandingan performa dengan pertandingan sebelumnya
//
//   TRANSFER → kebutuhan posisi spesifik klub target musim ini, rekam jejak transfer historis
//              pemain & klub, konteks finansial & FFP kedua klub,
//              pemain lain yang dikaitkan dengan slot posisi sama
//
//   KONPERS  → latar belakang & konteks pernyataan pelatih, pernyataan sebelumnya yang
//              relevan (konsistensi/kontradiksi), analisis implikasi taktis dari pernyataan
//
//   CEDERA   → riwayat cedera pemain sebelumnya, analisis dampak taktis ketidakhadiran
//              pemain, opsi pengganti yang mungkin dimainkan pelatih
//
//   TRIVIA   → narasi & konteks mendalam di balik angka statistik, cerita latar belakang
//              pemain atau klub, perspektif editorial yang memperkaya trivia
//
// max_results dijaga di 2 — Serper sudah menangani media utama, Tavily hanya menambah
// kedalaman konteks. Days window disesuaikan per tipe: berita historis lebih longgar,
// preview/hasil tetap ketat karena butuh informasi relevan pertandingan berjalan.

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

export type TavilyNewsType = "preview" | "hasil" | "transfer" | "konpers" | "cedera" | "trivia"

const TAVILY_ENDPOINT = "https://api.tavily.com/search"

// Window waktu pencarian per tipe berita.
// - preview/hasil: 3 hari — rivalitas & analisis taktis masih relevan di window pendek
// - transfer/konpers/cedera: 7 hari — konteks finansial & latar belakang butuh window lebih luas
// - trivia: 30 hari — konten historis & rekam jejak tidak dibatasi recency ketat
const TAVILY_DAYS_WINDOW: Record<TavilyNewsType, number> = {
  preview:  3,
  hasil:    3,
  transfer: 7,
  konpers:  7,
  cedera:   7,
  trivia:   30,
}

// Deskripsi konteks yang dicari Tavily per tipe.
// Sesuai PDF Bzzoiro Data Mapping — kolom "Tavily" per jenis artikel.
export const TAVILY_BACKUP_DATA: Record<TavilyNewsType, string> = {
  preview:
    "konteks rivalitas historis kedua tim, analisis taktis mendalam dari sumber spesialis, " +
    "rekor pertemuan di kompetisi yang sama",
  hasil:
    "konteks dampak hasil pada klasemen & persaingan, analisis keputusan taktis pelatih " +
    "selama pertandingan, perbandingan performa dengan pertandingan sebelumnya",
  transfer:
    "kebutuhan posisi spesifik klub target musim ini, rekam jejak transfer historis pemain " +
    "& klub, konteks finansial & FFP kedua klub, pemain lain yang dikaitkan dengan slot posisi sama",
  konpers:
    "latar belakang & konteks pernyataan pelatih, pernyataan sebelumnya yang relevan " +
    "(konsistensi/kontradiksi), analisis implikasi taktis dari pernyataan",
  cedera:
    "riwayat cedera pemain sebelumnya, analisis dampak taktis ketidakhadiran pemain, " +
    "opsi pengganti yang mungkin dimainkan pelatih",
  trivia:
    "narasi & konteks mendalam di balik angka statistik, cerita latar belakang pemain " +
    "atau klub, perspektif editorial yang memperkaya trivia",
}

// max_results tetap 2 — Tavily hanya lapisan konteks, bukan sumber berita utama.
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

// ─── Bangun query pencarian — fokus ke konteks naratif & analisis mendalam ──────
// Bukan berita terkini (itu tugas Serper), tapi latar belakang, historis, dan analisis taktis.
function buildQuery(newsType: TavilyNewsType, topic: string): string {
  switch (newsType) {
    case "preview":
      return `${topic} rivalitas historis analisis taktis rekor pertemuan head-to-head`
    case "hasil":
      return `${topic} dampak klasemen analisis taktis perbandingan performa keputusan pelatih`
    case "transfer":
      return `${topic} kebutuhan posisi rekam jejak transfer konteks finansial FFP`
    case "konpers":
      return `${topic} latar belakang pernyataan pelatih implikasi taktis konsistensi`
    case "cedera":
      return `${topic} riwayat cedera dampak taktis opsi pengganti absensi`
    case "trivia":
      return `${topic} sejarah rekor milestone narasi latar belakang fakta unik statistik`
  }
}

// ─── Format sumber — ringkas, 3 kalimat per sumber ───────────────────────────
function formatSource(r: TavilyRawResult, index: number, maxSentences = 3): string {
  const sentences = r.content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxSentences)

  const bulletPoints = sentences.map((s) => `* ${s}`).join("\n")

  return `[Konteks ${index + 1}]
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
      `Tavily tidak menemukan konteks naratif dalam ${daysWindow} hari terakhir untuk topik ini.`
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
