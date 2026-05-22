import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// ─── Liga yang dipantau ────────────────────────────────────────────────────
const WATCHED_LEAGUES = [
  { id: 39,   name: "Premier League"    },
  { id: 140,  name: "La Liga"           },
  { id: 78,   name: "Bundesliga"        },
  { id: 135,  name: "Serie A"           },
  { id: 61,   name: "Ligue 1"           },
  { id: 2,    name: "Champions League"  },
  { id: 1,    name: "World Cup"         },
  { id: 4,    name: "Euro"              },
  { id: 9,    name: "Copa America"      },
  { id: 12,   name: "AFCON"             },
  { id: 17,   name: "AFC Asian Cup"     },
  { id: 142,  name: "AFF Cup"           },
]

const LEAGUE_IDS = WATCHED_LEAGUES.map((l) => l.id)

// Cache TTL
const CACHE_TTL_LIVE_MS     = 2 * 60 * 1000   // 2 menit saat ada live
const CACHE_TTL_SCHEDULE_MS = 2 * 60 * 60 * 1000 // 2 jam saat tidak ada live

const CACHE_KEY_LIVE     = "livescores_live"
const CACHE_KEY_SCHEDULE = "livescores_schedule"

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

// ─── Fetch live matches ────────────────────────────────────────────────────
async function fetchLive() {
  // Fetch semua pertandingan live sekaligus
  const response = await apiFetch("/fixtures?live=all")
  // Filter hanya liga yang dipantau
  return response.filter((f: any) => LEAGUE_IDS.includes(f.league.id))
}

// ─── Fetch jadwal hari ini + 24 jam ke depan ──────────────────────────────
async function fetchSchedule() {
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const toDate = (d: Date) => d.toISOString().split("T")[0]

  // Fetch hari ini dan besok sekaligus untuk semua liga sekaligus
  const [todayRes, tomorrowRes] = await Promise.all([
    apiFetch(`/fixtures?date=${toDate(now)}`),
    apiFetch(`/fixtures?date=${toDate(tomorrow)}`),
  ])

  const combined = [...todayRes, ...tomorrowRes]
  return combined.filter((f: any) => LEAGUE_IDS.includes(f.league.id))
}

// ─── Group fixtures by league ──────────────────────────────────────────────
function groupByLeague(fixtures: any[]) {
  const map = new Map<number, any>()

  for (const f of fixtures) {
    const lid = f.league.id
    if (!map.has(lid)) {
      map.set(lid, {
        leagueId:   lid,
        leagueName: f.league.name,
        leagueLogo: f.league.logo,
        fixtures:   [],
      })
    }
    map.get(lid).fixtures.push(f)
  }

  // Urutkan sesuai urutan WATCHED_LEAGUES
  const ordered: any[] = []
  for (const wl of WATCHED_LEAGUES) {
    if (map.has(wl.id)) ordered.push(map.get(wl.id))
  }
  return ordered
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
    // Cache write gagal — tidak masalah, tetap lanjut
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────
export async function GET() {
  const supabase = getSupabase()

  // ── 1. Cek cache live dulu ─────────────────────────────────────────────
  if (supabase) {
    const cached = await getCache(supabase, CACHE_KEY_LIVE)
    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
      if (ageMs < CACHE_TTL_LIVE_MS) {
        return NextResponse.json({ ...cached.payload, fromCache: true, fetchedAt: cached.fetched_at })
      }
    }
  }

  // ── 2. Fetch live dari API ─────────────────────────────────────────────
  try {
    const liveFixtures = await fetchLive()

    if (liveFixtures.length > 0) {
      // Ada live — group dan cache
      const groups = groupByLeague(liveFixtures)
      const payload = { mode: "live", groups }

      if (supabase) await setCache(supabase, CACHE_KEY_LIVE, payload)

      return NextResponse.json({ ...payload, fromCache: false, fetchedAt: new Date().toISOString() })
    }

    // ── 3. Tidak ada live — cek cache schedule ─────────────────────────
    if (supabase) {
      const cached = await getCache(supabase, CACHE_KEY_SCHEDULE)
      if (cached) {
        const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
        if (ageMs < CACHE_TTL_SCHEDULE_MS) {
          return NextResponse.json({ ...cached.payload, fromCache: true, fetchedAt: cached.fetched_at })
        }
      }
    }

    // ── 4. Fetch jadwal ────────────────────────────────────────────────
    const scheduleFixtures = await fetchSchedule()
    const groups = groupByLeague(scheduleFixtures)
    const payload = { mode: "schedule", groups }

    if (supabase) await setCache(supabase, CACHE_KEY_SCHEDULE, payload)

    return NextResponse.json({ ...payload, fromCache: false, fetchedAt: new Date().toISOString() })

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Gagal fetch data" },
      { status: 500 }
    )
  }
}
