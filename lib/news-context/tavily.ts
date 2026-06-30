// lib/news-context/tavily.ts — v2
//
// PERUBAHAN DARI v1:
// ✓ Tambah parameter resmi Tavily `include_domains` — diisi ESPN.com,
//   SkySports.com, Goal.com (sama seperti Serper) untuk SEMUA tipe berita,
//   atas permintaan eksplisit pengguna karena ketiganya paling lengkap &
//   paling update datanya. Sebelumnya tavily.ts TIDAK memakai domain filter
//   sama sekali, jadi hasil bisa dari domain manapun (termasuk yang kualitas
//   atau bahasanya tidak konsisten dengan extractor di media-extractor.ts).
// ✓ Query diganti ke BAHASA INGGRIS — supaya match dengan konten ESPN/Sky
//   Sports/Goal.com (semua berbahasa Inggris). Sebelumnya query berbahasa
//   Indonesia, yang kurang match dengan domain Inggris bahkan saat domain
//   filter sudah benar.
// ✓ Tambah TRANSLATION_NOTE yang sama seperti di serper.ts — menandai
//   eksplisit ke prompt Gemma bahwa konteks di bawah berbahasa Inggris dan
//   wajib diterjemahkan/diparafrasakan, bukan disalin verbatim.
// ✓ Tambah parameter extraTerms opsional di fetchTavilyContext (khusus
//   KONPERS) — supaya query bisa disisipi skor/tanggal laga dari Bzzoiro,
//   sehingga konteks naratif yang diambil terikat ke laga yang sama persis
//   dengan yang diidentifikasi Bzzoiro, bukan sekadar konpers tim yang sama
//   di laga yang berbeda.
//
// Peran dalam pipeline: KONTEKS NARATIF & ANALISIS MENDALAM.
// Urutan pipeline: Bzzoiro (data & statistik) → Serper (media: ESPN/Sky Sports/Goal.com) →
// Tavily (konteks naratif, analisis mendalam, latar belakang historis — sumber sama) → LLM.
//
// Tavily BUKAN sumber berita terkini (itu tugas Serper). Tavily dipakai untuk menambahkan
// lapisan konteks yang tidak dimiliki Serper: rivalitas historis, analisis taktis mendalam,
// rekam jejak transfer, konteks finansial klub, riwayat cedera, dan narasi di balik angka.
//
// PERAN PER TIPE BERITA (sesuai PDF Bzzoiro Data Mapping) — SUMBER SERAGAM:
//
//   SEMUA TIPE → domain di-filter ke espn.com, skysports.com, goal.com lewat
//                parameter resmi Tavily `include_domains` (bukan sekadar
//                disisipkan di teks query, supaya benar-benar disaring API).
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
//              relevan (konsistensi/kontradiksi), analisis implikasi taktis dari pernyataan —
//              query diperkuat skor/tanggal laga (lihat extraTerms) supaya match laga yang tepat
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

// NEWv2: domain seragam untuk semua tipe — sama seperti SERPER_SOURCES_COMMON
// di serper.ts. Dipakai lewat parameter resmi `include_domains` Tavily API,
// bukan disisipkan di teks query (yang tidak benar-benar menyaring hasil).
const TAVILY_SOURCES_COMMON = ["espn.com", "skysports.com", "goal.com"]

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

async function tavilySearch(
  apiKey: string,
  query: string,
  daysWindow: number,
  includeDomains: string[], // NEWv2
): Promise<TavilyRawResponse> {
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
      include_domains: includeDomains, // NEWv2: filter resmi ke ESPN/Sky Sports/Goal.com
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
// NEWv2: diganti ke BAHASA INGGRIS supaya match dengan konten ESPN/Sky
// Sports/Goal.com (include_domains saja tidak cukup kalau query-nya bahasa
// Indonesia — query tetap harus relevan secara bahasa dengan kontennya).
// Parameter extraTerms (khusus konpers) menyisipkan skor/tanggal laga dari
// Bzzoiro agar hasil terikat ke laga yang sama persis, bukan konpers tim
// yang sama di laga lain.
function buildQuery(newsType: TavilyNewsType, topic: string, extraTerms?: string): string {
  const terms = extraTerms ? ` ${extraTerms}` : ""
  switch (newsType) {
    case "preview":
      return `${topic}${terms} historic rivalry tactical analysis head-to-head record`
    case "hasil":
      return `${topic}${terms} standings impact tactical analysis performance comparison`
    case "transfer":
      return `${topic}${terms} positional need transfer history financial context FFP`
    case "konpers":
      return `${topic}${terms} press conference background context manager statement consistency`
    case "cedera":
      return `${topic}${terms} injury history tactical impact replacement options`
    case "trivia":
      return `${topic}${terms} history record milestone background story unique facts statistics`
  }
}

// ─── Format sumber — ringkas, 3 kalimat per sumber ───────────────────────────
// NEWv2: konten TETAP disimpan dalam bahasa Inggris asli di sini — tidak
// diterjemahkan. Penerjemahan terjadi di tahap Gemma (lihat TRANSLATION_NOTE).
function formatSource(r: TavilyRawResult, index: number, maxSentences = 3): string {
  const sentences = r.content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxSentences)

  const bulletPoints = sentences.map((s) => `* ${s}`).join("\n")

  return `[Konteks ${index + 1} — ${(() => { try { return new URL(r.url).hostname.replace(/^www\./, "") } catch { return "" } })()}]
Judul (EN): ${r.title}

Poin Penting (EN):
${bulletPoints}`
}

// NEWv4 (update dari catatan v2): TRANSLATION_NOTE ini TIDAK LAGI dibaca
// Gemma secara langsung — lihat catatan lengkap di lib/news-context/serper.ts
// (TRANSLATION_NOTE). Sejak lib/ai/translation.ts ditambahkan, terjemahan
// kutipan & fakta media terjadi SEBELUM masuk ke EditorialBrief.
const TRANSLATION_NOTE =
  "[CATATAN: seluruh konteks naratif di bawah ini BERBAHASA INGGRIS " +
  "(sumber: ESPN/Sky Sports/Goal.com) — teks MENTAH sebelum diproses. Fakta " +
  "yang dipakai di draft FINAL sudah diterjemahkan terpisah lewat " +
  "lib/ai/translation.ts sebelum masuk ke EditorialBrief.]"

// ─── Fetch konteks dari Tavily ────────────────────────────────────────────────
export async function fetchTavilyContext(
  newsType: TavilyNewsType,
  topic: string,
  extraTerms?: string, // NEWv2 — dipakai khusus konpers, lihat catatan di buildQuery
): Promise<TavilyContextResult> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error("TAVILY_API_KEY tidak ditemukan di .env.local")

  const daysWindow = TAVILY_DAYS_WINDOW[newsType]
  const query = buildQuery(newsType, topic.trim(), extraTerms)
  const json = await tavilySearch(apiKey, query, daysWindow, TAVILY_SOURCES_COMMON)

  const results = (json.results ?? []).filter((r) => r.content?.trim())

  if (results.length === 0) {
    throw new Error(
      `Tavily tidak menemukan konteks naratif dari ESPN/Sky Sports/Goal.com dalam ${daysWindow} hari terakhir untuk topik ini.`
    )
  }

  const contextText = TRANSLATION_NOTE + "\n\n" + results
    .map((r, i) => formatSource(r, i, 3))
    .join("\n\n")

  const sources = results.map((r) => ({
    title: r.title,
    url: r.url,
    publishedDate: r.published_date,
  }))

  return { contextText, sources, queryUsed: query }
}

// Label sumber (untuk progress UI di route.ts) — konsisten dengan serperSourceLabel.
export function tavilySourceLabel(): string {
  return TAVILY_SOURCES_COMMON.join(", ")
}
