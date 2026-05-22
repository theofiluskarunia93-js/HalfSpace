import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// ─── League config ─────────────────────────────────────────────────────────
// League IDs dari API-Football
const LEAGUES = [
  { id: 39,  name: "Premier League", slug: "premier-league", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 140, name: "La Liga",        slug: "la-liga",        flag: "🇪🇸" },
  { id: 78,  name: "Bundesliga",     slug: "bundesliga",     flag: "🇩🇪" },
  { id: 135, name: "Serie A",        slug: "serie-a",        flag: "🇮🇹" },
  { id: 61,  name: "Ligue 1",        slug: "ligue-1",        flag: "🇫🇷" },
  { id: 2,   name: "Champions League", slug: "champions-league", flag: "🏆" },
]

// Season aktif — update tiap tahun
const SEASON = 2024

// Cache TTL — standings tidak butuh update sering
const CACHE_TTL_HOURS = 6  // 6 jam

// ─── Supabase ──────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── API-Football fetch ────────────────────────────────────────────────────
async function fetchFromAPI(leagueId: number, type: "standings" | "topscorers") {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) throw new Error("API_FOOTBALL_KEY tidak ditemukan di .env.local")

  const url =
    type === "standings"
      ? `https://v3.football.api-sports.io/standings?league=${leagueId}&season=${SEASON}`
      : `https://v3.football.api-sports.io/players/topscorers?league=${leagueId}&season=${SEASON}`

  const res = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const json = await res.json()
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(JSON.stringify(json.errors))
  }
  return json.response
}

// ─── Transform standings response ─────────────────────────────────────────
function transformStandings(response: any[]) {
  if (!response?.[0]?.league?.standings?.[0]) return []
  return response[0].league.standings[0].map((item: any) => ({
    pos:    item.rank,
    team:   item.team.name,
    logo:   item.team.logo,
    played: item.all.played,
    won:    item.all.win,
    drawn:  item.all.draw,
    lost:   item.all.lose,
    gd:     item.goalsDiff,
    points: item.points,
    form:   item.form ?? "",
    description: item.description ?? "",
  }))
}

// ─── Transform top scorers response ───────────────────────────────────────
function transformScorers(response: any[]) {
  return response.slice(0, 10).map((item: any, index: number) => ({
    pos:    index + 1,
    player: item.player.name,
    photo:  item.player.photo,
    team:   item.statistics[0]?.team?.name ?? "",
    teamLogo: item.statistics[0]?.team?.logo ?? "",
    goals:  item.statistics[0]?.goals?.total ?? 0,
    assists: item.statistics[0]?.goals?.assists ?? 0,
    appearances: item.statistics[0]?.games?.appearences ?? 0,
  }))
}

// ─── Main handler ──────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueSlug = searchParams.get("league") ?? "premier-league"
  const type = (searchParams.get("type") ?? "standings") as "standings" | "topscorers"

  const league = LEAGUES.find((l) => l.slug === leagueSlug) ?? LEAGUES[0]
  const cacheKey = `standings_${type}_${league.id}_${SEASON}`
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
        if (ageHours < CACHE_TTL_HOURS) {
          return NextResponse.json({
            ...cached.payload,
            fromCache: true,
            cachedAt: cached.fetched_at,
          })
        }
      }
    } catch {
      // Cache miss — lanjut ke API
    }
  }

  // ── 2. Fetch dari API-Football ─────────────────────────────────────────
  try {
    const raw = await fetchFromAPI(league.id, type)
    const data =
      type === "standings"
        ? { standings: transformStandings(raw), leagues: LEAGUES }
        : { scorers: transformScorers(raw), leagues: LEAGUES }

    // ── 3. Simpan ke cache ─────────────────────────────────────────────
    if (supabase) {
      await supabase.from("match_cache").upsert(
        { cache_key: cacheKey, payload: data, fetched_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      )
    }

    return NextResponse.json({ ...data, fromCache: false, cachedAt: new Date().toISOString() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Gagal fetch data" }, { status: 500 })
  }
}
