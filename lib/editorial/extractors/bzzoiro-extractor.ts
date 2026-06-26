// lib/editorial/extractors/bzzoiro-extractor.ts — v2
// (tidak ada perubahan logika utama dari v1, file ini di-copy ulang agar pipeline v2 lengkap)

export interface BzzoiroExtractedHasil {
  home: string
  away: string
  score: string
  competition: string
  date: string
  keyIncidents: Array<{
    minute: string | number
    type: string
    player: string
    team: string
  }>
  stats: {
    possession?: [number, number]
    shots?: [number, number]
    shotsOnTarget?: [number, number]
    xgTotal?: [number, number]
    bestPlayer?: string
  }
  momentumSummary: string
}

export interface BzzoiroExtractedPreview {
  home: string
  away: string
  competition: string
  matchDate: string
  venue?: string
  winProbability?: {
    home: number
    draw: number
    away: number
    label: string
  }
  h2hSummary: string
  formHome: string
  formAway: string
  standingsHome?: string
  standingsAway?: string
}

export interface BzzoiroExtractedPlayer {
  name: string
  team: string
  position: string
  age?: string | number
  marketValue?: string
  recentStats: {
    summary: string
    details: Array<{
      match: string
      minutes: number | string
      goals?: number
      assists?: number
      rating?: number
    }>
  }
}

// ── Momentum: angka mentah → deskripsi teks ──────────────────────────────────
export function summarizeMomentum(
  contextText: string,
  home: string,
  away: string,
): string {
  const numbers = (contextText.match(/momentum[^\d-]*(-?\d+)/gi) ?? [])
    .map((m) => parseInt(m.replace(/[^-\d]/g, ""), 10))
    .filter((n) => !isNaN(n))

  if (numbers.length === 0) return ""

  const half = Math.floor(numbers.length / 2)
  const avg1 = numbers.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1)
  const avg2 = numbers.slice(half).reduce((a, b) => a + b, 0) / (numbers.length - half || 1)

  const desc = (avg: number): string => {
    if (avg > 40)  return `${home} mendominasi dengan tekanan tinggi`
    if (avg > 15)  return `${home} lebih banyak menekan, ${away} bertahan dalam blok`
    if (avg > -15) return `kedua tim saling bergantian menguasai permainan`
    if (avg > -40) return `${away} lebih banyak menekan, ${home} lebih banyak bertahan`
    return `${away} mendominasi dengan tekanan penuh`
  }

  const d1 = desc(avg1), d2 = desc(avg2)
  if (d1 === d2) return `Sepanjang laga, ${d1}.`
  return `Babak pertama ${d1}. Babak kedua ${d2}.`
}

// ── Insiden kunci ─────────────────────────────────────────────────────────────
export function extractKeyIncidents(
  contextText: string,
): BzzoiroExtractedHasil["keyIncidents"] {
  const incidents: BzzoiroExtractedHasil["keyIncidents"] = []
  for (const line of contextText.split("\n")) {
    const m = line.match(/Menit\s+(\d+)'?\s*[—\-–]\s*([^—\-–]+)[—\-–]\s*([^(]+)(?:\(([^)]+)\))?/)
    if (m) incidents.push({ minute: m[1], type: m[2].trim(), player: m[3].trim(), team: m[4]?.trim() ?? "" })
  }
  return incidents
}

// ── Statistik ─────────────────────────────────────────────────────────────────
export function extractStats(ctx: string): BzzoiroExtractedHasil["stats"] {
  const stats: BzzoiroExtractedHasil["stats"] = {}

  const xgH = ctx.match(/xg[_\s]?home[:\s]+([0-9.]+)/i)?.[1]
  const xgA = ctx.match(/xg[_\s]?away[:\s]+([0-9.]+)/i)?.[1]
  if (xgH && xgA) stats.xgTotal = [parseFloat(xgH), parseFloat(xgA)]

  const posH = ctx.match(/possession[_\s]?home[:\s]+([0-9.]+)/i)?.[1]
  const posA = ctx.match(/possession[_\s]?away[:\s]+([0-9.]+)/i)?.[1]
  if (posH && posA) stats.possession = [parseFloat(posH), parseFloat(posA)]

  const shH = ctx.match(/shots[_\s]?home[:\s]+(\d+)/i)?.[1]
  const shA = ctx.match(/shots[_\s]?away[:\s]+(\d+)/i)?.[1]
  if (shH && shA) stats.shots = [parseInt(shH), parseInt(shA)]

  const sotH = ctx.match(/shots[_\s]?on[_\s]?target[_\s]?home[:\s]+(\d+)/i)?.[1]
  const sotA = ctx.match(/shots[_\s]?on[_\s]?target[_\s]?away[:\s]+(\d+)/i)?.[1]
  if (sotH && sotA) stats.shotsOnTarget = [parseInt(sotH), parseInt(sotA)]

  const motm = ctx.match(/(?:best_player|man_of_the_match|player_of_the_match)[:\s]+"?([^"\n,]+)"?/i)?.[1]
  if (motm) stats.bestPlayer = motm.trim()

  return stats
}

// ── Win probability ───────────────────────────────────────────────────────────
export function formatWinProbability(
  ctx: string,
  home: string,
  away: string,
): BzzoiroExtractedPreview["winProbability"] | undefined {
  const h = ctx.match(/home[_\s]?win[_\s]?prob[:\s]+([0-9.]+)/i)?.[1]
  const d = ctx.match(/draw[_\s]?prob[:\s]+([0-9.]+)/i)?.[1]
  const a = ctx.match(/away[_\s]?win[_\s]?prob[:\s]+([0-9.]+)/i)?.[1]
  if (!h || !a) return undefined

  const hp = parseFloat(h), dp = d ? parseFloat(d) : 0, ap = parseFloat(a)
  let label: string
  if (hp > ap + 15)      label = `${home} diunggulkan (${hp}% peluang menang)`
  else if (ap > hp + 15) label = `${away} diunggulkan (${ap}% peluang menang)`
  else                   label = `Laga berimbang — ${home} ${hp}%, imbang ${dp}%, ${away} ${ap}%`

  return { home: hp, draw: dp, away: ap, label }
}

// ── H2H summary ───────────────────────────────────────────────────────────────
export function summarizeH2H(lines: string[], home: string, away: string): string {
  let hw = 0, aw = 0, d = 0
  for (const line of lines) {
    const m = line.match(/(\d+)\s*-\s*(\d+)/)
    if (!m) continue
    const hs = parseInt(m[1]), as = parseInt(m[2])
    if (hs > as) hw++; else if (as > hs) aw++; else d++
  }
  const total = hw + aw + d
  if (total === 0) return ""
  if (hw > aw) return `Dalam ${total} pertemuan terakhir, ${home} lebih dominan (${hw} menang, ${d} imbang, ${aw} kalah).`
  if (aw > hw) return `Dalam ${total} pertemuan terakhir, ${away} lebih dominan (${aw} menang, ${d} imbang, ${hw} kalah).`
  return `Dalam ${total} pertemuan terakhir, kedua tim berimbang (${hw} menang ${home}, ${aw} menang ${away}, ${d} imbang).`
}
