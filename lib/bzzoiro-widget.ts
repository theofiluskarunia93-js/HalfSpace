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

function ageFromDOB(dob: string): number {
  const d = new Date(dob)
  if (isNaN(d.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--
  return age
}

// PENTING: pencarian nama pemain dengan aksen (mis. "Mbappe" vs "Mbappé") bisa
// gagal total kalau API tidak melakukan normalisasi aksen di sisi server.
// Helper ini bikin variasi tanpa-aksen untuk dicoba sebagai fallback pencarian.
function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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

// PENTING: dokumentasi resmi Bzzoiro cuma menyebut filter `?team_id=` (numerik)
// untuk /api/managers/ — TIDAK ADA filter `team_search=` (free-text nama tim).
// Memanggil `?team_search=...` langsung kemungkinan besar diabaikan server
// (param tak dikenal) dan mengembalikan manager pertama di seluruh database,
// BUKAN manager tim yang dicari — bug ini ada di fetchBzzAnalisaTaktis &
// fetchBzzPerbandingan sebelumnya. Fix: resolve team_id dulu lewat
// /api/teams/?search=, baru query /api/managers/?team_id={id}.
async function findManagerByTeamName(teamQuery: string): Promise<any | null> {
  const teamsJson = await bzzGet(`/api/teams/?search=${encodeURIComponent(teamQuery)}&limit=5`).catch(() => null)
  const teams: any[] = teamsJson?.results ?? (Array.isArray(teamsJson) ? teamsJson : [])
  const team = teams[0]
  if (!team?.id) return null

  const mgrJson = await bzzGet(`/api/managers/?team_id=${team.id}&limit=1`).catch(() => null)
  const list: any[] = mgrJson?.results ?? (Array.isArray(mgrJson) ? mgrJson : [])
  return list[0] ?? null
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

  // PENTING: tanpa cek ini, query yang tidak ketemu match sama sekali akan
  // "berhasil" mengembalikan array kosong — form jadwal terlihat tersimpan
  // padahal tabelnya kosong, tanpa keterangan apapun ke user.
  if (relevant.length === 0) {
    throw new Error(
      `Tidak ada pertandingan "${query}" yang ditemukan di Bzzoiro dalam rentang 5 hari lalu s/d 14 hari ke depan. ` +
      `Coba periksa nama tim, atau pertandingannya mungkin di luar rentang tanggal itu.`
    )
  }

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

// PENTING: path asli Bzzoiro adalah /leagues/{id}/standings/ (nested resource),
// BUKAN /standings/?league={id}. Kompetisi grup (Piala Dunia dkk) juga
// mengembalikan bentuk { grouped: true, groups: {A:[...], B:[...]} } bukan
// array `standings` rata seperti liga biasa — helper ini menangani keduanya.
async function fetchStandingsTable(leagueId: number | string, hint?: string): Promise<any[]> {
  const json = await bzzGet(`/api/v2/leagues/${leagueId}/standings/`)
  if (json?.grouped && json?.groups && typeof json.groups === "object") {
    const groupMatch = hint?.match(/\bgr(?:o|u)up?\s*([a-h])\b/i)
    const requestedGroup = groupMatch?.[1]?.toUpperCase()
    if (requestedGroup && Array.isArray(json.groups[requestedGroup])) {
      return json.groups[requestedGroup].map((r: any) => ({ ...r, __group: requestedGroup }))
    }
    return Object.entries(json.groups).flatMap(([letter, rows]: [string, any]) =>
      Array.isArray(rows) ? rows.map((r: any) => ({ ...r, __group: letter })) : []
    )
  }
  return json.results ?? json.standings ?? (Array.isArray(json) ? json : [])
}

export async function fetchBzzKlasemen(leagueQuery: string): Promise<BzzStandingRow[]> {
  // Coba cari league_id dari events dulu
  const events = await bzzGet(
    `/api/v2/events/?search=${encodeURIComponent(leagueQuery)}&limit=5`
  )
  const evList = events.results ?? (Array.isArray(events) ? events : [])
  const leagueId = evList[0]?.league_id ?? evList[0]?.league ?? null

  if (!leagueId) throw new Error(`Liga "${leagueQuery}" tidak ditemukan di Bzzoiro.`)

  // PENTING: path asli Bzzoiro adalah /leagues/{id}/standings/ (nested resource),
  // BUKAN /standings/?league={id} — itu sebabnya selalu 404 sebelumnya.
  const table: any[] = await fetchStandingsTable(leagueId, leagueQuery)

  // PENTING: liganya ketemu (leagueId valid), tapi kalau tabel standings-nya
  // sendiri kosong (misal kompetisi belum mulai/data belum diisi Bzzoiro),
  // tanpa cek ini form klasemen "berhasil" tersimpan dengan 0 baris.
  if (table.length === 0) {
    throw new Error(
      `Liga "${leagueQuery}" ditemukan, tapi tabel klasemennya masih kosong di Bzzoiro ` +
      `(kompetisi mungkin belum dimulai). Coba lagi setelah pertandingan pertama dimainkan.`
    )
  }

  const leagueName = fix(evList[0]?.league_name ?? leagueQuery)

  return table.map((row, i) => ({
    rank: row.position ?? row.rank ?? i + 1,
    team_name: fix(row.team_name ?? row.team ?? ""),
    group_label: row.__group ? `Grup ${row.__group}` : leagueName,
    played: row.played ?? row.matches_played ?? 0,
    won: row.won ?? row.wins ?? 0,
    drawn: row.drawn ?? row.draws ?? 0,
    lost: row.lost ?? row.losses ?? 0,
    gf: row.goals_for ?? row.gf ?? 0,
    ga: row.goals_against ?? row.ga ?? 0,
    // PENTING: field standings asli Bzzoiro adalah `pts`, bukan `points`
    // (kode lama selalu baca 0 dari sini).
    points: row.pts ?? row.points ?? 0,
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

  const statsResp = await bzzGet(`/api/v2/events/${event.id}/stats/`).catch(() => null)
  // PENTING: field asli Bzzoiro nested per sisi — { stats: { home: {...}, away: {...} } } —
  // BUKAN flat seperti shots_home/shots_away yang dicari kode lama. Itu sebabnya
  // semua stat selain possession selalu 0 dan ikut tersaring (cuma possession
  // muncul di screenshot, karena dihitung dengan cara berbeda sebagai fallback).
  const homeStats: any = statsResp?.stats?.home ?? {}
  const awayStats: any = statsResp?.stats?.away ?? {}

  const home = fix(event.home_team ?? "")
  const away = fix(event.away_team ?? "")
  const competition = fix(event.league_name ?? event.league ?? "")

  // Helper: ambil nilai stat dari objek per-sisi, support 3 bentuk asli Bzzoiro:
  // angka polos (mis. total_shots: 11), objek {value,total,pct} (mis. crosses),
  // dan objek {actual} (mis. xg: {actual: 1.23}).
  function sv(obj: any, ...keys: string[]): number {
    for (const k of keys) {
      const v = obj?.[k]
      if (v == null) continue
      if (typeof v === "object") {
        if (v.value != null && !isNaN(Number(v.value))) return Number(v.value)
        if (v.actual != null && !isNaN(Number(v.actual))) return Number(v.actual)
        continue
      }
      if (!isNaN(Number(v))) return Number(v)
    }
    return 0
  }

  const possH = sv(homeStats, "ball_possession", "possession")
  const possA = sv(awayStats, "ball_possession", "possession")
  const possession_home = possH || (possA ? 100 - possA : 50)

  const statRows = statsResp ? [
    {
      label: "Penguasaan Bola",
      home_value: possession_home,
      away_value: 100 - possession_home,
      is_percent: true,
      direction: "neutral" as const,
    },
    {
      label: "Tembakan",
      home_value: sv(homeStats, "total_shots", "shots"),
      away_value: sv(awayStats, "total_shots", "shots"),
      is_percent: false,
      direction: "higher_better" as const,
    },
    {
      label: "Tembakan Tepat Sasaran",
      home_value: sv(homeStats, "shots_on_target", "on_target"),
      away_value: sv(awayStats, "shots_on_target", "on_target"),
      is_percent: false,
      direction: "higher_better" as const,
    },
    {
      label: "xG",
      home_value: sv(homeStats, "xg"),
      away_value: sv(awayStats, "xg"),
      is_percent: false,
      direction: "higher_better" as const,
    },
    {
      label: "Pelanggaran",
      home_value: sv(homeStats, "fouls"),
      away_value: sv(awayStats, "fouls"),
      is_percent: false,
      direction: "lower_better" as const,
    },
    {
      label: "Kartu Kuning",
      home_value: sv(homeStats, "yellow_cards"),
      away_value: sv(awayStats, "yellow_cards"),
      is_percent: false,
      direction: "lower_better" as const,
    },
    {
      label: "Sepak Pojok",
      home_value: sv(homeStats, "corner_kicks", "corners"),
      away_value: sv(awayStats, "corner_kicks", "corners"),
      is_percent: false,
      direction: "higher_better" as const,
    },
  ].filter(s => s.home_value !== 0 || s.away_value !== 0) : []

  // PENTING: tim/skor sudah ketemu, tapi kalau statRows kosong (endpoint stats
  // gagal, ATAU sesuai docs Bzzoiro: data statistik spasial cuma terisi untuk
  // match yang sudah live/selesai, null untuk yang belum mulai), tanpa cek ini
  // form statistik "berhasil" tersimpan tapi seluruh tabel statistiknya kosong.
  if (statRows.length === 0) {
    const rawStatus = (event.status ?? "").toLowerCase()
    const reason = rawStatus === "scheduled" || !rawStatus
      ? "pertandingan belum dimulai — Bzzoiro baru mengisi statistik untuk match yang live/sudah selesai"
      : "endpoint statistik Bzzoiro tidak mengembalikan data untuk pertandingan ini"
    throw new Error(`Statistik untuk "${query}" masih kosong (${reason}). Coba fetch ulang setelah kickoff.`)
  }

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
    player_photo?: string
    assist_name?: string
    sub_in_name?: string
    sub_in_photo?: string
    sub_out_name?: string
    sub_out_photo?: string
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
  function mapType(t: string): BzzTimelineData["events"][0]["type"] | null {
    t = t.toLowerCase()
    if (t.includes("goal") || t.includes("gol")) return "goal"
    if (t.includes("penalty") || t.includes("penalti")) return "penalty"
    if (t.includes("red") || t.includes("merah")) return "red_card"
    if (t.includes("yellow") || t.includes("kuning")) return "yellow_card"
    if (t.includes("card") || t.includes("kartu")) return "yellow_card" // kartu tanpa warna spesifik -> default aman (bukan goal)
    if (t.includes("sub") || t.includes("ganti")) return "substitution"
    if (t.includes("var")) return "var"
    return null // tipe tidak dikenal -> jangan ditebak sebagai goal (bisa merusak skor berjalan)
  }

  // PENTING: incidents Bzzoiro mengidentifikasi tim lewat ID numerik
  // (home_team_id/away_team_id di event, team_id di tiap incident) — BUKAN
  // field nama seperti team_name/team yang tidak pernah ada di respons asli.
  // Kode lama selalu baca string kosong dari field itu, jadi isHome selalu
  // false dan SEMUA insiden (termasuk semua substitusi & gol) salah dianggap
  // milik tim away — itu sebabnya skor berjalan bisa melewati skor akhir asli,
  // dan semua pergantian pemain tampak dari satu tim saja.
  const homeTeamId = event.home_team_id ?? event.home_id
  const awayTeamId = event.away_team_id ?? event.away_id

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
      if (!type) return null

      let isHome: boolean
      if (inc.team_id != null && homeTeamId != null) {
        // Jalur utama: cocokkan via ID numerik (paling akurat)
        isHome = String(inc.team_id) === String(homeTeamId)
      } else if (inc.team === "home" || inc.team === "away") {
        isHome = inc.team === "home"
      } else {
        // Fallback terakhir: cocokkan nama tim (kurang akurat, cuma kalau ID tidak ada)
        const incHome = fix(inc.team_name ?? "")
        isHome = !!incHome && incHome.toLowerCase().includes(home.toLowerCase().split(" ")[0])
      }
      const team: "home" | "away" = isHome ? "home" : "away"

      if (type === "goal" || type === "penalty") {
        if (isHome) { runH++ } else { runA++ }
      }

      const photoUrl = (pid: any) => pid ? `https://sports.bzzoiro.com/img/player/${pid}/` : undefined

      return {
        minute: String(inc.minute ?? "?") + "'" ,
        type,
        team,
        score_after: `${runH}-${runA}`,
        player_name: fix(inc.player_name ?? inc.player ?? ""),
        player_photo: type !== "substitution" ? photoUrl(inc.player_id) : undefined,
        assist_name: fix(inc.assist_name ?? inc.assist ?? "") || undefined,
        sub_in_name: type === "substitution" ? fix(inc.sub_in_name ?? inc.player_in ?? "") || undefined : undefined,
        sub_in_photo: type === "substitution" ? photoUrl(inc.player_in_id) : undefined,
        sub_out_name: type === "substitution" ? fix(inc.sub_out_name ?? inc.player_out ?? inc.player_name ?? "") || undefined : undefined,
        sub_out_photo: type === "substitution" ? photoUrl(inc.player_out_id ?? inc.player_id) : undefined,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // PENTING: tim/skor sudah ketemu, tapi kalau timeline-nya kosong (belum ada
  // gol/kartu/substitusi tercatat, ATAU pertandingan belum mulai sama sekali),
  // tanpa cek ini form timeline "berhasil" tersimpan tapi kosong tanpa keterangan.
  if (timeline.length === 0) {
    const reason = status === "upcoming"
      ? "pertandingan belum dimulai, belum ada insiden untuk ditampilkan"
      : "belum ada gol/kartu/substitusi yang tercatat Bzzoiro untuk pertandingan ini"
    throw new Error(`Timeline untuk "${query}" masih kosong (${reason}).`)
  }

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
// → /api/v2/events/{id}/lineups/  (endpoint dedicated v2, BUKAN /events/{id}/ biasa!)
//   Response: { event_id, lineup_status: "confirmed"|"predicted"|"unavailable",
//               lineups: { home: { team_name, formation, confidence, players[], substitutes[] },
//                          away: { ... } } | null, unavailable_players, updated_at }
//   "unavailable" -> lineups bernilai null. Bzzoiro men-generate predicted lineup
//   secara periodik, jadi ini WAJAR terjadi untuk match yang masih jauh dari kickoff —
//   bukan berarti ada bug, tapi kita harus kasih tahu user secara eksplisit alih-alih
//   diam-diam mengembalikan form kosong yang terlihat seperti "berhasil tapi kosong".
// ═══════════════════════════════════════════════════════════════════════════════

export interface BzzLineupData {
  competition: string
  lineupStatus: "confirmed" | "predicted" | "unavailable"
  home: {
    team_name: string
    flag: string
    formation: string
    players: Array<{
      number: number
      name: string
      position: string
      rating: number | null
      photo_url: string | null
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
      photo_url: string | null
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

  const home = fix(event.home_team ?? "")
  const away = fix(event.away_team ?? "")
  const competition = fix(event.league_name ?? event.league ?? "")

  // Endpoint dedicated untuk lineup — TIDAK ada di /api/v2/events/{id}/ biasa
  const lineupRes = await bzzGet(`/api/v2/events/${event.id}/lineups/`)
  const status: "confirmed" | "predicted" | "unavailable" = lineupRes?.lineup_status ?? "unavailable"

  function buildTeam(rawTeam: any, teamName: string, fallbackFormation: string) {
    const players: any[] = rawTeam?.players ?? []
    return {
      team_name: rawTeam?.team_name ? fix(rawTeam.team_name) : teamName,
      flag: "",
      formation: rawTeam?.formation ?? fallbackFormation,
      players: players.slice(0, 11).map((p: any, i: number) => ({
        number: p.jersey_number ?? p.number ?? i + 1,
        name: fix(p.short_name ?? p.name ?? `Pemain ${i + 1}`),
        position: p.position ?? (i === 0 ? "GK" : "CM"),
        rating: p.ai_score != null ? Number(p.ai_score) : (p.rating != null ? Number(p.rating) : null),
        // Bzzoiro: foto pemain via image proxy publik, tidak perlu API call tambahan
        photo_url: p.id ? `https://sports.bzzoiro.com/img/player/${p.id}/` : null,
      })),
    }
  }

  if (status === "unavailable" || !lineupRes?.lineups) {
    // Sesuai docs resmi Bzzoiro: lineup di-generate periodik, belum tentu tersedia
    // untuk match yang masih jauh dari kickoff. Lempar error yang jelas supaya UI
    // form bisa menampilkan pesan ke user, bukan terlihat "berhasil" dengan 0/11 pemain.
    throw new Error(
      `Lineup untuk "${query}" belum tersedia di Bzzoiro (status: unavailable). ` +
      `Bzzoiro men-generate predicted lineup secara periodik mendekati kickoff — coba fetch ulang nanti.`
    )
  }

  const homeTeam = buildTeam(lineupRes.lineups.home, home, "4-3-3")
  const awayTeam = buildTeam(lineupRes.lineups.away, away, "4-3-3")

  // PENTING: status "predicted" kadang sudah punya team_name + formation duluan,
  // tapi daftar pemain per-posisi belum selesai di-generate Bzzoiro (proses bertahap).
  // Tanpa cek ini, form akan terisi "berhasil" tapi 0/11 pemain tanpa keterangan apapun
  // — terlihat seperti bug padahal sebenarnya cuma data Bzzoiro belum lengkap.
  if (homeTeam.players.length === 0 && awayTeam.players.length === 0) {
    throw new Error(
      `Formasi untuk "${query}" sudah diketahui (${homeTeam.formation} vs ${awayTeam.formation}), ` +
      `tapi daftar pemain belum di-generate Bzzoiro (status: ${status}). ` +
      `Ini bukan bug — Bzzoiro memproses prediksi lineup secara bertahap (formasi dulu, baru pemain). ` +
      `Coba fetch ulang beberapa saat lagi, atau isi pemain secara manual untuk sekarang.`
    )
  }

  return {
    competition,
    lineupStatus: status,
    home: homeTeam,
    away: awayTeam,
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

  // Klasemen untuk semua tim (path benar: /leagues/{id}/standings/)
  const table: any[] = leagueId ? await fetchStandingsTable(leagueId, query).catch(() => []) : []

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
    // PENTING: field standings asli Bzzoiro adalah `pts` (lihat docs resmi:
    // { position, team_id, team_name, played, won, drawn, lost, gf, ga, gd, pts }),
    // BUKAN `points` — kode lama selalu baca 0 dari sini.
    const pts = row?.pts ?? row?.points ?? 0
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
  home_value: string
  away_value: string
}

// PENTING: tidak ada agregat "nilai skuad tim" langsung di Bzzoiro — market
// value cuma ada per-pemain (/players/{id}/, field market_value_eur). Jadi
// untuk dapat nilai skuad, kita ambil squad tim (/teams/{id}/squad/) lalu
// jumlahkan market value tiap pemain. Dibatasi 25 pemain pertama per tim biar
// tidak terlalu banyak request paralel.
async function fetchSquadValueLabel(teamName: string): Promise<string> {
  const teamsJson = await bzzGet(`/api/teams/?search=${encodeURIComponent(teamName)}&limit=5`).catch(() => null)
  const teams: any[] = teamsJson?.results ?? (Array.isArray(teamsJson) ? teamsJson : [])
  const team = teams[0]
  if (!team?.id) return "-"

  const squadJson = await bzzGet(`/api/v2/teams/${team.id}/squad/`).catch(() => null)
  const players: any[] = squadJson?.players ?? squadJson?.results ?? (Array.isArray(squadJson) ? squadJson : [])
  if (players.length === 0) return "-"

  const detailed = await Promise.all(
    players.slice(0, 25).map((p) => bzzGet(`/api/v2/players/${p.id}/`).catch(() => null))
  )
  const total = detailed.reduce((sum, p) => sum + Number(p?.market_value_eur ?? 0), 0)
  if (total === 0) return "-"

  const m = total / 1_000_000
  return m >= 1 ? `€${m.toFixed(1)}M` : `€${(total / 1000).toFixed(0)}K`
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

  // Standings (path benar: /leagues/{id}/standings/)
  const table: any[] = leagueId ? await fetchStandingsTable(leagueId, query).catch(() => []) : []

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

  // Manager (coach) untuk kedua tim — resolve team_id dulu (lihat findManagerByTeamName)
  // + nilai skuad kedua tim (lihat fetchSquadValueLabel)
  const [homeMgr, awayMgr, homeValue, awayValue] = await Promise.all([
    findManagerByTeamName(teamA),
    findManagerByTeamName(teamB),
    fetchSquadValueLabel(teamA),
    fetchSquadValueLabel(teamB),
  ])

  function coachName(mgr: any): string {
    return fix(mgr?.name ?? mgr?.manager_name ?? "")
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
    home_value: homeValue,
    away_value: awayValue,
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
  photo_url: string | null
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
    // Bzzoiro: foto pemain via image proxy publik, tidak perlu API call tambahan
    // (404 kalau tidak ada foto -> Card harus sedia fallback/placeholder)
    photo_url: player.id ? `https://sports.bzzoiro.com/img/player/${player.id}/` : null,
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
  // PENTING: endpoint players yang lebih lengkap ada di /api/v2/players/
  // (filter by name/club/national-team/nationality/position). Kalau nama
  // mengandung aksen (mis. "Mbappé") dan tidak ketemu, coba lagi tanpa aksen
  // ("Mbappe") sebagai fallback — beberapa nama Bzzoiro tersimpan tanpa aksen.
  async function searchPlayer(q: string) {
    const json = await bzzGet(`/api/v2/players/?search=${encodeURIComponent(q)}&limit=5`).catch(() => null)
    const list: any[] = json?.results ?? (Array.isArray(json) ? json : [])
    return list[0] ?? null
  }

  let player = await searchPlayer(playerQuery)
  if (!player) {
    const stripped = stripDiacritics(playerQuery)
    if (stripped !== playerQuery) player = await searchPlayer(stripped)
  }
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
    // PENTING: field asli Bzzoiro adalah height_cm/weight_kg/date_of_birth —
    // bukan height/weight/age (yang tidak pernah ada, jadi selalu fallback
    // ke default 175/70/25 sebelumnya, terlepas dari data pemain sebenarnya).
    usia: player.age ?? (player.date_of_birth ? ageFromDOB(player.date_of_birth) : 25),
    tinggi_badan: player.height_cm ?? player.height ?? 175,
    berat_badan: player.weight_kg ?? player.weight ?? 70,
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

  // PENTING: path asli Bzzoiro adalah /teams/{id}/squad/ (nested resource),
  // BUKAN /players/?team={id} — pola bug yang sama dengan standings sebelumnya.
  // Itu sebabnya tim ketemu tapi daftar pemain selalu kosong.
  const json = await bzzGet(`/api/v2/teams/${teamId}/squad/`)
  const players: any[] = json.players ?? json.results ?? (Array.isArray(json) ? json : [])

  // PENTING: tim-nya ketemu, tapi kalau roster pemainnya kosong di Bzzoiro,
  // tanpa cek ini form "berhasil" tersimpan dengan 0 pemain — pola yang sama
  // dengan bug starting_lineup sebelumnya.
  if (players.length === 0) {
    throw new Error(
      `Tim "${teamQuery}" ditemukan, tapi daftar pemainnya kosong di Bzzoiro. ` +
      `Coba lagi nanti atau isi pemain secara manual untuk sekarang.`
    )
  }

  function formatMV(mv: any): string {
    if (!mv || isNaN(Number(mv))) return "-"
    const m = Number(mv) / 1_000_000
    return m >= 1 ? `€${m.toFixed(1)}M` : `€${(Number(mv) / 1000).toFixed(0)}K`
  }

  // PENTING: endpoint /teams/{id}/squad/ cuma kasih shape ringkas (TIDAK ada
  // market_value) — sesuai docs resmi: "For full per-player detail (market
  // value, foot, contract, etc.) hit /players/{id}/". Jadi nilai pasar perlu
  // di-fetch terpisah per pemain. Dibatasi 30 pemain pertama agar tidak terlalu
  // banyak request paralel.
  const detailed = await Promise.all(
    players.slice(0, 30).map((p) =>
      bzzGet(`/api/v2/players/${p.id}/`).catch(() => null)
    )
  )

  return players.slice(0, 30).map((p, i) => ({
    nomor_punggung: p.jersey_number ?? p.shirt_number ?? 0,
    nama_pemain: fix(p.player_name ?? p.name ?? ""),
    usia: p.age ?? (p.date_of_birth ? ageFromDOB(p.date_of_birth) : 0),
    asal_klub: teamName,
    nilai_pasar: formatMV(detailed[i]?.market_value ?? p.market_value),
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
  // Coba cari manager by nama pelatih (search= valid, DRF SearchFilter) atau by nama tim
  // (resolve team_id dulu — lihat findManagerByTeamName, ?team_search= bukan filter valid)
  const [byName, byTeam] = await Promise.all([
    bzzGet(`/api/managers/?search=${encodeURIComponent(query)}&limit=5`).catch(() => null),
    findManagerByTeamName(query).catch(() => null),
  ])

  const listName: any[] = byName?.results ?? (Array.isArray(byName) ? byName : [])
  const manager = listName[0] ?? byTeam

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

  // PENTING: /api/managers/ TIDAK menyertakan nama tim langsung — cuma
  // current_team_id (lihat docs resmi BSD). Tanpa resolve ini, teamName akan
  // selalu kosong walau manager-nya ketemu (bug lama: cek manager.team_name /
  // manager.team yang memang tidak pernah ada di respons asli).
  let teamName = fix(manager.team_name ?? manager.team ?? "")
  if (!teamName && manager.current_team_id) {
    teamName = fix(
      (await bzzGet(`/api/teams/${manager.current_team_id}/`).catch(() => null))?.name ?? ""
    )
  }
  if (!teamName) teamName = fix(query)

  // Bzzoiro /api/managers/ menyimpan tactical_profile / preferred_formation
  const formation = manager.preferred_formation ?? manager.formation ?? manager.tactical_formation ?? "4-3-3"

  // PENTING: field asli Bzzoiro adalah `tactical_profile` (label tunggal, selalu
  // ada) dan `tactical_styles` (array detail, cuma muncul kalau manager punya
  // ≥5 match dengan stats lengkap) — BUKAN `tactical_style`/`play_style`/
  // `description` yang dicek kode lama (field-field itu tidak pernah ada di
  // respons asli Bzzoiro, jadi playStyle nyaris selalu kosong sebelumnya).
  const stylesDetailed: string[] = Array.isArray(manager.tactical_styles)
    ? manager.tactical_styles.map((s: any) => String(s))
    : (manager.tactical_styles ? [String(manager.tactical_styles)] : [])
  const playStyle = fix(
    stylesDetailed[0] ?? manager.tactical_profile ?? manager.tactical_style ?? manager.play_style ?? manager.description ?? ""
  )

  // Main weapons: prioritaskan tactical_styles detail (kalau manager punya cukup
  // match), lalu turunkan dari statistik agregat NYATA yang memang ada di
  // /api/managers/ (pressing_intensity, avg_possession, clean_sheet_pct,
  // over_25_pct) — bukan pressing_style/attacking_style/key_attributes yang
  // memang tidak pernah ada di field asli Bzzoiro (bug lama).
  const weapons: string[] = []
  stylesDetailed.slice(1, 3).forEach((s) => weapons.push(fix(s)))
  if (typeof manager.pressing_intensity === "number") {
    weapons.push(
      manager.pressing_intensity >= 60 ? "Pressing tinggi" :
      manager.pressing_intensity <= 30 ? "Bertahan terorganisir, pressing rendah" :
      "Pressing menengah"
    )
  }
  if (typeof manager.avg_possession === "number" && manager.avg_possession >= 55) {
    weapons.push(`Dominasi penguasaan bola (${manager.avg_possession.toFixed(1)}% rata-rata)`)
  }
  if (typeof manager.clean_sheet_pct === "number" && manager.clean_sheet_pct >= 40) {
    weapons.push(`Pertahanan solid (${manager.clean_sheet_pct.toFixed(0)}% clean sheet)`)
  }
  if (typeof manager.over_25_pct === "number" && manager.over_25_pct >= 55) {
    weapons.push("Permainan terbuka, produktif gol")
  }
  // Fallback generic kalau manager belum punya cukup match (<5) untuk semua stat di atas
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

  // PENTING: dokumentasi resmi Bzzoiro cuma mengonfirmasi endpoint DETAIL
  // (/api/venues/{id}/) — tidak jelas apakah /api/venues/ (list) benar2
  // mendukung filter ?search=. Kalau parameter itu diabaikan diam-diam oleh
  // server, API akan balas baris PERTAMA di database secara default — sama
  // sekali tidak terkait dengan yang dicari (cth: cari "SoFi" balik "11 June
  // Stadium, Tripoli, Libya"). Jadi jangan langsung percaya venues[0] — cek
  // dulu ada kecocokan kata dengan query sebelum dipakai.
  const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const venue = venues.find((v) => {
    const name = fix(v.name ?? v.venue_name ?? "").toLowerCase()
    return qWords.length === 0 || qWords.some((w) => name.includes(w))
  })

  if (!venue) {
    throw new Error(
      `Stadion "${query}" tidak ditemukan secara akurat di Bzzoiro — hasil yang ` +
      `kembali dari pencarian tidak cocok dengan nama yang dicari (kemungkinan ` +
      `stadion ini belum ada di database mereka). Coba nama lain atau isi manual.`
    )
  }

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
