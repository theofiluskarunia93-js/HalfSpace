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

// ─── Cache TTL ─────────────────────────────────────────────────────────────
// Jika ada pertandingan live → fetch setiap 15 menit
// Jika tidak ada pertandingan sama sekali → fetch 1x sehari (24 jam)
const CACHE_TTL_LIVE_MS     = 15 * 60 * 1000        // 15 menit saat ada live
const CACHE_TTL_SCHEDULE_MS = 24 * 60 * 60 * 1000   // 24 jam (1x sehari) saat tidak ada live

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
  const response = await apiFetch("/fixtures?live=all")
  return response.filter((f: any) => LEAGUE_IDS.includes(f.league.id))
}

// ─── Fetch jadwal hari ini saja (bukan +24jam) ────────────────────────────
// Karena sudah 24jam cache, cukup ambil hari ini saja
async function fetchSchedule() {
  const now = new Date()
  const toDate = (d: Date) => d.toISOString().split("T")[0]
  const todayRes = await apiFetch(`/fixtures?date=${toDate(now)}`)
  return todayRes.filter((f: any) => LEAGUE_IDS.includes(f.league.id))
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
    // Cache write gagal — tidak masalah
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────
export async function GET() {
  const supabase = getSupabase()

  // ── 1. Cek cache live di Supabase (TTL: 15 menit) ─────────────────────
  if (supabase) {
    const cached = await getCache(supabase, CACHE_KEY_LIVE)
    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
      if (ageMs < CACHE_TTL_LIVE_MS) {
        return NextResponse.json({ ...cached.payload, fromCache: true, fetchedAt: cached.fetched_at })
      }
    }
  }

  // ── 2. Fetch live dari API-Football ───────────────────────────────────
  try {
    const liveFixtures = await fetchLive()

    if (liveFixtures.length > 0) {
      // Ada live → simpan ke Supabase, cache 15 menit
      const groups = groupByLeague(liveFixtures)
      const payload = { mode: "live", groups }

      if (supabase) await setCache(supabase, CACHE_KEY_LIVE, payload)

      return NextResponse.json({ ...payload, fromCache: false, fetchedAt: new Date().toISOString() })
    }

    // ── 3. Tidak ada live → hapus cache live yang expired ─────────────
    // Cek cache jadwal (TTL: 24 jam — hanya fetch 1x sehari)
    if (supabase) {
      const cached = await getCache(supabase, CACHE_KEY_SCHEDULE)
      if (cached) {
        const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
        if (ageMs < CACHE_TTL_SCHEDULE_MS) {
          // Masih dalam 24 jam → kembalikan dari Supabase, TIDAK fetch API
          return NextResponse.json({ ...cached.payload, fromCache: true, fetchedAt: cached.fetched_at })
        }
      }
    }

    // ── 4. Cache expired atau tidak ada → fetch jadwal hari ini ───────
    const scheduleFixtures = await fetchSchedule()
    const groups = groupByLeague(scheduleFixtures)
    const payload = { mode: "schedule", groups }

    // Simpan ke Supabase — berlaku 24 jam
    if (supabase) await setCache(supabase, CACHE_KEY_SCHEDULE, payload)

    return NextResponse.json({ ...payload, fromCache: false, fetchedAt: new Date().toISOString() })

  } catch (err: any) {
    // ── 5. API gagal → coba kembalikan cache lama meskipun expired ────
    if (supabase) {
      const staleLive = await getCache(supabase, CACHE_KEY_LIVE)
      if (staleLive) {
        return NextResponse.json({ ...staleLive.payload, fromCache: true, stale: true, fetchedAt: staleLive.fetched_at })
      }
      const staleSchedule = await getCache(supabase, CACHE_KEY_SCHEDULE)
      if (staleSchedule) {
        return NextResponse.json({ ...staleSchedule.payload, fromCache: true, stale: true, fetchedAt: staleSchedule.fetched_at })
      }
    }

    return NextResponse.json(
      { error: err.message ?? "Gagal fetch data" },
      { status: 500 }
    )
  }
}
