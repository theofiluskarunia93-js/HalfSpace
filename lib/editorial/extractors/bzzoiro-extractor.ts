// lib/editorial/extractors/bzzoiro-extractor.ts — v3
//
// PERUBAHAN DARI v2 (disesuaikan dengan PDF Data Mapping HalfSpace):
// + BzzoiroPredictedLineup: predicted_lineup + average_positions per tipe Preview & Cedera
// + BzzoiroOddsComparison: /events/{id}/odds/comparison/ — 14 bookmaker (Preview)
// + BzzoiroShotmapEntry: per-shot xG + koordinat (x,y) (Hasil & Trivia)
// + BzzoiroAiPreview: ai_preview (draft dari Haiku 4.5, referensi awal Preview)
// + BzzoiroExtractedCedera: interface terpisah untuk cedera (predicted_lineup, odds impact, upcoming)
// + BzzoiroExtractedTrivia: interface terpisah untuk trivia (shotmap, 66 liga, momentum historis)
// + extractPredictedLineup(), extractOddsComparison(), extractShotmap(),
//   extractAiPreview(), extractUpcomingEvents(), extractTriviaFacts()
// + BzzoiroExtractedPreview: tambah predictedLineup, oddsComparison, averagePositions, aiPreview

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
  // NEWv3: data tambahan per PDF Data Mapping
  predictedLineup?: BzzoiroPredictedLineup        // predicted_lineup (11 + subs)
  averagePositions?: BzzoiroAveragePositions       // posisi rata-rata pemain
  oddsComparison?: BzzoiroOddsComparison           // /events/{id}/odds/comparison/ 14 bookmaker
  aiPreview?: BzzoiroAiPreview                     // ai_preview dari Haiku 4.5 (referensi awal)
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

// ── Predicted Lineup — predicted_lineup dari Bzzoiro ─────────────────────────
// Dipakai di: Preview (as starting XI) + Cedera (proyeksi tanpa pemain cedera)
export interface BzzoiroPredictedLineup {
  home?: {
    formation: string
    startingXI: string[]   // 11 nama pemain
    subs: string[]         // pemain pengganti
  }
  away?: {
    formation: string
    startingXI: string[]
    subs: string[]
  }
  // Untuk Cedera: lineup tim yang kehilangan pemain cedera
  withoutPlayer?: {
    team: string
    projectedFormation: string
    likelyReplacements: string[]  // kandidat pengganti pemain cedera
  }
}

// ── Average Positions — posisi rata-rata pemain di lapangan ─────────────────
export interface BzzoiroAveragePositions {
  home?: Array<{ player: string; x: number; y: number }>
  away?: Array<{ player: string; x: number; y: number }>
}

// ── Odds Comparison — /events/{id}/odds/comparison/ (14 bookmaker) ───────────
export interface BzzoiroOddsComparison {
  bestHomeOdds?: number
  bestDrawOdds?: number
  bestAwayOdds?: number
  bookmakerCount: number
  impliedWinProbHome?: number  // dari rata-rata odds bookmaker, bukan ML
  impliedWinProbDraw?: number
  impliedWinProbAway?: number
  polymarketOdds?: { home: number; draw: number; away: number }
  summary: string  // deskripsi teks dari odds (siapa yang diunggulkan pasar)
}

// ── Per-Shot xG + Koordinat — dipakai di Hasil (xG paradox) & Trivia ────────
export interface BzzoiroShotmapEntry {
  minute: number
  team: string           // "home" | "away"
  player: string
  xg: number            // xG per shot (0.00–1.00)
  x: number             // koordinat posisi (0–100)
  y: number
  outcome: "goal" | "saved" | "blocked" | "missed"
}

// ── AI Preview — draft dari Haiku 4.5, sebagai referensi awal saja ───────────
export interface BzzoiroAiPreview {
  rawText: string        // teks mentah draft — HANYA sebagai referensi, bukan fakta
  wordCount: number
}

// ── Cedera: interface terpisah (lebih kaya dari BzzoiroExtractedPlayer) ──────
// PDF: player stats sebelum cedera + predicted_lineup (siapa pengganti) +
//      odds impact (pergeseran odds akibat absensi) + upcoming events (laga terdampak)
export interface BzzoiroExtractedCedera {
  player: BzzoiroExtractedPlayer
  predictedLineupWithout: BzzoiroPredictedLineup["withoutPlayer"]
  oddsImpact?: string  // deskripsi pergeseran odds: "peluang menang tim turun X%"
  upcomingMatches: Array<{
    opponent: string
    competition: string
    date: string
  }>
}

// ── Trivia: interface terpisah — memanfaatkan database besar Bzzoiro ─────────
// PDF: 62k+ pemain, 139k+ stats records, shotmap 15.5k pertandingan,
//      momentum historis, head-to-head 66 liga x 68k+ match
export interface BzzoiroExtractedTrivia {
  // Fakta shotmap xG unik — contoh: "peluang 0.94 xG terbuang menit ke-89"
  topShotmapFacts: Array<{
    description: string  // kalimat siap pakai, mis. "Peluang 0.94 xG yang terbuang menit ke-89"
    xg: number
    minute: number
    player: string
    outcome: string
  }>
  // Fakta statistik historis dari database 139k+ records
  historicalStatFacts: string[]
  // Head-to-head lintas musim (66 liga x 68k+ match)
  h2hCrossSeasonSummary?: string
  // Momentum historis — grafik tekanan pertandingan memorable
  historicMomentumNote?: string
  // Fakta dari manualContext (admin input)
  manualFacts: string[]
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

// ── Predicted Lineup extractor ────────────────────────────────────────────────
// Parsing format Bzzoiro:
//   PREDICTED LINEUP — HOME:
//   Formation: 4-3-3
//   XI: Pemain1, Pemain2, ...
//   Subs: PemainA, PemainB, ...
export function extractPredictedLineup(
  bzzoiroText: string,
  home: string,
  away: string,
): BzzoiroPredictedLineup {
  const result: BzzoiroPredictedLineup = {}

  const homeSection = bzzoiroText.match(
    /PREDICTED LINEUP[^:]*—[^:]*HOME[^:]*:\s*\n([\s\S]+?)(?=\nPREDICTED LINEUP[^:]*—[^:]*AWAY|\nAVERAGE|\nH2H|\nFORM|\nWIN|$)/i
  )?.[1] ?? ""

  const awaySection = bzzoiroText.match(
    /PREDICTED LINEUP[^:]*—[^:]*AWAY[^:]*:\s*\n([\s\S]+?)(?=\nAVERAGE|\nH2H|\nFORM|\nWIN|\n\n|$)/i
  )?.[1] ?? ""

  const parseSection = (text: string) => {
    if (!text.trim()) return undefined
    const formation = text.match(/Formation[:\s]+([0-9-]+)/i)?.[1]?.trim() ?? ""
    const xiRaw = text.match(/XI[:\s]+(.+)/i)?.[1] ?? ""
    const subsRaw = text.match(/Subs[:\s]+(.+)/i)?.[1] ?? ""
    return {
      formation,
      startingXI: xiRaw.split(",").map((s) => s.trim()).filter(Boolean),
      subs: subsRaw.split(",").map((s) => s.trim()).filter(Boolean),
    }
  }

  const h = parseSection(homeSection)
  const a = parseSection(awaySection)
  if (h) result.home = h
  if (a) result.away = a

  // Proyeksi "without player" untuk konteks cedera — diisi oleh extractCederaContext
  return result
}

// ── Average Positions extractor ───────────────────────────────────────────────
// Format Bzzoiro:
//   AVERAGE POSITIONS — HOME:
//   PemainA: x=45.2, y=30.1
export function extractAveragePositions(bzzoiroText: string): BzzoiroAveragePositions {
  const result: BzzoiroAveragePositions = {}

  const parsePos = (section: string) => {
    const entries: Array<{ player: string; x: number; y: number }> = []
    for (const line of section.split("\n")) {
      const m = line.match(/([A-Za-z\s]+):\s*x\s*=\s*([0-9.]+)\s*,\s*y\s*=\s*([0-9.]+)/i)
      if (m) entries.push({ player: m[1].trim(), x: parseFloat(m[2]), y: parseFloat(m[3]) })
    }
    return entries.length > 0 ? entries : undefined
  }

  const homeSection = bzzoiroText.match(/AVERAGE POSITIONS[^:]*HOME[^:]*:\s*\n([\s\S]+?)(?=\nAVERAGE POSITIONS[^:]*AWAY|\nH2H|\nFORM|\n\n|$)/i)?.[1] ?? ""
  const awaySection = bzzoiroText.match(/AVERAGE POSITIONS[^:]*AWAY[^:]*:\s*\n([\s\S]+?)(?=\nH2H|\nFORM|\nWIN|\n\n|$)/i)?.[1] ?? ""

  const h = parsePos(homeSection)
  const a = parsePos(awaySection)
  if (h) result.home = h
  if (a) result.away = a

  return result
}

// ── Odds Comparison extractor — /events/{id}/odds/comparison/ (14 bookmaker) ─
// Format Bzzoiro:
//   ODDS COMPARISON (14 bookmakers):
//   Best Home: 2.10 | Best Draw: 3.40 | Best Away: 3.80
//   Implied Prob — Home: 47.6% | Draw: 29.4% | Away: 26.3%
//   Polymarket: Home 0.52 | Draw 0.22 | Away 0.26
export function extractOddsComparison(
  bzzoiroText: string,
  home: string,
  away: string,
): BzzoiroOddsComparison | undefined {
  const section = bzzoiroText.match(/ODDS COMPARISON[^:]*:\s*\n([\s\S]+?)(?=\n\n|\nFORM|\nH2H|\nPREDICTED|$)/i)?.[1]
  if (!section) return undefined

  const bestHome  = section.match(/Best Home[:\s]+([0-9.]+)/i)?.[1]
  const bestDraw  = section.match(/Best Draw[:\s]+([0-9.]+)/i)?.[1]
  const bestAway  = section.match(/Best Away[:\s]+([0-9.]+)/i)?.[1]
  const implHome  = section.match(/Implied[^H]*Home[:\s]+([0-9.]+)%/i)?.[1]
  const implDraw  = section.match(/Implied[^H]*Draw[:\s]+([0-9.]+)%/i)?.[1]
  const implAway  = section.match(/Implied[^H]*Away[:\s]+([0-9.]+)%/i)?.[1]
  const polyH     = section.match(/Polymarket[^H]*Home[:\s]+([0-9.]+)/i)?.[1]
  const polyD     = section.match(/Polymarket[^H]*Draw[:\s]+([0-9.]+)/i)?.[1]
  const polyA     = section.match(/Polymarket[^H]*Away[:\s]+([0-9.]+)/i)?.[1]

  const countMatch = bzzoiroText.match(/(\d+)\s*bookmaker/i)?.[1]
  const bookmakerCount = countMatch ? parseInt(countMatch) : 14

  const hp = implHome ? parseFloat(implHome) : undefined
  const dp = implDraw ? parseFloat(implDraw) : undefined
  const ap = implAway ? parseFloat(implAway) : undefined

  let summary = ""
  if (hp && ap) {
    if (hp > ap + 15)      summary = `Pasar taruhan menyebut ${home} sebagai favorit (${hp}% implied prob). Best odds: ${bestHome ?? "?"}`
    else if (ap > hp + 15) summary = `Pasar taruhan menyebut ${away} sebagai favorit (${ap}% implied prob). Best odds: ${bestAway ?? "?"}`
    else                   summary = `Pasar taruhan melihat laga berimbang — ${home} ${hp}%, imbang ${dp ?? "?"}%, ${away} ${ap}%`
  }

  return {
    bestHomeOdds:      bestHome ? parseFloat(bestHome) : undefined,
    bestDrawOdds:      bestDraw ? parseFloat(bestDraw) : undefined,
    bestAwayOdds:      bestAway ? parseFloat(bestAway) : undefined,
    bookmakerCount,
    impliedWinProbHome: hp,
    impliedWinProbDraw: dp,
    impliedWinProbAway: ap,
    polymarketOdds: polyH && polyD && polyA
      ? { home: parseFloat(polyH), draw: parseFloat(polyD), away: parseFloat(polyA) }
      : undefined,
    summary,
  }
}

// ── Per-Shot xG + Koordinat extractor ────────────────────────────────────────
// Format Bzzoiro (per baris):
//   SHOT: minute=23, team=home, player=Pemain X, xg=0.34, x=78.2, y=45.1, outcome=saved
export function extractShotmap(bzzoiroText: string): BzzoiroShotmapEntry[] {
  const entries: BzzoiroShotmapEntry[] = []
  const lines = bzzoiroText.split("\n").filter((l) => l.trim().startsWith("SHOT:"))

  for (const line of lines) {
    const minute  = line.match(/minute\s*=\s*(\d+)/i)?.[1]
    const team    = line.match(/team\s*=\s*(\w+)/i)?.[1]
    const player  = line.match(/player\s*=\s*([^,\n]+)/i)?.[1]?.trim()
    const xg      = line.match(/xg\s*=\s*([0-9.]+)/i)?.[1]
    const x       = line.match(/x\s*=\s*([0-9.]+)/i)?.[1]
    const y       = line.match(/y\s*=\s*([0-9.]+)/i)?.[1]
    const outcome = line.match(/outcome\s*=\s*(\w+)/i)?.[1]

    if (!minute || !team || !player || !xg || !x || !y || !outcome) continue

    entries.push({
      minute:  parseInt(minute),
      team:    team.toLowerCase(),
      player,
      xg:      parseFloat(xg),
      x:       parseFloat(x),
      y:       parseFloat(y),
      outcome: outcome as BzzoiroShotmapEntry["outcome"],
    })
  }

  return entries
}

// ── Trivia facts extractor dari shotmap + historical stats ────────────────────
// Menghasilkan kalimat siap pakai dari data shotmap — "peluang 0.94 xG terbuang menit ke-89"
export function extractTriviaFacts(
  bzzoiroText: string,
  manualFacts: string[],
): BzzoiroExtractedTrivia {
  const shotmap = extractShotmap(bzzoiroText)

  // Ambil shots dengan xG tertinggi yang TIDAK jadi gol — paling dramatis untuk trivia
  const highXgMissed = [...shotmap]
    .filter((s) => s.outcome !== "goal")
    .sort((a, b) => b.xg - a.xg)
    .slice(0, 5)
    .map((s) => ({
      description: `Peluang ${s.xg.toFixed(2)} xG yang ${s.outcome === "saved" ? "digagalkan kiper" : s.outcome === "blocked" ? "diblok" : "meleset"} — menit ke-${s.minute} (${s.player})`,
      xg: s.xg,
      minute: s.minute,
      player: s.player,
      outcome: s.outcome,
    }))

  // Statistik historis dari teks Bzzoiro (format: "STAT: ...")
  const historicalStatFacts = bzzoiroText
    .split("\n")
    .filter((l) => l.trim().startsWith("STAT:"))
    .map((l) => l.replace(/^STAT:\s*/i, "").trim())
    .filter((l) => l.length > 10)
    .slice(0, 10)

  // H2H lintas musim
  const h2hCrossSeasonSummary = bzzoiroText.match(/H2H LINTAS MUSIM[^:]*:\s*(.+)/i)?.[1]?.trim()

  // Catatan momentum historis
  const historicMomentumNote = bzzoiroText.match(/MOMENTUM HISTORIS[^:]*:\s*(.+)/i)?.[1]?.trim()

  return {
    topShotmapFacts: highXgMissed,
    historicalStatFacts,
    h2hCrossSeasonSummary,
    historicMomentumNote,
    manualFacts,
  }
}

// ── AI Preview extractor — draft dari Haiku 4.5 (referensi awal saja) ────────
// Dipakai di brief-builder untuk memperkaya leadExample di Preview,
// BUKAN sebagai fakta — hanya "referensi awal" per PDF.
export function extractAiPreview(bzzoiroText: string): BzzoiroAiPreview | undefined {
  const section = bzzoiroText.match(/AI PREVIEW[^:]*:\s*\n([\s\S]+?)(?=\n\nPREDICTED|\n\nH2H|\n\nFORM|\n\n\n|$)/i)?.[1]?.trim()
  if (!section || section.length < 20) return undefined
  return {
    rawText: section,
    wordCount: section.split(/\s+/).filter(Boolean).length,
  }
}

// ── Upcoming Events extractor — laga terdampak (Cedera) ──────────────────────
// Format Bzzoiro:
//   UPCOMING: Manchester City vs Arsenal | Premier League | 2026-07-05
export function extractUpcomingMatches(bzzoiroText: string): BzzoiroExtractedCedera["upcomingMatches"] {
  const matches: BzzoiroExtractedCedera["upcomingMatches"] = []
  for (const line of bzzoiroText.split("\n")) {
    if (!line.trim().startsWith("UPCOMING:")) continue
    const parts = line.replace(/^UPCOMING:\s*/i, "").split("|").map((p) => p.trim())
    if (parts.length >= 2) {
      matches.push({
        opponent:    parts[0] ?? "",
        competition: parts[1] ?? "",
        date:        parts[2] ?? "",
      })
    }
  }
  return matches
}
