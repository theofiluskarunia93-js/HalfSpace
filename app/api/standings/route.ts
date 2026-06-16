import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// ─── League config ─────────────────────────────────────────────────────────
// bzzoiro pakai integer league_id, endpoint standings: /api/v2/leagues/{id}/standings/
// World Cup: bzzoiro pakai league_id=27 (BUKAN 1 seperti API-Football)
// World Cup response pakai { groups: { "Grup A": [...], ... } } bukan flat standings
const LEAGUES = [
  { id: 27,  name: "World Cup",        slug: "world-cup",        apiId: 27,  flag: "🌍" },
  { id: 39,  name: "Premier League",   slug: "premier-league",   apiId: 39,  flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 140, name: "La Liga",          slug: "la-liga",          apiId: 140, flag: "🇪🇸" },
  { id: 78,  name: "Bundesliga",       slug: "bundesliga",       apiId: 78,  flag: "🇩🇪" },
  { id: 135, name: "Serie A",          slug: "serie-a",          apiId: 135, flag: "🇮🇹" },
  { id: 61,  name: "Ligue 1",          slug: "ligue-1",          apiId: 61,  flag: "🇫🇷" },
  { id: 2,   name: "Champions League", slug: "champions-league", apiId: 2,   flag: "🏆" },
]

// Cache TTL
const CACHE_TTL_HOURS = 6

// ─── Supabase ──────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── bzzoiro fetch helper ──────────────────────────────────────────────────
async function bzzFetch(path: string) {
  const apiKey = process.env.BZZOIRO_API_KEY
  if (!apiKey) throw new Error("BZZOIRO_API_KEY tidak ditemukan di .env.local")

  const res = await fetch(`https://sports.bzzoiro.com${path}`, {
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`❌ bzzFetch [standings] error ${res.status} — path: ${path} — body: ${body.slice(0, 300)}`)
    throw new Error(`bzzoiro API error ${res.status}`)
  }
  const json = await res.json()
  console.log(`✅ bzzFetch [standings] ${path} — preview: ${JSON.stringify(json).slice(0, 200)}`)
  return json
}

// ─── Fix garbled UTF-8 dari bzzoiro (latin1 mis-decoded sebagai UTF-8) ──────
function fixEncoding(str: string): string {
  if (!str) return str
  try {
    // Decode latin1 → UTF-8 yang benar
    return decodeURIComponent(escape(str))
  } catch {
    return str
  }
}

// ─── Fetch standings dari bzzoiro ──────────────────────────────────────────
// Endpoint: GET /api/v2/leagues/{id}/standings/
// Response liga biasa: { standings: [...] }
// Response cup/World Cup: { groups: { "Group A": [...], "Group B": [...], ... } }
// Untuk World Cup, tiap row menyertakan field `group` agar widget bisa render per-grup
async function fetchStandings(leagueApiId: number) {
  const json = await bzzFetch(`/api/v2/leagues/${leagueApiId}/standings/`)

  // Cup/World Cup → groups map: tiap entry diberi field `group`
  if (json.groups && typeof json.groups === "object" && !Array.isArray(json.groups)) {
    const result: any[] = []
    for (const [groupName, entries] of Object.entries(json.groups)) {
      const rows = entries as any[]
      rows.forEach((item: any, idx: number) => {
        result.push({
          pos:         item.position ?? item.rank ?? idx + 1,
          team:        fixEncoding(item.team_name ?? item.team ?? ""),
          logo:        item.team_logo ?? item.logo ?? "",
          played:      item.played ?? item.games_played ?? 0,
          won:         item.won ?? item.wins ?? 0,
          drawn:       item.drawn ?? item.draws ?? 0,
          lost:        item.lost ?? item.losses ?? 0,
          gd:          item.goal_difference ?? item.goals_difference ?? 0,
          points:      item.points > 0 ? item.points : ((item.won ?? item.wins ?? 0) * 3 + (item.drawn ?? item.draws ?? 0)),
          form:        item.form ?? "",
          description: item.description ?? item.status ?? "",
          group:       groupName,
        })
      })
    }
    return result
  }

  // Liga biasa → flat standings array
  let list: any[] = []
  if (json.standings && Array.isArray(json.standings)) {
    list = json.standings
  } else if (Array.isArray(json)) {
    list = json
  }

  return list.map((item: any, idx: number) => ({
    pos:         item.position ?? item.rank ?? idx + 1,
    team:        fixEncoding(item.team_name ?? item.team ?? ""),
    logo:        item.team_logo ?? item.logo ?? "",
    played:      item.played ?? item.games_played ?? 0,
    won:         item.won ?? item.wins ?? 0,
    drawn:       item.drawn ?? item.draws ?? 0,
    lost:        item.lost ?? item.losses ?? 0,
    gd:          item.goal_difference ?? item.goals_difference ?? 0,
    points:      item.points > 0 ? item.points : ((item.won ?? item.wins ?? 0) * 3 + (item.drawn ?? item.draws ?? 0)),
    form:        item.form ?? "",
    description: item.description ?? item.status ?? "",
  }))
}

// ─── Main handler ──────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueSlug = searchParams.get("league") ?? "world-cup"

  const league = LEAGUES.find((l) => l.slug === leagueSlug) ?? LEAGUES[0]
  const cacheKey = `bzz_standings_${league.apiId}`
  const supabase = getSupabase()

  // ── 1. Cek cache Supabase ──────────────────────────────────────────────
  if (supabase) {
    try {
      const { data: cached } = await supabase
        .from("match_cache")
        .select("payload, fetched_at")
        .eq("cache_key", cacheKey)
        .single()

      if (cached) {
        const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / 3600000
        const cachedHasData = (cached.payload?.standings?.length ?? 0) > 0

        if (ageHours < CACHE_TTL_HOURS && cachedHasData) {
          return NextResponse.json({ ...cached.payload, fromCache: true, cachedAt: cached.fetched_at })
        }
      }
    } catch {
      // Cache miss — lanjut ke API
    }
  }

  // ── 2. Fetch standings dari bzzoiro ────────────────────────────────────
  try {
    const standings = await fetchStandings(league.apiId)
    const data = { standings, leagues: LEAGUES }

    // ── 3. Simpan ke cache jika ada data ────────────────────────────────
    if (supabase && standings.length > 0) {
      await supabase.from("match_cache").upsert(
        { cache_key: cacheKey, payload: data, fetched_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      )
    }

    return NextResponse.json({ ...data, fromCache: false, cachedAt: new Date().toISOString() })
  } catch (err: any) {
    console.error("❌ standings route error:", err.message)
    return NextResponse.json({ error: err.message ?? "Gagal fetch data" }, { status: 500 })
  }
}
