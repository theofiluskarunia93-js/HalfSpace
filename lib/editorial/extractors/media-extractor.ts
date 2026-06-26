// lib/editorial/extractors/media-extractor.ts — v2
// Tidak ada perubahan logika dari v1 — file ini di-copy agar pipeline v2 lengkap dan self-contained.

export interface SerperExtracted {
  quotes: Array<{ text: string; speaker: string; source: string }>
  manOfMatch?: string
  playerRatings?: Array<{ player: string; rating: number }>
  mediaHighlights: string[]
  transferStatus?: string
  injuryStatement?: string
}

export interface TavilyExtracted {
  additionalFacts: string[]
  injuryDetails?: string
  transferTimeline?: string
}

function extractQuotesFromSnippets(text: string): SerperExtracted["quotes"] {
  const quotes: SerperExtracted["quotes"] = []
  const p1 = /"([^"]{40,200})"\s*[—–\-]\s*([A-Z][a-záéíóúñ]+ [A-Z][a-záéíóúñ]+)/g
  const p2 = /([A-Z][a-záéíóúñ]+ [A-Z][a-záéíóúñ]+):\s*"([^"]{40,200})"/g
  let m: RegExpExecArray | null

  while ((m = p1.exec(text)) !== null && quotes.length < 3) {
    const wc = m[1].trim().split(/\s+/).length
    if (wc >= 5 && wc <= 50) quotes.push({ text: m[1].trim(), speaker: m[2].trim(), source: "Serper" })
  }
  while ((m = p2.exec(text)) !== null && quotes.length < 3) {
    const wc = m[2].trim().split(/\s+/).length
    if (wc >= 5 && wc <= 50) quotes.push({ text: m[2].trim(), speaker: m[1].trim(), source: "Serper" })
  }
  return quotes
}

function extractPlayerRatings(text: string): SerperExtracted["playerRatings"] {
  const ratings: SerperExtracted["playerRatings"] = []
  const p = /([A-Z][a-záéíóúñ]+(?: [A-Z][a-záéíóúñ]+){0,2})[\s:—–]+(\d+(?:\.\d)?)\s*(?:\/10)?(?=\s|,|\.|$)/g
  let m: RegExpExecArray | null
  while ((m = p.exec(text)) !== null && ratings.length < 5) {
    const r = parseFloat(m[2])
    if (r >= 5 && r <= 10) ratings.push({ player: m[1].trim(), rating: r })
  }
  return ratings.length > 0 ? ratings : undefined
}

function extractMediaHighlights(text: string): string[] {
  const lines = text.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("Ringkasan:") || l.startsWith("* "))
    .map((l) => l.replace(/^(Ringkasan:|[*•]\s*)/, "").trim())
    .filter((l) => l.length > 30)

  const seen = new Set<string>()
  return lines.filter((l) => {
    const key = l.slice(0, 40).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)
}

export function extractSerperData(text: string, newsType: string): SerperExtracted {
  const motm = text.match(/(?:man of the match|player of the match|MOTM)[:\s]+([A-Z][a-záéíóúñ]+(?: [A-Z][a-záéíóúñ]+){0,2})/i)?.[1]?.trim()
  const transferStatus = newsType === "transfer"
    ? text.match(/(deal agreed|personal terms|bid submitted|move confirmed|fee agreed|negotiations|talks|verbally agreed)[^.\n]{0,100}/i)?.[0]?.trim()
    : undefined
  const injuryStatement = newsType === "cedera"
    ? text.match(/(official statement|club confirm|ruled out|expected to miss|will be out)[^.\n]{0,150}/i)?.[0]?.trim()
    : undefined

  return {
    quotes:          extractQuotesFromSnippets(text),
    manOfMatch:      motm,
    playerRatings:   extractPlayerRatings(text),
    mediaHighlights: extractMediaHighlights(text),
    transferStatus,
    injuryStatement,
  }
}

export function extractTavilyData(
  text: string,
  bzzoiroText: string,
  serperText: string,
  newsType: string,
): TavilyExtracted {
  if (!text.trim()) return { additionalFacts: [] }

  const existing = (bzzoiroText + " " + serperText).toLowerCase()
  const facts = text.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("* ") || l.startsWith("• "))
    .map((l) => l.replace(/^[*•]\s+/, "").trim())
    .filter((l) => l.length > 20)
    .filter((f) => {
      const words = f.toLowerCase().split(/\s+/).slice(0, 6).join(" ")
      return !existing.includes(words)
    })
    .slice(0, 3)

  const injuryDetails = newsType === "cedera"
    ? text.match(/(hamstring|knee|ankle|muscle|ligament|fracture|torn|sprain)[^.\n]{0,150}(?:week|month|laga|pertandingan)[^.\n]{0,60}/i)?.[0]?.trim()
    : undefined

  const transferTimeline = newsType === "transfer"
    ? text.match(/(medical|unveil|sign|announce|complete)[^.\n]{0,100}(?:by|before|next|this week|this month)[^.\n]{0,60}/i)?.[0]?.trim()
    : undefined

  return { additionalFacts: facts, injuryDetails, transferTimeline }
}
