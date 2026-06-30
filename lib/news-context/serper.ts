// lib/news-context/serper.ts — v2
//
// PERUBAHAN DARI v1:
// ✓ Sumber media DISERAGAMKAN ke 3 situs untuk SEMUA tipe berita:
//   ESPN.com, SkySports.com, Goal.com — atas permintaan eksplisit pengguna,
//   karena ketiganya paling lengkap dan paling update datanya untuk sepak bola
//   global (sebelumnya domain berbeda-beda per tipe, termasuk domain Indonesia
//   seperti sport.detik.com/cnnindonesia.com yang justru TIDAK match dengan
//   regex ekstraksi di lib/editorial/extractors/media-extractor.ts — regex itu
//   mencari keyword bahasa Inggris seperti "deal agreed", "ruled out",
//   "hamstring", dst, jadi sumber Indonesia sebelumnya kemungkinan besar
//   menghasilkan quotes/transferStatus/injuryStatement kosong).
// ✓ gl/hl diganti dari "id"/"id" → "us"/"en" — parameter lama membiaskan
//   hasil pencarian Google ke konten BERBAHASA Indonesia, yang bertentangan
//   dengan tujuan fokus ke 3 situs Inggris di atas. Terjemahan ke Bahasa
//   Indonesia tetap terjadi, tapi di tahap Gemma (generate-draft), BUKAN di
//   tahap pencarian — supaya kualitas & kelengkapan sumber tidak terdegradasi
//   oleh bias bahasa pencarian.
// ✓ Tambah TRANSLATION_NOTE yang disisipkan ke contextText — menandai dengan
//   eksplisit ke pemanggil hilir (brief-builder → Gemma) bahwa snippet di
//   bawah ini BERBAHASA INGGRIS dan WAJIB diterjemahkan/diparafrasakan ke
//   Bahasa Indonesia saat dipakai di draft, bukan disalin verbatim.
//
// Sumber MEDIA dalam pipeline: Bzzoiro (data & statistik) → Serper (media) → Tavily (konteks naratif).
// Serper.dev = wrapper Google Search — dipakai untuk ambil narasi, kutipan, dan analisis
// dari media spesifik per tipe berita lewat operator site:.
//
// PERAN PER TIPE BERITA — SUMBER SERAGAM, kebutuhan data tetap dibedakan per tipe
// (sesuai PDF Bzzoiro Data Mapping, kolom "Serper"):
//
//   SEMUA TIPE → espn.com, skysports.com, goal.com
//
//   PREVIEW  → Ambil: berita terkini kedua tim (7 hari terakhir), injury news & status pemain
//                     kunci, pernyataan pelatih pre-match, prediksi & opini media besar
//
//   HASIL    → Ambil: reaksi & kutipan pelatih post-match, highlight dan momen kunci dari
//                     media, reaksi pemain & kapten tim
//
//   TRANSFER → Ambil: laporan jurnalis terpercaya, klaim & counter-klaim resmi kedua klub,
//                     harga transfer & struktur kontrak, reaksi fans & komunitas
//
//   KONPERS  → Ambil: transkrip lengkap / kutipan langsung preskon, liputan media,
//                     isu yang dibahas (cedera/suspensi/formasi), tanya-jawab jurnalis signifikan
//
//   CEDERA   → Ambil: laporan cedera terbaru & diagnosa resmi, estimasi waktu kembali bermain,
//                     pernyataan resmi klub / pelatih, konteks kapan & mekanisme cedera terjadi
//
//   TRIVIA   → Ambil: verifikasi fakta historis, rekor resmi (Guinness/UEFA/FIFA),
//                     kutipan & konteks dari ensiklopedi, data statistik milestone
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

// ─── Sumber media SERAGAM untuk semua tipe — ESPN, Sky Sports, Goal.com ────
// Permintaan eksplisit: 3 situs ini paling lengkap & paling update datanya
// untuk sepak bola global, walau berbahasa Inggris (diterjemahkan di tahap
// generate-draft/Gemma, lihat catatan TRANSLATION_NOTE di bawah).
// Transfer tetap menambahkan Fabrizio Romano sebagai keyword tambahan (bukan
// site:) karena ia jurnalis lepas tepercaya untuk transfer rumor, bukan situs.
const SERPER_SOURCES_COMMON: SourceSpec[] = [
  { site: "espn.com" },
  { site: "skysports.com" },
  { site: "goal.com" },
]

const SERPER_SOURCES: Record<SerperNewsType, SourceSpec[]> = {
  preview:  [...SERPER_SOURCES_COMMON],
  hasil:    [...SERPER_SOURCES_COMMON],
  transfer: [...SERPER_SOURCES_COMMON, { keyword: "Fabrizio Romano" }],
  konpers:  [...SERPER_SOURCES_COMMON],
  cedera:   [...SERPER_SOURCES_COMMON],
  trivia:   [...SERPER_SOURCES_COMMON],
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
// NEWv2: diganti ke BAHASA INGGRIS — query dalam bahasa Inggris jauh lebih
// match dengan konten ESPN/Sky Sports/Goal.com (semua berbahasa Inggris)
// dibanding query bahasa Indonesia sebelumnya, yang menghasilkan snippet
// campuran atau kosong dari 3 situs ini.
const SERPER_EXTRA_KEYWORDS: Record<SerperNewsType, string> = {
  preview:  "preview prediction match preview team news",
  hasil:    "match report reaction post-match analysis",
  transfer: "transfer news deal agreed fee",
  konpers:  "press conference quotes reaction",
  cedera:   "injury update return date statement",
  trivia:   "history record stats milestone facts",
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

// NEWv2: parameter extraTerms opsional — dipakai khusus untuk KONPERS, supaya
// query bisa disisipi skor/tanggal laga yang melatari konferensi pers (mis.
// "Uruguay 0-1 Spain") yang sudah diekstrak dari Bzzoiro
// (lihat lib/news-context/bzzoiro.ts → blok "PERTANDINGAN TERKAIT KONPERS").
// Sebelumnya query konpers hanya memakai nama tim generik, sehingga Serper
// & Tavily bisa saja mengembalikan kutipan/konteks dari konpers tim yang
// SAMA tapi laga yang BERBEDA — extraTerms membuat hasil pencarian terikat
// ke laga yang sama persis dengan yang sudah diidentifikasi di Bzzoiro.
function buildQuery(newsType: SerperNewsType, topic: string, extraTerms?: string): string {
  const terms = extraTerms ? ` ${extraTerms}` : ""
  return `${topic}${terms} ${SERPER_EXTRA_KEYWORDS[newsType]} ${buildSiteFilter(SERPER_SOURCES[newsType])}`
}

async function serperSearch(apiKey: string, query: string, num: number): Promise<SerperRawResponse> {
  const res = await fetch(SERPER_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    // NEWv2: gl/hl diganti dari "id"/"id" → "us"/"en". Parameter lama
    // membiaskan hasil Google ke region & bahasa Indonesia, yang
    // bertentangan dengan tujuan mengutamakan ESPN/Sky Sports/Goal.com
    // (semua berbahasa Inggris, basis data internasional). Terjemahan ke
    // Bahasa Indonesia dilakukan belakangan oleh Gemma di generate-draft,
    // bukan di tahap pencarian ini.
    body: JSON.stringify({ q: query, gl: "us", hl: "en", num }),
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
// NEWv2: snippet/judul TETAP disimpan dalam bahasa Inggris asli — TIDAK
// diterjemahkan di sini. Penerjemahan terjadi di tahap Gemma (lihat
// TRANSLATION_NOTE di fetchSerperContext) supaya konteks & nuansa asli tidak
// hilang karena terjemahan otomatis ganda (sekali di sini, sekali lagi nanti).
function formatResult(r: SerperOrganicResult, index: number): string {
  const domain = (() => {
    try { return new URL(r.link).hostname.replace(/^www\./, "") } catch { return "" }
  })()
  const snippet = (r.snippet ?? "").trim()
  return [
    `[Media ${index + 1}${domain ? ` — ${domain}` : ""}]`,
    `Judul (EN): ${r.title}`,
    snippet ? `Ringkasan (EN): ${snippet}` : "",
  ].filter(Boolean).join("\n")
}

// NEWv4 (update dari catatan v2): TRANSLATION_NOTE ini TIDAK LAGI dibaca
// oleh Gemma secara langsung. Sejak lib/ai/translation.ts ditambahkan,
// kutipan & fakta media diterjemahkan terlebih dahulu di brief-builder.ts
// SEBELUM masuk ke EditorialBrief — Gemma hanya menerima hasil yang sudah
// dalam Bahasa Indonesia (lihat aturan mutlak #15 di gemma-writer-prompt.ts:
// "DILARANG menerjemahkan ulang"). contextText mentah di bawah ini (dengan
// TRANSLATION_NOTE-nya) hanya dikonsumsi oleh:
//   1. extractSerperData() (regex parser, bukan LLM) di media-extractor.ts
//   2. groundingPool di brief-validator.ts (dipakai untuk .includes()
//      substring check terhadap angka, bukan dibaca/diinterpretasi LLM)
// Catatan ini DIPERTAHANKAN (bukan dihapus) karena tetap berguna sebagai
// dokumentasi/log untuk debugging manual (mis. kalau developer mencetak
// contextText mentah untuk inspeksi), dan tidak mengganggu apapun kalau
// dipertahankan — hanya sudah tidak fungsional sebagai instruksi ke LLM.
const TRANSLATION_NOTE =
  "[CATATAN: seluruh kutipan dan ringkasan media di bawah ini BERBAHASA INGGRIS " +
  "(sumber: ESPN/Sky Sports/Goal.com) — teks MENTAH sebelum diproses. Kutipan " +
  "& fakta media yang dipakai di draft FINAL sudah diterjemahkan terpisah " +
  "lewat lib/ai/translation.ts sebelum masuk ke EditorialBrief.]"

// ─── Fetch konteks dari Serper ────────────────────────────────────────────────
export async function fetchSerperContext(
  newsType: SerperNewsType,
  topic: string,
  extraTerms?: string, // NEWv2 — lihat catatan di buildQuery (dipakai khusus konpers)
): Promise<SerperContextResult> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) throw new Error("SERPER_API_KEY tidak ditemukan di .env.local")

  const maxResults = SERPER_MAX_RESULTS[newsType]
  const query = buildQuery(newsType, topic.trim(), extraTerms)
  const json = await serperSearch(apiKey, query, maxResults)

  const results = (json.organic ?? []).filter((r) => r.title?.trim()).slice(0, maxResults)

  if (results.length === 0) {
    throw new Error(
      `Serper tidak menemukan hasil media (ESPN/Sky Sports/Goal.com) untuk topik ini.`
    )
  }

  const contextText = TRANSLATION_NOTE + "\n\n" + results.map((r, i) => formatResult(r, i)).join("\n\n")
  const sources = results.map((r) => ({ title: r.title, url: r.link }))

  return { contextText, sources, queryUsed: query }
}

// Label sumber per tipe (untuk progress UI di route.ts) — daftar domain/keyword yang dipakai.
export function serperSourceLabel(newsType: SerperNewsType): string {
  return SERPER_SOURCES[newsType].map((s) => s.site ?? s.keyword).filter(Boolean).join(", ")
}
