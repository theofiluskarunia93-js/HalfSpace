"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, WifiOff, TrendingUp, AlertCircle } from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────
interface LeagueOption {
  id: number
  name: string
  slug: string
  flag: string
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
}

interface Scorer {
  pos: number
  player: string
  photo: string
  team: string
  teamLogo: string
  goals: number
  assists: number
  appearances: number
}

// ─── Leagues config ────────────────────────────────────────────────────────
const LEAGUES: LeagueOption[] = [
  { id: 39,  slug: "premier-league",   name: "Premier League",   flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 140, slug: "la-liga",          name: "La Liga",          flag: "🇪🇸" },
  { id: 135, slug: "serie-a",          name: "Serie A",          flag: "🇮🇹" },
  { id: 78,  slug: "bundesliga",       name: "Bundesliga",       flag: "🇩🇪" },
  { id: 61,  slug: "ligue-1",          name: "Ligue 1",          flag: "🇫🇷" },
  { id: 2,   slug: "champions-league", name: "Champions League", flag: "🏆" },
]

// ─── Dummy data fallback ───────────────────────────────────────────────────
const DUMMY_STANDINGS: StandingRow[] = [
  { pos: 1,  team: "Manchester City",   logo: "https://media.api-sports.io/football/teams/50.png",  played: 36, won: 26, drawn: 5,  lost: 5,  gd: 58,  points: 83, form: "WWWDW", description: "UEFA Champions League" },
  { pos: 2,  team: "Arsenal",           logo: "https://media.api-sports.io/football/teams/42.png",  played: 36, won: 25, drawn: 5,  lost: 6,  gd: 52,  points: 80, form: "WWWWW", description: "UEFA Champions League" },
  { pos: 3,  team: "Liverpool",         logo: "https://media.api-sports.io/football/teams/40.png",  played: 36, won: 23, drawn: 8,  lost: 5,  gd: 51,  points: 77, form: "WDWWW", description: "UEFA Champions League" },
  { pos: 4,  team: "Aston Villa",       logo: "https://media.api-sports.io/football/teams/66.png",  played: 36, won: 21, drawn: 6,  lost: 9,  gd: 26,  points: 69, form: "WLWDW", description: "UEFA Champions League" },
  { pos: 5,  team: "Tottenham",         logo: "https://media.api-sports.io/football/teams/47.png",  played: 36, won: 19, drawn: 6,  lost: 11, gd: 18,  points: 63, form: "DWWLW", description: "UEFA Europa League" },
  { pos: 6,  team: "Chelsea",           logo: "https://media.api-sports.io/football/teams/49.png",  played: 36, won: 18, drawn: 8,  lost: 10, gd: 22,  points: 62, form: "WDWWL", description: "UEFA Europa League" },
  { pos: 7,  team: "Newcastle",         logo: "https://media.api-sports.io/football/teams/34.png",  played: 36, won: 17, drawn: 7,  lost: 12, gd: 12,  points: 58, form: "LLWWW", description: "UEFA Europa Conference League" },
  { pos: 8,  team: "Manchester United", logo: "https://media.api-sports.io/football/teams/33.png",  played: 36, won: 14, drawn: 5,  lost: 17, gd: -10, points: 47, form: "LWLWL", description: "" },
  { pos: 9,  team: "Brighton",          logo: "https://media.api-sports.io/football/teams/51.png",  played: 36, won: 12, drawn: 10, lost: 14, gd: 0,   points: 46, form: "DLWLD", description: "" },
  { pos: 10, team: "West Ham",          logo: "https://media.api-sports.io/football/teams/48.png",  played: 36, won: 13, drawn: 5,  lost: 18, gd: -14, points: 44, form: "LWLLL", description: "" },
]

const DUMMY_SCORERS: Scorer[] = [
  { pos: 1, player: "Erling Haaland",   photo: "https://media.api-sports.io/football/players/1100.png", team: "Manchester City",   teamLogo: "https://media.api-sports.io/football/teams/50.png",  goals: 27, assists: 5,  appearances: 32 },
  { pos: 2, player: "Cole Palmer",      photo: "https://media.api-sports.io/football/players/226537.png", team: "Chelsea",          teamLogo: "https://media.api-sports.io/football/teams/49.png",  goals: 22, assists: 11, appearances: 34 },
  { pos: 3, player: "Alexander Isak",   photo: "https://media.api-sports.io/football/players/35845.png",  team: "Newcastle",        teamLogo: "https://media.api-sports.io/football/teams/34.png",  goals: 21, assists: 3,  appearances: 30 },
  { pos: 4, player: "Mohamed Salah",    photo: "https://media.api-sports.io/football/players/306.png",    team: "Liverpool",        teamLogo: "https://media.api-sports.io/football/teams/40.png",  goals: 19, assists: 13, appearances: 35 },
  { pos: 5, player: "Ollie Watkins",    photo: "https://media.api-sports.io/football/players/76369.png",  team: "Aston Villa",      teamLogo: "https://media.api-sports.io/football/teams/66.png",  goals: 19, assists: 13, appearances: 36 },
  { pos: 6, player: "Bukayo Saka",      photo: "https://media.api-sports.io/football/players/184916.png", team: "Arsenal",          teamLogo: "https://media.api-sports.io/football/teams/42.png",  goals: 16, assists: 9,  appearances: 34 },
  { pos: 7, player: "Son Heung-min",    photo: "https://media.api-sports.io/football/players/2728.png",   team: "Tottenham",        teamLogo: "https://media.api-sports.io/football/teams/47.png",  goals: 15, assists: 7,  appearances: 35 },
  { pos: 8, player: "Rasmus Højlund",   photo: "https://media.api-sports.io/football/players/254666.png", team: "Manchester United", teamLogo: "https://media.api-sports.io/football/teams/33.png", goals: 14, assists: 2,  appearances: 29 },
]

// ─── Cache helpers ─────────────────────────────────────────────────────────
const STANDINGS_CACHE_TTL = 12 * 60 * 60 * 1000  // 12 jam — standings jarang berubah

function readStandingsCache(league: string, type: string) {
  try {
    const raw = localStorage.getItem(`standings_${type}_${league}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.cachedAt > STANDINGS_CACHE_TTL) return null
    return parsed
  } catch { return null }
}

function writeStandingsCache(league: string, type: string, data: any) {
  try {
    localStorage.setItem(`standings_${type}_${league}`, JSON.stringify({ data, cachedAt: Date.now() }))
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

function SkeletonScorers({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-2.5 animate-pulse sm:px-4 sm:py-3">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded bg-muted" />
            <div className="h-7 w-7 rounded-full bg-muted" />
            <div>
              <div className="h-3 w-28 rounded bg-muted mb-1" />
              <div className="h-2.5 w-20 rounded bg-muted" />
            </div>
          </div>
          <div className="text-right">
            <div className="h-5 w-8 rounded bg-muted mb-1 ml-auto" />
            <div className="h-2.5 w-10 rounded bg-muted ml-auto" />
          </div>
        </div>
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

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    // Cek cache lokal dulu — validasi tidak kosong
    const cached = readStandingsCache(league, "standings")
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
          writeStandingsCache(league, "standings", { standings: DUMMY_STANDINGS, isDummy: true })
          return
        }
        throw new Error(errMsg)
      }

      setRows(json.standings ?? [])
      setIsDummy(false)
      setCachedAt(json.cachedAt ?? null)
      // Hanya cache jika data tidak kosong — mencegah poisoned cache
      if ((json.standings ?? []).length > 0) {
        writeStandingsCache(league, "standings", json)
      }
    } catch {
      // Fallback dummy jika kosong
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
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/30 min-h-[480px]">
      <div className="flex flex-col gap-2 border-b border-border bg-secondary/50 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm sm:text-base">League Table</h3>
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
      </div>

      {isDummy && <DummyBanner />}

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
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded text-xs font-bold sm:h-6 sm:w-6 ${
                        row.description?.toLowerCase().includes("champions")
                          ? "bg-primary/20 text-primary"
                          : row.description?.toLowerCase().includes("europa")
                          ? "bg-orange-500/20 text-orange-400"
                          : row.description?.toLowerCase().includes("relegat")
                          ? "bg-destructive/20 text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {row.pos}
                    </span>
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
    </div>
  )
}

// ─── Top Scorers ───────────────────────────────────────────────────────────
function TopScorers({
  league,
  onLeagueChange,
}: {
  league: string
  onLeagueChange: (slug: string) => void
}) {
  const [scorers, setScorers] = useState<Scorer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDummy, setIsDummy] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    // Cek cache lokal dulu — validasi tidak kosong
    const cached = readStandingsCache(league, "topscorers")
    if (cached && (cached.data.scorers ?? []).length > 0) {
      setScorers(cached.data.scorers ?? [])
      setIsDummy(cached.data.isDummy ?? false)
      setCachedAt(new Date(cached.cachedAt).toISOString())
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/standings?type=topscorers&league=${league}`)
      const json = await res.json()

      if (!res.ok) {
        const errMsg = json.error ?? `HTTP ${res.status}`
        if (isRateLimitError(errMsg)) {
          setScorers(DUMMY_SCORERS)
          setIsDummy(true)
          setCachedAt(new Date().toISOString())
          writeStandingsCache(league, "topscorers", { scorers: DUMMY_SCORERS, isDummy: true })
          return
        }
        throw new Error(errMsg)
      }

      setScorers(json.scorers ?? [])
      setIsDummy(false)
      setCachedAt(json.cachedAt ?? null)
      // Hanya cache jika data tidak kosong — mencegah poisoned cache
      if ((json.scorers ?? []).length > 0) {
        writeStandingsCache(league, "topscorers", json)
      }
    } catch {
      if (scorers.length === 0) {
        setScorers(DUMMY_SCORERS)
        setIsDummy(true)
      }
    } finally {
      setIsLoading(false)
    }
  }, [league])

  useEffect(() => {
    setScorers([])
    setIsDummy(false)
    setIsLoading(true)
    fetchData()
  }, [league])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/30 min-h-[510px]">
      <div className="flex flex-col gap-2 border-b border-border bg-secondary/50 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm sm:text-base">Top Scorers</h3>
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
      </div>

      {isDummy && <DummyBanner />}

      <div className="divide-y divide-border/50">
        {isLoading ? (
          <SkeletonScorers count={8} />
        ) : (
          scorers.slice(0, 8).map((scorer) => (
            <div
              key={scorer.pos}
              className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-secondary/50 sm:px-4 sm:py-3"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold sm:h-6 sm:w-6 ${
                    scorer.pos <= 3
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {scorer.pos}
                </span>
                <TeamLogo src={scorer.photo} alt={scorer.player} size={7} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate sm:text-sm">{scorer.player}</p>
                  <div className="flex items-center gap-1">
                    <TeamLogo src={scorer.teamLogo} alt={scorer.team} size={3} />
                    <p className="text-[10px] text-muted-foreground truncate">{scorer.team}</p>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className="flex items-center gap-1 justify-end">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  <span className="text-base font-bold text-primary sm:text-xl">{scorer.goals}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {scorer.assists} assist · {scorer.appearances} laga
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export function StandingsSection() {
  const [standingsLeague, setStandingsLeague] = useState("premier-league")
  const [scorersLeague, setScorersLeague] = useState("premier-league")

  return (
    <section id="standings-section" className="border-t border-border bg-card py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h2
          className="mb-8 text-2xl font-bold uppercase tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-oswald)" }}
        >
          Standings & Top Scorers
        </h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <StandingsTable
            league={standingsLeague}
            onLeagueChange={setStandingsLeague}
          />
          <TopScorers
            league={scorersLeague}
            onLeagueChange={setScorersLeague}
          />
        </div>
      </div>
    </section>
  )
}
