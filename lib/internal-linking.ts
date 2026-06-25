// lib/internal-linking.ts
//
// Internal Link Building otomatis — menyisipkan link antar-artikel ke dalam
// konten HTML berdasarkan relevansi semantik + kecocokan teks.
//
// Dipakai di dua tempat:
//   1. components/admin/views/create-article-view.tsx → saat artikel baru
//      disimpan/dipublish (otomatis, berjalan sendiri tiap save).
//   2. app/api/internal-linking/route.ts → dipicu manual dari Posts view untuk
//      menjalankan ulang ke artikel yang SUDAH publish (retroaktif).

export interface LinkCandidate {
  id: string
  slug: string
  title: string
  tags?: string[]
  categoryId?: string
}

// Konteks artikel yang sedang diproses — dipakai untuk semantic scoring.
// Opsional agar backward-compatible dengan semua pemanggil lama.
export interface SourceArticleContext {
  categoryId?: string | null
  tags?: string[]
}

export interface InternalLinkOptions {
  /** Maksimal jumlah link baru yang disisipkan per artikel. Default: auto (1 per ~400 kata, min 3 max 8). */
  maxLinks?: number
  /** Minimal panjang keyword agar tidak match ke kata terlalu umum. Default 8. */
  minKeywordLength?: number
  /** Prefix URL artikel. Default "/article/". */
  basePath?: string
}

interface Hit {
  start: number
  end: number
  candidate: LinkCandidate
  text: string
  contextPhrase: string  // frasa 2-3 kata di sekitar match untuk anchor text yang lebih deskriptif
}

const DEFAULT_OPTIONS: Required<InternalLinkOptions> = {
  maxLinks: 0,          // 0 = auto-calculate dari panjang konten
  minKeywordLength: 8,
  basePath: "/article/",
}

// Kata-kata yang terlalu umum untuk dijadikan anchor link meski lolos minKeywordLength.
// Daftar ini spesifik untuk konten sepakbola berbahasa Indonesia.
const BLOCKED_KEYWORDS = new Set([
  "taktik", "formasi", "pemain", "pelatih", "wasit", "kapten", "striker",
  "pemain", "musim", "kompetisi", "turnamen", "klasemen", "pertandingan",
  "tendangan", "gawang", "kiper", "bola", "sepakbola", "football",
  "manager", "skuad", "timnas", "transfer", "kontrak", "liga",
])

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Hitung semantic relevance score kandidat terhadap artikel sumber.
// Makin tinggi score → kandidat makin diprioritaskan di antrian matching.
function calcRelevanceScore(candidate: LinkCandidate, source: SourceArticleContext): number {
  let score = 0

  // Kategori sama: sinyal terkuat — artikel taktik lebih relevan ke artikel taktik lain
  if (source.categoryId && candidate.categoryId && source.categoryId === candidate.categoryId) {
    score += 5
  }

  // Setiap tag yang sama menambah skor
  const sourceTags = new Set((source.tags ?? []).map(t => t.toLowerCase()))
  for (const tag of candidate.tags ?? []) {
    if (sourceTags.has(tag.toLowerCase())) score += 2
  }

  return score
}

// Keyword per kandidat: tag-tag (lebih spesifik, sering muncul di body) + judul penuh.
// Urutan: tag terpanjang dulu → judul → tag pendek, agar match yang lebih spesifik menang.
function buildKeywords(candidate: LinkCandidate, minLen: number): string[] {
  const keywords = new Set<string>()

  for (const tag of candidate.tags ?? []) {
    const t = tag.trim()
    if (t.length >= minLen && !BLOCKED_KEYWORDS.has(t.toLowerCase())) {
      keywords.add(t)
    }
  }

  if (candidate.title && candidate.title.length >= minLen) {
    keywords.add(candidate.title)
  }

  // Urutkan: tag panjang dulu (lebih spesifik), judul panjang mendukung fallback
  return [...keywords].sort((a, b) => {
    const aIsTitle = a === candidate.title
    const bIsTitle = b === candidate.title
    if (!aIsTitle && bIsTitle) return -1  // tag sebelum judul
    if (aIsTitle && !bIsTitle) return 1
    return b.length - a.length            // yang lebih panjang dulu
  })
}

// Cari frasa 2–3 kata yang mencakup keyword di dalam teks segmen.
// Dipakai sebagai anchor text yang lebih deskriptif daripada satu kata saja.
// Contoh: keyword "Liverpool" di "taktik pressing Liverpool" → anchor "pressing Liverpool"
function extractContextPhrase(seg: string, start: number, end: number): string {
  // Ambil window ±40 karakter, lalu pilih 2–3 kata yang mencakup match
  const windowStart = Math.max(0, start - 40)
  const windowEnd = Math.min(seg.length, end + 40)
  const window = seg.slice(windowStart, windowEnd)
  const relStart = start - windowStart
  const relEnd = end - windowStart

  // Cari batas kata di sekitar match
  const words = window.split(/\s+/)
  let charPos = 0
  let matchWordStart = -1
  let matchWordEnd = -1

  for (let i = 0; i < words.length; i++) {
    const wStart = charPos
    const wEnd = charPos + words[i].length
    if (wEnd >= relStart && matchWordStart === -1) matchWordStart = i
    if (wStart <= relEnd) matchWordEnd = i
    charPos += words[i].length + 1
  }

  if (matchWordStart === -1) return seg.slice(start, end)

  // Ambil 1 kata sebelum keyword (jika ada) + keyword — max 3 kata total
  const phraseStart = Math.max(0, matchWordStart - 1)
  const phraseEnd = Math.min(words.length - 1, matchWordEnd + 1)
  const phrase = words.slice(phraseStart, phraseEnd + 1).join(" ").trim()

  // Jangan kembalikan frasa yang terlalu panjang (>35 karakter) atau terlalu pendek
  if (phrase.length > 35 || phrase.length < seg.slice(start, end).length) {
    return seg.slice(start, end)
  }
  return phrase
}

// Hitung maxLinks otomatis berdasarkan perkiraan jumlah kata di konten HTML.
// Rasio: 1 link per 400 kata, min 3, max 8.
function calcAutoMaxLinks(html: string): number {
  const textApprox = html.replace(/<[^>]+>/g, " ").trim()
  const wordCount = textApprox.split(/\s+/).filter(Boolean).length
  return Math.max(3, Math.min(8, Math.floor(wordCount / 400)))
}

/**
 * Sisipkan internal link ke dalam HTML artikel dengan semantic scoring.
 *
 * Perbedaan dari versi sebelumnya:
 * - Kandidat diurutkan berdasarkan relevance score (kategori + tag sama) sebelum matching.
 *   Artikel yang topiknya lebih dekat diprioritaskan mendapat slot link.
 * - Tag umum (taktik, pemain, dll.) diblokir agar tidak jadi anchor.
 * - Anchor text diambil sebagai frasa 2–3 kata yang mencakup keyword,
 *   bukan sekadar satu kata, agar lebih deskriptif untuk SEO.
 * - maxLinks dihitung otomatis dari panjang konten jika tidak di-set.
 * - minKeywordLength naik ke 8 untuk mengurangi false positive.
 *
 * Tetap aman terhadap:
 * - Tag HTML & atribut (hanya segmen teks yang diubah).
 * - Link yang sudah ada (<a> tidak ditumpuk).
 * - Heading (<h1>–<h6>) dilewati.
 * - Widget shortcode dilewati.
 */
export function applyInternalLinks(
  html: string,
  currentArticleId: string | null | undefined,
  candidates: LinkCandidate[],
  options: InternalLinkOptions = {},
  sourceContext: SourceArticleContext = {}
): { html: string; linkedSlugs: string[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const maxLinks = opts.maxLinks > 0 ? opts.maxLinks : calcAutoMaxLinks(html)

  // Filter kandidat valid, lalu urutkan berdasarkan semantic score (tinggi → rendah)
  const usable = candidates
    .filter((c) => c.id !== currentArticleId && c.slug)
    .map((c) => ({
      candidate: c,
      keywords: buildKeywords(c, opts.minKeywordLength),
      score: calcRelevanceScore(c, sourceContext),
    }))
    .filter((c) => c.keywords.length > 0)
    .sort((a, b) => b.score - a.score)  // kandidat paling relevan masuk antrian duluan

  if (usable.length === 0 || maxLinks <= 0) {
    return { html, linkedSlugs: [] }
  }

  const segments = html.split(/(<[^>]+>)/g)

  let depthInsideA = 0
  let depthInsideHeading = 0
  let linksInserted = 0
  const linkedSlugs = new Set<string>()
  const linkedCandidateIds = new Set<string>()

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg) continue

    if (seg.startsWith("<")) {
      const tagMatch = /^<\/?([a-zA-Z0-9]+)/.exec(seg)
      const tagName = tagMatch?.[1]?.toLowerCase()
      const isClosing = /^<\//.test(seg)
      if (tagName === "a") depthInsideA += isClosing ? -1 : 1
      if (tagName && /^h[1-6]$/.test(tagName)) depthInsideHeading += isClosing ? -1 : 1
      continue
    }

    if (depthInsideA > 0 || depthInsideHeading > 0) continue
    if (linksInserted >= maxLinks) continue
    if (!seg.trim()) continue
    if (/^\s*\[[a-z_]+_data\s+id="[^"]+"\]\s*$/i.test(seg)) continue

    const hits: Hit[] = []
    for (const { candidate, keywords } of usable) {
      if (linkedCandidateIds.has(candidate.id)) continue
      for (const keyword of keywords) {
        const pattern = new RegExp(
          `(?<![\\p{L}\\p{N}])(${escapeRegExp(keyword)})(?![\\p{L}\\p{N}])`,
          "iu"
        )
        const m = pattern.exec(seg)
        if (m && m.index !== undefined) {
          const contextPhrase = extractContextPhrase(seg, m.index, m.index + m[1].length)
          hits.push({
            start: m.index,
            end: m.index + m[1].length,
            candidate,
            text: m[1],
            contextPhrase,
          })
          break
        }
      }
    }
    if (hits.length === 0) continue

    hits.sort((a, b) => a.start - b.start)
    const chosen: Hit[] = []
    let lastEnd = -1
    for (const hit of hits) {
      if (chosen.length + linksInserted >= maxLinks) break
      if (hit.start < lastEnd) continue
      chosen.push(hit)
      lastEnd = hit.end
    }
    if (chosen.length === 0) continue

    // Bangun ulang segmen dari belakang ke depan.
    // Anchor text: gunakan contextPhrase jika lebih deskriptif dari satu kata,
    // dan pastikan frasa yang dijadikan link persis menggantikan rentang teks yang match.
    let segOut = seg
    for (let k = chosen.length - 1; k >= 0; k--) {
      const hit = chosen[k]
      const href = `${opts.basePath}${hit.candidate.slug}`
      const safeTitle = hit.candidate.title.replace(/"/g, "&quot;")

      // Jika contextPhrase berbeda dari match asli, kita perlu memperluas rentang yang diganti
      const phrase = hit.contextPhrase
      const usePhrase = phrase !== hit.text && phrase.includes(hit.text)

      let replaceStart = hit.start
      let replaceEnd = hit.end
      let anchorText = hit.text

      if (usePhrase) {
        const phraseIdx = seg.lastIndexOf(phrase, hit.end)
        if (phraseIdx !== -1 && phraseIdx <= hit.start) {
          replaceStart = phraseIdx
          replaceEnd = phraseIdx + phrase.length
          anchorText = phrase
        }
      }

      const anchor = `<a href="${href}" title="${safeTitle}">${anchorText}</a>`
      segOut = segOut.slice(0, replaceStart) + anchor + segOut.slice(replaceEnd)
    }

    for (const hit of chosen) {
      linkedCandidateIds.add(hit.candidate.id)
      linkedSlugs.add(hit.candidate.slug)
    }
    linksInserted += chosen.length
    segments[i] = segOut
  }

  return { html: segments.join(""), linkedSlugs: [...linkedSlugs] }
}

/**
 * Ambil daftar kandidat artikel published dari Supabase.
 * Sekarang juga mengambil category_id agar bisa dipakai untuk semantic scoring.
 */
export async function fetchLinkCandidates(
  supabase: any,
  excludeArticleId?: string | null
): Promise<LinkCandidate[]> {
  let query = supabase
    .from("articles")
    .select("id, slug, title, category_id, article_tags(tags(name))")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(300)

  if (excludeArticleId) query = query.neq("id", excludeArticleId)

  const { data, error } = await query
  if (error || !data) return []

  return (data as any[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    categoryId: row.category_id ?? undefined,
    tags: (row.article_tags ?? []).flatMap((at: any) => {
      const t = at?.tags
      if (!t) return []
      return Array.isArray(t) ? t.map((tt: any) => tt?.name) : [t.name]
    }).filter(Boolean),
  }))
}
