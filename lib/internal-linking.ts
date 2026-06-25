// lib/internal-linking.ts
//
// Internal Link Building otomatis — menyisipkan link antar-artikel ke dalam
// konten HTML berdasarkan kecocokan judul/tag artikel lain yang sudah publish.
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
}

export interface InternalLinkOptions {
  /** Maksimal jumlah link baru yang disisipkan per artikel. Default 5. */
  maxLinks?: number
  /** Minimal panjang keyword (judul/tag) agar tidak match ke kata terlalu umum. Default 6. */
  minKeywordLength?: number
  /** Prefix URL artikel. Default "/article/". */
  basePath?: string
}

interface Hit {
  start: number
  end: number
  candidate: LinkCandidate
  text: string
}

const DEFAULT_OPTIONS: Required<InternalLinkOptions> = {
  maxLinks: 5,
  minKeywordLength: 6,
  basePath: "/article/",
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Keyword per kandidat: judul penuh + tag-tag. Tag biasanya lebih pendek &
// lebih spesifik (nama klub/pemain) sehingga lebih sering match di body teks
// daripada judul artikel yang berupa kalimat naratif panjang.
function buildKeywords(candidate: LinkCandidate, minLen: number): string[] {
  const keywords = new Set<string>()
  if (candidate.title && candidate.title.length >= minLen) keywords.add(candidate.title)
  for (const tag of candidate.tags ?? []) {
    if (tag && tag.length >= minLen) keywords.add(tag)
  }
  return [...keywords].sort((a, b) => b.length - a.length)
}

/**
 * Sisipkan internal link ke dalam HTML artikel.
 *
 * Aman terhadap:
 * - Tag HTML & attribute (regex hanya jalan di segmen teks, bukan di dalam tag).
 * - Link yang sudah ada (<a>...</a> tidak ditimpa / tidak ditumpuk jadi nested link).
 * - Heading (<h1>-<h6>) — dilewati agar judul section tidak penuh link.
 * - Widget shortcode teks, mis. [match_data id="..."] — dilewati apa adanya.
 *
 * Setiap kandidat hanya ditautkan SATU KALI per artikel (match pertama yang
 * ditemukan), dan total link baru dibatasi `maxLinks`.
 */
export function applyInternalLinks(
  html: string,
  currentArticleId: string | null | undefined,
  candidates: LinkCandidate[],
  options: InternalLinkOptions = {}
): { html: string; linkedSlugs: string[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const usable = candidates
    .filter((c) => c.id !== currentArticleId && c.slug)
    .map((c) => ({ candidate: c, keywords: buildKeywords(c, opts.minKeywordLength) }))
    .filter((c) => c.keywords.length > 0)

  if (usable.length === 0 || opts.maxLinks <= 0) {
    return { html, linkedSlugs: [] }
  }

  // Pecah HTML jadi segmen tag vs teks — hanya segmen teks (index ganjil/genap
  // berseling) yang boleh diubah.
  const segments = html.split(/(<[^>]+>)/g)

  let depthInsideA = 0
  let depthInsideHeading = 0
  let linksInserted = 0
  const linkedSlugs = new Set<string>()
  const linkedCandidateIds = new Set<string>()

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg) continue

    // Segmen tag → hanya update state, jangan diubah.
    if (seg.startsWith("<")) {
      const tagMatch = /^<\/?\s*([a-zA-Z0-9]+)/.exec(seg)
      const tagName = tagMatch?.[1]?.toLowerCase()
      const isClosing = /^<\//.test(seg)
      if (tagName === "a") depthInsideA += isClosing ? -1 : 1
      if (tagName && /^h[1-6]$/.test(tagName)) depthInsideHeading += isClosing ? -1 : 1
      continue
    }

    if (depthInsideA > 0 || depthInsideHeading > 0) continue
    if (linksInserted >= opts.maxLinks) continue
    if (!seg.trim()) continue
    // Lewati segmen yang murni shortcode widget, mis. [match_data id="x"]
    if (/^\s*\[[a-z_]+_data\s+id="[^"]+"\]\s*$/i.test(seg)) continue

    // Kumpulkan semua match kandidat di segmen ini dulu (tanpa mengubah string),
    // supaya tidak ada link yang ter-nested di dalam link lain.
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
          hits.push({ start: m.index, end: m.index + m[1].length, candidate, text: m[1] })
          break // satu keyword cukup untuk kandidat ini, lanjut ke kandidat lain
        }
      }
    }
    if (hits.length === 0) continue

    // Pilih match yang tidak overlap, urut dari posisi paling awal, sesuai sisa kuota.
    hits.sort((a, b) => a.start - b.start)
    const chosen: Hit[] = []
    let lastEnd = -1
    for (const hit of hits) {
      if (chosen.length + linksInserted >= opts.maxLinks) break
      if (hit.start < lastEnd) continue
      chosen.push(hit)
      lastEnd = hit.end
    }
    if (chosen.length === 0) continue

    // Bangun ulang segmen dari belakang ke depan supaya index tetap valid.
    let segOut = seg
    for (let k = chosen.length - 1; k >= 0; k--) {
      const hit = chosen[k]
      const href = `${opts.basePath}${hit.candidate.slug}`
      const safeTitle = hit.candidate.title.replace(/"/g, "&quot;")
      const anchor = `<a href="${href}" title="${safeTitle}">${hit.text}</a>`
      segOut = segOut.slice(0, hit.start) + anchor + segOut.slice(hit.end)
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
 * Ambil daftar kandidat artikel published dari Supabase, siap dipakai sebagai
 * argumen `candidates` di atas. Dipisah dari `applyInternalLinks` (pure
 * function, tanpa I/O) supaya bisa dipanggil baik dari client (browser, saat
 * admin menyimpan artikel di create-article-view.tsx) maupun dari server
 * (API route untuk proses retroaktif).
 */
export async function fetchLinkCandidates(
  supabase: any,
  excludeArticleId?: string | null
): Promise<LinkCandidate[]> {
  let query = supabase
    .from("articles")
    .select("id, slug, title, article_tags(tags(name))")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(300) // batasi agar query & matching tetap ringan

  if (excludeArticleId) query = query.neq("id", excludeArticleId)

  const { data, error } = await query
  if (error || !data) return []

  return (data as any[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    // article_tags(tags(name)) bisa muncul sebagai objek tunggal ATAU array
    // tergantung cara Supabase menginferensi relasi — tangani keduanya.
    tags: (row.article_tags ?? []).flatMap((at: any) => {
      const t = at?.tags
      if (!t) return []
      return Array.isArray(t) ? t.map((tt: any) => tt?.name) : [t.name]
    }).filter(Boolean),
  }))
}
