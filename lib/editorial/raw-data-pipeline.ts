// lib/editorial/raw-data-pipeline.ts — BARU
//
// STEP baru di pipeline (per permintaan pengguna, Juli 2026):
//
//   RAW Data (Bzzoiro + Serper + Tavily)
//     → Normalizer
//     → Exact Deduplication
//     → Semantic Deduplication
//     → Fact Merging (target 1.000–2.000 token)
//     → Editor Brief (GPT-5 Mini)
//     → Validator
//     → Generate Draft (Claude Sonnet)
//
// File ini adalah kode TypeScript murni — TANPA AI — konsisten dengan prinsip
// yang sudah dipakai di lib/editorial/brief-builder.ts (fakta harus
// deterministik dan bisa diaudit, bukan hasil "tebakan" model).
//
// CATATAN SCOPE: normalisasi & deduplikasi HANYA diterapkan ke serperText dan
// tavilyText. bzzoiroText TIDAK disentuh — ia sudah berupa data struktural
// dari API Bzzoiro (bukan teks media mentah), jadi tidak punya HTML/iklan/
// footer/navigasi/author-bio yang perlu dibersihkan, dan label-labelnya
// (mis. "Tanggal:", "Venue:", "SKOR AKHIR:") harus dipertahankan persis untuk
// parser regex di brief-builder.ts.

export interface RawDataPipelineReport {
  normalizer: {
    linesRemovedSerper: number
    linesRemovedTavily: number
  }
  exactDeduplication: {
    duplicateParagraphsRemoved: number
    duplicateSentencesRemoved: number
    duplicateTitlesRemoved: number
  }
  semanticDeduplication: {
    nearDuplicateSentencesRemoved: number
  }
  factMerging: {
    tokenEstimateBefore: number
    tokenEstimateAfter: number
    targetMin: number
    targetMax: number
    trimmed: boolean
    note: string
  }
}

export interface RawDataPipelineInput {
  bzzoiroText: string
  serperText: string
  tavilyText: string
  manualContext: string
}

export interface RawDataPipelineOutput {
  bzzoiroText: string
  serperText: string
  tavilyText: string
  manualContext: string
  report: RawDataPipelineReport
}

// Target token untuk RAW DATA gabungan (bzzoiro + serper + tavily + manual)
// SEBELUM masuk ke Editor Brief (GPT-5 Mini). Estimasi kasar 1 token ≈ 4
// karakter — sama seperti estimateTokens() di lib/editorial/types.ts.
const FACT_MERGE_TARGET_MIN = 1000
const FACT_MERGE_TARGET_MAX = 2000

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NORMALIZER
// Hilangkan HTML, iklan, footer, navigasi, copyright, author bio, dan
// kalimat pembuka boilerplate yang tidak berisi informasi.
// ─────────────────────────────────────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&lt;": "<", "&gt;": ">", "&mdash;": "—", "&ndash;": "–", "&rsquo;": "’", "&lsquo;": "‘",
}

function stripHtml(text: string): string {
  let out = text.replace(/<[^>]+>/g, " ")
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    out = out.split(entity).join(replacement)
  }
  // sisa entity numerik/HTML yang tidak dikenali, mis. &#8217;
  out = out.replace(/&#\d+;/g, " ")
  return out
}

// Baris yang menandakan iklan/promosi
const AD_PATTERN = /\b(advertisement|sponsored( content)?|iklan|promoted|klik di sini|click here|shop now|buy now)\b/i

// Baris footer/copyright/kebijakan
const FOOTER_PATTERN = /(all rights reserved|copyright\s*©|©\s?\d{4}|hak cipta dilindungi|privacy policy|kebijakan privasi|terms of (service|use)|syarat (dan|&) ketentuan|cookie policy)/i

// Baris navigasi (menu situs, breadcrumb, share bar)
const NAV_PATTERN = /^(home|beranda|menu|kategori|share|bagikan|follow us|ikuti kami)\s*[:\-|›»]/i
const BREADCRUMB_PATTERN = /^[A-Za-z0-9 ]{1,20}(\s*[›»|>]\s*[A-Za-z0-9 ]{1,20}){2,}$/

// Baris author bio / byline
const AUTHOR_BIO_PATTERN = /(is a (senior |staff |lead |chief )?(writer|reporter|correspondent|editor|columnist|contributor)|covers? (the )?[a-z ]+ for\b|contributed to this report|has (covered|written about)\b|follow (him|her|them) on\b|penulis adalah|wartawan senior yang meliput|kontributor untuk)/i

// Kalimat pembuka boilerplate yang tidak berisi informasi (newsletter, subscribe, dsb.)
const OPENING_FLUFF_PATTERN = /^(subscribe|sign up|newsletter|get the latest|daftar newsletter|langganan|dapatkan berita terbaru|download (our|the) app|read more|baca juga|baca selengkapnya)\b/i

function isJunkLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false // baris kosong dibiarkan (pemisah paragraf), bukan "dihapus"
  if (AD_PATTERN.test(trimmed)) return true
  if (FOOTER_PATTERN.test(trimmed)) return true
  if (NAV_PATTERN.test(trimmed)) return true
  if (BREADCRUMB_PATTERN.test(trimmed)) return true
  if (AUTHOR_BIO_PATTERN.test(trimmed)) return true
  if (OPENING_FLUFF_PATTERN.test(trimmed)) return true
  return false
}

/**
 * Normalisasi satu blok teks media (Serper/Tavily): hilangkan HTML, entity,
 * dan baris-baris iklan/footer/navigasi/copyright/author-bio/boilerplate.
 * Baris berlabel (mis. "[Media 1 — espn.com]", "Judul (EN): ...") TETAP
 * dipertahankan karena dipakai parser di media-extractor.ts.
 */
function normalizeMediaText(text: string): { cleaned: string; removedCount: number } {
  const withoutHtml = stripHtml(text)
  const lines = withoutHtml.split("\n")
  let removedCount = 0

  const keptLines = lines.filter((line) => {
    if (isJunkLine(line)) {
      removedCount++
      return false
    }
    return true
  })

  return { cleaned: keptLines.join("\n"), removedCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXACT DEDUPLICATION
// Hapus paragraf identik, kalimat identik, judul identik, dan baris metadata
// identik — baik dalam satu sumber maupun lintas sumber (Serper vs Tavily).
// ─────────────────────────────────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ")
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

interface ExactDedupResult {
  paragraphs: string[]
  duplicateParagraphsRemoved: number
  duplicateSentencesRemoved: number
  duplicateTitlesRemoved: number
}

/**
 * Dedup EXACT lintas dua sumber sekaligus (serper + tavily digabung dulu
 * sebagai daftar paragraf, supaya duplikasi ANTAR sumber juga tertangkap,
 * bukan cuma duplikasi di dalam satu sumber).
 */
function exactDeduplicateParagraphs(paragraphBlocks: string[]): ExactDedupResult {
  const seenParagraphKeys = new Set<string>()
  const seenTitleKeys = new Set<string>()
  const seenSentenceKeys = new Set<string>()

  let duplicateParagraphsRemoved = 0
  let duplicateSentencesRemoved = 0
  let duplicateTitlesRemoved = 0

  const outParagraphs: string[] = []

  for (const block of paragraphBlocks) {
    const blockKey = normalizeKey(block)
    if (!blockKey) { outParagraphs.push(block); continue }

    if (seenParagraphKeys.has(blockKey)) {
      duplicateParagraphsRemoved++
      continue // paragraf identik persis — buang seluruhnya
    }
    seenParagraphKeys.add(blockKey)

    // Judul identik: baris "Judul (EN): X" / "Title: X" yang sudah pernah muncul
    const titleMatch = block.match(/^Judul \(EN\):\s*(.+)$/m)
    if (titleMatch) {
      const titleKey = normalizeKey(titleMatch[1])
      if (titleKey && seenTitleKeys.has(titleKey)) {
        duplicateTitlesRemoved++
        continue // sumber lain dengan judul yang sama persis — kemungkinan artikel duplikat
      }
      if (titleKey) seenTitleKeys.add(titleKey)
    }

    // Dedup kalimat identik DI DALAM blok yang masih lolos di atas
    const lines = block.split("\n")
    const outLines: string[] = []
    for (const line of lines) {
      // Baris berlabel (mis. "[Media 1 — espn.com]", "Poin Penting (EN):") tidak
      // dianggap "kalimat" — biarkan lolos apa adanya, hanya bullet fakta ("* ...")
      // dan kalimat naratif yang dicek dedup.
      const isBullet = /^[*•]\s+/.test(line.trim())
      const isNarrative = !isBullet && line.trim().length > 25 && !/^\[|:$/.test(line.trim())

      if (isBullet || isNarrative) {
        const sentenceKey = normalizeKey(line.replace(/^[*•]\s+/, ""))
        if (sentenceKey && seenSentenceKeys.has(sentenceKey)) {
          duplicateSentencesRemoved++
          continue
        }
        if (sentenceKey) seenSentenceKeys.add(sentenceKey)
      }
      outLines.push(line)
    }

    outParagraphs.push(outLines.join("\n"))
  }

  return {
    paragraphs: outParagraphs,
    duplicateParagraphsRemoved,
    duplicateSentencesRemoved,
    duplicateTitlesRemoved,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SEMANTIC DEDUPLICATION
// Hapus kalimat yang MAKNANYA sama walau kata-katanya berbeda. Deterministik
// (tanpa AI/embedding) — pakai kemiripan Jaccard atas bag-of-words signifikan
// (stopword dibuang), konsisten dengan pendekatan heuristik ringan yang sudah
// dipakai di brief-validator.ts (allNumbersGrounded, dsb).
// ─────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with",
  "is", "are", "was", "were", "be", "been", "has", "have", "had", "it", "its", "that",
  "this", "as", "by", "from", "will", "would", "could", "can", "he", "she", "they",
  "his", "her", "their", "after", "before", "said", "yang", "dan", "atau", "di", "ke",
  "dari", "untuk", "dengan", "pada", "adalah", "itu", "ini", "akan", "sudah", "telah",
])

function significantTokens(sentence: string): Set<string> {
  const words = sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  return new Set(words)
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const w of a) if (b.has(w)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// Ambang kemiripan — di atas ini dianggap "makna sama" (near-duplicate).
// Dipilih longgar sengaja (bukan terlalu agresif) supaya tidak salah buang
// dua kalimat yang kebetulan membahas topik sama tapi fakta berbeda.
const SEMANTIC_SIMILARITY_THRESHOLD = 0.72

function semanticDeduplicateParagraphs(paragraphBlocks: string[]): { paragraphs: string[]; removedCount: number } {
  const seenTokenSets: Set<string>[] = []
  let removedCount = 0

  const outParagraphs = paragraphBlocks.map((block) => {
    const lines = block.split("\n")
    const outLines = lines.filter((line) => {
      const isBullet = /^[*•]\s+/.test(line.trim())
      const isNarrative = !isBullet && line.trim().length > 25 && !/^\[|:$/.test(line.trim())
      if (!isBullet && !isNarrative) return true // baris label, biarkan

      const content = line.replace(/^[*•]\s+/, "").trim()
      const tokens = significantTokens(content)
      if (tokens.size === 0) return true

      for (const seen of seenTokenSets) {
        if (jaccardSimilarity(tokens, seen) >= SEMANTIC_SIMILARITY_THRESHOLD) {
          removedCount++
          return false // makna sudah pernah muncul di kalimat lain — buang
        }
      }
      seenTokenSets.push(tokens)
      return true
    })
    return outLines.join("\n")
  })

  return { paragraphs: outParagraphs, removedCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FACT MERGING
// Gabungkan fakta dari seluruh sumber (Serper + Tavily, setelah normalisasi &
// dedup) jadi satu korpus RAW DATA bersih, dengan target token 1.000–2.000
// (bzzoiro + serper + tavily + manualContext gabungan). bzzoiroText adalah
// data primer struktural dan TIDAK PERNAH dipangkas. Kalau total melebihi
// batas atas, pangkas dari yang PALING TIDAK primer dulu: Tavily (lapisan
// konteks tambahan) dipangkas duluan, baru Serper (media) kalau masih lebih —
// urutan ini konsisten dengan peran masing-masing sumber di pipeline
// (lihat komentar peran sumber di lib/news-context/tavily.ts & serper.ts).
// Kalau total di bawah batas bawah, TIDAK ADA yang ditambahkan/dikarang —
// hanya dicatat sebagai catatan (data mentah memang tipis untuk topik ini).
// ─────────────────────────────────────────────────────────────────────────────

function trimParagraphsToTokenBudget(paragraphs: string[], maxTokens: number): string[] {
  const out: string[] = []
  let used = 0
  for (const p of paragraphs) {
    const t = estimateTokens(p)
    if (used + t > maxTokens) break
    out.push(p)
    used += t
  }
  return out
}

function splitIntoBlocks(text: string): string[] {
  // Blok = dipisah baris kosong ganda (paragraf/blok sumber), format yang
  // sudah dipakai konsisten oleh formatResult()/formatSource() di
  // serper.ts & tavily.ts (lihat "\n\n" join antar sumber).
  return text.split(/\n\n+/).filter((b) => b.trim().length > 0)
}

export function processRawData(input: RawDataPipelineInput): RawDataPipelineOutput {
  const { bzzoiroText, serperText, tavilyText, manualContext } = input

  // ── 1. Normalizer (hanya Serper & Tavily — lihat catatan scope di atas) ──
  const normSerper = normalizeMediaText(serperText)
  const normTavily = normalizeMediaText(tavilyText)

  // ── 2. Exact Deduplication (lintas Serper + Tavily digabung) ────────────
  const serperBlocks = splitIntoBlocks(normSerper.cleaned)
  const tavilyBlocks = splitIntoBlocks(normTavily.cleaned)

  const combinedBlockCount = serperBlocks.length
  const exactDedup = exactDeduplicateParagraphs([...serperBlocks, ...tavilyBlocks])
  const dedupSerperBlocks = exactDedup.paragraphs.slice(0, combinedBlockCount)
  const dedupTavilyBlocks = exactDedup.paragraphs.slice(combinedBlockCount)

  // ── 3. Semantic Deduplication (per sumber, setelah exact dedup) ─────────
  const semSerper = semanticDeduplicateParagraphs(dedupSerperBlocks)
  // Tavily dicek juga terhadap kalimat yang SUDAH muncul di Serper, supaya
  // narasi Tavily yang cuma menegaskan ulang (dengan kata berbeda) apa yang
  // sudah disebut Serper ikut terbuang — bukan cuma dedup internal Tavily.
  const semTavilyAcrossSerper = semanticDeduplicateParagraphs([...dedupSerperBlocks, ...dedupTavilyBlocks])
  const semTavilyBlocks = semTavilyAcrossSerper.paragraphs.slice(dedupSerperBlocks.length)
  const semanticRemovedTotal = semSerper.removedCount + (semTavilyAcrossSerper.removedCount - semSerper.removedCount /* kasar, lihat catatan */)

  let cleanedSerperText = semSerper.paragraphs.join("\n\n")
  let cleanedTavilyText = semTavilyBlocks.join("\n\n")

  // ── 4. Fact Merging — cek & tegakkan target token 1.000–2.000 ───────────
  const tokenBefore = estimateTokens(bzzoiroText) + estimateTokens(serperText) + estimateTokens(tavilyText) + estimateTokens(manualContext)

  let trimmed = false
  let note = ""
  let combinedAfter =
    estimateTokens(bzzoiroText) + estimateTokens(cleanedSerperText) + estimateTokens(cleanedTavilyText) + estimateTokens(manualContext)

  if (combinedAfter > FACT_MERGE_TARGET_MAX) {
    // Pangkas Tavily dulu (lapisan konteks tambahan, bukan primer)
    const budgetForTavily = Math.max(0, FACT_MERGE_TARGET_MAX - estimateTokens(bzzoiroText) - estimateTokens(cleanedSerperText) - estimateTokens(manualContext))
    const trimmedTavilyBlocks = trimParagraphsToTokenBudget(semTavilyBlocks, budgetForTavily)
    cleanedTavilyText = trimmedTavilyBlocks.join("\n\n")
    trimmed = true

    combinedAfter = estimateTokens(bzzoiroText) + estimateTokens(cleanedSerperText) + estimateTokens(cleanedTavilyText) + estimateTokens(manualContext)

    // Kalau MASIH di atas target setelah Tavily habis dipangkas, baru pangkas Serper
    if (combinedAfter > FACT_MERGE_TARGET_MAX) {
      const budgetForSerper = Math.max(0, FACT_MERGE_TARGET_MAX - estimateTokens(bzzoiroText) - estimateTokens(cleanedTavilyText) - estimateTokens(manualContext))
      const trimmedSerperBlocks = trimParagraphsToTokenBudget(semSerper.paragraphs, budgetForSerper)
      cleanedSerperText = trimmedSerperBlocks.join("\n\n")
      combinedAfter = estimateTokens(bzzoiroText) + estimateTokens(cleanedSerperText) + estimateTokens(cleanedTavilyText) + estimateTokens(manualContext)
    }

    note = `RAW data dipangkas dari ~${tokenBefore} token ke ~${combinedAfter} token (target maks ${FACT_MERGE_TARGET_MAX}), prioritas Tavily dipangkas lebih dulu.`
  } else if (combinedAfter < FACT_MERGE_TARGET_MIN) {
    note = `RAW data setelah dibersihkan hanya ~${combinedAfter} token (di bawah target minimum ${FACT_MERGE_TARGET_MIN}) — TIDAK ditambahkan fakta karangan, ini murni mencerminkan data mentah yang tipis untuk topik ini.`
  } else {
    note = `RAW data ~${combinedAfter} token, sudah dalam target ${FACT_MERGE_TARGET_MIN}–${FACT_MERGE_TARGET_MAX} token.`
  }

  const report: RawDataPipelineReport = {
    normalizer: {
      linesRemovedSerper: normSerper.removedCount,
      linesRemovedTavily: normTavily.removedCount,
    },
    exactDeduplication: {
      duplicateParagraphsRemoved: exactDedup.duplicateParagraphsRemoved,
      duplicateSentencesRemoved: exactDedup.duplicateSentencesRemoved,
      duplicateTitlesRemoved: exactDedup.duplicateTitlesRemoved,
    },
    semanticDeduplication: {
      nearDuplicateSentencesRemoved: Math.max(0, semanticRemovedTotal),
    },
    factMerging: {
      tokenEstimateBefore: tokenBefore,
      tokenEstimateAfter: combinedAfter,
      targetMin: FACT_MERGE_TARGET_MIN,
      targetMax: FACT_MERGE_TARGET_MAX,
      trimmed,
      note,
    },
  }

  return {
    bzzoiroText, // tidak disentuh — lihat catatan scope di atas
    serperText: cleanedSerperText,
    tavilyText: cleanedTavilyText,
    manualContext, // input admin manual — tidak melalui pipeline media ini
    report,
  }
}
