// ─── INJURY UPDATE — HYBRID: Bzzoiro (data pemain & menit main) + Tavily (berita cedera resmi) ──
//
// Perubahan dari versi sebelumnya:
//   SEBELUM: Hanya Bzzoiro → sinyal tidak langsung (cek kehadiran dari lineup/match),
//            kelemahan: tidak ada fakta cedera, hanya "pemain tidak muncul di lineup".
//   SESUDAH: Bzzoiro (profil pemain + riwayat statistik per match: menit main, gol, assist,
//            xG, tackles dst.) DIGABUNG dengan Tavily Search (berita cedera resmi, pernyataan
//            dokter tim, estimasi waktu absen) → konteks yang dikirim ke Gemini jauh lebih kaya
//            dan berisi fakta yang bisa diverifikasi, bukan sekadar sinyal absensi.
//
// PENTING — batasan tetap berlaku:
//   - Bzzoiro TIDAK punya endpoint "injuries" resmi. Data dari Bzzoiro di sini adalah:
//       • Profil pemain (nama lengkap, posisi, kebangsaan, nilai pasar)
//       • Statistik per match dari 5 laga terakhir tim (menit main, gol, assist, xG, dll.)
//       Ini dipakai sebagai DATA KONTEKS PEMAIN, bukan konfirmasi cedera.
//   - Fakta cedera RESMI (jenis cedera, prognosis, waktu absen, kutipan pelatih/dokter)
//     didapat dari Tavily Search (window 3 hari terakhir).
//   - Jika Tavily tidak menemukan berita cedera, artikel TETAP bisa digenerate dari
//     data Bzzoiro + catatan manual admin, dengan warning yang jelas.

import { fetchTavilyContext } from "./tavily"

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

// ─── Cari event/match berdasarkan nama tim ────────────────────────────────────
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

// ─── Cari profil pemain dari Bzzoiro /api/players/ ────────────────────────────
// Dipakai untuk mendapat: nama lengkap, posisi, kebangsaan, nilai pasar.
async function fetchPlayerProfile(playerQuery: string): Promise<any | null> {
  try {
    const json = await bzzFetch(
      `/api/players/?search=${encodeURIComponent(playerQuery)}&limit=5`
    )
    const players = json.results ?? (Array.isArray(json) ? json : [])
    if (players.length === 0) return null
    // Ambil match paling relevan (pertama = paling cocok dengan query)
    return players[0]
  } catch {
    return null
  }
}

// ─── Ambil statistik per match dari Bzzoiro /api/player-stats/ ───────────────
// Mengembalikan statistik dari 5 laga terakhir pemain: menit main, gol,
// assist, xG, xA, tackles, rating, dll.
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

// ─── Cari statistik pemain dari match events (fallback jika player ID tidak diketahui) ───
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
        playerMatch.passes != null ? `passes: ${playerMatch.passes}` : null,
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
//
// Strategi pengambilan data:
//   1. Bzzoiro /api/players/ → profil pemain (posisi, kebangsaan, nilai pasar)
//   2. Bzzoiro /api/player-stats/ → statistik 5 laga terakhir pemain tsb
//      (jika player ID ditemukan dari step 1)
//   3. Bzzoiro events + /api/v2/events/{id}/player-stats/ → fallback: cek
//      kehadiran dari match events tim jika player ID tidak ditemukan
//   4. Tavily Search (window 3 hari terakhir) → berita cedera resmi, pernyataan
//      pelatih/dokter, estimasi waktu absen, konfirmasi dari klub
//
// Output: dua blok konteks berlabel jelas untuk Gemini:
//   • [DATA PEMAIN — Bzzoiro] → profil + riwayat statistik
//   • [BERITA CEDERA TERKINI — Tavily] → fakta cedera dari sumber berita

export async function fetchCederaContext(
  topic: string,
): Promise<BzzoiroContextResult> {
  const lines: string[] = []
  const meta: Record<string, unknown> = {}
  const warnings: string[] = []

  // ── 1. Cari profil pemain di Bzzoiro ───────────────────────────────────────
  let playerProfile: any | null = null
  let playerRecentStats: any[] = []

  try {
    playerProfile = await fetchPlayerProfile(topic)
    if (playerProfile) {
      const playerName = fixEncoding(playerProfile.player_name ?? playerProfile.name ?? topic)
      const position = fixEncoding(playerProfile.position ?? "-")
      const nationality = fixEncoding(playerProfile.nationality ?? "-")
      const marketValue = playerProfile.market_value
        ? `€${playerProfile.market_value.toLocaleString()}`
        : "-"
      const team = fixEncoding(
        playerProfile.team_name ?? playerProfile.team ?? "-"
      )
      const age = playerProfile.age ?? playerProfile.date_of_birth ?? "-"

      lines.push("[DATA PEMAIN — Bzzoiro Sports Data API]")
      lines.push(`Nama: ${playerName}`)
      lines.push(`Tim: ${team}`)
      lines.push(`Posisi: ${position}`)
      lines.push(`Kebangsaan: ${nationality}`)
      if (age !== "-") lines.push(`Usia/Lahir: ${age}`)
      if (marketValue !== "-") lines.push(`Nilai Pasar: ${marketValue}`)
      lines.push("")

      meta.playerFound = true
      meta.playerName = playerName
      meta.team = team

      // ── 2. Ambil statistik 5 laga terakhir via player ID ─────────────────
      const playerId = playerProfile.id
      if (playerId) {
        playerRecentStats = await fetchPlayerRecentStats(playerId)
        if (playerRecentStats.length > 0) {
          lines.push("STATISTIK 5 LAGA TERAKHIR (dari Bzzoiro /api/player-stats/):")
          playerRecentStats.forEach((s: any) => {
            const matchLabel = [
              fixEncoding(s.home_team ?? s.event?.home_team ?? ""),
              "vs",
              fixEncoding(s.away_team ?? s.event?.away_team ?? ""),
              s.event_date ?? s.event?.event_date ? `(${s.event_date ?? s.event?.event_date})` : "",
            ].filter(Boolean).join(" ")

            const minutes = s.minutes_played ?? "?"
            const statParts = [
              s.goals != null ? `gol: ${s.goals}` : null,
              s.assists != null ? `assist: ${s.assists}` : null,
              s.xg != null ? `xG: ${s.xg}` : null,
              s.xa != null ? `xA: ${s.xa}` : null,
              s.rating != null ? `rating: ${s.rating}` : null,
              s.tackles != null ? `tackles: ${s.tackles}` : null,
              s.shots != null ? `shots: ${s.shots}` : null,
            ].filter(Boolean).join(", ")

            lines.push(
              `  • ${matchLabel || "(laga tidak diketahui)"} — ${minutes === "TIDAK MAIN" || minutes === 0 ? "TIDAK BERMAIN" : `${minutes} menit main`}${statParts ? ` (${statParts})` : ""}`
            )
          })
          meta.statsMatchesCount = playerRecentStats.length
        } else {
          lines.push(
            "  (Statistik per-laga pemain tidak tersedia di Bzzoiro — kemungkinan pemain belum tampil musim ini atau data belum masuk.)"
          )
        }
      }
    } else {
      // Profil pemain tidak ditemukan di Bzzoiro — coba fallback via event player-stats
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

  // ── 3. Fallback: cek kehadiran dari event player-stats jika profil tidak ditemukan ─
  if (!playerProfile) {
    try {
      const events = await findEvent(topic, { upcoming: false })
      if (events.length > 0) {
        const presenceData = await fetchPlayerStatsFromEvents(events, topic)
        if (presenceData.length > 0) {
          if (lines.length > 0) lines.push("")
          lines.push("[DATA KEHADIRAN DARI MATCH EVENTS — Bzzoiro (fallback)]")
          lines.push(
            "Catatan: profil pemain tidak ditemukan via /api/players/. Data berikut " +
            "adalah riwayat kehadiran dari player-stats per event tim — bukan konfirmasi cedera."
          )
          presenceData.forEach((d) => {
            lines.push(
              `  • ${d.matchLabel} — ${d.minutesPlayed === "TIDAK MAIN" ? "TIDAK BERMAIN" : `${d.minutesPlayed} menit main`}${d.stats !== "pemain tidak tercatat bermain di laga ini" ? ` (${d.stats})` : ""}`
            )
          })
          meta.fallbackPresenceChecked = presenceData.length
        }
      }
    } catch {
      // Fallback juga gagal — Tavily masih akan memberikan konteks dari berita
    }
  }

  // ── 4. Tavily: berita cedera resmi (window 3 hari terakhir) ───────────────
  let tavilyBlock = ""
  let tavilyWarning: string | undefined

  try {
    // Query Tavily difokuskan ke berita cedera: jenis cedera, waktu absen, pernyataan pelatih
    const tavilyResult = await fetchTavilyContext("cedera", topic)
    tavilyBlock = tavilyResult.contextText
    meta.tavilySources = tavilyResult.sources.length
    meta.tavilyQuery = tavilyResult.queryUsed
  } catch (err) {
    tavilyWarning =
      `Tavily tidak menemukan berita cedera dalam 3 hari terakhir untuk "${topic}" ` +
      `(${err instanceof Error ? err.message : "error tidak diketahui"}). ` +
      "Artikel digenerate dari data Bzzoiro + catatan manual admin."
    warnings.push(tavilyWarning)
    meta.tavilySources = 0
  }

  // ── Gabungkan output ───────────────────────────────────────────────────────
  const bzzoiroBlock = lines.join("\n")

  const combinedLines: string[] = []

  if (bzzoiroBlock.trim()) {
    combinedLines.push(bzzoiroBlock.trim())
  }

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

// ─── Export lama tetap dipertahankan untuk kompatibilitas ─────────────────────
// Nama fungsi lama `fetchCederaSignalContext` dialiaskan ke fungsi baru,
// sehingga route.ts yang memanggil nama lama tidak perlu diubah nama impornya.
export const fetchCederaSignalContext = fetchCederaContext
