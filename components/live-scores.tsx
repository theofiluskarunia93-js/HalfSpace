"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { RefreshCw, WifiOff, Clock, ChevronDown, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"

// ─── Interval refresh ─────────────────────────────────────────────────────
const REFRESH_WITH_MATCHES_MS = 15 * 60 * 1000  // 15 menit jika ada pertandingan

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

// ─── Liga yang tersedia untuk dropdown filter ─────────────────────────────
const LEAGUES = [
  { id: 39,  slug: "premier-league",   name: "Premier League",    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 140, slug: "la-liga",          name: "La Liga",           flag: "🇪🇸" },
  { id: 135, slug: "serie-a",          name: "Serie A",           flag: "🇮🇹" },
  { id: 78,  slug: "bundesliga",       name: "Bundesliga",        flag: "🇩🇪" },
  { id: 61,  slug: "ligue-1",          name: "Ligue 1",           flag: "🇫🇷" },
  { id: 2,   slug: "champions-league", name: "Champions League",  flag: "🏆" },
  { id: 3,   slug: "europa-league",    name: "Europa League",     flag: "🌍" },
]

// ─── Storage key untuk cache lokal (per-liga) ─────────────────────────────
const CACHE_KEY = (leagueSlug: string) => `livescores_cache_${leagueSlug}`
const CACHE_TTL_EMPTY_MS  = 24 * 60 * 60 * 1000   // 24 jam jika tidak ada pertandingan
const CACHE_TTL_ACTIVE_MS = 15 * 60 * 1000          // 15 menit jika ada pertandingan

// ─── Dummy data fallback (saat API limit tercapai) ────────────────────────
const DUMMY_FIXTURES: Fixture[] = [
  {
    fixture: { id: 9001, date: new Date(Date.now() + 2 * 3600_000).toISOString(), status: { short: "NS", elapsed: null } },
    teams: {
      home: { id: 40, name: "Liverpool",       logo: "https://media.api-sports.io/football/teams/40.png" },
      away: { id: 42, name: "Arsenal",          logo: "https://media.api-sports.io/football/teams/42.png" },
    },
    goals: { home: null, away: null },
  },
  {
    fixture: { id: 9002, date: new Date(Date.now() + 3 * 3600_000).toISOString(), status: { short: "NS", elapsed: null } },
    teams: {
      home: { id: 50, name: "Manchester City", logo: "https://media.api-sports.io/football/teams/50.png" },
      away: { id: 66, name: "Aston Villa",     logo: "https://media.api-sports.io/football/teams/66.png" },
    },
    goals: { home: null, away: null },
  },
  {
    fixture: { id: 9003, date: new Date(Date.now() + 4 * 3600_000).toISOString(), status: { short: "NS", elapsed: null } },
    teams: {
      home: { id: 47, name: "Tottenham",         logo: "https://media.api-sports.io/football/teams/47.png" },
      away: { id: 33, name: "Manchester United", logo: "https://media.api-sports.io/football/teams/33.png" },
    },
    goals: { home: null, away: null },
  },
  {
    fixture: { id: 9004, date: new Date(Date.now() + 5 * 3600_000).toISOString(), status: { short: "NS", elapsed: null } },
    teams: {
      home: { id: 49, name: "Chelsea",   logo: "https://media.api-sports.io/football/teams/49.png" },
      away: { id: 51, name: "Brighton",  logo: "https://media.api-sports.io/football/teams/51.png" },
    },
    goals: { home: null, away: null },
  },
  {
    fixture: { id: 9005, date: new Date(Date.now() + 6 * 3600_000).toISOString(), status: { short: "NS", elapsed: null } },
    teams: {
      home: { id: 34, name: "Newcastle", logo: "https://media.api-sports.io/football/teams/34.png" },
      away: { id: 48, name: "West Ham",  logo: "https://media.api-sports.io/football/teams/48.png" },
    },
    goals: { home: null, away: null },
  },
]

// ─── Types ─────────────────────────────────────────────────────────────────
interface Fixture {
  fixture: {
    id: number
    date: string
    status: { short: string; elapsed: number | null }
  }
  teams: {
    home: { id: number; name: string; logo: string }
    away: { id: number; name: string; logo: string }
  }
  goals: { home: number | null; away: number | null }
}

// FIX: ApiResponse sekarang menggunakan fixtures: Fixture[] (flat array)
// sesuai dengan apa yang dikembalikan route.ts yang sudah diperbaiki
interface ApiResponse {
  mode: "live" | "schedule"
  fixtures: Fixture[]   // ← bukan groups: [...] lagi
  fetchedAt: string
  isDummy?: boolean
}

interface CachedData {
  data: ApiResponse
  cachedAt: number
  hasMatches: boolean
}

// ─── Cache lokal (localStorage-based) ────────────────────────────────────
function readCache(leagueSlug: string): CachedData | null {
  try {
    if (typeof window === "undefined") return null
    const raw = localStorage.getItem(CACHE_KEY(leagueSlug))
    if (!raw) return null
    const parsed: CachedData = JSON.parse(raw)
    if (!parsed?.cachedAt || !parsed?.data) return null
    const age = Date.now() - parsed.cachedAt
    const ttl = parsed.hasMatches ? CACHE_TTL_ACTIVE_MS : CACHE_TTL_EMPTY_MS
    if (age > ttl) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(leagueSlug: string, data: ApiResponse, hasMatches: boolean) {
  try {
    if (typeof window === "undefined") return
    const payload: CachedData = { data, cachedAt: Date.now(), hasMatches }
    localStorage.setItem(CACHE_KEY(leagueSlug), JSON.stringify(payload))
  } catch {
    // storage penuh / private mode, abaikan
  }
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
  const todayStr     = now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })
  const matchStr     = d.toLocaleDateString("id-ID",  { timeZone: "Asia/Jakarta" })
  const tomorrowDate = new Date(now)
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowStr  = tomorrowDate.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })
  if (matchStr === todayStr)     return "Hari ini"
  if (matchStr === tomorrowStr)  return "Besok"
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" })
}

function isRateLimitError(err: string): boolean {
  const lower = err.toLowerCase()
  return (
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("429") ||
    lower.includes("limit reached") ||
    lower.includes("too many requests") ||
    lower.includes("request limit") ||
    lower.includes("exceeded")
  )
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

// ─── Match Card ────────────────────────────────────────────────────────────
function MatchCard({
  fixture,
  cardWidth = "w-[140px]",
  logoSize = 7,
  teamFontCls = "text-[10px]",
  scoreFontCls = "text-sm",
  timeFontCls = "text-xs",
  timeLabelCls = "text-[9px]",
  isDummy = false,
}: {
  fixture: Fixture
  cardWidth?: string
  logoSize?: number
  teamFontCls?: string
  scoreFontCls?: string
  timeFontCls?: string
  timeLabelCls?: string
  isDummy?: boolean
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
      } ${isDummy ? "opacity-75" : ""}`}
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

// ─── Scrollable Match Strip ────────────────────────────────────────────────
function MatchStrip({
  fixtures,
  cardWidth,
  logoSize,
  teamFontCls,
  scoreFontCls,
  timeFontCls,
  timeLabelCls,
  scrollStep = 160,
  isDummy = false,
}: {
  fixtures: Fixture[]
  cardWidth?: string
  logoSize?: number
  teamFontCls?: string
  scoreFontCls?: string
  timeFontCls?: string
  timeLabelCls?: string
  scrollStep?: number
  isDummy?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft]   = useState(false)
  const [canRight, setCanRight] = useState(true)

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
  }, [fixtures])

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -scrollStep : scrollStep, behavior: "smooth" })
  }

  return (
    <div className="relative">
      <button
        onClick={() => scroll("left")}
        disabled={!canLeft}
        className={`absolute left-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-r from-card via-card/80 to-transparent transition-opacity ${
          canLeft ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Scroll kiri"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:border-primary hover:text-primary transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />
        </span>
      </button>

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory px-8 py-3"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {fixtures.map((f) => (
          <MatchCard
            key={f.fixture.id}
            fixture={f}
            cardWidth={cardWidth}
            logoSize={logoSize}
            teamFontCls={teamFontCls}
            scoreFontCls={scoreFontCls}
            timeFontCls={timeFontCls}
            timeLabelCls={timeLabelCls}
            isDummy={isDummy}
          />
        ))}
      </div>

      <button
        onClick={() => scroll("right")}
        disabled={!canRight}
        className={`absolute right-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-l from-card via-card/80 to-transparent transition-opacity ${
          canRight ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Scroll kanan"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:border-primary hover:text-primary transition-colors">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
    </div>
  )
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonStrip({ cardCount = 5 }: { cardCount?: number }) {
  return (
    <div className="flex gap-2 px-8 py-3 animate-pulse min-h-[130px]">
      {Array.from({ length: cardCount }).map((_, i) => (
        <div key={i} className="flex-shrink-0 rounded-xl bg-muted" style={{ width: 120, height: 130 }} />
      ))}
    </div>
  )
}

// ─── League Dropdown ───────────────────────────────────────────────────────
function LeagueDropdown({
  value,
  onChange,
}: {
  value: string
  onChange: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = LEAGUES.find((l) => l.slug === value) ?? LEAGUES[0]
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/50 hover:bg-secondary transition-colors"
      >
        <span>{selected.flag}</span>
        <span className="hidden sm:inline">{selected.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {LEAGUES.map((league) => (
            <button
              key={league.slug}
              onClick={() => { onChange(league.slug); setOpen(false) }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/60 ${
                league.slug === value ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
              }`}
            >
              <span className="text-base">{league.flag}</span>
              <span>{league.name}</span>
              {league.slug === value && <span className="ml-auto text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Banner: dummy mode ────────────────────────────────────────────────────
function DummyBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
      <span>Maaf, data sedang tidak dapat dimuat saat ini. Mohon tunggu beberapa saat lagi.</span>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────
export function LiveScores() {
  const [selectedLeague, setSelectedLeague] = useState("premier-league")
  const [data, setData]           = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDummy, setIsDummy]     = useState(false)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(async (silent = false) => {
    // Cek cache lokal dulu
    const cached = readCache(selectedLeague)
    if (cached && !silent) {
      setData(cached.data)
      setIsDummy(cached.data.isDummy ?? false)
      setFetchedAt(new Date(cached.cachedAt))
      setIsLoading(false)
      return
    }

    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      // FIX: kirim leagueId yang benar ke API route yang sudah diperbaiki
      const leagueObj = LEAGUES.find((l) => l.slug === selectedLeague)
      const leagueId  = leagueObj?.id ?? 39

      const res  = await fetch(`/api/live-scores?league=${leagueId}`, { cache: "no-store" })
      const json = await res.json()

      if (!res.ok) {
        const errMsg = json.error ?? `HTTP ${res.status}`
        if (isRateLimitError(errMsg)) {
          const dummyResponse: ApiResponse = {
            mode: "schedule",
            fixtures: DUMMY_FIXTURES,
            fetchedAt: new Date().toISOString(),
            isDummy: true,
          }
          setData(dummyResponse)
          setIsDummy(true)
          setFetchedAt(new Date())
          writeCache(selectedLeague, dummyResponse, true)
          return
        }
        throw new Error(errMsg)
      }

      // FIX: API sekarang return { fixtures: [...] } langsung (flat array)
      // Tidak perlu transform dari groups lagi
      const fixtures: Fixture[] = json.fixtures ?? []
      const hasMatches = fixtures.length > 0

      const normalized: ApiResponse = {
        mode: json.mode ?? "schedule",
        fixtures,
        fetchedAt: json.fetchedAt ?? new Date().toISOString(),
        isDummy: false,
      }

      setData(normalized)
      setIsDummy(false)
      setFetchedAt(new Date())
      writeCache(selectedLeague, normalized, hasMatches)

    } catch (e: any) {
      const errMsg = e.message ?? "Gagal memuat data"
      if (isRateLimitError(errMsg)) {
        if (!data) {
          const dummyResponse: ApiResponse = {
            mode: "schedule",
            fixtures: DUMMY_FIXTURES,
            fetchedAt: new Date().toISOString(),
            isDummy: true,
          }
          setData(dummyResponse)
          setIsDummy(true)
          setFetchedAt(new Date())
        }
      }
      // Jika sudah ada data sebelumnya, biarkan tampil data lama
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedLeague, data])

  // Fetch awal saat liga berubah
  useEffect(() => {
    setIsLoading(true)
    setData(null)
    setIsDummy(false)
    fetchData()
  }, [selectedLeague])

  // Setup auto-refresh berdasarkan kondisi data
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    // FIX: gunakan data?.fixtures (bukan data?.groups) untuk cek hasMatches
    const hasMatches  = (data?.fixtures?.length ?? 0) > 0
    const isDummyMode = data?.isDummy ?? false

    if (!hasMatches || isDummyMode) return

    intervalRef.current = setInterval(() => fetchData(true), REFRESH_WITH_MATCHES_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [data, fetchData])

  const isLiveMode = data?.mode === "live"

  // FIX: baca fixtures langsung dari data.fixtures (sudah flat)
  const fixtures = data?.fixtures ?? []
  const hasLive  = fixtures.some((f) => STATUS_CFG[f.fixture.status.short]?.live)

  const getNextRefreshLabel = () => {
    const hasMatches = fixtures.length > 0 && !isDummy
    if (!hasMatches) return null
    return "Auto-refresh 15 mnt"
  }

  return (
    <section className="border-y border-border bg-card py-4 min-h-[200px]">
      <div className="mx-auto max-w-7xl px-4">

        {/* ── Header ── */}
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
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
            {hasLive && (
              <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {fixtures.filter((f) => STATUS_CFG[f.fixture.status.short]?.live).length} LIVE
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {getNextRefreshLabel() && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                {getNextRefreshLabel()}
              </span>
            )}
            {fetchedAt && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                Update {fetchedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing || isLoading}
              title="Refresh"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
            <LeagueDropdown value={selectedLeague} onChange={setSelectedLeague} />
          </div>
        </div>

        {/* ── Dummy banner ── */}
        {isDummy && !isLoading && (
          <div className="mb-3">
            <DummyBanner />
          </div>
        )}

        {/* ── Content ── */}
        <div className="overflow-hidden rounded-xl border border-border bg-card min-h-[146px]">
          {isLoading ? (
            <>
              <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2 animate-pulse">
                <div className="h-4 w-24 rounded bg-muted" />
              </div>
              <SkeletonStrip cardCount={5} />
            </>
          ) : fixtures.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">Tidak ada pertandingan</p>
              <p className="text-sm text-muted-foreground">
                Tidak ada jadwal dalam 24 jam ke depan untuk{" "}
                {LEAGUES.find((l) => l.slug === selectedLeague)?.name ?? "liga ini"}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden">
                <MatchStrip
                  fixtures={fixtures}
                  cardWidth="w-[100px]"
                  logoSize={5}
                  teamFontCls="text-[9px]"
                  scoreFontCls="text-xs"
                  timeFontCls="text-[10px]"
                  timeLabelCls="text-[8px]"
                  scrollStep={110}
                  isDummy={isDummy}
                />
              </div>

              {/* Desktop */}
              <div className="hidden md:block">
                <MatchStrip
                  fixtures={fixtures}
                  cardWidth="w-[120px]"
                  logoSize={6}
                  teamFontCls="text-[10px]"
                  scoreFontCls="text-xs"
                  timeFontCls="text-[11px]"
                  timeLabelCls="text-[9px]"
                  scrollStep={130}
                  isDummy={isDummy}
                />
              </div>
            </>
          )}
        </div>

      </div>
    </section>
  )
}
