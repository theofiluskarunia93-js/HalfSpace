import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// ─── League config — bzzoiro pakai integer ID ─────────────────────────────
// Endpoint: /api/v2/events/ — league_id berbeda dari API-Football untuk beberapa liga
// World Cup: bzzoiro pakai league_id=27 (BUKAN 1 seperti API-Football)
const WATCHED_LEAGUES = [
  { id: 39,  apiId: 39  }, // Premier League
  { id: 140, apiId: 140 }, // La Liga
  { id: 78,  apiId: 78  }, // Bundesliga
  { id: 135, apiId: 135 }, // Serie A
  { id: 61,  apiId: 61  }, // Ligue 1
  { id: 2,   apiId: 2   }, // Champions League
  { id: 3,   apiId: 3   }, // Europa League
  { id: 27,  apiId: 27  }, // World Cup (bzzoiro ID: 27)
  { id: 4,   apiId: 4   }, // Euro
  { id: 9,   apiId: 9   }, // Copa America
  { id: 12,  apiId: 12  }, // AFCON
  { id: 17,  apiId: 17  }, // AFC Asian Cup
  { id: 142, apiId: 142 }, // AFF Cup
]

const ALL_LEAGUE_IDS = WATCHED_LEAGUES.map((l) => l.id)

// ─── Cache TTL ─────────────────────────────────────────────────────────────
const CACHE_TTL_LIVE_MS     = 15 * 60 * 1000
const CACHE_TTL_SCHEDULE_MS = 24 * 60 * 60 * 1000

// ─── Supabase ──────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── bzzoiro fetch helper ──────────────────────────────────────────────────
// Base URL: https://sports.bzzoiro.com
// Endpoint: /api/v2/events/ (BUKAN /football/api/v2/matches/)
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
    console.error(`❌ bzzFetch [live-scores] error ${res.status} — path: ${path} — body: ${body.slice(0, 300)}`)
    throw new Error(`bzzoiro API error ${res.status}`)
  }
  const json = await res.json()
  console.log(`✅ bzzFetch [live-scores] ${path} — preview: ${JSON.stringify(json).slice(0, 200)}`)
  return json
}

// ─── Map status bzzoiro → kode yang dipakai komponen live-scores.tsx ───────
// Dari schema: status enum = "1st_half","2nd_half","aet","cancelled","extratime",
//              "finished","halftime","inprogress","notstarted","penalties","postponed"
function mapStatus(status: string, period?: string): string {
  const s = (status ?? "").toLowerCase()
  const p = (period ?? "").toLowerCase()

  if (s === "inprogress" || s === "1st_half" || p === "1st_half") return "1H"
  if (s === "2nd_half" || p === "2nd_half")  return "2H"
  if (s === "halftime"  || p === "halftime")  return "HT"
  if (s === "extratime" || s === "aet" || p === "extra_time") return "ET"
  if (s === "penalties" || p === "penalties") return "P"
  if (s === "finished")   return "FT"
  if (s === "aet")        return "AET"
  if (s === "notstarted") return "NS"
  if (s === "postponed")  return "PST"
  if (s === "cancelled")  return "CANC"
  return "NS"
}

// ─── Transform bzzoiro EventDetailV2Schema → format komponen ──────────────
// Schema bzzoiro: { id, home_team, away_team, home_score, away_score,
//                   event_date, status, period, current_minute,
//                   home_team_id, away_team_id, league_id }
// Komponen butuh: { fixture: { id, date, status: { short, elapsed } },
//                   teams: { home: { id, name, logo }, away: ... },
//                   goals: { home, away } }
function transformEvent(event: any) {
  return {
    fixture: {
      id:     event.id,
      date:   event.event_date,
      status: {
        short:   mapStatus(event.status, event.period),
        elapsed: event.current_minute ?? null,
      },
    },
    teams: {
      home: {
        id:   event.home_team_id   ?? 0,
        name: event.home_team      ?? "",
        // bzzoiro tidak sertakan logo langsung di events list — kosongkan dulu
        // Logo bisa diambil dari /api/v2/teams/{id}/ jika diperlukan
        logo: event.home_team_logo ?? "",
      },
      away: {
        id:   event.away_team_id   ?? 0,
        name: event.away_team      ?? "",
        logo: event.away_team_logo ?? "",
      },
    },
    goals: {
      home: event.home_score ?? null,
      away: event.away_score ?? null,
    },
  }
}

// ─── Fetch live matches untuk satu liga ───────────────────────────────────
// bzzoiro endpoint live: GET /api/v2/events/live/?league_id={id}
// Response: { count: N, events: [...] }
async function fetchLiveForLeague(leagueId: number) {
  const json = await bzzFetch(`/api/v2/events/live/?league_id=${leagueId}`)
  const events = json.events ?? json.results ?? (Array.isArray(json) ? json : [])
  return events.map(transformEvent)
}

// ─── Fetch jadwal hari ini untuk satu liga ────────────────────────────────
// bzzoiro endpoint events: GET /api/v2/events/?league_id={id}&date_from=...&date_to=...
async function fetchScheduleForLeague(leagueId: number) {
  const today = new Date().toISOString().split("T")[0]
  const dateFrom = `${today}T00:00:00Z`
  const dateTo   = `${today}T23:59:59Z`
  const json = await bzzFetch(
    `/api/v2/events/?league_id=${leagueId}&date_from=${dateFrom}&date_to=${dateTo}&limit=20`
  )
  const events = json.results ?? (Array.isArray(json) ? json : [])
  return events.map(transformEvent)
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
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const leagueId = parseInt(searchParams.get("league") ?? "39", 10)

  const isValidLeague = ALL_LEAGUE_IDS.includes(leagueId)
  const resolvedLeagueId = isValidLeague ? leagueId : 39

  const cacheKeyLive     = `livescores_live_${resolvedLeagueId}`
  const cacheKeySchedule = `livescores_schedule_${resolvedLeagueId}`
  const supabase = getSupabase()

  // ── 1. Cek cache live (TTL: 15 menit) ────────────────────────────────
  if (supabase) {
    const cached = await getCache(supabase, cacheKeyLive)
    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
      if (ageMs < CACHE_TTL_LIVE_MS) {
        return NextResponse.json({ ...cached.payload, fromCache: true, fetchedAt: cached.fetched_at })
      }
    }
  }

  try {
    // ── 2. Fetch live dari bzzoiro ────────────────────────────────────
    const liveFixtures = await fetchLiveForLeague(resolvedLeagueId)

    if (liveFixtures.length > 0) {
      const payload = { mode: "live" as const, fixtures: liveFixtures }
      if (supabase) await setCache(supabase, cacheKeyLive, payload)
      return NextResponse.json({ ...payload, fromCache: false, fetchedAt: new Date().toISOString() })
    }

    // ── 3. Tidak ada live → cek cache jadwal ─────────────────────────
    if (supabase) {
      const cached = await getCache(supabase, cacheKeySchedule)
      if (cached) {
        const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
        if (ageMs < CACHE_TTL_SCHEDULE_MS) {
          return NextResponse.json({ ...cached.payload, fromCache: true, fetchedAt: cached.fetched_at })
        }
      }
    }

    // ── 4. Fetch jadwal hari ini ──────────────────────────────────────
    const scheduleFixtures = await fetchScheduleForLeague(resolvedLeagueId)
    const payload = { mode: "schedule" as const, fixtures: scheduleFixtures }
    if (supabase) await setCache(supabase, cacheKeySchedule, payload)

    return NextResponse.json({ ...payload, fromCache: false, fetchedAt: new Date().toISOString() })

  } catch (err: any) {
    console.error("❌ live-scores route error:", err.message)
    // ── 5. API gagal → kembalikan stale cache jika ada ───────────────
    if (supabase) {
      const staleLive = await getCache(supabase, cacheKeyLive)
      if (staleLive) return NextResponse.json({ ...staleLive.payload, fromCache: true, stale: true, fetchedAt: staleLive.fetched_at })
      const staleSchedule = await getCache(supabase, cacheKeySchedule)
      if (staleSchedule) return NextResponse.json({ ...staleSchedule.payload, fromCache: true, stale: true, fetchedAt: staleSchedule.fetched_at })
    }
    return NextResponse.json({ error: err.message ?? "Gagal fetch data" }, { status: 500 })
  }
}
