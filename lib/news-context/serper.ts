// lib/news-context/serper.ts
//
// Sumber MEDIA dalam pipeline: Bzzoiro (data & statistik) → Serper (media) → Tavily (konteks naratif).
// Serper.dev = wrapper Google Search — dipakai untuk ambil narasi, kutipan, dan analisis
// dari media spesifik per tipe berita lewat operator site: (atau keyword untuk sumber
// tanpa domain tunggal, mis. nama jurnalis).
//
// PERAN PER TIPE BERITA (sesuai PDF Bzzoiro Data Mapping):
//
//   PREVIEW  → espn.com, skysports.com, sport.detik.com, cnnindonesia.com
//            Ambil: berita terkini kedua tim (7 hari terakhir), injury news & status pemain
//                   kunci, pernyataan pelatih pre-match, prediksi & opini media besar
//
//   HASIL    → espn.com, skysports.com, sport.detik.com, cnnindonesia.com
//            Ambil: reaksi & kutipan pelatih post-match, highlight dan momen kunci dari
//                   media, reaksi pemain & kapten tim
//
//   TRANSFER → skysports.com, theathletic.com, bbc.co.uk/sport, espn.com,
//              transfermarkt.com, Fabrizio Romano
//            Ambil: laporan jurnalis terpercaya, klaim & counter-klaim resmi kedua klub,
//                   harga transfer & struktur kontrak, reaksi fans & komunitas
//
//   KONPERS  → espn.com, skysports.com, fifa.com
//            Ambil: transkrip lengkap / kutipan langsung preskon, liputan media,
//                   isu yang dibahas (cedera/suspensi/formasi), tanya-jawab jurnalis signifikan
//
//   CEDERA   → espn.com, bbc.co.uk/sport, skysports.com, situs resmi klub
//            Ambil: laporan cedera terbaru & diagnosa resmi, estimasi waktu kembali bermain,
//                   pernyataan resmi klub / pelatih, konteks kapan & mekanisme cedera terjadi
//
//   TRIVIA   → en.wikipedia.org, transfermarkt.com, soccerway.com, espn.com
//            Ambil: verifikasi fakta historis, rekor resmi (Guinness/UEFA/FIFA),
//                   kutipan & konteks dari ensiklopedi, data statistik milestone
//
// Satu kali request per tipe — seluruh sumber digabung dalam satu query dengan operator OR
// agar hemat kuota Serper & token LLM, hasil organic diringkas jadi poin pendek per media.

export type SerperNewsType = "preview" | "hasil" | "transfer" | "konpers" | "cedera" | "trivia"

export interface SerperContextResult {
  contextText: string
  sources: { title: string; url: string }[]
  queryUsed: string
}

interface SerperOrganicResult {
  title: string
  link: string
  snippet?: string
  date?: string
}

interface SerperRawResponse {
  organic?: SerperOrganicResult[]
}

const SERPER_ENDPOINT = "https://google.serper.dev/search"

interface SourceSpec {
  site?: string     // domain → dipakai sebagai site:domain
  keyword?: string  // sumber tanpa domain tunggal (nama jurnalis, "situs resmi klub", dll)
}

// ─── Sumber media per tipe berita ────────────────────────────────────────────
const SERPER_SOURCES: Record<SerperNewsType, SourceSpec[]> = {
  preview: [
    { site: "espn.com" },
    { site: "skysports.com" },
    { site: "sport.detik.com" },
    { site: "cnnindonesia.com" },
  ],
  hasil: [
    { site: "espn.com" },
    { site: "skysports.com" },
    { site: "sport.detik.com" },
    { site: "cnnindonesia.com" },
  ],
  transfer: [
    { site: "skysports.com" },
    { site: "theathletic.com" },
    { site: "bbc.co.uk/sport" },
    { site: "espn.com" },
    { site: "transfermarkt.com" },
    { keyword: "Fabrizio Romano" },
  ],
  konpers: [
    { site: "espn.com" },
    { site: "skysports.com" },
    { site: "fifa.com" },
  ],
  cedera: [
    { site: "espn.com" },
    { site: "bbc.co.uk/sport" },
    { site: "skysports.com" },
    { keyword: "pernyataan resmi klub" },
  ],
  trivia: [
    { site: "en.wikipedia.org" },
    { site: "transfermarkt.com" },
    { site: "soccerway.com" },
    { site: "espn.com" },
  ],
}

// Data yang WAJIB diekstrak per tipe — dipakai sebagai instruksi di context block utk LLM.
// Sesuai PDF Bzzoiro Data Mapping — kolom "Serper" per jenis artikel.
export const SERPER_DATA_NEEDED: Record<SerperNewsType, string> = {
  preview:
    "berita terkini kedua tim (7 hari terakhir), injury news & status pemain kunci, " +
    "pernyataan pelatih pre-match (press conference), prediksi & opini media besar",
  hasil:
    "reaksi & kutipan pelatih post-match, highlight dan momen kunci dari media, " +
    "reaksi pemain & kapten tim",
  transfer:
    "laporan transfer terbaru dari jurnalis terpercaya (Fabrizio Romano, dll), " +
    "klaim & counter-klaim resmi dari kedua klub, harga transfer yang dilaporkan & " +
    "struktur kontrak, reaksi fans & komunitas terhadap rumor",
  konpers:
    "transkrip lengkap atau kutipan langsung preskon, liputan media terhadap pernyataan " +
    "pelatih, isu terkini yang dibahas (cedera/suspensi/formasi), " +
    "tanya-jawab jurnalis yang signifikan",
  cedera:
    "laporan cedera terbaru & diagnosa resmi, estimasi waktu kembali bermain (return date), " +
    "pernyataan resmi klub / pelatih tentang cedera, " +
    "konteks cedera: kapan terjadi & mekanisme",
  trivia:
    "verifikasi fakta historis dari sumber ensiklopedi, kutipan & konteks dari artikel " +
    "Wikipedia / Transfermarkt, fakta rekor resmi (Guinness/UEFA/FIFA)",
}

// Kata kunci tambahan per tipe agar pencarian lebih terarah (selain nama tim/pemain).
const SERPER_EXTRA_KEYWORDS: Record<SerperNewsType, string> = {
  preview:  "preview prediksi pertandingan berita terkini",
  hasil:    "analisis pertandingan reaksi pelatih highlight",
  transfer: "transfer rumor negosiasi nilai kontrak",
  konpers:  "konferensi pers kutipan pernyataan",
  cedera:   "cedera injury update diagnosa return date",
  trivia:   "sejarah rekor statistik milestone fakta",
}

// Jumlah hasil organic yang diambil & diformat per tipe — dijaga ringkas demi hemat token.
const SERPER_MAX_RESULTS: Record<SerperNewsType, number> = {
  preview:  5,
  hasil:    5,
  transfer: 5,
  konpers:  4,
  cedera:   4,
  trivia:   4,
}

function buildSiteFilter(specs: SourceSpec[]): string {
  const parts = specs.map((s) => (s.site ? `site:${s.site}` : `"${s.keyword}"`))
  return `(${parts.join(" OR ")})`
}

function buildQuery(newsType: SerperNewsType, topic: string): string {
  return `${topic} ${SERPER_EXTRA_KEYWORDS[newsType]} ${buildSiteFilter(SERPER_SOURCES[newsType])}`
}

async function serperSearch(apiKey: string, query: string, num: number): Promise<SerperRawResponse> {
  const res = await fetch(SERPER_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, gl: "id", hl: "id", num }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`❌ serperSearch error ${res.status} — query: "${query}" — body: ${body.slice(0, 300)}`)
    throw new Error(`Serper API error ${res.status}`)
  }
  return res.json()
}

// Judul + ringkasan singkat per media (snippet Google sudah pendek, tidak perlu dipotong lagi).
function formatResult(r: SerperOrganicResult, index: number): string {
  const domain = (() => {
    try { return new URL(r.link).hostname.replace(/^www\./, "") } catch { return "" }
  })()
  const snippet = (r.snippet ?? "").trim()
  return [
    `[Media ${index + 1}${domain ? ` — ${domain}` : ""}]`,
    `Judul: ${r.title}`,
    snippet ? `Ringkasan: ${snippet}` : "",
  ].filter(Boolean).join("\n")
}

// ─── Fetch konteks dari Serper ────────────────────────────────────────────────
export async function fetchSerperContext(
  newsType: SerperNewsType,
  topic: string,
): Promise<SerperContextResult> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) throw new Error("SERPER_API_KEY tidak ditemukan di .env.local")

  const maxResults = SERPER_MAX_RESULTS[newsType]
  const query = buildQuery(newsType, topic.trim())
  const json = await serperSearch(apiKey, query, maxResults)

  const results = (json.organic ?? []).filter((r) => r.title?.trim()).slice(0, maxResults)

  if (results.length === 0) {
    throw new Error(
      `Serper tidak menemukan hasil media (ESPN/Sky Sports/dll) untuk topik ini.`
    )
  }

  const contextText = results.map((r, i) => formatResult(r, i)).join("\n\n")
  const sources = results.map((r) => ({ title: r.title, url: r.link }))

  return { contextText, sources, queryUsed: query }
}

// Label sumber per tipe (untuk progress UI di route.ts) — daftar domain/keyword yang dipakai.
export function serperSourceLabel(newsType: SerperNewsType): string {
  return SERPER_SOURCES[newsType].map((s) => s.site ?? s.keyword).filter(Boolean).join(", ")
}
