// lib/news-context/bzzoiro.ts
//
// Sumber konteks untuk tipe berita: HASIL PERTANDINGAN, PREVIEW PERTANDINGAN,
// dan INJURY UPDATE — menggunakan Bzzoiro Sports Data API (sports.bzzoiro.com),
// API yang sebelumnya HANYA dipakai untuk jadwal & standing (lihat
// app/api/live-scores/route.ts dan app/api/standings/route.ts).
//
// Tujuannya: minimalkan halusinasi AI dengan mengirim FAKTA NYATA dari API
// (skor, menit gol, kartu, statistik, lineup, prediksi, H2H) sebagai konteks,
// bukan mengandalkan admin mengetik manual atau Gemini "mengarang" detail.
//
// ━━━ INJURY UPDATE — HYBRID Bzzoiro + Tavily ━━━
// Bzzoiro TIDAK punya endpoint khusus data cedera/injury pemain. Resource yang
// tersedia di API ini hanya: leagues, teams, events (match detail/lineup/
// incidents/stats/odds/predictions), live, players, player-stats, managers,
// venues — TIDAK ADA endpoint "injuries".
//
// Karena itu, fetchCederaContext menggabungkan DUA sumber:
//   1. Bzzoiro /api/players/        → profil pemain (posisi, kebangsaan, nilai pasar)
//   2. Bzzoiro /api/player-stats/   → statistik 5 laga terakhir (menit main, gol,
//                                     assist, xG, rating, tackles)
//   3. Fallback: event player-stats → cek kehadiran dari match events jika player
//                                     ID tidak ditemukan (perilaku lama)
//   4. Tavily Search (3 hari)       → berita cedera resmi: jenis cedera, estimasi
//                                     absen, pernyataan pelatih/dokter tim
//
// Catatan API key:
// - BZZOIRO_API_KEY → sudah dikonfigurasi sebelumnya untuk live-scores & standings,
//   dipakai ulang di sini untuk generate artikel.

const BZZOIRO_BASE = "https://sports.bzzoiro.com"

export interface BzzoiroContextResult {
  contextText: string
  meta: Record<string, unknown>
  warning?: string
}

// ─── Fetch helper (pola sama dengan live-scores/standings route) ──────────
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
    console.error(`❌ bzzFetch [article-context] error ${res.status} — path: ${path} — body: ${body.slice(0, 300)}`)
    throw new Error(`Bzzoiro API error ${res.status} pada ${path}`)
  }
  const json = await res.json()
  console.log(`✅ bzzFetch [article-context] ${path} — preview: ${JSON.stringify(json).slice(0, 200)}`)
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

// ─── Cari event/match berdasarkan nama tim (untuk resolve eventId dari topic) ─
// Topic dari admin berbentuk teks bebas ("Barcelona vs Atletico Madrid"),
// jadi kita cari event terbaru/terdekat yang melibatkan tim-tim tersebut.
async function findEvent(teamQuery: string, opts: { upcoming?: boolean } = {}) {
  const today = new Date()
  const past = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000)
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

// ─── HASIL PERTANDINGAN ─────────────────────────────────────────────────────
// Ambil skor akhir, statistik per tim, dan insiden (gol/kartu/subs) dari
// Bzzoiro untuk pertandingan yang sudah selesai (status: finished).
export async function fetchHasilContext(topic: string): Promise<BzzoiroContextResult> {
  const events = await findEvent(topic, { upcoming: false })
  const finished = events.find((e) => (e.status ?? "").toLowerCase() === "finished") ?? events[0]

  if (!finished) {
    return {
      contextText: "",
      meta: {},
      warning: `Tidak ditemukan pertandingan yang cocok dengan "${topic}" di Bzzoiro dalam 4 hari terakhir. Lengkapi konteks secara manual.`,
    }
  }

  const eventId = finished.id
  const [stats, incidents] = await Promise.all([
    bzzFetch(`/api/v2/events/${eventId}/stats/`).catch(() => null),
    bzzFetch(`/api/v2/events/${eventId}/incidents/`).catch(() => null),
  ])

  const home = fixEncoding(finished.home_team ?? "")
  const away = fixEncoding(finished.away_team ?? "")
  const scoreLine = `${home} ${finished.home_score ?? 0} - ${finished.away_score ?? 0} ${away}`

  const incidentList = (incidents?.incidents ?? incidents?.results ?? (Array.isArray(incidents) ? incidents : []))
    .map((inc: any) => {
      const minute = inc.minute ?? inc.time ?? "?"
      const type = inc.type ?? inc.incident_type ?? ""
      const player = fixEncoding(inc.player_name ?? inc.player ?? "")
      const team = fixEncoding(inc.team_name ?? inc.team ?? "")
      return `Menit ${minute}' — ${type} — ${player}${team ? ` (${team})` : ""}`
    })
    .join("\n")

  const statLines = stats
    ? Object.entries(stats)
        .filter(([k]) => !["id", "event_id"].includes(k))
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n")
    : ""

  const contextText = [
    `SKOR AKHIR: ${scoreLine}`,
    `Liga/Kompetisi: ${finished.league_name ?? finished.league ?? "-"}`,
    `Tanggal: ${finished.event_date ?? "-"}`,
    incidentList ? `\nINSIDEN PERTANDINGAN (gol/kartu/subs):\n${incidentList}` : "",
    statLines ? `\nSTATISTIK PERTANDINGAN:\n${statLines}` : "",
  ].filter(Boolean).join("\n")

  return {
    contextText,
    meta: { eventId, home, away, score: scoreLine },
  }
}

// ─── PREVIEW PERTANDINGAN ───────────────────────────────────────────────────
// Ambil jadwal pertandingan mendatang + prediksi ML Bzzoiro + (jika tersedia)
// data H2H/lineup yang menyertai match detail.
export async function fetchPreviewContext(topic: string): Promise<BzzoiroContextResult> {
  const events = await findEvent(topic, { upcoming: true })
  const upcoming = events.find((e) => (e.status ?? "").toLowerCase() !== "finished") ?? events[0]

  if (!upcoming) {
    return {
      contextText: "",
      meta: {},
      warning: `Tidak ditemukan pertandingan mendatang yang cocok dengan "${topic}" di Bzzoiro dalam 7 hari ke depan. Lengkapi konteks secara manual.`,
    }
  }

  const eventId = upcoming.id
  const predictions = await bzzFetch(`/api/v2/predictions/?event=${eventId}`).catch(() => null)

  const home = fixEncoding(upcoming.home_team ?? "")
  const away = fixEncoding(upcoming.away_team ?? "")

  const predList = predictions
    ? (predictions.results ?? (Array.isArray(predictions) ? predictions : [predictions]))
        .map((p: any) =>
          [
            p.market ? `Market: ${p.market}` : "",
            p.home_win_prob != null ? `Prob. ${home} menang: ${p.home_win_prob}%` : "",
            p.draw_prob != null ? `Prob. Seri: ${p.draw_prob}%` : "",
            p.away_win_prob != null ? `Prob. ${away} menang: ${p.away_win_prob}%` : "",
            p.predicted_score ? `Skor prediksi: ${p.predicted_score}` : "",
            p.btts_prob != null ? `Prob. BTTS: ${p.btts_prob}%` : "",
          ].filter(Boolean).join(" | ")
        )
        .join("\n")
    : ""

  const contextText = [
    `PERTANDINGAN: ${home} vs ${away}`,
    `Liga/Kompetisi: ${upcoming.league_name ?? upcoming.league ?? "-"}`,
    `Tanggal & Waktu: ${upcoming.event_date ?? "-"}`,
    upcoming.venue ? `Venue: ${fixEncoding(upcoming.venue)}` : "",
    predList ? `\nPREDIKSI ML (CatBoost, Bzzoiro):\n${predList}` : "\n(Prediksi ML belum tersedia untuk laga ini di Bzzoiro.)",
  ].filter(Boolean).join("\n")

  return {
    contextText,
    meta: { eventId, home, away },
  }
}

// ─── Cari profil pemain dari Bzzoiro /api/players/ ───────────────────────────
async function fetchPlayerProfile(playerQuery: string): Promise<any | null> {
  try {
    const json = await bzzFetch(
      `/api/players/?search=${encodeURIComponent(playerQuery)}&limit=5`
    )
    const players = json.results ?? (Array.isArray(json) ? json : [])
    if (players.length === 0) return null
    return players[0]
  } catch {
    return null
  }
}

// ─── Ambil statistik per match dari Bzzoiro /api/player-stats/ ───────────────
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

// ─── Fallback: cek kehadiran pemain dari event player-stats ──────────────────
async function fetchPlayerStatsFromEvents(
  events: any[],
  playerNameQuery: string,
): Promise<{ matchLabel: string; minutesPlayed: string | number; stats: string }[]> {
  const recentFinished = events
    .filter((e) => (e.status ?? "").toLowerCase() === "finished")
    .slice(0, 5)

  const statsPerMatch = await Promise.all(
    recentFinished.map((e) =>
      bzzFetch(`/api/v2/events/${e.id}/player-stats/`).catch(() => null)
    )
  )

  const results: { matchLabel: string; minutesPlayed: string | number; stats: string }[] = []
  const firstName = playerNameQuery.toLowerCase().split(" ")[0]

  recentFinished.forEach((e, idx) => {
    const ps = statsPerMatch[idx]
    const home = fixEncoding(e.home_team ?? "")
    const away = fixEncoding(e.away_team ?? "")
    const matchLabel = `${home} vs ${away} (${e.event_date ?? "-"})`

    const list: any[] = ps?.results ?? ps?.player_stats ?? (Array.isArray(ps) ? ps : [])
    const playerMatch = list.find((p: any) =>
      fixEncoding(p.player_name ?? "").toLowerCase().includes(firstName)
    )

    if (playerMatch) {
      const minutesPlayed = playerMatch.minutes_played ?? "?"
      const statParts = [
        playerMatch.goals != null ? `gol: ${playerMatch.goals}` : null,
        playerMatch.assists != null ? `assist: ${playerMatch.assists}` : null,
        playerMatch.xg != null ? `xG: ${playerMatch.xg}` : null,
        playerMatch.xa != null ? `xA: ${playerMatch.xa}` : null,
        playerMatch.rating != null ? `rating: ${playerMatch.rating}` : null,
        playerMatch.tackles != null ? `tackles: ${playerMatch.tackles}` : null,
      ].filter(Boolean).join(", ")
      results.push({ matchLabel, minutesPlayed, stats: statParts || "data terbatas" })
    } else {
      results.push({
        matchLabel,
        minutesPlayed: "TIDAK MAIN",
        stats: "pemain tidak tercatat bermain di laga ini",
      })
    }
  })

  return results
}

// ─── INJURY UPDATE — Hybrid Bzzoiro + Tavily ─────────────────────────────────
export async function fetchCederaContext(
  topic: string,
): Promise<BzzoiroContextResult> {
  const { fetchTavilyContext } = await import("./tavily")

  const lines: string[] = []
  const meta: Record<string, unknown> = {}
  const warnings: string[] = []

  // ── 1. Profil pemain dari Bzzoiro /api/players/ ───────────────────────────
  let playerProfile: any | null = null

  try {
    playerProfile = await fetchPlayerProfile(topic)
    if (playerProfile) {
      const playerName = fixEncoding(playerProfile.player_name ?? playerProfile.name ?? topic)
      const position   = fixEncoding(playerProfile.position ?? "-")
      const nationality = fixEncoding(playerProfile.nationality ?? "-")
      const marketValue = playerProfile.market_value
        ? `€${playerProfile.market_value.toLocaleString()}`
        : "-"
      const team = fixEncoding(playerProfile.team_name ?? playerProfile.team ?? "-")
      const age  = playerProfile.age ?? playerProfile.date_of_birth ?? "-"

      lines.push("[DATA PEMAIN — Bzzoiro Sports Data API]")
      lines.push(`Nama: ${playerName}`)
      lines.push(`Tim: ${team}`)
      lines.push(`Posisi: ${position}`)
      lines.push(`Kebangsaan: ${nationality}`)
      if (age !== "-") lines.push(`Usia/Lahir: ${age}`)
      if (marketValue !== "-") lines.push(`Nilai Pasar: ${marketValue}`)
      lines.push("")

      meta.playerFound = true
      meta.playerName  = playerName
      meta.team        = team

      // ── 2. Statistik 5 laga terakhir via player ID ──────────────────────
      const playerId = playerProfile.id
      if (playerId) {
        const recentStats = await fetchPlayerRecentStats(playerId)
        if (recentStats.length > 0) {
          lines.push("STATISTIK 5 LAGA TERAKHIR (dari Bzzoiro /api/player-stats/):")
          recentStats.forEach((s: any) => {
            const matchLabel = [
              fixEncoding(s.home_team ?? s.event?.home_team ?? ""),
              "vs",
              fixEncoding(s.away_team ?? s.event?.away_team ?? ""),
              (s.event_date ?? s.event?.event_date)
                ? `(${s.event_date ?? s.event?.event_date})`
                : "",
            ].filter(Boolean).join(" ")

            const minutes = s.minutes_played ?? "?"
            const statParts = [
              s.goals   != null ? `gol: ${s.goals}`     : null,
              s.assists != null ? `assist: ${s.assists}` : null,
              s.xg      != null ? `xG: ${s.xg}`         : null,
              s.xa      != null ? `xA: ${s.xa}`         : null,
              s.rating  != null ? `rating: ${s.rating}` : null,
              s.tackles != null ? `tackles: ${s.tackles}` : null,
              s.shots   != null ? `shots: ${s.shots}`   : null,
            ].filter(Boolean).join(", ")

            lines.push(
              `  • ${matchLabel || "(laga tidak diketahui)"} — ` +
              `${minutes === 0 ? "TIDAK BERMAIN" : `${minutes} menit main`}` +
              `${statParts ? ` (${statParts})` : ""}`
            )
          })
          meta.statsMatchesCount = recentStats.length
        } else {
          lines.push(
            "  (Statistik per-laga pemain tidak tersedia di Bzzoiro — " +
            "kemungkinan pemain belum tampil musim ini atau data belum masuk.)"
          )
        }
      }
    } else {
      warnings.push(
        `Profil pemain "${topic}" tidak ditemukan di Bzzoiro /api/players/. ` +
        "Mencoba mengambil data kehadiran dari match events tim."
      )
      meta.playerFound = false
    }
  } catch (err) {
    warnings.push(
      `Gagal mengambil profil pemain dari Bzzoiro: ${err instanceof Error ? err.message : "error tidak diketahui"}.`
    )
    meta.playerFound = false
  }

  // ── 3. Fallback kehadiran dari event player-stats ─────────────────────────
  if (!playerProfile) {
    try {
      const events = await findEvent(topic, { upcoming: false })
      if (events.length > 0) {
        const presenceData = await fetchPlayerStatsFromEvents(events, topic)
        if (presenceData.length > 0) {
          if (lines.length > 0) lines.push("")
          lines.push("[DATA KEHADIRAN DARI MATCH EVENTS — Bzzoiro (fallback)]")
          lines.push(
            "Catatan: profil pemain tidak ditemukan via /api/players/. " +
            "Data berikut adalah riwayat kehadiran dari player-stats per event — bukan konfirmasi cedera."
          )
          presenceData.forEach((d) => {
            lines.push(
              `  • ${d.matchLabel} — ` +
              `${d.minutesPlayed === "TIDAK MAIN" ? "TIDAK BERMAIN" : `${d.minutesPlayed} menit main`}` +
              `${d.stats !== "pemain tidak tercatat bermain di laga ini" ? ` (${d.stats})` : ""}`
            )
          })
          meta.fallbackPresenceChecked = presenceData.length
        }
      }
    } catch {
      // Fallback gagal — Tavily masih akan memberikan konteks dari berita
    }
  }

  // ── 4. Tavily: berita cedera resmi (window 3 hari) ───────────────────────
  let tavilyBlock = ""
  try {
    const tavilyResult = await fetchTavilyContext("cedera", topic)
    tavilyBlock = tavilyResult.contextText
    meta.tavilySources = tavilyResult.sources.length
    meta.tavilyQuery   = tavilyResult.queryUsed
  } catch (err) {
    const msg =
      `Tavily tidak menemukan berita cedera dalam 3 hari terakhir untuk "${topic}" ` +
      `(${err instanceof Error ? err.message : "error tidak diketahui"}). ` +
      "Artikel digenerate dari data Bzzoiro + catatan manual admin."
    warnings.push(msg)
    meta.tavilySources = 0
  }

  // ── Gabungkan output ──────────────────────────────────────────────────────
  const combinedLines: string[] = []

  const bzzoiroBlock = lines.join("\n")
  if (bzzoiroBlock.trim()) combinedLines.push(bzzoiroBlock.trim())

  if (tavilyBlock.trim()) {
    if (combinedLines.length > 0) combinedLines.push("")
    combinedLines.push("[BERITA CEDERA TERKINI — Tavily Search, 3 hari terakhir]")
    combinedLines.push(
      "Catatan: konten berikut berasal dari hasil pencarian berita real-time. " +
      "Prioritaskan pernyataan resmi dari klub, dokter tim, atau pelatih sebagai fakta utama."
    )
    combinedLines.push(tavilyBlock.trim())
  }

  const contextText = combinedLines.join("\n")

  if (!contextText.trim()) {
    return {
      contextText: "",
      meta,
      warning:
        `Tidak ditemukan data dari Bzzoiro maupun Tavily untuk "${topic}". ` +
        "Isi fakta cedera secara manual di kolom konteks sebelum generate.",
    }
  }

  return {
    contextText,
    meta,
    warning: warnings.length > 0 ? warnings.join(" | ") : undefined,
  }
}

// ─── Alias untuk kompatibilitas (route.ts lama memanggil nama ini) ────────────
export const fetchCederaSignalContext = fetchCederaContext
