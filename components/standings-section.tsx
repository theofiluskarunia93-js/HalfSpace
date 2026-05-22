"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, WifiOff, TrendingUp } from "lucide-react"

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

// ─── Form indicator (W/D/L bubbles) ───────────────────────────────────────
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

// ─── Skeleton rows ─────────────────────────────────────────────────────────
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

// ─── League Selector pills ─────────────────────────────────────────────────
function LeaguePills({
  leagues,
  value,
  onChange,
}: {
  leagues: LeagueOption[]
  value: string
  onChange: (slug: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {leagues.map((l) => (
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

// ─── Standings table ───────────────────────────────────────────────────────
function StandingsTable({
  league,
  onLeagueChange,
  leagues,
}: {
  league: string
  onLeagueChange: (slug: string) => void
  leagues: LeagueOption[]
}) {
  const [rows, setRows] = useState<StandingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/standings?type=standings&league=${league}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setRows(json.standings ?? [])
      setCachedAt(json.cachedAt ?? null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }, [league])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/30">
      {/* Header */}
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
        {leagues.length > 0 && (
          <LeaguePills leagues={leagues} value={league} onChange={onLeagueChange} />
        )}
      </div>

      {/* Error */}
      {error ? (
        <div className="flex items-center gap-2 p-4 text-sm text-destructive">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
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
                <SkeletonRows count={6} />
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
      )}
    </div>
  )
}

// ─── Top Scorers list ──────────────────────────────────────────────────────
function TopScorers({
  league,
  onLeagueChange,
  leagues,
}: {
  league: string
  onLeagueChange: (slug: string) => void
  leagues: LeagueOption[]
}) {
  const [scorers, setScorers] = useState<Scorer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/standings?type=topscorers&league=${league}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setScorers(json.scorers ?? [])
      setCachedAt(json.cachedAt ?? null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }, [league])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-secondary/30">
      {/* Header */}
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
        {leagues.length > 0 && (
          <LeaguePills leagues={leagues} value={league} onChange={onLeagueChange} />
        )}
      </div>

      {/* Error */}
      {error ? (
        <div className="flex items-center gap-2 p-4 text-sm text-destructive">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {isLoading ? (
            <SkeletonScorers count={6} />
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
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export function StandingsSection() {
  // Standings dan Top Scorers bisa pilih liga berbeda secara independen
  const [standingsLeague, setStandingsLeague] = useState("premier-league")
  const [scorersLeague, setScorersLeague] = useState("premier-league")
  const [leagues, setLeagues] = useState<LeagueOption[]>([])

  // Fetch daftar liga sekali saja (dari response standings pertama)
  useEffect(() => {
    fetch("/api/standings?type=standings&league=premier-league")
      .then((r) => r.json())
      .then((json) => { if (json.leagues) setLeagues(json.leagues) })
      .catch(() => {})
  }, [])

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
            leagues={leagues}
          />
          <TopScorers
            league={scorersLeague}
            onLeagueChange={setScorersLeague}
            leagues={leagues}
          />
        </div>
      </div>
    </section>
  )
}
