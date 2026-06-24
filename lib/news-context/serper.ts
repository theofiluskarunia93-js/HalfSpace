// lib/news-context/serper.ts
//
// Sumber MEDIA dalam pipeline: Bzzoiro (data & statistik) → Serper (media) → Tavily (backup).
// Serper.dev = wrapper Google Search — dipakai untuk ambil narasi, kutipan, dan analisis
// dari media spesifik per tipe berita lewat operator site: (atau keyword untuk sumber
// tanpa domain tunggal, mis. nama jurnalis).
//
// PERAN PER TIPE BERITA:
//
//   PREVIEW  (bobot 25%) → espn.com, skysports.com, sport.detik.com, cnnindonesia.com
//            Ambil: prediksi media, kondisi skuad, quote pelatih, pemain kunci, narasi pertandingan
//
//   HASIL    → espn.com, skysports.com, sport.detik.com, cnnindonesia.com
//            Ambil: player ratings, man of the match, analisis pertandingan, komentar pelatih
//
//   TRANSFER → Sky Sports, The Athletic, BBC Sport, ESPN, Fabrizio Romano
//            Ambil: status negosiasi, nilai transfer, sumber rumor, komentar agen, komentar pelatih
//
//   KONPERS  → espn.com, skysports.com, fifa.com
//            Ambil: quote pelatih, quote pemain, pernyataan penting
//
//   CEDERA   → ESPN, BBC, Sky Sports, situs resmi klub
//            Ambil: injury update, official statement
//
// Satu kali request per tipe — seluruh sumber digabung dalam satu query dengan operator OR
// agar hemat kuota Serper & token LLM, hasil organic diringkas jadi poin pendek per media.

export type SerperNewsType = "preview" | "hasil" | "transfer" | "konpers" | "cedera"

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
    { keyword: "situs resmi klub pernyataan resmi" },
  ],
}

// Data yang WAJIB diekstrak per tipe — dipakai sebagai instruksi di context block utk LLM.
export const SERPER_DATA_NEEDED: Record<SerperNewsType, string> = {
  preview:  "prediksi media, kondisi skuad, quote pelatih, pemain kunci, narasi pertandingan",
  hasil:    "player ratings, man of the match, analisis pertandingan, komentar pelatih",
  transfer: "status negosiasi, nilai transfer, sumber rumor, komentar agen, komentar pelatih",
  konpers:  "quote pelatih, quote pemain, pernyataan penting",
  cedera:   "injury update, official statement dari klub",
}

// Kata kunci tambahan per tipe agar pencarian lebih terarah (selain nama tim/pemain).
const SERPER_EXTRA_KEYWORDS: Record<SerperNewsType, string> = {
  preview:  "preview prediksi pertandingan",
  hasil:    "player rating analisis pertandingan",
  transfer: "transfer rumor negosiasi",
  konpers:  "konferensi pers quote",
  cedera:   "injury update cedera",
}

// Jumlah hasil organic yang diambil & diformat per tipe — dijaga ringkas demi hemat token.
const SERPER_MAX_RESULTS: Record<SerperNewsType, number> = {
  preview:  5,
  hasil:    5,
  transfer: 5,
  konpers:  4,
  cedera:   4,
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
