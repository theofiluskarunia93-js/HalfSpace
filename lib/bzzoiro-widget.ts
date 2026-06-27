// lib/bzzoiro-widget.ts
//
// Fungsi fetch Bzzoiro khusus untuk autofill widget shortcode.
// Berbeda dari lib/news-context/bzzoiro.ts yang menghasilkan contextText
// untuk pipeline artikel, file ini mengembalikan data terstruktur
// yang langsung bisa di-upsert ke tabel Supabase widget.
//
// Endpoint baru yang dipakai di sini (belum ada di bzzoiro.ts):
//   /api/managers/          → coach_name, formation, tactical fingerprint
//   /api/venues/            → nama stadion, kapasitas, kota, negara
//
// Endpoint yang sudah ada di bzzoiro.ts dan dipakai ulang:
//   /api/v2/events/         → jadwal, skor, status, venue, league
//   /api/v2/standings/      → klasemen per liga
//   /api/v2/events/{id}/stats/     → statistik pertandingan
//   /api/v2/events/{id}/incidents/ → timeline gol/kartu/substitusi
//   /api/v2/predictions/    → win prob, odds
//   /api/players/           → profil pemain
//   /api/player-stats/      → statistik per pertandingan pemain

const BASE = "https://sports.bzzoiro.com"

// ─── Fetch helper (server-side only — pakai BZZOIRO_API_KEY) ─────────────────

async function bzzGet(path: string) {
  const apiKey = process.env.BZZOIRO_API_KEY
  if (!apiKey) throw new Error("BZZOIRO_API_KEY tidak ditemukan di .env.local")

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Bzzoiro ${res.status} — ${path} — ${body.slice(0, 200)}`)
  }
  return res.json()
}

function fix(str: string | null | undefined): string {
  if (!str) return ""
  try { return decodeURIComponent(escape(str)) } catch { return str }
}

// Tabel translasi nama tim Indonesia → Inggris (sama seperti di bzzoiro.ts)
const ID_TO_EN: Record<string, string> = {
  jepang: "japan", swedia: "sweden", inggris: "england", prancis: "france",
  perancis: "france", spanyol: "spain", jerman: "germany", belanda: "netherlands",
  brasil: "brazil", "korea selatan": "south korea", "arab saudi": "saudi arabia",
  maroko: "morocco", kroasia: "croatia", polandia: "poland", swiss: "switzerland",
  belgia: "belgium", italia: "italy", mesir: "egypt", aljazair: "algeria",
  "kosta rika": "costa rica", meksiko: "mexico", kanada: "canada",
  "selandia baru": "new zealand", skotlandia: "scotland", yordania: "jordan",
  uruguay: "uruguay", paraguay: "paraguay", iran: "iran", qatar: "qatar",
  ghana: "ghana", nigeria: "nigeria", senegal: "senegal", tunisia: "tunisia",
  argentina: "argentina", portugal: "portugal", uzbekistan: "uzbekistan",
  denmark: "denmark", wales: "wales", panama: "panama",
}

function toEn(name: string): string {
  return ID_TO_EN[name.toLowerCase()] ?? name
}

// Ekstrak nama tim dari query "Tim A vs Tim B"
function parseVs(query: string): { teamA: string; teamB: string | null } {
  const cleaned = query.toLowerCase()
    .replace(/hasil pertandingan|preview pertandingan|pertandingan|vs\.?/gi, " vs ")
    .trim()
  const parts = cleaned.split(/\s+vs\s+/i)
  return {
    teamA: toEn((parts[0] ?? cleaned).trim()),
    teamB: parts[1] ? toEn(parts[1].trim()) : null,
  }
}

// Cari event di Bzzoiro berdasarkan query tim
async function findEventByTeam(
  teamQuery: string,
  opts: { upcoming?: boolean; daysBack?: number; daysAhead?: number } = {}
) {
  const today = new Date()
  const past = new Date(today.getTime() - (opts.daysBack ?? 5) * 86400_000)
  const future = new Date(today.getTime() + (opts.daysAhead ?? 8) * 86400_000)

  const dateFrom = opts.upcoming
    ? today.toISOString().split("T")[0]
    : past.toISOString().split("T")[0]
  const dateTo = opts.upcoming
    ? future.toISOString().split("T")[0]
    : today.toISOString().split("T")[0]

  const json = await bzzGet(
    `/api/v2/events/?date_from=${dateFrom}&date_to=${dateTo}&search=${encodeURIComponent(teamQuery)}&limit=20`
  )
  return (json.results ?? json.events ?? (Array.isArray(json) ? json : [])) as any[]
}

function eventHasTeams(e: any, names: string[]): boolean {
  const h = fix(e.home_team ?? "").toLowerCase()
  const a = fix(e.away_team ?? "").toLowerCase()
  if (!h && !a) return false
  return names.some(n => n && (h.includes(n) || a.includes(n) || n.includes(h) || n.includes(a)))
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WIDGET JADWAL PERTANDINGAN
// → /api/v2/events/  (search, date range)
// Kembalikan array MatchRow yang langsung bisa di-upsert ke widget_jadwal
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzJadwalMatch {
  group_label: string
  home_team: string
  away_team: string
  match_date: string | null
  match_time: string | null
  score_home: number | null
  score_away: number | null
  stadium: string | null
  status: "scheduled" | "live" | "finished"
}

export async function fetchBzzJadwal(query: string): Promise<BzzJadwalMatch[]> {
  const { teamA, teamB } = parseVs(query)
  const names = [teamA, teamB].filter(Boolean) as string[]

  // Ambil event 5 hari lalu s/d 14 hari ke depan
  const events = await findEventByTeam(teamA, { daysBack: 5, daysAhead: 14 })
  const relevant = teamB
    ? events.filter(e => eventHasTeams(e, names))
    : events.filter(e => eventHasTeams(e, [teamA]))

  const league = fix(relevant[0]?.league_name ?? relevant[0]?.league ?? "")

  return relevant.slice(0, 10).map(e => {
    const dt = e.event_date ?? e.date ?? null
    let match_date: string | null = null
    let match_time: string | null = null
    if (dt) {
      const d = new Date(dt)
      match_date = d.toISOString().split("T")[0]
      const hh = String(d.getUTCHours()).padStart(2, "0")
      const mm = String(d.getUTCMinutes()).padStart(2, "0")
      match_time = `${hh}:${mm}`
    }

    const rawStatus = (e.status ?? "").toLowerCase()
    const status: BzzJadwalMatch["status"] =
      rawStatus === "finished" ? "finished"
      : rawStatus === "live" ? "live"
      : "scheduled"

    return {
      group_label: league || "Pertandingan",
      home_team: fix(e.home_team ?? ""),
      away_team: fix(e.away_team ?? ""),
      match_date,
      match_time,
      score_home: status !== "scheduled" ? (e.home_score ?? null) : null,
      score_away: status !== "scheduled" ? (e.away_score ?? null) : null,
      stadium: fix(e.venue ?? e.stadium ?? null) || null,
      status,
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. WIDGET KLASEMEN
// → /api/v2/standings/?league=<id>
// Kembalikan array StandingRow siap upsert ke widget_klasemen
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzStandingRow {
  rank: number
  team_name: string
  group_label: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

export async function fetchBzzKlasemen(leagueQuery: string): Promise<BzzStandingRow[]> {
  // Coba cari league_id dari events dulu
  const events = await bzzGet(
    `/api/v2/events/?search=${encodeURIComponent(leagueQuery)}&limit=5`
  )
  const evList = events.results ?? (Array.isArray(events) ? events : [])
  const leagueId = evList[0]?.league_id ?? evList[0]?.league ?? null

  if (!leagueId) throw new Error(`Liga "${leagueQuery}" tidak ditemukan di Bzzoiro.`)

  const json = await bzzGet(`/api/v2/standings/?league=${leagueId}&limit=30`)
  const table: any[] = json.results ?? json.standings ?? (Array.isArray(json) ? json : [])

  const leagueName = fix(evList[0]?.league_name ?? leagueQuery)

  return table.map((row, i) => ({
    rank: row.position ?? row.rank ?? i + 1,
    team_name: fix(row.team_name ?? row.team ?? ""),
    group_label: leagueName,
    played: row.played ?? row.matches_played ?? 0,
    won: row.won ?? row.wins ?? 0,
    drawn: row.drawn ?? row.draws ?? 0,
    lost: row.lost ?? row.losses ?? 0,
    gf: row.goals_for ?? row.gf ?? 0,
    ga: row.goals_against ?? row.ga ?? 0,
    points: row.points ?? 0,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WIDGET STATISTIK PERTANDINGAN
// → /api/v2/events/ + /api/v2/events/{id}/stats/
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzStatistikData {
  home_team: string
  away_team: string
  home_flag: string
  away_flag: string
  competition: string
  home_score: number | null
  away_score: number | null
  possession_home: number
  stats: Array<{
    label: string
    home_value: number
    away_value: number
    is_percent: boolean
    direction: "higher_better" | "lower_better" | "neutral"
  }>
}

export async function fetchBzzStatistik(query: string): Promise<BzzStatistikData> {
  const { teamA, teamB } = parseVs(query)
  const names = [teamA, teamB].filter(Boolean) as string[]

  const events = await findEventByTeam(teamA, { daysBack: 7, daysAhead: 1 })
  const relevant = events.filter(e => eventHasTeams(e, names))
  const event = relevant.find(e => (e.status ?? "").toLowerCase() === "finished") ?? relevant[0]

  if (!event) throw new Error(`Pertandingan "${query}" tidak ditemukan di Bzzoiro.`)

  const stats = await bzzGet(`/api/v2/events/${event.id}/stats/`).catch(() => null)

  const home = fix(event.home_team ?? "")
  const away = fix(event.away_team ?? "")
  const competition = fix(event.league_name ?? event.league ?? "")

  // Helper: ambil nilai stat dari response (support berbagai shape key)
  function sv(obj: any, ...keys: string[]): number {
    for (const k of keys) {
      if (obj?.[k] != null && !isNaN(Number(obj[k]))) return Number(obj[k])
    }
    return 0
  }

  const possH = sv(stats, "possession_home", "home_possession", "possession")
  const possA = sv(stats, "possession_away", "away_possession")
  const possession_home = possH || (possA ? 100 - possA : 50)

  const statRows = stats ? [
    {
      label: "Penguasaan Bola",
      home_value: possession_home,
      away_value: 100 - possession_home,
      is_percent: true,
      direction: "neutral" as const,
    },
    {
      label: "Tembakan",
      home_value: sv(stats, "shots_home", "total_shots_home"),
      away_value: sv(stats, "shots_away", "total_shots_away"),
      is_percent: false,
      direction: "higher_better" as const,
    },
    {
      label: "Tembakan Tepat Sasaran",
      home_value: sv(stats, "shots_on_target_home", "on_target_home"),
      away_value: sv(stats, "shots_on_target_away", "on_target_away"),
      is_percent: false,
      direction: "higher_better" as const,
    },
    {
      label: "xG",
      home_value: sv(stats, "xg_home"),
      away_value: sv(stats, "xg_away"),
      is_percent: false,
      direction: "higher_better" as const,
    },
    {
      label: "Pelanggaran",
      home_value: sv(stats, "fouls_home"),
      away_value: sv(stats, "fouls_away"),
      is_percent: false,
      direction: "lower_better" as const,
    },
    {
      label: "Kartu Kuning",
      home_value: sv(stats, "yellow_cards_home"),
      away_value: sv(stats, "yellow_cards_away"),
      is_percent: false,
      direction: "lower_better" as const,
    },
    {
      label: "Sepak Pojok",
      home_value: sv(stats, "corners_home"),
      away_value: sv(stats, "corners_away"),
      is_percent: false,
      direction: "higher_better" as const,
    },
  ].filter(s => s.home_value !== 0 || s.away_value !== 0) : []

  return {
    home_team: home,
    away_team: away,
    home_flag: "",
    away_flag: "",
    competition,
    home_score: event.home_score ?? null,
    away_score: event.away_score ?? null,
    possession_home,
    stats: statRows,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WIDGET TIMELINE PERTANDINGAN
// → /api/v2/events/{id}/incidents/
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzTimelineData {
  home_team: string
  away_team: string
  home_flag: string
  away_flag: string
  home_abbr: string
  away_abbr: string
  home_score: number
  away_score: number
  status: "upcoming" | "live" | "finished"
  competition: string
  match_info: string
  events: Array<{
    minute: string
    type: "goal" | "yellow_card" | "red_card" | "substitution" | "var" | "penalty"
    team: "home" | "away"
    score_after: string
    player_name: string
    assist_name?: string
    sub_in_name?: string
    sub_out_name?: string
  }>
}

export async function fetchBzzTimeline(query: string): Promise<BzzTimelineData> {
  const { teamA, teamB } = parseVs(query)
  const names = [teamA, teamB].filter(Boolean) as string[]

  const events = await findEventByTeam(teamA, { daysBack: 7, daysAhead: 1 })
  const relevant = events.filter(e => eventHasTeams(e, names))
  const event = relevant.find(e => ["finished", "live"].includes((e.status ?? "").toLowerCase())) ?? relevant[0]

  if (!event) throw new Error(`Pertandingan "${query}" tidak ditemukan di Bzzoiro.`)

  const incidents = await bzzGet(`/api/v2/events/${event.id}/incidents/`).catch(() => null)
  const incList: any[] = incidents?.incidents ?? incidents?.results ?? (Array.isArray(incidents) ? incidents : [])

  const home = fix(event.home_team ?? "")
  const away = fix(event.away_team ?? "")
  const hs = event.home_score ?? 0
  const as_ = event.away_score ?? 0
  const competition = fix(event.league_name ?? event.league ?? "")
  const rawStatus = (event.status ?? "").toLowerCase()
  const status: BzzTimelineData["status"] =
    rawStatus === "finished" ? "finished" : rawStatus === "live" ? "live" : "upcoming"

  // Peta tipe insiden Bzzoiro → tipe widget
  function mapType(t: string): BzzTimelineData["events"][0]["type"] {
    t = t.toLowerCase()
    if (t.includes("goal") || t.includes("gol")) return "goal"
    if (t.includes("penalty") || t.includes("penalti")) return "penalty"
    if (t.includes("red") || t.includes("merah")) return "red_card"
    if (t.includes("yellow") || t.includes("kuning")) return "yellow_card"
    if (t.includes("sub") || t.includes("ganti")) return "substitution"
    if (t.includes("var")) return "var"
    return "goal"
  }

  // Lacak skor berjalan
  let runH = 0, runA = 0
  const timeline = incList
    .filter(inc => {
      const t = (inc.type ?? inc.incident_type ?? "").toLowerCase()
      return t.includes("goal") || t.includes("penalty") || t.includes("card")
        || t.includes("sub") || t.includes("var")
    })
    .sort((a, b) => (Number(a.minute ?? 0) - Number(b.minute ?? 0)))
    .map(inc => {
      const type = mapType(inc.type ?? inc.incident_type ?? "")
      const incHome = fix(inc.team_name ?? inc.team ?? "")
      const isHome = incHome.toLowerCase().includes(home.toLowerCase().split(" ")[0])
      const team: "home" | "away" = isHome ? "home" : "away"

      if (type === "goal" || type === "penalty") {
        if (isHome) { runH++ } else { runA++ }
      }

      return {
        minute: String(inc.minute ?? "?") + "'" ,
        type,
        team,
        score_after: `${runH}-${runA}`,
        player_name: fix(inc.player_name ?? inc.player ?? ""),
        assist_name: fix(inc.assist_name ?? inc.assist ?? "") || undefined,
        sub_in_name: type === "substitution" ? fix(inc.sub_in_name ?? inc.player_in ?? "") || undefined : undefined,
        sub_out_name: type === "substitution" ? fix(inc.sub_out_name ?? inc.player_out ?? inc.player_name ?? "") || undefined : undefined,
      }
    })

  const abbr = (name: string) => name.slice(0, 3).toUpperCase()

  return {
    home_team: home,
    away_team: away,
    home_flag: "",
    away_flag: "",
    home_abbr: abbr(home),
    away_abbr: abbr(away),
    home_score: hs,
    away_score: as_,
    status,
    competition,
    match_info: `${status === "finished" ? "Selesai" : status === "live" ? "LIVE" : "Akan Datang"} · ${competition}`,
    events: timeline,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WIDGET STARTING LINEUP
// → /api/v2/events/{id}/ — field predicted_lineup atau lineups
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzLineupData {
  competition: string
  home: {
    team_name: string
    flag: string
    formation: string
    players: Array<{
      number: number
      name: string
      position: string
      rating: number | null
    }>
  }
  away: {
    team_name: string
    flag: string
    formation: string
    players: Array<{
      number: number
      name: string
      position: string
      rating: number | null
    }>
  }
}

export async function fetchBzzStartingLineup(query: string): Promise<BzzLineupData> {
  const { teamA, teamB } = parseVs(query)
  const names = [teamA, teamB].filter(Boolean) as string[]

  // Cari event upcoming atau live (lineup lebih relevan)
  const events = await findEventByTeam(teamA, { daysBack: 2, daysAhead: 8 })
  const relevant = events.filter(e => eventHasTeams(e, names))
  const event = relevant[0]
  if (!event) throw new Error(`Pertandingan "${query}" tidak ditemukan di Bzzoiro.`)

  const eventDetail = await bzzGet(`/api/v2/events/${event.id}/`).catch(() => event)

  const home = fix(event.home_team ?? "")
  const away = fix(event.away_team ?? "")
  const competition = fix(event.league_name ?? event.league ?? "")

  // Support berbagai shape lineup dari Bzzoiro
  const rawLineups = eventDetail.lineups ?? eventDetail.predicted_lineup ?? eventDetail.lineup ?? null

  function buildTeam(rawTeam: any, teamName: string, formation: string) {
    const players: any[] = rawTeam?.players ?? rawTeam?.starting ?? rawTeam ?? []
    return {
      team_name: teamName,
      flag: "",
      formation,
      players: players.slice(0, 11).map((p: any, i: number) => ({
        number: p.number ?? p.jersey_number ?? p.shirt_number ?? i + 1,
        name: fix(p.name ?? p.player_name ?? `Pemain ${i + 1}`),
        position: p.position ?? p.pos ?? (i === 0 ? "GK" : "CM"),
        rating: p.rating != null ? Number(p.rating) : null,
      })),
    }
  }

  const homeFormation = eventDetail.home_formation ?? event.home_formation ?? "4-3-3"
  const awayFormation = eventDetail.away_formation ?? event.away_formation ?? "4-3-3"

  if (rawLineups) {
    const homeRaw = rawLineups.home ?? rawLineups[0] ?? null
    const awayRaw = rawLineups.away ?? rawLineups[1] ?? null
    return {
      competition,
      home: buildTeam(homeRaw, home, homeFormation),
      away: buildTeam(awayRaw, away, awayFormation),
    }
  }

  // Fallback: kembalikan template kosong dengan nama tim terisi
  return {
    competition,
    home: { team_name: home, flag: "", formation: homeFormation, players: [] },
    away: { team_name: away, flag: "", formation: awayFormation, players: [] },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. WIDGET PELUANG JUARA
// → /api/v2/predictions/ + /api/v2/standings/
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzPeluangRow {
  team_name: string
  rank: number
  win_pct: number
  pros: string[]
  cons: string[]
}

export async function fetchBzzPeluang(query: string): Promise<BzzPeluangRow[]> {
  const events = await findEventByTeam(query, { upcoming: true, daysAhead: 8 })
  if (!events.length) throw new Error(`Tidak ada event mendatang untuk "${query}".`)

  const event = events[0]
  const leagueId = event.league_id ?? event.league

  // Klasemen untuk semua tim
  const standings = leagueId
    ? await bzzGet(`/api/v2/standings/?league=${leagueId}&limit=25`).catch(() => null)
    : null
  const table: any[] = standings?.results ?? standings?.standings ?? (Array.isArray(standings) ? standings : [])

  // Predictions untuk event ini
  const preds = await bzzGet(`/api/v2/predictions/?event=${event.id}`).catch(() => null)
  const predList: any[] = preds?.results ?? (Array.isArray(preds) ? preds : preds ? [preds] : [])
  const pred = predList[0] ?? null

  const home = fix(event.home_team ?? "")
  const away = fix(event.away_team ?? "")

  const homeProb = pred?.home_win_prob ?? 50
  const awayProb = pred?.away_win_prob ?? 50

  function standingFor(teamName: string) {
    return table.find(r =>
      fix(r.team_name ?? r.team ?? "").toLowerCase().includes(teamName.toLowerCase().split(" ")[0])
    )
  }

  function buildRow(teamName: string, prob: number): BzzPeluangRow {
    const row = standingFor(teamName)
    const rank = row?.position ?? row?.rank ?? 1
    const pts = row?.points ?? 0
    const w = row?.won ?? row?.wins ?? 0
    const d = row?.drawn ?? row?.draws ?? 0
    const l = row?.lost ?? row?.losses ?? 0

    return {
      team_name: teamName,
      rank,
      win_pct: Math.round(prob),
      pros: [
        pts > 0 ? `${pts} poin dari ${(w + d + l)} pertandingan` : "Performa solid",
        w > 0 ? `${w} kemenangan musim ini` : "Skuad berpengalaman",
      ],
      cons: [
        l > 0 ? `${l} kekalahan musim ini` : "Konsistensi perlu dijaga",
        prob < 40 ? "Peluang menang lebih rendah" : "Tekanan favorit",
      ],
    }
  }

  return [buildRow(home, homeProb), buildRow(away, awayProb)]
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. WIDGET PERBANDINGAN TIM
// → /api/v2/events/ (H2H + form) + /api/v2/standings/ + /api/v2/predictions/
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzPerbandinganData {
  home_team: string
  away_team: string
  competition: string
  home_rank: string
  away_rank: string
  home_coach: string
  away_coach: string
  home_form: Array<{ result: "W" | "D" | "L" }>
  away_form: Array<{ result: "W" | "D" | "L" }>
  total_matches: number
  home_wins: number
  draws: number
  away_wins: number
}

export async function fetchBzzPerbandingan(query: string): Promise<BzzPerbandinganData> {
  const { teamA, teamB } = parseVs(query)
  if (!teamB) throw new Error("Query harus format 'Tim A vs Tim B'")

  const names = [teamA, teamB]

  const [events, homeFormRaw, awayFormRaw] = await Promise.all([
    findEventByTeam(teamA, { daysBack: 5, daysAhead: 8 }),
    bzzGet(`/api/v2/events/?search=${encodeURIComponent(teamA)}&limit=6&ordering=-event_date`).catch(() => null),
    bzzGet(`/api/v2/events/?search=${encodeURIComponent(teamB)}&limit=6&ordering=-event_date`).catch(() => null),
  ])

  const relevant = events.filter(e => eventHasTeams(e, names))
  const mainEvent = relevant[0] ?? events[0]
  const leagueId = mainEvent?.league_id ?? mainEvent?.league
  const competition = fix(mainEvent?.league_name ?? mainEvent?.league ?? "")

  // Standings
  const standings = leagueId
    ? await bzzGet(`/api/v2/standings/?league=${leagueId}&limit=25`).catch(() => null)
    : null
  const table: any[] = standings?.results ?? standings?.standings ?? (Array.isArray(standings) ? standings : [])

  function getStandRow(name: string) {
    return table.find(r =>
      fix(r.team_name ?? r.team ?? "").toLowerCase().includes(name.toLowerCase().split(" ")[0])
    )
  }

  const homeRow = getStandRow(teamA)
  const awayRow = getStandRow(teamB)

  // Form 5 laga
  function extractForm(data: any, name: string): Array<{ result: "W" | "D" | "L" }> {
    const evs = (data?.results ?? (Array.isArray(data) ? data : []))
      .filter((e: any) => (e.status ?? "").toLowerCase() === "finished")
      .slice(0, 5)
    return evs.map((e: any) => {
      const isHome = fix(e.home_team ?? "").toLowerCase().includes(name.toLowerCase().split(" ")[0])
      const hs = e.home_score ?? 0, as_ = e.away_score ?? 0
      const result: "W" | "D" | "L" = isHome
        ? (hs > as_ ? "W" : hs < as_ ? "L" : "D")
        : (as_ > hs ? "W" : as_ < hs ? "L" : "D")
      return { result }
    })
  }

  // H2H
  const h2hAll = (homeFormRaw?.results ?? (Array.isArray(homeFormRaw) ? homeFormRaw : []))
    .filter((e: any) => (e.status ?? "").toLowerCase() === "finished")
    .filter((e: any) => {
      const h = fix(e.home_team ?? "").toLowerCase()
      const a = fix(e.away_team ?? "").toLowerCase()
      return (h.includes(teamA.split(" ")[0]) || a.includes(teamA.split(" ")[0])) &&
             (h.includes(teamB.split(" ")[0]) || a.includes(teamB.split(" ")[0]))
    })
    .slice(0, 10)

  let homeWins = 0, awayWins = 0, draws = 0
  for (const e of h2hAll) {
    const hs = e.home_score ?? 0, as_ = e.away_score ?? 0
    if (hs > as_) homeWins++; else if (as_ > hs) awayWins++; else draws++
  }

  // Manager (coach) untuk kedua tim
  const [homeMgr, awayMgr] = await Promise.all([
    bzzGet(`/api/managers/?team_search=${encodeURIComponent(teamA)}&limit=1`).catch(() => null),
    bzzGet(`/api/managers/?team_search=${encodeURIComponent(teamB)}&limit=1`).catch(() => null),
  ])

  function coachName(mgr: any): string {
    const list = mgr?.results ?? (Array.isArray(mgr) ? mgr : [])
    return fix(list[0]?.name ?? list[0]?.manager_name ?? "")
  }

  return {
    home_team: fix(mainEvent?.home_team ?? teamA),
    away_team: fix(mainEvent?.away_team ?? teamB),
    competition,
    home_rank: `#${homeRow?.position ?? homeRow?.rank ?? "-"}`,
    away_rank: `#${awayRow?.position ?? awayRow?.rank ?? "-"}`,
    home_coach: coachName(homeMgr),
    away_coach: coachName(awayMgr),
    home_form: extractForm(homeFormRaw, teamA),
    away_form: extractForm(awayFormRaw, teamB),
    total_matches: h2hAll.length,
    home_wins: homeWins,
    draws,
    away_wins: awayWins,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. WIDGET TRANSFER
// → /api/players/ + /api/player-stats/
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzTransferRow {
  nama_pemain: string
  posisi: string
  usia: number | null
  asal_klub: string
  klub_tujuan: string
  transfer_value: number | null
  transfer_date: string | null
  is_free: boolean
}

export async function fetchBzzTransfer(playerQuery: string): Promise<BzzTransferRow> {
  const json = await bzzGet(`/api/players/?search=${encodeURIComponent(playerQuery)}&limit=5`)
  const players: any[] = json.results ?? (Array.isArray(json) ? json : [])
  const player = players[0]
  if (!player) throw new Error(`Pemain "${playerQuery}" tidak ditemukan di Bzzoiro.`)

  const mv = player.market_value ? Number(player.market_value) : null
  const mvM = mv ? parseFloat((mv / 1_000_000).toFixed(1)) : null

  return {
    nama_pemain: fix(player.player_name ?? player.name ?? playerQuery),
    posisi: fix(player.position ?? ""),
    usia: player.age ?? null,
    asal_klub: fix(player.team_name ?? player.team ?? ""),
    klub_tujuan: "",
    transfer_value: mvM,
    transfer_date: null,
    is_free: mv === 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. WIDGET PEMAIN ANDALAN
// → /api/players/ + /api/player-stats/
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzPemainAndalanData {
  nama_pemain: string
  nomor_punggung: number
  posisi: string
  usia: number
  tinggi_badan: number
  berat_badan: number
  kaki_dominan: string
  jumlah_pertandingan: number
  kontribusi_goal: number
  kontribusi_assist: number
  menit_bermain: number
  rating_performa: number
  kebangsaan: string
}

export async function fetchBzzPemainAndalan(playerQuery: string): Promise<BzzPemainAndalanData> {
  const json = await bzzGet(`/api/players/?search=${encodeURIComponent(playerQuery)}&limit=5`)
  const players: any[] = json.results ?? (Array.isArray(json) ? json : [])
  const player = players[0]
  if (!player) throw new Error(`Pemain "${playerQuery}" tidak ditemukan di Bzzoiro.`)

  const playerId = player.id
  let stats: any[] = []
  if (playerId) {
    const statsJson = await bzzGet(
      `/api/player-stats/?player=${playerId}&limit=20&ordering=-event__event_date`
    ).catch(() => null)
    stats = statsJson?.results ?? (Array.isArray(statsJson) ? statsJson : [])
  }

  const totalGoals = stats.reduce((s, r) => s + (r.goals ?? 0), 0)
  const totalAssists = stats.reduce((s, r) => s + (r.assists ?? 0), 0)
  const totalMinutes = stats.reduce((s, r) => s + (r.minutes_played ?? 0), 0)
  const matchCount = stats.filter(r => (r.minutes_played ?? 0) > 0).length

  const ratingsWithVal = stats.filter(r => r.rating != null)
  const avgRating = ratingsWithVal.length
    ? parseFloat((ratingsWithVal.reduce((s, r) => s + Number(r.rating), 0) / ratingsWithVal.length).toFixed(1))
    : 7.0

  return {
    nama_pemain: fix(player.player_name ?? player.name ?? playerQuery),
    nomor_punggung: player.jersey_number ?? player.shirt_number ?? 10,
    posisi: fix(player.position ?? ""),
    usia: player.age ?? 25,
    tinggi_badan: player.height ?? 175,
    berat_badan: player.weight ?? 70,
    kaki_dominan: player.preferred_foot === "left" ? "Kiri"
      : player.preferred_foot === "both" ? "Kedua"
      : "Kanan",
    jumlah_pertandingan: matchCount || stats.length,
    kontribusi_goal: totalGoals,
    kontribusi_assist: totalAssists,
    menit_bermain: totalMinutes,
    rating_performa: avgRating,
    kebangsaan: fix(player.nationality ?? ""),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. WIDGET DAFTAR PEMAIN
// → /api/players/?team=<team_id>
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzDaftarPemainRow {
  nomor_punggung: number
  nama_pemain: string
  usia: number
  asal_klub: string
  nilai_pasar: string
  posisi: string | null
}

export async function fetchBzzDaftarPemain(teamQuery: string): Promise<BzzDaftarPemainRow[]> {
  // Cari team_id dulu dari /api/teams/
  const teamsJson = await bzzGet(`/api/teams/?search=${encodeURIComponent(teamQuery)}&limit=5`)
  const teams: any[] = teamsJson.results ?? (Array.isArray(teamsJson) ? teamsJson : [])
  const team = teams[0]
  if (!team) throw new Error(`Tim "${teamQuery}" tidak ditemukan di Bzzoiro.`)

  const teamId = team.id
  const teamName = fix(team.name ?? team.team_name ?? teamQuery)

  const json = await bzzGet(`/api/players/?team=${teamId}&limit=50`)
  const players: any[] = json.results ?? (Array.isArray(json) ? json : [])

  function formatMV(mv: any): string {
    if (!mv || isNaN(Number(mv))) return "-"
    const m = Number(mv) / 1_000_000
    return m >= 1 ? `€${m.toFixed(1)}M` : `€${(Number(mv) / 1000).toFixed(0)}K`
  }

  return players.map(p => ({
    nomor_punggung: p.jersey_number ?? p.shirt_number ?? 0,
    nama_pemain: fix(p.player_name ?? p.name ?? ""),
    usia: p.age ?? 0,
    asal_klub: teamName,
    nilai_pasar: formatMV(p.market_value),
    posisi: fix(p.position ?? null) || null,
  })).sort((a, b) => a.nomor_punggung - b.nomor_punggung)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. WIDGET ANALISA TAKTIS
// → /api/managers/ (endpoint baru — tactical fingerprint)
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzAnalisaTaktisData {
  team_name: string
  coach_name: string
  formation: string
  play_style: string
  main_weapons: string[]
}

export async function fetchBzzAnalisaTaktis(query: string): Promise<BzzAnalisaTaktisData> {
  // Coba cari manager by nama pelatih atau nama tim
  const [byName, byTeam] = await Promise.all([
    bzzGet(`/api/managers/?search=${encodeURIComponent(query)}&limit=5`).catch(() => null),
    bzzGet(`/api/managers/?team_search=${encodeURIComponent(query)}&limit=5`).catch(() => null),
  ])

  const listName: any[] = byName?.results ?? (Array.isArray(byName) ? byName : [])
  const listTeam: any[] = byTeam?.results ?? (Array.isArray(byTeam) ? byTeam : [])
  const manager = listName[0] ?? listTeam[0]

  if (!manager) {
    // Fallback: cari via events untuk dapatkan team_name
    const events = await findEventByTeam(query, { daysBack: 7, daysAhead: 7 })
    const event = events[0]
    if (!event) throw new Error(`Manager/tim "${query}" tidak ditemukan di Bzzoiro.`)

    const home = fix(event.home_team ?? "")
    return {
      team_name: home,
      coach_name: "",
      formation: event.home_formation ?? "4-3-3",
      play_style: "",
      main_weapons: [],
    }
  }

  const coachName = fix(manager.name ?? manager.manager_name ?? "")
  const teamName = fix(manager.team_name ?? manager.team ?? "")

  // Bzzoiro /api/managers/ menyimpan tactical_profile / preferred_formation
  const formation = manager.preferred_formation ?? manager.formation ?? manager.tactical_formation ?? "4-3-3"
  const playStyle = fix(
    manager.tactical_style ?? manager.play_style ?? manager.description ?? ""
  )

  // Main weapons: dari pressing_style, attacking_style, key_attributes jika ada
  const weapons: string[] = []
  if (manager.pressing_style) weapons.push(fix(manager.pressing_style))
  if (manager.attacking_style) weapons.push(fix(manager.attacking_style))
  if (manager.key_attributes) {
    const attrs = Array.isArray(manager.key_attributes) ? manager.key_attributes : [manager.key_attributes]
    attrs.forEach((a: any) => weapons.push(fix(String(a))))
  }
  // Fallback generic jika tidak ada data taktis detail
  if (weapons.length === 0 && formation) {
    if (formation.startsWith("4-3")) weapons.push("Kontrol tengah lapangan")
    if (formation.startsWith("4-4")) weapons.push("Transisi cepat")
    if (formation.startsWith("3-5") || formation.startsWith("5-3")) weapons.push("Serangan sayap")
    if (formation.startsWith("4-2-3")) weapons.push("Kreativitas lini kedua")
  }

  return {
    team_name: teamName,
    coach_name: coachName,
    formation: String(formation),
    play_style: playStyle,
    main_weapons: weapons.filter(Boolean).slice(0, 5),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. WIDGET PROFIL STADION
// → /api/venues/ (endpoint baru)
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzProfilStadionData {
  nama_stadion: string
  kota: string
  negara: string | null
  kapasitas: number
  jenis_rumput: string
  jenis_atap: string
  tahun_berdiri: number | null
}

export async function fetchBzzProfilStadion(query: string): Promise<BzzProfilStadionData> {
  const json = await bzzGet(`/api/venues/?search=${encodeURIComponent(query)}&limit=5`)
  const venues: any[] = json.results ?? (Array.isArray(json) ? json : [])
  const venue = venues[0]

  if (!venue) throw new Error(`Stadion "${query}" tidak ditemukan di Bzzoiro.`)

  return {
    nama_stadion: fix(venue.name ?? venue.venue_name ?? query),
    kota: fix(venue.city ?? venue.location ?? ""),
    negara: fix(venue.country ?? null) || null,
    kapasitas: Number(venue.capacity ?? venue.capacity_max ?? 0),
    jenis_rumput: fix(venue.surface ?? venue.pitch_type ?? "Natural"),
    jenis_atap: fix(venue.roof ?? venue.roof_type ?? "Terbuka"),
    tahun_berdiri: venue.year_built ?? venue.built_year ?? null,
  }
}
