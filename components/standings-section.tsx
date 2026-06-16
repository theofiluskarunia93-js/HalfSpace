"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, AlertCircle } from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────
interface LeagueOption {
  id: number
  name: string
  slug: string
  flag: string
  isWorldCup?: boolean
}

interface StandingRow {
  pos: number
  team: string
  logo: string
  played: number
  won: number
  drawn: number
  lost: number
  gd: number
  points: number
  form: string
  description: string
  group?: string
}

// ─── Leagues config ────────────────────────────────────────────────────────
const LEAGUES: LeagueOption[] = [
  { id: 27,  slug: "world-cup",        name: "World Cup",        flag: "🌍", isWorldCup: true },
  { id: 39,  slug: "premier-league",   name: "Premier League",   flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 140, slug: "la-liga",          name: "La Liga",          flag: "🇪🇸" },
  { id: 135, slug: "serie-a",          name: "Serie A",          flag: "🇮🇹" },
  { id: 78,  slug: "bundesliga",       name: "Bundesliga",       flag: "🇩🇪" },
  { id: 61,  slug: "ligue-1",          name: "Ligue 1",          flag: "🇫🇷" },
  { id: 2,   slug: "champions-league", name: "Champions League", flag: "🏆" },
]

// ─── Dummy data fallback ───────────────────────────────────────────────────
const DUMMY_STANDINGS: StandingRow[] = [
  { pos: 1,  team: "Manchester City",   logo: "", played: 36, won: 26, drawn: 5,  lost: 5,  gd: 58,  points: 83, form: "WWWDW", description: "UEFA Champions League" },
  { pos: 2,  team: "Arsenal",           logo: "", played: 36, won: 25, drawn: 5,  lost: 6,  gd: 52,  points: 80, form: "WWWWW", description: "UEFA Champions League" },
  { pos: 3,  team: "Liverpool",         logo: "", played: 36, won: 23, drawn: 8,  lost: 5,  gd: 51,  points: 77, form: "WDWWW", description: "UEFA Champions League" },
  { pos: 4,  team: "Aston Villa",       logo: "", played: 36, won: 21, drawn: 6,  lost: 9,  gd: 26,  points: 69, form: "WLWDW", description: "UEFA Champions League" },
  { pos: 5,  team: "Tottenham",         logo: "", played: 36, won: 19, drawn: 6,  lost: 11, gd: 18,  points: 63, form: "DWWLW", description: "UEFA Europa League" },
  { pos: 6,  team: "Chelsea",           logo: "", played: 36, won: 18, drawn: 8,  lost: 10, gd: 22,  points: 62, form: "WDWWL", description: "UEFA Europa League" },
  { pos: 7,  team: "Newcastle",         logo: "", played: 36, won: 17, drawn: 7,  lost: 12, gd: 12,  points: 58, form: "LLWWW", description: "" },
  { pos: 8,  team: "Manchester United", logo: "", played: 36, won: 14, drawn: 5,  lost: 17, gd: -10, points: 47, form: "LWLWL", description: "" },
  { pos: 9,  team: "Brighton",          logo: "", played: 36, won: 12, drawn: 10, lost: 14, gd: 0,   points: 46, form: "DLWLD", description: "" },
  { pos: 10, team: "West Ham",          logo: "", played: 36, won: 13, drawn: 5,  lost: 18, gd: -14, points: 44, form: "LWLLL", description: "" },
]

// ─── Cache helpers ─────────────────────────────────────────────────────────
const STANDINGS_CACHE_TTL = 12 * 60 * 60 * 1000

function readStandingsCache(league: string) {
  try {
    const raw = localStorage.getItem(`standings_standings_${league}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.cachedAt > STANDINGS_CACHE_TTL) return null
    return parsed
  } catch { return null }
}

function writeStandingsCache(league: string, data: any) {
  try {
    localStorage.setItem(`standings_standings_${league}`, JSON.stringify({ data, cachedAt: Date.now() }))
  } catch {}
}

function isRateLimitError(err: string): boolean {
  const lower = err.toLowerCase()
  return (
    lower.includes("rate limit") || lower.includes("quota") ||
    lower.includes("429") || lower.includes("limit reached") ||
    lower.includes("too many requests") || lower.includes("request limit") ||
    lower.includes("exceeded")
  )
}

// ─── Logo with fallback ────────────────────────────────────────────────────
function TeamLogo({ src, alt, size = 5 }: { src: string; alt: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    return (
      <img
        src={src}
        alt={alt}
        className={`h-${size} w-${size} flex-shrink-0 object-contain`}
        onError={() => setErr(true)}
      />
    )
  }
  return (
    <div className={`flex h-${size} w-${size} flex-shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground`}>
      {alt.charAt(0)}
    </div>
  )
}

// ─── Form indicator ────────────────────────────────────────────────────────
function FormBadge({ form }: { form: string }) {
  if (!form) return null
  const last5 = form.slice(-5).split("")
  return (
    <div className="flex gap-0.5">
      {last5.map((r, i) => (
        <span
          key={i}
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
            r === "W" ? "bg-green-500/20 text-green-400" :
            r === "D" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-destructive/20 text-destructive"
          }`}
        >
          {r}
        </span>
      ))}
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-border/50 animate-pulse">
          <td className="px-2 py-2.5 sm:px-4"><div className="h-5 w-5 rounded bg-muted" /></td>
          <td className="px-2 py-2.5 sm:px-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          </td>
          <td className="px-2 py-2.5 text-center sm:px-4"><div className="h-3 w-6 rounded bg-muted mx-auto" /></td>
          <td className="px-2 py-2.5 text-center sm:px-4"><div className="h-3 w-6 rounded bg-muted mx-auto" /></td>
          <td className="px-2 py-2.5 text-center sm:px-4"><div className="h-3 w-8 rounded bg-muted mx-auto" /></td>
        </tr>
      ))}
    </>
  )
}

// ─── League Pills ──────────────────────────────────────────────────────────
function LeaguePills({
  value,
  onChange,
}: {
  value: string
  onChange: (slug: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LEAGUES.map((l) => (
        <button
          key={l.slug}
          onClick={() => onChange(l.slug)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            value === l.slug
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
          }`}
        >
          {l.flag} {l.name}
        </button>
      ))}
    </div>
  )
}

// ─── Dummy Banner ──────────────────────────────────────────────────────────
function DummyBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
      <AlertCircle className="h-3 w-3 flex-shrink-0" />
      <span>Maaf, data sedang tidak dapat dimuat saat ini. Mohon tunggu beberapa saat lagi.</span>
    </div>
  )
}

// ─── Pos badge — warna berdasarkan description ────────────────────────────
function PosBadge({ pos, description, isWorldCup }: { pos: number; description: string; isWorldCup: boolean }) {
  const desc = (description ?? "").toLowerCase()
  let cls = "text-muted-foreground"

  if (isWorldCup) {
    // World Cup: posisi 1-2 lolos fase gugur (hijau), pos 3 play-off (kuning)
    if (pos <= 2) cls = "bg-primary/20 text-primary"
    else if (pos === 3) cls = "bg-yellow-500/20 text-yellow-400"
  } else {
    if (desc.includes("champions")) cls = "bg-primary/20 text-primary"
    else if (desc.includes("europa")) cls = "bg-orange-500/20 text-orange-400"
    else if (desc.includes("relegat")) cls = "bg-destructive/20 text-destructive"
  }

  return (
    <span className={`flex h-5 w-5 items-center justify-center rounded text-xs font-bold sm:h-6 sm:w-6 ${cls}`}>
      {pos}
    </span>
  )
}

// ─── World Cup Group Standings ─────────────────────────────────────────────
// Render per-group jika data mengandung field `group`
function WorldCupStandings({ rows, isLoading }: { rows: StandingRow[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <tbody><SkeletonRows count={8} /></tbody>
        </table>
      </div>
    )
  }

  // Groupkan berdasarkan field `group`
  const groups = rows.reduce<Record<string, StandingRow[]>>((acc, row) => {
    const g = row.group ?? "Grup A"
    if (!acc[g]) acc[g] = []
    acc[g].push(row)
    return acc
  }, {})

  const groupKeys = Object.keys(groups).sort()

  if (groupKeys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <span className="text-4xl mb-3">🌍</span>
        <p className="text-sm font-medium">Data klasemen belum tersedia</p>
        <p className="text-xs mt-1">Coba refresh atau periksa koneksi</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 p-3 sm:p-4">
      {groupKeys.map((groupName) => (
        <div key={groupName} className="rounded-lg border border-border overflow-hidden">
          <div className="bg-secondary/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {groupName}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium w-6">#</th>
                <th className="px-2 py-1.5 text-left font-medium">Tim</th>
                <th className="px-2 py-1.5 text-center font-medium">M</th>
                <th className="px-2 py-1.5 text-center font-medium">GD</th>
                <th className="px-2 py-1.5 text-center font-medium">Pts</th>
              </tr>
            </thead>
            <tbody>
              {groups[groupName].map((row) => (
                <tr
                  key={`${groupName}-${row.pos}`}
                  className={`border-b border-border/30 transition-colors hover:bg-secondary/50 ${
                    row.pos <= 2 ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <PosBadge pos={row.pos} description={row.description} isWorldCup={true} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <TeamLogo src={row.logo} alt={row.team} size={4} />
                      <span className="font-medium text-foreground truncate max-w-[80px]">{row.team}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">{row.played}</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </td>
                  <td className="px-2 py-1.5 text-center font-bold text-foreground">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── Regular Standings Table ───────────────────────────────────────────────
function RegularStandings({ rows, isLoading }: { rows: StandingRow[]; isLoading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-2 py-2 text-left font-medium sm:px-4 sm:py-3">#</th>
            <th className="px-2 py-2 text-left font-medium sm:px-4 sm:py-3">Tim</th>
            <th className="px-2 py-2 text-center font-medium sm:px-4 sm:py-3">M</th>
            <th className="px-2 py-2 text-center font-medium sm:px-4 sm:py-3">GD</th>
            <th className="px-2 py-2 text-center font-medium sm:px-4 sm:py-3">Pts</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <SkeletonRows count={10} />
          ) : (
            rows.slice(0, 10).map((row) => (
              <tr
                key={row.pos}
                className="border-b border-border/50 transition-colors hover:bg-secondary/50"
                title={row.description}
              >
                <td className="px-2 py-2 sm:px-4 sm:py-2.5">
                  <PosBadge pos={row.pos} description={row.description} isWorldCup={false} />
                </td>
                <td className="px-2 py-2 sm:px-4 sm:py-2.5">
                  <div className="flex items-center gap-2">
                    <TeamLogo src={row.logo} alt={row.team} size={5} />
                    <span className="font-medium text-foreground truncate max-w-[80px] sm:max-w-none">
                      {row.team}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-center text-muted-foreground sm:px-4 sm:py-2.5">{row.played}</td>
                <td className="px-2 py-2 text-center text-muted-foreground sm:px-4 sm:py-2.5">
                  {row.gd > 0 ? `+${row.gd}` : row.gd}
                </td>
                <td className="px-2 py-2 text-center font-bold text-foreground sm:px-4 sm:py-2.5">{row.points}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Standings Table ───────────────────────────────────────────────────────
function StandingsTable({
  league,
  onLeagueChange,
}: {
  league: string
  onLeagueChange: (slug: string) => void
}) {
  const [rows, setRows] = useState<StandingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDummy, setIsDummy] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const leagueConfig = LEAGUES.find((l) => l.slug === league)
  const isWorldCup = leagueConfig?.isWorldCup ?? false

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    const cached = readStandingsCache(league)
    if (cached && (cached.data.standings ?? []).length > 0) {
      setRows(cached.data.standings ?? [])
      setIsDummy(cached.data.isDummy ?? false)
      setCachedAt(new Date(cached.cachedAt).toISOString())
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/standings?type=standings&league=${league}`)
      const json = await res.json()

      if (!res.ok) {
        const errMsg = json.error ?? `HTTP ${res.status}`
        if (isRateLimitError(errMsg)) {
          setRows(DUMMY_STANDINGS)
          setIsDummy(true)
          setCachedAt(new Date().toISOString())
          writeStandingsCache(league, { standings: DUMMY_STANDINGS, isDummy: true })
          return
        }
        throw new Error(errMsg)
      }

      setRows(json.standings ?? [])
      setIsDummy(false)
      setCachedAt(json.cachedAt ?? null)
      if ((json.standings ?? []).length > 0) {
        writeStandingsCache(league, json)
      }
    } catch {
      if (rows.length === 0) {
        setRows(DUMMY_STANDINGS)
        setIsDummy(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [league])

  useEffect(() => {
    setRows([])
    setIsDummy(false)
    setIsLoading(true)
    fetchData()
  }, [league])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/30">
      <div className="flex flex-col gap-2 border-b border-border bg-secondary/50 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm sm:text-base">
            {isWorldCup ? "Klasemen Grup Piala Dunia 2026" : "League Table"}
          </h3>
          <div className="flex items-center gap-2">
            {cachedAt && (
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                {new Date(cachedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <LeaguePills value={league} onChange={onLeagueChange} />
        {isWorldCup && !isLoading && rows.length > 0 && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-primary/40" /> Lolos 16 Besar
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-yellow-500/40" /> Play-off
            </span>
          </div>
        )}
      </div>

      {isDummy && <DummyBanner />}

      {isWorldCup ? (
        <WorldCupStandings rows={rows} isLoading={isLoading} />
      ) : (
        <RegularStandings rows={rows} isLoading={isLoading} />
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export function StandingsSection() {
  const [standingsLeague, setStandingsLeague] = useState("world-cup")

  return (
    <section id="standings-section" className="border-t border-border bg-card py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h2
          className="mb-8 text-2xl font-bold uppercase tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-oswald)" }}
        >
          Standings
        </h2>

        <StandingsTable
          league={standingsLeague}
          onLeagueChange={setStandingsLeague}
        />
      </div>
    </section>
  )
}
