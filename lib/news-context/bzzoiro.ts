// lib/news-context/bzzoiro.ts
//
// Sumber DATA & STATISTIK TERVERIFIKASI dalam pipeline:
//   Bzzoiro (data & statistik) → Serper (media: ESPN/Sky Sports/dll) → Tavily (backup) → LLM
//
// File ini HANYA mengambil data dari Bzzoiro Sports Data API (sports.bzzoiro.com).
// Penggabungan dengan Serper + Tavily dilakukan di app/api/generate-article/route.ts
// (sebelumnya Tavily digabung di sini langsung — sekarang dipisah agar tiap layer
// pipeline independen dan mudah di-debug per sumber).
//
//   HASIL    → skor, xG, shots, shots on target, possession, momentum, goal incidents,
//              kartu merah, penalti. Target context: 800-1000 token.
//
//   PREVIEW  (bobot 60%) → H2H 5 pertandingan, form 5 pertandingan, win probability,
//              odds, KLASEMEN kedua tim (BARU — sebelumnya belum diambil).
//              Target context: 900-1200 token.
//
//   CEDERA   → profil pemain (posisi, kontribusi musim ini, menit bermain, gol, assist).
//              Target context: 600-800 token.
//
//   TRANSFER → profil pemain: nama, umur, posisi, klub, menit bermain musim ini,
//              gol, assist, rating rata-rata, 5 laga terakhir. Target context: 500-700 token.
//
//   KONPERS  → form tim, posisi klasemen, 5 pertandingan terakhir. Target context: 500-700 token.
//
//   TRIVIA   → use case TERKUAT Bzzoiro. Profil 62.681 pemain, 139k+ statistik per match,
//              per-shot xG + koordinat (shotmap 15.5k+ pertandingan), head-to-head lintas
//              musim (66 liga × 68k+ match). Target context: 800-1200 token.

const BZZOIRO_BASE = "https://sports.bzzoiro.com"

export interface BzzoiroContextResult {
  contextText: string
  meta: Record<string, unknown>
  warning?: string
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function bzzFetch(path: string) {
  const apiKey = process.env.BZZOIRO_API_KEY
  if (!apiKey) throw new Error("BZZOIRO_API_KEY tidak ditemukan di .env.local")

  const res = await fetch(`${BZZOIRO_BASE}${path}`, {
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`❌ bzzFetch error ${res.status} — path: ${path} — body: ${body.slice(0, 300)}`)
    throw new Error(`Bzzoiro API error ${res.status} pada ${path}`)
  }
  const json = await res.json()
  console.log(`✅ bzzFetch ${path} — preview: ${JSON.stringify(json).slice(0, 200)}`)
  return json
}

function fixEncoding(str: string): string {
  if (!str) return str
  try {
    return decodeURIComponent(escape(str))
  } catch {
    return str
  }
}

// ─── Translasi nama tim/negara Indonesia → Inggris ───────────────────────────
// Bzzoiro Sports Data API menyimpan nama tim dalam bahasa Inggris, sementara
// field Topik di CMS sering diisi dalam bahasa Indonesia (terutama nama negara
// di artikel Piala Dunia). Tanpa translasi ini, pencarian "Jepang vs Swedia"
// tidak akan match dengan "Japan vs Sweden" di API, dan kode lama akan jatuh
// ke fallback yang mengambil pertandingan ACAK pertama yang ditemukan dalam
// rentang tanggal — bukan error, tapi DIAM-DIAM SALAH (silent wrong data).
// Tambahkan entry baru di sini kalau ketemu nama negara/tim yang belum cocok.
const ID_TO_EN_TEAM: Record<string, string> = {
  jepang: "japan", swedia: "sweden", inggris: "england", prancis: "france",
  perancis: "france", spanyol: "spain", jerman: "germany", belanda: "netherlands",
  brasil: "brazil", "korea selatan": "south korea", "arab saudi": "saudi arabia",
  maroko: "morocco", kroasia: "croatia", polandia: "poland", swiss: "switzerland",
  belgia: "belgium", italia: "italy", kamerun: "cameroon", mesir: "egypt",
  aljazair: "algeria", "kosta rika": "costa rica", meksiko: "mexico", kanada: "canada",
  "amerika serikat": "united states", ekuador: "ecuador", kolombia: "colombia",
  "selandia baru": "new zealand", skotlandia: "scotland", yordania: "jordan",
  uruguay: "uruguay", paraguay: "paraguay", australia: "australia", iran: "iran",
  qatar: "qatar", ghana: "ghana", nigeria: "nigeria", senegal: "senegal",
  tunisia: "tunisia", argentina: "argentina", portugal: "portugal",
  uzbekistan: "uzbekistan", denmark: "denmark", wales: "wales", panama: "panama",
}

// Kata-kata yang sering ikut terisi di field Topik tapi bukan nama tim,
// supaya tidak ikut dikirim sebagai query pencarian ke Bzzoiro.
const TOPIC_NOISE = [
  "hasil pertandingan", "hasil laga", "hasil", "preview pertandingan",
  "pratinjau pertandingan", "preview", "pratinjau", "laporan", "pertandingan",
]

// ─── Ekstrak nama tim bersih dari Topik + translasi ID→EN untuk pencarian ────
function extractTeamNames(topic: string): { teamA: string; teamB: string | null; namesForMatching: string[] } {
  let cleaned = topic.toLowerCase()
  for (const w of TOPIC_NOISE) cleaned = cleaned.replace(w, " ")
  // Buang semua setelah koma/kurung — biasanya keterangan kompetisi tambahan,
  // bukan bagian dari nama tim (mis. "Jepang vs Swedia, Grup F Piala Dunia")
  cleaned = cleaned.split(",")[0].split("(")[0].trim().replace(/\s+/g, " ")

  const parts = cleaned.split(/\s+vs\.?\s+|\s+v\s+|\s+melawan\s+/i)
  const teamA = (parts[0] ?? cleaned).trim()
  const teamB = parts[1] ? parts[1].trim() : null

  const translate = (t: string) => ID_TO_EN_TEAM[t] ?? t
  const namesForMatching = [teamA, teamB, translate(teamA), teamB ? translate(teamB) : null]
    .filter((n): n is string => !!n && n.length > 1)

  return { teamA, teamB, namesForMatching }
}

// ─── Validasi: apakah event Bzzoiro ini benar-benar pertandingan yang dicari?─
// INI PERBAIKAN UTAMA — sebelumnya tidak ada validasi sama sekali, sehingga
// kode lama bisa mengambil pertandingan yang tidak ada hubungannya dengan
// Topik (mis. "Jepang vs Swedia" bisa dapat data "Cuiabá vs Londrina").
function eventMatchesTeams(e: any, names: string[]): boolean {
  const home = fixEncoding(e.home_team ?? "").toLowerCase()
  const away = fixEncoding(e.away_team ?? "").toLowerCase()
  if (!home && !away) return false
  return names.some((n) => n && (home.includes(n) || away.includes(n) || n.includes(home) || n.includes(away)))
}

// ─── Cari event/match berdasarkan nama tim ────────────────────────────────────
async function findEvent(teamQuery: string, opts: { upcoming?: boolean } = {}) {
  const today = new Date()
  const past   = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000)
  const future = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const dateFrom = opts.upcoming
    ? today.toISOString().split("T")[0]
    : past.toISOString().split("T")[0]
  const dateTo = opts.upcoming
    ? future.toISOString().split("T")[0]
    : today.toISOString().split("T")[0]

  const json = await bzzFetch(
    `/api/v2/events/?date_from=${dateFrom}&date_to=${dateTo}&search=${encodeURIComponent(teamQuery)}&limit=20`
  )
  const events = json.results ?? json.events ?? (Array.isArray(json) ? json : [])
  return events as any[]
}

// ─── HASIL PERTANDINGAN ───────────────────────────────────────────────────────
// Ambil: skor, xG total + per-shot xG dengan koordinat (shotmap), shots, shots on
// target, possession, momentum menit-per-menit, goal incidents (build-up sequence),
// kartu merah, penalti, average_positions, statistik individu pemain per match.
// JANGAN: 30+ statistik detail, seluruh event pertandingan.
export async function fetchHasilContext(topic: string): Promise<BzzoiroContextResult> {
  const warnings: string[] = []
  const meta: Record<string, unknown> = {}
  let bzzoiroBlock = ""

  try {
    const { teamA, teamB, namesForMatching } = extractTeamNames(topic)
    const events  = await findEvent(teamA || topic, { upcoming: false })
    const relevant = events.filter((e) => eventMatchesTeams(e, namesForMatching))
    const finished = relevant.find((e) => (e.status ?? "").toLowerCase() === "finished") ?? relevant[0]

    if (!finished) {
      warnings.push(`Tidak ditemukan pertandingan yang cocok dengan "${topic}" (dicari: ${teamA}${teamB ? ` vs ${teamB}` : ""}) di Bzzoiro dalam 4 hari terakhir.`)
    } else {
      const eventId = finished.id
      const [stats, incidents, shotsRaw, avgPosRaw, playerStatsRaw] = await Promise.all([
        bzzFetch(`/api/v2/events/${eventId}/stats/`).catch(() => null),
        bzzFetch(`/api/v2/events/${eventId}/incidents/`).catch(() => null),
        bzzFetch(`/api/v2/events/${eventId}/shots/`).catch(() => null),          // per-shot xG + koordinat
        bzzFetch(`/api/v2/events/${eventId}/average_positions/`).catch(() => null),
        bzzFetch(`/api/player-stats/?event=${eventId}&limit=22`).catch(() => null), // statistik individu per match
      ])

      const home = fixEncoding(finished.home_team ?? "")
      const away = fixEncoding(finished.away_team ?? "")
      const scoreLine = `${home} ${finished.home_score ?? 0} - ${finished.away_score ?? 0} ${away}`

      // Insiden utama: hanya gol, kartu merah, penalti (bukan semua event)
      const incidentList = (incidents?.incidents ?? incidents?.results ?? (Array.isArray(incidents) ? incidents : []))
        .filter((inc: any) => {
          const t = (inc.type ?? inc.incident_type ?? "").toLowerCase()
          return t.includes("goal") || t.includes("red") || t.includes("penalty")
        })
        .map((inc: any) => {
          const minute = inc.minute ?? inc.time ?? "?"
          const type   = inc.type ?? inc.incident_type ?? ""
          const player = fixEncoding(inc.player_name ?? inc.player ?? "")
          const team   = fixEncoding(inc.team_name ?? inc.team ?? "")
          return `Menit ${minute}' — ${type} — ${player}${team ? ` (${team})` : ""}`
        })
        .join("\n")

      // Statistik yang diizinkan: xG, shots, shots on target, possession, momentum, pemain terbaik
      const ALLOWED_STAT_KEYS = [
        "xg", "xg_home", "xg_away",
        "shots", "shots_home", "shots_away",
        "shots_on_target", "shots_on_target_home", "shots_on_target_away",
        "possession", "possession_home", "possession_away",
        "momentum",
        "best_player", "man_of_the_match", "player_of_the_match",
      ]

      const statLines = stats
        ? Object.entries(stats)
            .filter(([k]) => ALLOWED_STAT_KEYS.some((allowed) => k.toLowerCase().includes(allowed)))
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join("\n")
        : ""

      // Per-shot xG + koordinat (shotmap) — urutkan dari xG tertinggi, ambil top 5
      const shotmapList = (() => {
        const shots: any[] = shotsRaw?.shots ?? shotsRaw?.results ?? (Array.isArray(shotsRaw) ? shotsRaw : [])
        if (shots.length === 0) return ""
        const sorted = [...shots]
          .filter((s: any) => s.xg != null)
          .sort((a: any, b: any) => (b.xg ?? 0) - (a.xg ?? 0))
          .slice(0, 5)
        return sorted.map((s: any) => {
          const player = fixEncoding(s.player_name ?? s.player ?? "")
          const team   = fixEncoding(s.team_name ?? s.team ?? "")
          const min    = s.minute ?? s.time ?? "?"
          const result = s.result ?? s.shot_result ?? ""
          return `Menit ${min}' — xG ${s.xg} — ${player}${team ? ` (${team})` : ""}${result ? ` [${result}]` : ""} — koordinat x:${s.x ?? "?"} y:${s.y ?? "?"}`
        }).join("\n")
      })()

      // Average positions — posisi rata-rata tiap pemain (taktis)
      const avgPosList = (() => {
        const data: any[] = avgPosRaw?.positions ?? avgPosRaw?.results ?? (Array.isArray(avgPosRaw) ? avgPosRaw : [])
        if (data.length === 0) return ""
        return data.slice(0, 11).map((p: any) => {
          const name = fixEncoding(p.player_name ?? p.name ?? "")
          const team = fixEncoding(p.team_name ?? p.team ?? "")
          return `${name}${team ? ` (${team})` : ""}: x=${p.average_x ?? p.x ?? "?"} y=${p.average_y ?? p.y ?? "?"}`
        }).join("\n")
      })()

      // Statistik individu pemain per match — top performers (rating tertinggi, ambil 5)
      const playerStatsList = (() => {
        const data: any[] = playerStatsRaw?.results ?? (Array.isArray(playerStatsRaw) ? playerStatsRaw : [])
        if (data.length === 0) return ""
        const sorted = [...data]
          .filter((s: any) => s.rating != null || s.goals != null)
          .sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, 5)
        return sorted.map((s: any) => {
          const name  = fixEncoding(s.player_name ?? s.player ?? "")
          const team  = fixEncoding(s.team_name ?? s.team ?? "")
          const parts = [
            s.minutes_played != null ? `${s.minutes_played} menit` : null,
            s.goals   != null ? `${s.goals} gol` : null,
            s.assists != null ? `${s.assists} assist` : null,
            s.rating  != null ? `rating ${s.rating}` : null,
          ].filter(Boolean).join(", ")
          return `${name}${team ? ` (${team})` : ""}: ${parts}`
        }).join("\n")
      })()

      bzzoiroBlock = [
        `[DATA & STATISTIK TERVERIFIKASI — Bzzoiro Sports Data API]`,
        `SKOR AKHIR: ${scoreLine}`,
        `Liga/Kompetisi: ${finished.league_name ?? finished.league ?? "-"}`,
        `Tanggal: ${finished.event_date ?? "-"}`,
        incidentList    ? `\nINSIDEN UTAMA (gol/kartu merah/penalti):\n${incidentList}` : "",
        statLines       ? `\nSTATISTIK KUNCI:\n${statLines}` : "",
        shotmapList     ? `\nPER-SHOT xG + KOORDINAT (top 5 peluang terbesar):\n${shotmapList}` : "",
        playerStatsList ? `\nSTATISTIK INDIVIDU PEMAIN:\n${playerStatsList}` : "",
        avgPosList      ? `\nPOSISI RATA-RATA PEMAIN:\n${avgPosList}` : "",
      ].filter(Boolean).join("\n")

      meta.eventId = eventId
      meta.home    = home
      meta.away    = away
      meta.score   = scoreLine
    }
  } catch (err) {
    warnings.push(`Bzzoiro gagal mengambil data hasil: ${err instanceof Error ? err.message : "error tidak diketahui"}.`)
  }

  if (!bzzoiroBlock.trim()) {
    return {
      contextText: "",
      meta,
      warning: warnings.length > 0 ? warnings.join(" | ") : `Tidak ditemukan data Bzzoiro untuk "${topic}".`,
    }
  }
  return { contextText: bzzoiroBlock, meta, warning: warnings.length > 0 ? warnings.join(" | ") : undefined }
}

// ─── PREVIEW PERTANDINGAN ─────────────────────────────────────────────────────
// Ambil: predicted_lineup, win probability (8 market CatBoost), odds/comparison
// (14 bookmaker), H2H 5 pertandingan, form 5 pertandingan, klasemen, average_positions.
// JANGAN: throw in, corner detail, foul, goal kick, possession breakdown detail.
export async function fetchPreviewContext(topic: string): Promise<BzzoiroContextResult> {
  const warnings: string[] = []
  const meta: Record<string, unknown> = {}
  let bzzoiroBlock = ""

  try {
    const { teamA, teamB, namesForMatching } = extractTeamNames(topic)
    const events   = await findEvent(teamA || topic, { upcoming: true })
    const relevant = events.filter((e) => eventMatchesTeams(e, namesForMatching))
    const upcoming = relevant.find((e) => (e.status ?? "").toLowerCase() !== "finished") ?? relevant[0]

    if (!upcoming) {
      warnings.push(`Tidak ditemukan pertandingan mendatang yang cocok dengan "${topic}" (dicari: ${teamA}${teamB ? ` vs ${teamB}` : ""}) di Bzzoiro.`)
    } else {
      const eventId = upcoming.id
      const [predictions, lineupRaw, oddsCompRaw, avgPosRaw] = await Promise.all([
        bzzFetch(`/api/v2/predictions/?event=${eventId}`).catch(() => null),
        bzzFetch(`/api/v2/events/${eventId}/predicted_lineup/`).catch(() => null),
        bzzFetch(`/api/v2/events/${eventId}/odds/comparison/`).catch(() => null),
        bzzFetch(`/api/v2/events/${eventId}/average_positions/`).catch(() => null),
      ])

      const home = fixEncoding(upcoming.home_team ?? "")
      const away = fixEncoding(upcoming.away_team ?? "")

      // Win probability, odds saja
      const ALLOWED_PRED_KEYS = [
        "home_win_prob", "draw_prob", "away_win_prob",
        "predicted_score", "xg_home", "xg_away",
        "btts_prob", "odds_home", "odds_draw", "odds_away",
        "market",
      ]

      const predList = predictions
        ? (predictions.results ?? (Array.isArray(predictions) ? predictions : [predictions]))
            .map((p: any) =>
              Object.entries(p)
                .filter(([k]) => ALLOWED_PRED_KEYS.some((allowed) => k.toLowerCase().includes(allowed)))
                .map(([k, v]) => {
                  if (k.includes("prob")) return `${k.replace(/_/g, " ")}: ${v}%`
                  if (k === "predicted_score") return `Skor prediksi: ${v}`
                  return `${k.replace(/_/g, " ")}: ${v}`
                })
                .join(" | ")
            )
            .filter(Boolean)
            .join("\n")
        : ""

      // H2H — 5 pertemuan terakhir kedua tim (pakai nama tim yang sudah
      // tervalidasi dari event yang ketemu, bukan topic mentah)
      const h2h = await bzzFetch(
        `/api/v2/events/?search=${encodeURIComponent(home)}&limit=10&ordering=-event_date`
      ).catch(() => null)

      const h2hList = h2h
        ? (h2h.results ?? (Array.isArray(h2h) ? h2h : []))
            .filter((e: any) => (e.status ?? "").toLowerCase() === "finished")
            .filter((e: any) => {
              const h = fixEncoding(e.home_team ?? "").toLowerCase()
              const a = fixEncoding(e.away_team ?? "").toLowerCase()
              const homeL = home.toLowerCase(), awayL = away.toLowerCase()
              const hasHome = h.includes(homeL) || a.includes(homeL)
              const hasAway = h.includes(awayL) || a.includes(awayL)
              return hasHome && hasAway // harus pertemuan KEDUA tim, bukan salah satu
            })
            .slice(0, 5)
            .map((e: any) => {
              const h = fixEncoding(e.home_team ?? "")
              const a = fixEncoding(e.away_team ?? "")
              return `${h} ${e.home_score ?? 0} - ${e.away_score ?? 0} ${a} (${e.event_date ?? "-"})`
            })
            .join("\n")
        : ""

      // Form 5 laga masing-masing tim — fetch paralel
      const [homeFormRaw, awayFormRaw] = await Promise.all([
        bzzFetch(`/api/v2/events/?search=${encodeURIComponent(home)}&limit=6&ordering=-event_date`).catch(() => null),
        bzzFetch(`/api/v2/events/?search=${encodeURIComponent(away)}&limit=6&ordering=-event_date`).catch(() => null),
      ])

      function extractForm(data: any, teamName: string): string {
        const events = (data?.results ?? (Array.isArray(data) ? data : []))
          .filter((e: any) => (e.status ?? "").toLowerCase() === "finished")
          .slice(0, 5)
        if (events.length === 0) return "(tidak tersedia)"
        return events.map((e: any) => {
          const h = fixEncoding(e.home_team ?? "")
          const a = fixEncoding(e.away_team ?? "")
          const hs = e.home_score ?? 0
          const as_ = e.away_score ?? 0
          const isHome = h.toLowerCase().includes(teamName.toLowerCase().split(" ")[0])
          const result = isHome
            ? (hs > as_ ? "M" : hs < as_ ? "K" : "S")
            : (as_ > hs ? "M" : as_ < hs ? "K" : "S")
          return `[${result}] ${h} ${hs}-${as_} ${a} (${e.event_date ?? "-"})`
        }).join("\n")
      }

      const homeFormStr = homeFormRaw ? extractForm(homeFormRaw, home) : "(tidak tersedia)"
      const awayFormStr = awayFormRaw ? extractForm(awayFormRaw, away) : "(tidak tersedia)"

      // ── Klasemen kedua tim (BARU — sebelumnya tidak diambil di preview) ──
      let standingsBlock = ""
      try {
        const leagueId = upcoming.league_id ?? upcoming.league
        if (leagueId) {
          const standings = await bzzFetch(`/api/v2/standings/?league=${leagueId}&limit=25`).catch(() => null)
          const table: any[] = standings?.results ?? standings?.standings ?? (Array.isArray(standings) ? standings : [])

          const findRow = (teamName: string) =>
            table.find((row: any) =>
              fixEncoding(row.team_name ?? row.team ?? "").toLowerCase().includes(teamName.toLowerCase().split(" ")[0])
            )

          const rowLine = (row: any, label: string) => row
            ? `${label}: posisi ${row.position ?? row.rank ?? "-"} | Main ${row.played ?? row.matches_played ?? "-"} ` +
              `| M${row.won ?? row.wins ?? "-"} S${row.drawn ?? row.draws ?? "-"} K${row.lost ?? row.losses ?? "-"} ` +
              `| Poin ${row.points ?? "-"}`
            : `${label}: data klasemen tidak tersedia`

          standingsBlock = [rowLine(findRow(home), home), rowLine(findRow(away), away)].join("\n")
        }
      } catch {
        // klasemen gagal — lanjut tanpa data ini, jangan gagalkan seluruh preview
      }

      // Predicted lineup — 11 pemain + subs berbasis form & suspensi
      const lineupList = (() => {
        const data = lineupRaw?.lineup ?? lineupRaw?.predicted_lineup ?? lineupRaw?.results ?? (Array.isArray(lineupRaw) ? lineupRaw : [])
        if (!data || data.length === 0) return ""
        const starters = data.filter((p: any) => !p.is_substitute && !p.substitute)
        const subs     = data.filter((p: any) => p.is_substitute || p.substitute)
        const fmt = (p: any) => {
          const name = fixEncoding(p.player_name ?? p.name ?? "")
          const pos  = p.position ?? p.pos ?? ""
          const team = fixEncoding(p.team_name ?? p.team ?? "")
          return `${name}${pos ? ` (${pos})` : ""}${team ? ` — ${team}` : ""}`
        }
        const lines = starters.slice(0, 11).map(fmt)
        if (subs.length > 0) lines.push(`Sub: ${subs.slice(0, 7).map(fmt).join(", ")}`)
        return lines.join("\n")
      })()

      // Odds comparison — 14 bookmaker + Polymarket (ambil max 5 bookmaker terrepresentatif)
      const oddsCompList = (() => {
        const data = oddsCompRaw?.odds ?? oddsCompRaw?.results ?? (Array.isArray(oddsCompRaw) ? oddsCompRaw : [])
        if (!data || data.length === 0) return ""
        return data.slice(0, 5).map((o: any) => {
          const bookie = fixEncoding(o.bookmaker ?? o.name ?? "")
          const h = o.home ?? o.odds_home ?? "?"
          const d = o.draw ?? o.odds_draw ?? "?"
          const a = o.away ?? o.odds_away ?? "?"
          return `${bookie}: H ${h} / S ${d} / A ${a}`
        }).join("\n")
      })()

      // Average positions — gambaran taktis posisi rata-rata pemain di lapangan
      const avgPosList = (() => {
        const data = avgPosRaw?.positions ?? avgPosRaw?.results ?? (Array.isArray(avgPosRaw) ? avgPosRaw : [])
        if (!data || data.length === 0) return ""
        return data.slice(0, 11).map((p: any) => {
          const name = fixEncoding(p.player_name ?? p.name ?? "")
          const x = p.average_x ?? p.x ?? "?"
          const y = p.average_y ?? p.y ?? "?"
          const team = fixEncoding(p.team_name ?? p.team ?? "")
          return `${name}${team ? ` (${team})` : ""}: x=${x} y=${y}`
        }).join("\n")
      })()

      bzzoiroBlock = [
        `[DATA & STATISTIK TERVERIFIKASI — Bzzoiro Sports Data API]`,
        `PERTANDINGAN: ${home} vs ${away}`,
        `Liga/Kompetisi: ${upcoming.league_name ?? upcoming.league ?? "-"}`,
        `Tanggal & Waktu: ${upcoming.event_date ?? "-"}`,
        upcoming.venue ? `Venue: ${fixEncoding(upcoming.venue)}` : "",
        predList
          ? `\nWIN PROBABILITY & ODDS:\n${predList}`
          : "\n(Win probability & odds belum tersedia.)",
        oddsCompList ? `\nPERBANDINGAN ODDS (14 Bookmaker):\n${oddsCompList}` : "",
        lineupList   ? `\nPREDIKTED LINEUP:\n${lineupList}` : "",
        avgPosList   ? `\nPOSISI RATA-RATA PEMAIN:\n${avgPosList}` : "",
        h2hList ? `\nH2H 5 PERTANDINGAN TERAKHIR:\n${h2hList}` : "",
        `\nFORM 5 LAGA — ${home}:\n${homeFormStr}`,
        `\nFORM 5 LAGA — ${away}:\n${awayFormStr}`,
        standingsBlock ? `\nKLASEMEN:\n${standingsBlock}` : "",
      ].filter(Boolean).join("\n")

      meta.eventId = eventId
      meta.home    = home
      meta.away    = away
    }
  } catch (err) {
    warnings.push(`Bzzoiro gagal mengambil data preview: ${err instanceof Error ? err.message : "error tidak diketahui"}.`)
  }

  if (!bzzoiroBlock.trim()) {
    return {
      contextText: "",
      meta,
      warning: warnings.length > 0 ? warnings.join(" | ") : `Tidak ditemukan data Bzzoiro untuk "${topic}".`,
    }
  }
  return { contextText: bzzoiroBlock, meta, warning: warnings.length > 0 ? warnings.join(" | ") : undefined }
}

// ─── Helpers untuk CEDERA & TRANSFER: profil + statistik ringkas pemain ──────
async function fetchPlayerProfile(playerQuery: string): Promise<any | null> {
  try {
    const json = await bzzFetch(`/api/players/?search=${encodeURIComponent(playerQuery)}&limit=5`)
    const players = json.results ?? (Array.isArray(json) ? json : [])
    return players.length > 0 ? players[0] : null
  } catch {
    return null
  }
}

async function fetchPlayerRecentStats(playerId: number): Promise<any[]> {
  try {
    const json = await bzzFetch(
      `/api/player-stats/?player=${playerId}&limit=5&ordering=-event__event_date`
    )
    return json.results ?? (Array.isArray(json) ? json : [])
  } catch {
    return []
  }
}

// ─── INJURY UPDATE ────────────────────────────────────────────────────────────
// Ambil: profil lengkap pemain (/api/players/ — usia, posisi, klub, foto),
// statistik performa sebelum cedera (/api/player-stats/ — xG, xA, passes, dll),
// predicted_lineup tanpa pemain yang cedera, pertandingan yang terdampak
// (/events/?status=upcoming), pergeseran odds akibat absensi (/predictions/).
// JANGAN: xG per pertandingan detail, seluruh statistik historis.
export async function fetchCederaContext(topic: string): Promise<BzzoiroContextResult> {
  const lines: string[] = []
  const meta: Record<string, unknown> = {}
  const warnings: string[] = []

  try {
    const playerProfile = await fetchPlayerProfile(topic)
    if (playerProfile) {
      const playerName  = fixEncoding(playerProfile.player_name ?? playerProfile.name ?? topic)
      const position    = fixEncoding(playerProfile.position ?? "-")
      const nationality = fixEncoding(playerProfile.nationality ?? "-")
      const team        = fixEncoding(playerProfile.team_name ?? playerProfile.team ?? "-")
      const age         = playerProfile.age ?? playerProfile.date_of_birth ?? "-"

      lines.push("[DATA PEMAIN — Bzzoiro Sports Data API]")
      lines.push(`Nama: ${playerName}`)
      lines.push(`Tim: ${team}`)
      lines.push(`Posisi: ${position}`)
      lines.push(`Kebangsaan: ${nationality}`)
      if (age !== "-") lines.push(`Usia/Lahir: ${age}`)
      lines.push("")

      meta.playerFound = true
      meta.playerName  = playerName
      meta.team        = team

      // Foto resmi pemain — untuk artikel cedera (/img/player/{id}/)
      const playerId = playerProfile.id
      if (playerId) {
        lines.push(`Foto Resmi: ${BZZOIRO_BASE}/img/player/${playerId}/`)
      }
      lines.push("")

      if (playerId) {
        const recentStats = await fetchPlayerRecentStats(playerId)
        if (recentStats.length > 0) {
          lines.push("STATISTIK SEBELUM CEDERA — 5 LAGA TERAKHIR (xG, xA, menit, gol, assist):")
          recentStats.forEach((s: any) => {
            const matchLabel = [
              fixEncoding(s.home_team ?? s.event?.home_team ?? ""),
              "vs",
              fixEncoding(s.away_team ?? s.event?.away_team ?? ""),
              (s.event_date ?? s.event?.event_date) ? `(${s.event_date ?? s.event?.event_date})` : "",
            ].filter(Boolean).join(" ")

            const minutes = s.minutes_played ?? "?"
            const statParts = [
              s.goals   != null ? `gol: ${s.goals}`     : null,
              s.assists != null ? `assist: ${s.assists}` : null,
              s.rating  != null ? `rating: ${s.rating}` : null,
            ].filter(Boolean).join(", ")

            lines.push(
              `  • ${matchLabel || "(laga tidak diketahui)"} — ` +
              `${minutes === 0 ? "TIDAK BERMAIN" : `${minutes} menit`}` +
              `${statParts ? ` (${statParts})` : ""}`
            )
          })
          meta.statsMatchesCount = recentStats.length
        } else {
          lines.push("  (Statistik pemain belum tersedia di Bzzoiro.)")
        }

        // Pertandingan mendatang yang terdampak + predicted_lineup tanpa pemain ini
        try {
          const teamQuery = team !== "-" ? team : topic
          const upcomingEvents = await findEvent(teamQuery, { upcoming: true })
          const nextMatches = upcomingEvents
            .filter((e: any) => {
              const h = fixEncoding(e.home_team ?? "").toLowerCase()
              const a = fixEncoding(e.away_team ?? "").toLowerCase()
              return teamQuery.toLowerCase().split(" ").some((w: string) => w.length > 2 && (h.includes(w) || a.includes(w)))
            })
            .slice(0, 2)

          if (nextMatches.length > 0) {
            lines.push("")
            lines.push("PERTANDINGAN YANG TERDAMPAK:")
            for (const e of nextMatches) {
              const h  = fixEncoding(e.home_team ?? "")
              const a  = fixEncoding(e.away_team ?? "")
              const lg = fixEncoding(e.league_name ?? e.league ?? "")
              lines.push(`  • ${h} vs ${a} — ${e.event_date ?? "-"}${lg ? ` [${lg}]` : ""}`)

              if (e.id) {
                // Predicted lineup (proyeksi tanpa pemain cedera)
                const [lineupRaw, predsRaw] = await Promise.all([
                  bzzFetch(`/api/v2/events/${e.id}/predicted_lineup/`).catch(() => null),
                  bzzFetch(`/api/v2/predictions/?event=${e.id}`).catch(() => null),
                ])

                const lineupData = lineupRaw?.lineup ?? lineupRaw?.predicted_lineup ?? lineupRaw?.results ?? (Array.isArray(lineupRaw) ? lineupRaw : [])
                if (lineupData.length > 0) {
                  const starters = lineupData.filter((p: any) => !p.is_substitute && !p.substitute).slice(0, 11)
                  const playerNames = starters.map((p: any) => fixEncoding(p.player_name ?? p.name ?? "")).filter(Boolean)
                  lines.push(`    Predicted XI: ${playerNames.join(", ")}`)

                  // Cek apakah pemain cedera ada di lineup prediksi — seharusnya tidak
                  const inLineup = playerNames.some((n: string) => n.toLowerCase().includes(playerName.toLowerCase().split(" ").slice(-1)[0]))
                  if (!inLineup) lines.push(`    ✓ ${playerName} tidak ada di predicted lineup`)
                }

                // Pergeseran odds akibat absensi
                const predsData = predsRaw?.results ?? (Array.isArray(predsRaw) ? predsRaw : predsRaw ? [predsRaw] : [])
                if (predsData.length > 0) {
                  const p = predsData[0]
                  const hw = p.home_win_prob ?? p.home_win ?? null
                  const dp = p.draw_prob ?? p.draw ?? null
                  const aw = p.away_win_prob ?? p.away_win ?? null
                  if (hw != null) lines.push(`    Win probability: H ${hw}% / S ${dp ?? "?"}% / A ${aw ?? "?"}%`)
                }
              }
            }
          }
        } catch {
          // upcoming fixtures gagal — tidak kritis
        }
      }
    } else {
      warnings.push(`Profil pemain "${topic}" tidak ditemukan di Bzzoiro.`)
      meta.playerFound = false
    }
  } catch (err) {
    warnings.push(`Gagal mengambil profil pemain: ${err instanceof Error ? err.message : "error tidak diketahui"}.`)
    meta.playerFound = false
  }

  const contextText = lines.join("\n")
  if (!contextText.trim()) {
    return {
      contextText: "",
      meta,
      warning: warnings.length > 0 ? warnings.join(" | ") : `Tidak ditemukan data Bzzoiro untuk "${topic}".`,
    }
  }
  return { contextText, meta, warning: warnings.length > 0 ? warnings.join(" | ") : undefined }
}

// ─── TRANSFER RUMOR — Data profil pemain dari Bzzoiro ────────────────────────
// Ambil: profil lengkap + market value (/api/players/), statistik performa musim
// berjalan (/api/player-stats/), URL foto resmi (/img/player/{id}/),
// data tim asal (/api/teams/), konteks kompetisi (/api/leagues/).
// JANGAN: statistik detail per pertandingan, lineup, xG per laga.
export async function fetchTransferContext(topic: string): Promise<BzzoiroContextResult> {
  const lines: string[] = []
  const meta: Record<string, unknown> = {}
  const warnings: string[] = []

  try {
    const playerProfile = await fetchPlayerProfile(topic)

    if (!playerProfile) {
      warnings.push(`Profil pemain "${topic}" tidak ditemukan di Bzzoiro.`)
      return { contextText: "", meta, warning: warnings.join(" | ") }
    }

    const playerName  = fixEncoding(playerProfile.player_name ?? playerProfile.name ?? topic)
    const position    = fixEncoding(playerProfile.position ?? "-")
    const nationality = fixEncoding(playerProfile.nationality ?? "-")
    const team        = fixEncoding(playerProfile.team_name ?? playerProfile.team ?? "-")
    const age         = playerProfile.age ?? "-"
    const marketValue = playerProfile.market_value
      ? `€${playerProfile.market_value.toLocaleString()}`
      : "-"

    lines.push("[DATA PEMAIN — Bzzoiro Sports Data API]")
    lines.push(`Nama: ${playerName}`)
    lines.push(`Tim Saat Ini: ${team}`)
    lines.push(`Posisi: ${position}`)
    lines.push(`Kebangsaan: ${nationality}`)
    if (age !== "-")         lines.push(`Umur: ${age}`)
    if (marketValue !== "-") lines.push(`Nilai Pasar: ${marketValue}`)
    lines.push("")

    meta.playerFound = true
    meta.playerName  = playerName
    meta.team        = team

    const playerId = playerProfile.id
    if (playerId) {
      // Foto resmi pemain dan data tim asal — fetch paralel
      const teamId = playerProfile.team_id ?? playerProfile.team
      const [recentStats, teamRaw] = await Promise.all([
        fetchPlayerRecentStats(playerId),
        teamId
          ? bzzFetch(`/api/teams/${teamId}/`).catch(() => null)
          : Promise.resolve(null),
      ])

      // URL foto resmi (/img/player/{id}/) — untuk konteks visual artikel
      const photoUrl = `${BZZOIRO_BASE}/img/player/${playerId}/`
      lines.push(`Foto Resmi: ${photoUrl}`)

      // Data tim asal
      if (teamRaw) {
        const teamName    = fixEncoding(teamRaw.name ?? teamRaw.team_name ?? "")
        const teamLeague  = fixEncoding(teamRaw.league_name ?? teamRaw.league ?? "")
        const teamCountry = fixEncoding(teamRaw.country ?? "")
        if (teamName) {
          lines.push("")
          lines.push(`TIM ASAL: ${teamName}${teamLeague ? ` — ${teamLeague}` : ""}${teamCountry ? ` (${teamCountry})` : ""}`)
        }
      }
      lines.push("")

      if (recentStats.length > 0) {
        const totalMinutes = recentStats.reduce((acc, s) => acc + (s.minutes_played ?? 0), 0)
        const totalGoals   = recentStats.reduce((acc, s) => acc + (s.goals ?? 0), 0)
        const totalAssists = recentStats.reduce((acc, s) => acc + (s.assists ?? 0), 0)
        const avgRating    = recentStats.filter((s) => s.rating != null).length > 0
          ? (recentStats.reduce((acc, s) => acc + (s.rating ?? 0), 0) /
             recentStats.filter((s) => s.rating != null).length).toFixed(1)
          : "-"

        lines.push(`STATISTIK MUSIM INI (dari 5 laga terakhir yang tersedia):`)
        lines.push(`Total menit: ${totalMinutes} | Gol: ${totalGoals} | Assist: ${totalAssists} | Rating rata-rata: ${avgRating}`)
        lines.push("")
        lines.push("5 PERTANDINGAN TERAKHIR:")
        recentStats.forEach((s: any) => {
          const matchLabel = [
            fixEncoding(s.home_team ?? s.event?.home_team ?? ""),
            "vs",
            fixEncoding(s.away_team ?? s.event?.away_team ?? ""),
            (s.event_date ?? s.event?.event_date) ? `(${s.event_date ?? s.event?.event_date})` : "",
          ].filter(Boolean).join(" ")

          const minutes = s.minutes_played ?? "?"
          const statParts = [
            s.goals   != null ? `gol: ${s.goals}`     : null,
            s.assists != null ? `assist: ${s.assists}` : null,
            s.rating  != null ? `rating: ${s.rating}` : null,
          ].filter(Boolean).join(", ")

          lines.push(
            `  • ${matchLabel || "(laga tidak diketahui)"} — ` +
            `${minutes} menit${statParts ? ` (${statParts})` : ""}`
          )
        })
      } else {
        lines.push("  (Statistik pertandingan pemain belum tersedia di Bzzoiro.)")
      }
    }
  } catch (err) {
    warnings.push(`Gagal mengambil data pemain dari Bzzoiro: ${err instanceof Error ? err.message : "error tidak diketahui"}.`)
  }

  const contextText = lines.join("\n")
  return { contextText, meta, warning: warnings.length > 0 ? warnings.join(" | ") : undefined }
}

// ─── KONFERENSI PERS — Data tim dari Bzzoiro ─────────────────────────────────
// Ambil: fixture mendatang (/events/?status=upcoming), profil pemain yang disebut
// (/api/players/), squad data (status cedera & ketersediaan pemain), odds/ekspektasi
// (/events/{id}/odds/), form 5 laga, klasemen.
// Bzzoiro HANYA sebagai data konteks — narasi utama dari Serper & Tavily.
export async function fetchKonpersContext(topic: string): Promise<BzzoiroContextResult> {
  const lines: string[] = []
  const meta: Record<string, unknown> = {}
  const warnings: string[] = []

  try {
    // Ambil 5 laga terakhir tim dari events
    const { teamA, namesForMatching } = extractTeamNames(topic)
    const events = await findEvent(teamA || topic, { upcoming: false })
    const finished = events
      .filter((e) => (e.status ?? "").toLowerCase() === "finished")
      .filter((e) => eventMatchesTeams(e, namesForMatching))
      .slice(0, 5)

    if (finished.length === 0) {
      warnings.push(`Tidak ditemukan pertandingan terbaru untuk "${topic}" (dicari: ${teamA}) di Bzzoiro.`)
      return { contextText: "", meta, warning: warnings.join(" | ") }
    }

    // Cari nama tim yang cocok sebagai home/away sesuai query
    const matchName = (t: string) => namesForMatching.some((n) => t.toLowerCase().includes(n))
    const teamName = fixEncoding(
      finished
        .map((e: any) => [e.home_team, e.away_team])
        .flat()
        .find((t: string) => matchName(fixEncoding(t ?? "")))
      ?? finished[0].home_team
      ?? finished[0].away_team
      ?? topic
    )

    lines.push("[DATA TIM — Bzzoiro Sports Data API]")
    lines.push(`Tim: ${teamName}`)
    lines.push("")

    // Posisi klasemen dari standings API
    try {
      const leagueId = finished[0]?.league_id ?? finished[0]?.league
      if (leagueId) {
        const standings = await bzzFetch(`/api/v2/standings/?league=${leagueId}&limit=25`).catch(() => null)
        const table: any[] = standings?.results ?? standings?.standings ?? (Array.isArray(standings) ? standings : [])
        const teamRow = table.find((row: any) =>
          matchName(fixEncoding(row.team_name ?? row.team ?? ""))
        )
        if (teamRow) {
          const pos = teamRow.position ?? teamRow.rank ?? "-"
          const pts = teamRow.points ?? "-"
          const played = teamRow.played ?? teamRow.matches_played ?? "-"
          const w = teamRow.won ?? teamRow.wins ?? "-"
          const d = teamRow.drawn ?? teamRow.draws ?? "-"
          const l = teamRow.lost ?? teamRow.losses ?? "-"
          lines.push(`POSISI KLASEMEN: ${pos} | Main: ${played} | M: ${w} S: ${d} K: ${l} | Poin: ${pts}`)
          lines.push("")
        }
      }
    } catch {
      // standings gagal — lanjut tanpa klasemen
    }

    // Form 5 laga — hasil W/D/L + skor
    lines.push("FORM 5 LAGA TERAKHIR:")
    finished.forEach((e: any) => {
      const home      = fixEncoding(e.home_team ?? "")
      const away      = fixEncoding(e.away_team ?? "")
      const homeScore = e.home_score ?? 0
      const awayScore = e.away_score ?? 0
      const date      = e.event_date ?? "-"
      const isHome    = matchName(home)
      let result = "?"
      if (isHome) {
        result = homeScore > awayScore ? "M" : homeScore < awayScore ? "K" : "S"
      } else {
        result = awayScore > homeScore ? "M" : awayScore < homeScore ? "K" : "S"
      }
      lines.push(`  • [${result}] ${home} ${homeScore} - ${awayScore} ${away} (${date})`)
    })

    // Fixture mendatang yang kemungkinan dibahas dalam preskon
    try {
      const upcomingEvents = await findEvent(teamA || topic, { upcoming: true })
      const nextMatches = upcomingEvents
        .filter((e: any) => eventMatchesTeams(e, namesForMatching))
        .slice(0, 3)
      if (nextMatches.length > 0) {
        lines.push("")
        lines.push("FIXTURE MENDATANG (konteks preskon):")
        for (const e of nextMatches) {
          const h  = fixEncoding(e.home_team ?? "")
          const a  = fixEncoding(e.away_team ?? "")
          const lg = fixEncoding(e.league_name ?? e.league ?? "")
          lines.push(`  • ${h} vs ${a} — ${e.event_date ?? "-"}${lg ? ` [${lg}]` : ""}`)

          // Odds/ekspektasi untuk fixture mendatang itu
          if (e.id) {
            const oddsRaw = await bzzFetch(`/api/v2/events/${e.id}/odds/`).catch(() => null)
            const oddsData = oddsRaw?.odds ?? oddsRaw?.results ?? (Array.isArray(oddsRaw) ? oddsRaw : [])
            if (oddsData.length > 0) {
              const o = oddsData[0]
              const h_o = o.home ?? o.odds_home ?? "?"
              const d_o = o.draw ?? o.odds_draw ?? "?"
              const a_o = o.away ?? o.odds_away ?? "?"
              lines.push(`    Odds: H ${h_o} / S ${d_o} / A ${a_o}`)
            }
          }
        }
      }
    } catch {
      // fixture mendatang gagal — tidak kritis untuk konpers
    }

    meta.teamName      = teamName
    meta.recentMatches = finished.length
  } catch (err) {
    warnings.push(`Bzzoiro gagal mengambil data tim: ${err instanceof Error ? err.message : "error tidak diketahui"}.`)
  }

  const contextText = lines.join("\n")
  return { contextText, meta, warning: warnings.length > 0 ? warnings.join(" | ") : undefined }
}

// ─── TRIVIA — Kedalaman database Bzzoiro: 62k+ pemain, 139k+ statistik, 66 liga ──
//
// Ini adalah use case TERKUAT Bzzoiro. xG per-shot unik bisa menghasilkan
// narasi seperti: "Peluang 0.94 xG yang terbuang di menit ke-89 — terbesar musim ini".
//
// Ambil: player stats historis, per-shot xG, head-to-head lintas musim, liga global.
// Topik bisa berupa: nama pemain, nama tim, nama liga, atau fakta spesifik.
export async function fetchTriviaContext(topic: string): Promise<BzzoiroContextResult> {
  const lines: string[] = []
  const meta: Record<string, unknown> = {}
  const warnings: string[] = []

  try {
    const { teamA, teamB, namesForMatching } = extractTeamNames(topic)

    // ── Coba deteksi apakah topik adalah pemain atau tim ──────────────────────
    const playerProfile = await fetchPlayerProfile(topic).catch(() => null)

    if (playerProfile) {
      // PEMAIN — ambil profil + statistik historis lintas musim
      const playerName  = fixEncoding(playerProfile.player_name ?? playerProfile.name ?? topic)
      const position    = fixEncoding(playerProfile.position ?? "-")
      const team        = fixEncoding(playerProfile.team_name ?? playerProfile.team ?? "-")
      const age         = playerProfile.age ?? "-"
      const marketValue = playerProfile.market_value
        ? `€${playerProfile.market_value.toLocaleString()}`
        : "-"

      lines.push("[DATA PEMAIN — Bzzoiro Sports Data API]")
      lines.push(`Nama: ${playerName}`)
      lines.push(`Tim: ${team}`)
      lines.push(`Posisi: ${position}`)
      if (age !== "-")         lines.push(`Usia: ${age}`)
      if (marketValue !== "-") lines.push(`Nilai Pasar: ${marketValue}`)
      lines.push("")

      meta.type       = "player"
      meta.playerName = playerName

      // Statistik per match — 139k+ records, ambil 10 terbaru untuk konteks
      const playerId = playerProfile.id
      if (playerId) {
        const recentStats = await bzzFetch(
          `/api/player-stats/?player=${playerId}&limit=10&ordering=-event__event_date`
        ).catch(() => null)

        const statList = recentStats?.results ?? (Array.isArray(recentStats) ? recentStats : [])
        if (statList.length > 0) {
          const totalMinutes = statList.reduce((acc: number, s: any) => acc + (s.minutes_played ?? 0), 0)
          const totalGoals   = statList.reduce((acc: number, s: any) => acc + (s.goals ?? 0), 0)
          const totalAssists = statList.reduce((acc: number, s: any) => acc + (s.assists ?? 0), 0)
          const ratingsArr   = statList.filter((s: any) => s.rating != null)
          const avgRating    = ratingsArr.length > 0
            ? (ratingsArr.reduce((acc: number, s: any) => acc + s.rating, 0) / ratingsArr.length).toFixed(2)
            : "-"

          // per-shot xG — fakta trivia paling unik dari Bzzoiro
          const bestXgShot = statList
            .flatMap((s: any) => s.shots ?? [])
            .filter((sh: any) => sh?.xg != null)
            .sort((a: any, b: any) => (b.xg ?? 0) - (a.xg ?? 0))[0]

          lines.push(`STATISTIK DARI ${statList.length} LAGA TERSEDIA:`)
          lines.push(`Total menit: ${totalMinutes} | Gol: ${totalGoals} | Assist: ${totalAssists} | Rating rata-rata: ${avgRating}`)
          if (bestXgShot) {
            lines.push(`Peluang xG tertinggi: ${bestXgShot.xg} xG (menit ${bestXgShot.minute ?? "?"}, koordinat x:${bestXgShot.x ?? "?"} y:${bestXgShot.y ?? "?"})`)
          }
          lines.push("")

          lines.push("RINCIAN 10 LAGA TERAKHIR:")
          statList.forEach((s: any) => {
            const matchLabel = [
              fixEncoding(s.home_team ?? s.event?.home_team ?? ""),
              "vs",
              fixEncoding(s.away_team ?? s.event?.away_team ?? ""),
              (s.event_date ?? s.event?.event_date) ? `(${s.event_date ?? s.event?.event_date})` : "",
            ].filter(Boolean).join(" ")

            const minutes = s.minutes_played ?? "?"
            const statParts = [
              s.goals   != null ? `gol: ${s.goals}`     : null,
              s.assists != null ? `assist: ${s.assists}` : null,
              s.rating  != null ? `rating: ${s.rating}` : null,
            ].filter(Boolean).join(", ")

            lines.push(
              `  • ${matchLabel || "(laga tidak diketahui)"} — ` +
              `${minutes === 0 ? "TIDAK BERMAIN" : `${minutes} menit`}` +
              `${statParts ? ` (${statParts})` : ""}`
            )
          })
          meta.statsCount = statList.length
        } else {
          lines.push("  (Statistik historis pemain tidak tersedia.)")
        }
      }

    } else {
      // TIM / LIGA — ambil head-to-head historis + pertandingan terakhir
      lines.push("[DATA TIM/LIGA — Bzzoiro Sports Data API]")
      lines.push(`Query: ${topic}`)
      lines.push("")

      meta.type = "team"

      // Head-to-head historis lintas musim (66 liga × 68k+ match)
      const h2hRaw = await bzzFetch(
        `/api/v2/events/?search=${encodeURIComponent(teamA)}&limit=30&ordering=-event_date`
      ).catch(() => null)

      const allEvents: any[] = h2hRaw?.results ?? (Array.isArray(h2hRaw) ? h2hRaw : [])
      const finished = allEvents.filter((e: any) => (e.status ?? "").toLowerCase() === "finished")

      if (finished.length > 0) {
        // H2H jika ada dua tim
        if (teamB) {
          const h2hMatches = finished.filter((e: any) => {
            const h = fixEncoding(e.home_team ?? "").toLowerCase()
            const a = fixEncoding(e.away_team ?? "").toLowerCase()
            return namesForMatching.some((n) => h.includes(n) || a.includes(n))
          }).slice(0, 10)

          if (h2hMatches.length > 0) {
            lines.push(`HEAD-TO-HEAD HISTORIS (${teamA} vs ${teamB}):`)
            let hw = 0, aw = 0, draws = 0
            h2hMatches.forEach((e: any) => {
              const h = fixEncoding(e.home_team ?? "")
              const a = fixEncoding(e.away_team ?? "")
              const hs = e.home_score ?? 0
              const as_ = e.away_score ?? 0
              const lg = fixEncoding(e.league_name ?? e.league ?? "")
              if (hs > as_) hw++; else if (as_ > hs) aw++; else draws++
              lines.push(`  • ${h} ${hs} - ${as_} ${a} (${e.event_date ?? "-"})${lg ? ` [${lg}]` : ""}`)
            })
            lines.push(`Rekor: ${teamA} ${hw} menang | ${draws} imbang | ${teamB} ${aw} menang`)
            lines.push("")
            meta.h2hCount = h2hMatches.length
          }
        }

        // 10 pertandingan terakhir tim dengan per-shot xG jika ada
        const recentMatches = finished.slice(0, 10)
        lines.push(`10 PERTANDINGAN TERAKHIR — ${teamA}:`)
        for (const e of recentMatches) {
          const h   = fixEncoding(e.home_team ?? "")
          const a   = fixEncoding(e.away_team ?? "")
          const hs  = e.home_score ?? 0
          const as_ = e.away_score ?? 0
          const lg  = fixEncoding(e.league_name ?? e.league ?? "")
          lines.push(`  • ${h} ${hs} - ${as_} ${a} (${e.event_date ?? "-"})${lg ? ` [${lg}]` : ""}`)
        }
        lines.push("")
        meta.matchCount = recentMatches.length

        // Coba ambil stats dari pertandingan terbaru untuk xG unik
        const latestEventId = finished[0]?.id
        if (latestEventId) {
          const latestStats = await bzzFetch(`/api/v2/events/${latestEventId}/stats/`).catch(() => null)
          if (latestStats) {
            const xgH = latestStats.xg_home ?? latestStats.xg?.home
            const xgA = latestStats.xg_away ?? latestStats.xg?.away
            if (xgH != null && xgA != null) {
              lines.push(`xG pertandingan terakhir: ${fixEncoding(finished[0].home_team ?? "")} ${xgH} — ${fixEncoding(finished[0].away_team ?? "")} ${xgA}`)
            }
          }
        }
      } else {
        warnings.push(`Tidak ditemukan data pertandingan untuk "${topic}" di Bzzoiro.`)
      }

      // Data liga jika topik adalah nama liga
      const leagueRaw = await bzzFetch(
        `/api/v2/leagues/?search=${encodeURIComponent(teamA)}&limit=5`
      ).catch(() => null)

      const leagues: any[] = leagueRaw?.results ?? (Array.isArray(leagueRaw) ? leagueRaw : [])
      if (leagues.length > 0) {
        lines.push(`\nDATA LIGA (Bzzoiro — 66 liga global):`)
        leagues.slice(0, 3).forEach((lg: any) => {
          lines.push(`  • ${fixEncoding(lg.name ?? "")} (${fixEncoding(lg.country ?? "")}) — ID: ${lg.id}`)
        })
      }
    }

  } catch (err) {
    warnings.push(`Bzzoiro gagal mengambil data trivia: ${err instanceof Error ? err.message : "error tidak diketahui"}.`)
  }

  const contextText = lines.join("\n")
  if (!contextText.trim()) {
    return {
      contextText: "",
      meta,
      warning: warnings.length > 0 ? warnings.join(" | ") : `Tidak ditemukan data Bzzoiro untuk trivia "${topic}".`,
    }
  }
  return { contextText, meta, warning: warnings.length > 0 ? warnings.join(" | ") : undefined }
}

// ─── Alias untuk kompatibilitas ───────────────────────────────────────────────
export const fetchCederaSignalContext = fetchCederaContext
