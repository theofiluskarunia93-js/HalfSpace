"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { RefreshCw, WifiOff, Clock, ChevronLeft, ChevronRight } from "lucide-react"

// ─── Interval refresh adaptif ──────────────────────────────────────────────
const REFRESH_LIVE_MS  = 2 * 60 * 1000
const REFRESH_IDLE_MS  = 30 * 60 * 1000

// ─── Status config ─────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; live: boolean; cls: string }> = {
  "1H":  { label: "LIVE",  live: true,  cls: "bg-primary/20 text-primary" },
  "2H":  { label: "LIVE",  live: true,  cls: "bg-primary/20 text-primary" },
  HT:    { label: "HT",    live: true,  cls: "bg-yellow-500/20 text-yellow-400" },
  ET:    { label: "ET",    live: true,  cls: "bg-primary/20 text-primary" },
  BT:    { label: "BT",    live: true,  cls: "bg-primary/20 text-primary" },
  P:     { label: "PEN",   live: true,  cls: "bg-primary/20 text-primary" },
  INT:   { label: "INT",   live: true,  cls: "bg-yellow-500/20 text-yellow-400" },
  NS:    { label: "SOON",  live: false, cls: "bg-secondary text-foreground" },
  TBD:   { label: "TBD",   live: false, cls: "bg-muted text-muted-foreground" },
  FT:    { label: "FT",    live: false, cls: "bg-muted text-muted-foreground" },
  AET:   { label: "AET",   live: false, cls: "bg-muted text-muted-foreground" },
  PEN:   { label: "PEN",   live: false, cls: "bg-muted text-muted-foreground" },
  PST:   { label: "TUNDA", live: false, cls: "bg-muted text-muted-foreground" },
  CANC:  { label: "BATAL", live: false, cls: "bg-muted text-muted-foreground" },
  SUSP:  { label: "SUSP",  live: false, cls: "bg-muted text-muted-foreground" },
  AWD:   { label: "AWD",   live: false, cls: "bg-muted text-muted-foreground" },
  WO:    { label: "WO",    live: false, cls: "bg-muted text-muted-foreground" },
}

// ─── Types ─────────────────────────────────────────────────────────────────
interface Fixture {
  fixture: {
    id: number
    date: string
    status: { short: string; elapsed: number | null }
  }
  league: { id: number; name: string; logo: string }
  teams: {
    home: { id: number; name: string; logo: string }
    away: { id: number; name: string; logo: string }
  }
  goals: { home: number | null; away: number | null }
}

interface LeagueGroup {
  leagueId: number
  leagueName: string
  leagueLogo: string
  fixtures: Fixture[]
}

interface ApiResponse {
  mode: "live" | "schedule"
  groups: LeagueGroup[]
  fetchedAt: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatWIB(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  })
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const todayStr = now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })
  const matchStr = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })
  const tomorrowDate = new Date(now)
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowStr = tomorrowDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })
  if (matchStr === todayStr) return "Hari ini"
  if (matchStr === tomorrowStr) return "Besok"
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" })
}

// ─── Logo ──────────────────────────────────────────────────────────────────
function Logo({ src, alt, size = 6 }: { src: string; alt: string; size?: number }) {
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
    <div className={`flex h-${size} w-${size} flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground`}>
      {alt.charAt(0)}
    </div>
  )
}

// ─── Match Card — shared by mobile & desktop, size via props ───────────────
function MatchCard({
  fixture,
  cardWidth = "w-[140px]",
  logoSize = 7,
  teamFontCls = "text-[10px]",
  scoreFontCls = "text-sm",
  timeFontCls = "text-xs",
  timeLabelCls = "text-[9px]",
}: {
  fixture: Fixture
  cardWidth?: string
  logoSize?: number
  teamFontCls?: string
  scoreFontCls?: string
  timeFontCls?: string
  timeLabelCls?: string
}) {
  const short = fixture.fixture.status.short
  const cfg = STATUS_CFG[short] ?? { label: short, live: false, cls: "bg-muted text-muted-foreground" }
  const elapsed = fixture.fixture.status.elapsed
  const isUpcoming = short === "NS" || short === "TBD"
  const homeGoals = fixture.goals.home
  const awayGoals = fixture.goals.away

  return (
    <div
      className={`flex flex-col items-center justify-between rounded-xl border border-border bg-card px-3 py-3 snap-start flex-shrink-0 ${cardWidth} gap-2 transition-colors hover:border-primary/40 hover:bg-secondary/40 ${
        cfg.live ? "border-primary/30 bg-primary/5" : ""
      }`}
    >
      {/* Status badge */}
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold leading-tight ${cfg.cls} ${
          cfg.live ? "animate-pulse" : ""
        }`}
      >
        {cfg.live && elapsed ? `${elapsed}'` : cfg.label}
      </span>

      {/* Home team */}
      <div className="flex flex-col items-center gap-1 w-full">
        <Logo src={fixture.teams.home.logo} alt={fixture.teams.home.name} size={logoSize} />
        <span className={`${teamFontCls} font-medium text-foreground/80 text-center line-clamp-1 w-full`}>
          {fixture.teams.home.name}
        </span>
      </div>

      {/* Score / Time */}
      <div className="text-center">
        {isUpcoming ? (
          <div className="flex flex-col items-center leading-tight">
            <span className={`${timeFontCls} font-bold text-foreground`}>{formatWIB(fixture.fixture.date)}</span>
            <span className={`${timeLabelCls} text-muted-foreground`}>{formatDateLabel(fixture.fixture.date)}</span>
          </div>
        ) : (
          <span className={`${scoreFontCls} font-bold tabular-nums ${cfg.live ? "text-primary" : "text-foreground"}`}>
            {homeGoals ?? "-"} - {awayGoals ?? "-"}
          </span>
        )}
      </div>

      {/* Away team */}
      <div className="flex flex-col items-center gap-1 w-full">
        <Logo src={fixture.teams.away.logo} alt={fixture.teams.away.name} size={logoSize} />
        <span className={`${teamFontCls} font-medium text-foreground/80 text-center line-clamp-1 w-full`}>
          {fixture.teams.away.name}
        </span>
      </div>
    </div>
  )
}

// ─── League Strip — used for BOTH mobile & desktop ─────────────────────────
function LeagueStrip({
  group,
  cardWidth,
  logoSize,
  teamFontCls,
  scoreFontCls,
  timeFontCls,
  timeLabelCls,
  scrollStep = 160,
  headerLogoSize = 4,
  headerFontCls = "text-xs",
  cardAreaPy = "py-3",
}: {
  group: LeagueGroup
  cardWidth?: string
  logoSize?: number
  teamFontCls?: string
  scoreFontCls?: string
  timeFontCls?: string
  timeLabelCls?: string
  scrollStep?: number
  headerLogoSize?: number
  headerFontCls?: string
  cardAreaPy?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const liveCount = group.fixtures.filter(
    (f) => STATUS_CFG[f.fixture.status.short]?.live
  ).length

  const updateArrows = () => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    el.addEventListener("scroll", updateArrows, { passive: true })
    return () => el.removeEventListener("scroll", updateArrows)
  }, [group.fixtures])

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -scrollStep : scrollStep, behavior: "smooth" })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* League header */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <Logo src={group.leagueLogo} alt={group.leagueName} size={headerLogoSize} />
        <span className={`${headerFontCls} font-bold uppercase tracking-wide text-foreground flex-1 truncate`}>
          {group.leagueName}
        </span>
        {liveCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary flex-shrink-0">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {liveCount} LIVE
          </span>
        )}
      </div>

      {/* Scroll area */}
      <div className="relative">
        {/* Left button */}
        <button
          onClick={() => scroll("left")}
          disabled={!canLeft}
          className={`absolute left-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-r from-card via-card/80 to-transparent transition-opacity ${
            canLeft ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll left"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:border-primary hover:text-primary transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </span>
        </button>

        <div
          ref={scrollRef}
          className={`flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory px-8 ${cardAreaPy}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {group.fixtures.map((f) => (
            <MatchCard
              key={f.fixture.id}
              fixture={f}
              cardWidth={cardWidth}
              logoSize={logoSize}
              teamFontCls={teamFontCls}
              scoreFontCls={scoreFontCls}
              timeFontCls={timeFontCls}
              timeLabelCls={timeLabelCls}
            />
          ))}
        </div>

        {/* Right button */}
        <button
          onClick={() => scroll("right")}
          disabled={!canRight}
          className={`absolute right-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-l from-card via-card/80 to-transparent transition-opacity ${
            canRight ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          aria-label="Scroll right"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:border-primary hover:text-primary transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonStrip({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card animate-pulse">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <div className="h-4 w-4 rounded-full bg-muted" />
        <div className="h-3 w-28 rounded bg-muted" />
      </div>
      <div className="flex gap-2 px-8 py-3">
        {Array.from({ length: cardCount }).map((_, i) => (
          <div key={i} className="flex-shrink-0 rounded-xl bg-muted" style={{ width: 100, height: 110 }} />
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export function LiveScores() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)
    setError(null)
    try {
      const res = await fetch("/api/live-scores", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) {
      setError(e.message ?? "Gagal memuat data")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const isLive = data?.mode === "live"
    intervalRef.current = setInterval(() => fetchData(true), isLive ? REFRESH_LIVE_MS : REFRESH_IDLE_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [data?.mode, fetchData])

  const isLiveMode = data?.mode === "live"
  const groups = data?.groups ?? []
  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt) : null

  return (
    <section className="border-y border-border bg-card py-4">
      <div className="mx-auto max-w-7xl px-4">

        {/* ── Header ── */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2
              className="text-xl font-bold uppercase tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-oswald)" }}
            >
              {isLiveMode ? "Live Scores" : "Jadwal Pertandingan"}
            </h2>
            {isLiveMode && (
              <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                LIVE
              </span>
            )}
            {!isLiveMode && !isLoading && (
              <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                24 jam ke depan
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {fetchedAt && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                Update {fetchedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              title="Refresh"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-sm">
            <WifiOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold text-foreground">Gagal memuat data</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
            </div>
            <button
              onClick={() => fetchData()}
              className="flex-shrink-0 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
            >
              Coba lagi
            </button>
          </div>
        ) : isLoading ? (
          <>
            {/* Mobile skeleton */}
            <div className="flex flex-col gap-3 md:hidden">
              {[3, 3, 2].map((c, i) => <SkeletonStrip key={i} cardCount={c} />)}
            </div>
            {/* Desktop skeleton */}
            <div className="hidden md:flex md:flex-col gap-3">
              {[5, 5, 4].map((c, i) => <SkeletonStrip key={i} cardCount={c} />)}
            </div>
          </>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 py-12 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium text-foreground">Tidak ada pertandingan</p>
            <p className="text-sm text-muted-foreground">Tidak ada jadwal dalam 24 jam ke depan untuk liga yang dipantau</p>
          </div>
        ) : (
          <>
            {/* ── Mobile strips ── */}
            <div className="flex flex-col gap-3 md:hidden">
              {groups.map((group) => (
                <LeagueStrip
                  key={group.leagueId}
                  group={group}
                  cardWidth="w-[100px]"
                  logoSize={5}
                  teamFontCls="text-[9px]"
                  scoreFontCls="text-xs"
                  timeFontCls="text-[10px]"
                  timeLabelCls="text-[8px]"
                  scrollStep={110}
                  headerLogoSize={3}
                  headerFontCls="text-[11px]"
                  cardAreaPy="py-2"
                />
              ))}
            </div>

            {/* ── Desktop strips ── */}
            <div className="hidden md:flex md:flex-col gap-3">
              {groups.map((group) => (
                <LeagueStrip
                  key={group.leagueId}
                  group={group}
                  cardWidth="w-[120px]"
                  logoSize={6}
                  teamFontCls="text-[10px]"
                  scoreFontCls="text-xs"
                  timeFontCls="text-[11px]"
                  timeLabelCls="text-[9px]"
                  scrollStep={130}
                  headerLogoSize={4}
                  headerFontCls="text-xs"
                  cardAreaPy="py-2"
                />
              ))}
            </div>
          </>
        )}

      </div>
    </section>
  )
}
