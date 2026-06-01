import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// ─── Liga yang dipantau ────────────────────────────────────────────────────
const WATCHED_LEAGUES = [
  { id: 39,  name: "Premier League"    },
  { id: 140, name: "La Liga"           },
  { id: 78,  name: "Bundesliga"        },
  { id: 135, name: "Serie A"           },
  { id: 61,  name: "Ligue 1"           },
  { id: 2,   name: "Champions League"  },
  { id: 3,   name: "Europa League"     }, // ← FIX: ditambahkan, ada di dropdown komponen
  { id: 1,   name: "World Cup"         },
  { id: 4,   name: "Euro"              },
  { id: 9,   name: "Copa America"      },
  { id: 12,  name: "AFCON"             },
  { id: 17,  name: "AFC Asian Cup"     },
  { id: 142, name: "AFF Cup"           },
]

const ALL_LEAGUE_IDS = WATCHED_LEAGUES.map((l) => l.id)

// ─── Cache TTL ─────────────────────────────────────────────────────────────
// Live match → 15 menit | Tidak ada pertandingan → 24 jam
const CACHE_TTL_LIVE_MS     = 15 * 60 * 1000
const CACHE_TTL_SCHEDULE_MS = 24 * 60 * 60 * 1000

// ─── Supabase ──────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── API-Football fetch helpers ────────────────────────────────────────────
async function apiFetch(path: string) {
  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) throw new Error("API_FOOTBALL_KEY tidak ditemukan di .env.local")

  const res = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const json = await res.json()
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(JSON.stringify(json.errors))
  }
  return json.response as any[]
}

// ─── Fetch live matches untuk satu liga ───────────────────────────────────
async function fetchLiveForLeague(leagueId: number) {
  const response = await apiFetch("/fixtures?live=all")
  // Filter hanya liga yang diminta
  return response.filter((f: any) => f.league.id === leagueId)
}

// ─── Fetch jadwal hari ini untuk satu liga ────────────────────────────────
async function fetchScheduleForLeague(leagueId: number) {
  const today = new Date().toISOString().split("T")[0]
  const response = await apiFetch(`/fixtures?date=${today}&league=${leagueId}`)
  return response
}

// ─── Supabase cache helpers ────────────────────────────────────────────────
async function getCache(supabase: any, key: string) {
  try {
    const { data } = await supabase
      .from("match_cache")
      .select("payload, fetched_at")
      .eq("cache_key", key)
      .single()
    return data ?? null
  } catch {
    return null
  }
}

async function setCache(supabase: any, key: string, payload: any) {
  try {
    await supabase.from("match_cache").upsert(
      { cache_key: key, payload, fetched_at: new Date().toISOString() },
      { onConflict: "cache_key" }
    )
  } catch {
    // Cache write gagal — tidak masalah, lanjut saja
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────
// FIX: Terima request parameter dan destructure URL untuk baca ?league=
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueId = parseInt(searchParams.get("league") ?? "39", 10)

  // Validasi leagueId — harus ada di daftar yang diizinkan
  const isValidLeague = ALL_LEAGUE_IDS.includes(leagueId)
  const resolvedLeagueId = isValidLeague ? leagueId : 39

  // Cache key per-liga sehingga tiap liga punya cache sendiri
  const cacheKeyLive     = `livescores_live_${resolvedLeagueId}`
  const cacheKeySchedule = `livescores_schedule_${resolvedLeagueId}`

  const supabase = getSupabase()

  // ── 1. Cek cache live per-liga (TTL: 15 menit) ────────────────────────
  if (supabase) {
    const cached = await getCache(supabase, cacheKeyLive)
    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
      if (ageMs < CACHE_TTL_LIVE_MS) {
        return NextResponse.json({
          ...cached.payload,
          fromCache: true,
          fetchedAt: cached.fetched_at,
        })
      }
    }
  }

  // ── 2. Fetch live dari API-Football ───────────────────────────────────
  try {
    const liveFixtures = await fetchLiveForLeague(resolvedLeagueId)

    if (liveFixtures.length > 0) {
      // FIX: return flat { fixtures: [...] } bukan { groups: [...] }
      // Komponen live-scores.tsx membaca data?.fixtures
      const payload = { mode: "live" as const, fixtures: liveFixtures }

      if (supabase) await setCache(supabase, cacheKeyLive, payload)

      return NextResponse.json({
        ...payload,
        fromCache: false,
        fetchedAt: new Date().toISOString(),
      })
    }

    // ── 3. Tidak ada live → cek cache jadwal ──────────────────────────
    if (supabase) {
      const cached = await getCache(supabase, cacheKeySchedule)
      if (cached) {
        const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
        if (ageMs < CACHE_TTL_SCHEDULE_MS) {
          return NextResponse.json({
            ...cached.payload,
            fromCache: true,
            fetchedAt: cached.fetched_at,
          })
        }
      }
    }

    // ── 4. Cache expired → fetch jadwal hari ini ──────────────────────
    const scheduleFixtures = await fetchScheduleForLeague(resolvedLeagueId)

    // FIX: return flat { fixtures: [...] } bukan { groups: [...] }
    const payload = { mode: "schedule" as const, fixtures: scheduleFixtures }

    if (supabase) await setCache(supabase, cacheKeySchedule, payload)

    return NextResponse.json({
      ...payload,
      fromCache: false,
      fetchedAt: new Date().toISOString(),
    })

  } catch (err: any) {
    // ── 5. API gagal → coba kembalikan stale cache ────────────────────
    if (supabase) {
      const staleLive = await getCache(supabase, cacheKeyLive)
      if (staleLive) {
        return NextResponse.json({
          ...staleLive.payload,
          fromCache: true,
          stale: true,
          fetchedAt: staleLive.fetched_at,
        })
      }
      const staleSchedule = await getCache(supabase, cacheKeySchedule)
      if (staleSchedule) {
        return NextResponse.json({
          ...staleSchedule.payload,
          fromCache: true,
          stale: true,
          fetchedAt: staleSchedule.fetched_at,
        })
      }
    }

    return NextResponse.json(
      { error: err.message ?? "Gagal fetch data" },
      { status: 500 }
    )
  }
}
