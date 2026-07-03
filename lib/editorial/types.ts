// lib/editorial/types.ts — v2
//
// Perubahan dari v1:
// + seoKeywords: keyword wajib masuk judul & 100 kata pertama (fix audit #9)
// + dataQualityWarning: blokir hallucination saat data kosong (fix audit #7)
// + transitionHints: instruksi kalimat jembatan antar subheading (fix audit #3)
// + leadExample: contoh kalimat pembuka konkret berdasarkan data nyata (fix audit #1)
// + qualityGate: kriteria minimum sebelum status draft_ready (fix audit #10)

export type NewsType = "transfer" | "konpers" | "cedera" | "preview" | "hasil" | "trivia"

export type ArticleAngle =
  | "upset_result"
  | "tactical_breakdown"
  | "individual_brilliance"
  | "injury_impact"
  | "comeback"
  | "milestone"
  | "controversy"
  | "negotiation_drama"
  | "market_value"
  | "departure_narrative"
  | "press_conference_reveal"
  | "form_contrast"
  | "tactical_question"
  | "historical_fact"
  | "default"

export interface EditorialBriefQuote {
  text: string
  speaker: string
  placement: "lead" | "middle" | "closing"
  // NEWv4: teks asli sebelum diterjemahkan (lihat lib/ai/translation.ts).
  // Opsional — hanya terisi untuk kutipan yang sumbernya berbahasa Inggris
  // (ESPN/Sky Sports/Goal.com) dan sudah lewat translateQuotes(). Disimpan
  // untuk audit trail: editor manusia bisa membandingkan langsung hasil
  // terjemahan vs ucapan asli tanpa harus menggali log terpisah, terutama
  // penting untuk kutipan yang dataQualityWarnings menandai bermasalah
  // (lihat field "quote_translation" / "quote_translation_integrity").
  originalText?: string
}

// NEWv2: Kontrol kualitas data — jika field ini ada, Llama wajib ikuti batasannya
export interface DataQualityWarning {
  field: string          // mis. "player_stats", "transfer_fee"
  status: "missing" | "partial" | "unverified"
  instruction: string    // instruksi eksplisit untuk Llama
}

// NEWv2: Metadata SEO untuk judul dan paragraf pertama
// NEWv3: + metaDescriptionTemplate dan metaDescriptionFacts — golden standard
// SELALU menyertakan "Meta description" terpisah dari judul (1 kalimat ringkas
// berisi skor/tanggal/venue/hook utama, ~140-160 karakter). Field ini dipush
// eksplisit ke brief supaya Qwen3-Next WAJIB generate metaDescription di output,
// bukan cuma title+content seperti sebelumnya.
export interface SeoMeta {
  primaryKeyword: string    // keyword utama — WAJIB ada di judul
  secondaryKeywords: string[] // keyword pendukung — masuk di 100 kata pertama
  titleTemplate: string     // format: "[primaryKeyword]: [hook]" atau "[hook] — [primaryKeyword]"
  metaDescriptionFacts: string[] // fakta inti yang WAJIB masuk meta description (skor/tanggal/venue/nama kunci)
}

export interface EditorialBrief {
  meta: {
    newsType: NewsType
    topic: string
    generatedAt: string
    tokenEstimate: number
    dataQualityWarnings: DataQualityWarning[]  // NEWv2
  }
  seo: SeoMeta  // NEWv2
  angle: {
    primary: ArticleAngle
    rationale: string
    headlineDirection: string
    narrativeFocus: string
  }
  keyFacts: {
    mustUse: string[]
    canUse: string[]
    doNotUse: string[]
  }
  storylines: {
    // NEWv2: leadExample adalah kalimat pembuka KONKRET berdasarkan data nyata
    // (bukan instruksi abstrak) — ini perubahan terpenting dari v1
    leadExample: string
    leadInstruction: string   // tetap ada sebagai penjelasan
    primaryStoryline: string
    subStorylines: string[]
    // NEWv2: instruksi eksplisit kalimat jembatan antar subheading
    transitionHints: string[]
  }
  keyPlayers: string[]
  quotes: EditorialBriefQuote[]
  structureHints: {
    // NEWv2: H2 sekarang menyertakan konteks data, bukan placeholder
    suggestedH2s: Array<{
      text: string          // teks subheading
      focus: string         // apa yang dibahas di bawah subheading ini — konkret
      mustMentionFacts: string[] // fakta dari mustUse yang WAJIB ada di bagian ini
    }>
    // NEWv2: paragraphGuide tidak lagi menyebut ulang fakta
    // hanya berisi instruksi alur dan transisi
    paragraphGuide: string
  }
  wordTarget: {
    min: number
    max: number
    paragraphMin: number
    h2Min: number
  }
  // NEWv2: Quality gate — kriteria minimum sebelum generate-draft/route.ts simpan draft
  qualityGate: {
    minWordCount: number
    minH2Count: number
    requiresBlockquote: boolean
    requiresMetaDescription: boolean // NEWv3: golden standard selalu punya meta description terpisah dari title
    forbiddenPhrases: string[]  // frasa yang menunjukkan artikel generik/AI
  }
}

// BARU (Juli 2026): struktur H2 BAKU khusus tipe "preview" dan "hasil", atas
// permintaan eksplisit pengguna — judul H2 untuk dua tipe ini TIDAK LAGI
// dinamis berdasarkan angle seperti tipe lain, tapi SELALU 4 section dengan
// judul persis seperti di bawah (urutan tetap). Dipakai oleh:
//   - lib/editorial/brief-builder.ts (buildH2s) — sumber kebenaran deterministik
//   - lib/ai/gpt5-mini-brief-editor.ts — instruksi ke Editor Brief AI
//   - lib/editorial/brief-validator.ts — validasi hasil AI (heading harus
//     match persis salah satu dari daftar ini, tidak boleh diubah AI)
export const FIXED_SECTION_STRUCTURE: Record<"preview" | "hasil", string[]> = {
  preview: [
    "Kondisi Skuad Tuan Rumah",
    "Kondisi Skuad Tim Tamu",
    "Pertarungan Kunci dan Prediksi Starting Lineup",
    "Prediksi Jalannya Pertandingan",
  ],
  hasil: [
    "Jalannya Babak Pertama",
    "Jalannya Babak Kedua",
    "Momen Penentu",
    "Dampak Hasil",
  ],
}

// Word targets per tipe — DISESUAIKAN ke golden standard nyata:
// hasil ~693, preview ~714, transfer ~723, konpers ~744, cedera ~686, trivia ~681 kata.
// Target lama (500-700) terlalu rendah dan membuat draft konsisten di-flag
// "draft_below_quality" walau secara editorial sudah lengkap — sekarang
// rentang dinaikkan supaya selaras dengan panjang artikel golden standard
// (rata-rata + buffer ±60 kata), dan h2Min dinaikkan jadi 4 (golden standard
// rata-rata punya 4 H2: lead implisit + 3-4 subheading bernama).
export const WORD_TARGETS: Record<NewsType, EditorialBrief["wordTarget"]> = {
  hasil:    { min: 650, max: 800, paragraphMin: 9,  h2Min: 4 },
  preview:  { min: 650, max: 820, paragraphMin: 9,  h2Min: 4 },
  cedera:   { min: 620, max: 780, paragraphMin: 9,  h2Min: 4 },
  konpers:  { min: 650, max: 820, paragraphMin: 10, h2Min: 4 },
  transfer: { min: 650, max: 800, paragraphMin: 9,  h2Min: 4 },
  trivia:   { min: 620, max: 780, paragraphMin: 9,  h2Min: 4 },
}

// Quality gate default — sama untuk semua tipe
// forbiddenPhrases dideteksi sebelum simpan ke Supabase
// minWordCount & minH2Count dinaikkan supaya sejalan dengan WORD_TARGETS baru
// (golden standard rata-rata 680-745 kata, 4+ H2 bernama) — nilai lama (450/3)
// terlalu longgar dan meluluskan draft yang jauh lebih tipis dari standar.
export const DEFAULT_QUALITY_GATE: EditorialBrief["qualityGate"] = {
  minWordCount: 600,
  minH2Count: 4,
  requiresBlockquote: false, // hanya required jika brief.quotes.length > 0
  requiresMetaDescription: true, // NEWv3: golden standard selalu punya meta description terpisah
  forbiddenPhrases: [
    "Dalam laga yang",
    "Pertandingan yang",
    "Perlu diketahui bahwa",
    "Secara keseluruhan",
    "Dalam kesimpulannya",
    "Sangat menarik untuk",
    "Tidak dapat dipungkiri",
    "Hal ini menandakan",
    "Bagian Pertama",
    "Bagian Kedua",
    "Bagian Ketiga",
    "sebagai berikut",
    "di atas",           // ciri artikel AI yang mereferensikan dirinya sendiri
  ],
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Cek quality gate — dipakai di generate-draft/route.ts sebelum simpan
export interface QualityCheckResult {
  passed: boolean
  wordCount: number
  h2Count: number
  hasBlockquote: boolean
  hasMetaDescription: boolean // NEWv3
  metaDescriptionLength: number // NEWv3
  forbiddenFound: string[]
  score: number // 0-100
}

export function checkQuality(
  htmlContent: string,
  gate: EditorialBrief["qualityGate"],
  hasQuotes: boolean,
  metaDescription?: string, // NEWv3 — opsional supaya tidak breaking-change pemanggil lama
): QualityCheckResult {
  const text = htmlContent.replace(/<[^>]+>/g, " ")
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const h2Count = (htmlContent.match(/<h2>/g) ?? []).length
  const hasBlockquote = htmlContent.includes("<blockquote>")

  const metaDescriptionLength = metaDescription?.trim().length ?? 0
  // Golden standard: meta description selalu 1 kalimat utuh, kira-kira
  // 120-200 karakter (lihat contoh "Brasil menang 3-0 atas Haiti..." dsb).
  // Di bawah 60 karakter berarti kosong/placeholder, jadi dianggap gagal.
  const hasMetaDescription = metaDescriptionLength >= 60

  const forbiddenFound = gate.forbiddenPhrases.filter((phrase) =>
    htmlContent.toLowerCase().includes(phrase.toLowerCase())
  )

  const wordPass  = wordCount >= gate.minWordCount
  const h2Pass    = h2Count >= gate.minH2Count
  const quotePass = !hasQuotes || !gate.requiresBlockquote || hasBlockquote
  const phrasePass = forbiddenFound.length === 0
  const metaPass  = !gate.requiresMetaDescription || hasMetaDescription

  // Score: setiap kriteria bobotnya berbeda
  let score = 0
  if (wordPass)   score += 30
  else score += Math.floor((wordCount / gate.minWordCount) * 30)
  if (h2Pass)     score += 20
  if (quotePass)  score += 15
  if (phrasePass) score += 25
  else score += Math.max(0, 25 - forbiddenFound.length * 7)
  if (metaPass)   score += 10

  const passed = wordPass && h2Pass && quotePass && forbiddenFound.length === 0 && metaPass

  return { passed, wordCount, h2Count, hasBlockquote, hasMetaDescription, metaDescriptionLength, forbiddenFound, score }
}
