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
}

// NEWv2: Kontrol kualitas data — jika field ini ada, Llama wajib ikuti batasannya
export interface DataQualityWarning {
  field: string          // mis. "player_stats", "transfer_fee"
  status: "missing" | "partial" | "unverified"
  instruction: string    // instruksi eksplisit untuk Llama
}

// NEWv2: Metadata SEO untuk judul dan paragraf pertama
export interface SeoMeta {
  primaryKeyword: string    // keyword utama — WAJIB ada di judul
  secondaryKeywords: string[] // keyword pendukung — masuk di 100 kata pertama
  titleTemplate: string     // format: "[primaryKeyword]: [hook]" atau "[hook] — [primaryKeyword]"
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
    forbiddenPhrases: string[]  // frasa yang menunjukkan artikel generik/AI
  }
}

// Word targets per tipe — sesuai article-prompts.ts
export const WORD_TARGETS: Record<NewsType, EditorialBrief["wordTarget"]> = {
  hasil:    { min: 500, max: 700, paragraphMin: 8, h2Min: 3 },
  preview:  { min: 500, max: 700, paragraphMin: 8, h2Min: 3 },
  cedera:   { min: 500, max: 700, paragraphMin: 8, h2Min: 3 },
  konpers:  { min: 500, max: 700, paragraphMin: 8, h2Min: 3 },
  transfer: { min: 500, max: 700, paragraphMin: 8, h2Min: 3 },
  trivia:   { min: 500, max: 700, paragraphMin: 8, h2Min: 3 },
}

// Quality gate default — sama untuk semua tipe
// forbiddenPhrases dideteksi sebelum simpan ke Supabase
export const DEFAULT_QUALITY_GATE: EditorialBrief["qualityGate"] = {
  minWordCount: 450,
  minH2Count: 3,
  requiresBlockquote: false, // hanya required jika brief.quotes.length > 0
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
  forbiddenFound: string[]
  score: number // 0-100
}

export function checkQuality(
  htmlContent: string,
  gate: EditorialBrief["qualityGate"],
  hasQuotes: boolean,
): QualityCheckResult {
  const text = htmlContent.replace(/<[^>]+>/g, " ")
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const h2Count = (htmlContent.match(/<h2>/g) ?? []).length
  const hasBlockquote = htmlContent.includes("<blockquote>")

  const forbiddenFound = gate.forbiddenPhrases.filter((phrase) =>
    htmlContent.toLowerCase().includes(phrase.toLowerCase())
  )

  const wordPass  = wordCount >= gate.minWordCount
  const h2Pass    = h2Count >= gate.minH2Count
  const quotePass = !hasQuotes || !gate.requiresBlockquote || hasBlockquote
  const phrasePass = forbiddenFound.length === 0

  // Score: setiap kriteria bobotnya berbeda
  let score = 0
  if (wordPass)   score += 35
  else score += Math.floor((wordCount / gate.minWordCount) * 35)
  if (h2Pass)     score += 20
  if (quotePass)  score += 15
  if (phrasePass) score += 30
  else score += Math.max(0, 30 - forbiddenFound.length * 8)

  const passed = wordPass && h2Pass && quotePass && forbiddenFound.length === 0

  return { passed, wordCount, h2Count, hasBlockquote, forbiddenFound, score }
}
