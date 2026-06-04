"use client"

import React, { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Pencil, CalendarDays, Trophy, Loader2, AlertCircle, Clock, MapPin, Brain } from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

export interface MatchRow {
  id: string
  widget_id: string
  group_label: string
  home_team: string
  away_team: string
  match_date?: string | null
  match_time?: string | null
  score_home?: number | null
  score_away?: number | null
  stadium?: string | null
  status?: "scheduled" | "live" | "finished"
}

export interface StandingRow {
  id: string
  widget_id: string
  rank: number
  team_name: string
  group_label: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

interface JadwalCardProps {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string) => void
}

interface KlasemenCardProps {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  } catch {
    return dateStr
  }
}

function formatTime(timeStr: string): string {
  // timeStr bisa "HH:MM" atau "HH:MM:SS" — ambil hanya jam & menit
  const parts = timeStr.split(":")
  const hh = parts[0] ?? "00"
  const mm = parts[1] ?? "00"
  return hh + "." + mm + " WIB"
}

function LoadingState() {
  return (
    <div className="flex min-h-[140px] items-center justify-center gap-2 text-gray-400">
      <Loader2 size={16} className="animate-spin text-[#39FF14]" />
      <span className="text-sm">Memuat data...</span>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-red-400">
      <AlertCircle size={16} />
      <span className="text-sm">{message}</span>
    </div>
  )
}

// ── Jadwal Pertandingan Card ──────────────────────────────────────────────────
// Matches the dark card style in screenshot 1

export function JadwalCard({ widgetId, isAdmin, onEdit }: JadwalCardProps) {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("widget_jadwal")
          .select("*")
          .eq("widget_id", widgetId)
          .order("match_date", { ascending: true })

        if (error) throw error
        setMatches(data ?? [])
        if (data && data.length > 0) setActiveGroup(data[0].group_label)
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat data jadwal.")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [widgetId])

  const groups = [...new Set(matches.map((m) => m.group_label))].sort()
  const filtered = activeGroup ? matches.filter((m) => m.group_label === activeGroup) : matches

  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg min-h-[220px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#13151c] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={18} className="text-[#39FF14]" />
          <span className="font-semibold text-white">Jadwal Pertandingan</span>
        </div>
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(widgetId)}
            className="flex items-center gap-1.5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-1.5 text-xs font-medium text-[#39FF14] transition-all hover:bg-[#39FF14]/20 hover:border-[#39FF14]/60"
          >
            <Pencil size={12} />
            Edit Widget
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : matches.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Belum ada jadwal.</p>
      ) : (
        <>
          {/* Group tabs — horizontal scroll */}
          {groups.length > 1 && (
            <div
              className="flex gap-2 border-b border-white/10 bg-[#13151c] px-5 py-3 overflow-x-auto"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    activeGroup === g
                      ? "bg-[#39FF14] text-black"
                      : "border border-white/10 bg-white/5 text-gray-300 hover:border-[#39FF14]/40 hover:text-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {/* Match cards grid */}
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            {filtered.map((m) => (
              <MatchItem key={m.id} match={m} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MatchItem({ match: m }: { match: MatchRow }) {
  const hasScore = m.status === "live" || m.status === "finished"
  const isLive = m.status === "live"

  return (
    <div className="rounded-xl border border-white/10 bg-[#181b24] p-4 transition-colors hover:border-white/20">
      {/* Top: Badge + Date */}
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-md bg-[#39FF14] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-black">
          {m.group_label}
        </span>
        {m.match_date && (
          <span className="text-[11px] text-gray-400">{formatDate(m.match_date)}</span>
        )}
      </div>

      {/* Teams + Score */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex-1 text-left text-sm font-bold text-white">{m.home_team}</span>
        {hasScore ? (
          <span className="mx-2 text-lg font-black text-white tabular-nums">
            {m.score_home ?? 0}
            <span className="mx-1.5 text-[#39FF14]">–</span>
            {m.score_away ?? 0}
          </span>
        ) : (
          <span className="mx-2 text-sm font-bold text-[#39FF14]">vs</span>
        )}
        <span className="flex-1 text-right text-sm font-bold text-white">{m.away_team}</span>
      </div>

      {/* Bottom: Time + Stadium */}
      <div className="flex items-center justify-between gap-2">
        {m.match_time && (
          <div className="flex items-center gap-1.5 rounded-md bg-black/40 px-2.5 py-1">
            <span className="text-sm">⏰</span>
            <span className={`text-xs font-bold ${isLive ? "text-red-400" : "text-white"}`}>
              {isLive ? "LIVE" : formatTime(m.match_time)}
            </span>
          </div>
        )}
        {m.stadium && (
          <span className="text-right text-[11px] text-gray-500 truncate">{m.stadium}</span>
        )}
      </div>
    </div>
  )
}

// ── Klasemen Grup Card ────────────────────────────────────────────────────────
// Matches the standings table in screenshot 2

export function KlasemenCard({ widgetId, isAdmin, onEdit }: KlasemenCardProps) {
  const [standings, setStandings] = useState<StandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("widget_klasemen")
          .select("*")
          .eq("widget_id", widgetId)
          .order("points", { ascending: false })

        if (error) throw error
        setStandings(data ?? [])
        if (data && data.length > 0) setActiveGroup(data[0].group_label)
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat data klasemen.")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [widgetId])

  const groups = [...new Set(standings.map((s) => s.group_label))].sort()
  const filtered = standings
    .filter((s) => s.group_label === activeGroup)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const sgA = a.gf - a.ga
      const sgB = b.gf - b.ga
      if (sgB !== sgA) return sgB - sgA
      return b.gf - a.gf
    })

  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg min-h-[220px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#13151c] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Trophy size={18} className="text-[#39FF14]" />
          <span className="font-semibold text-white">Klasemen Grup</span>
          <span className="rounded-full border border-[#39FF14]/20 bg-[#39FF14]/10 px-2 py-0.5 text-[10px] font-bold text-[#39FF14]">
            Sementara
          </span>
        </div>
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(widgetId)}
            className="flex items-center gap-1.5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-1.5 text-xs font-medium text-[#39FF14] transition-all hover:bg-[#39FF14]/20 hover:border-[#39FF14]/60"
          >
            <Pencil size={12} />
            Edit Widget
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : standings.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Belum ada data klasemen.</p>
      ) : (
        <>
          {/* Group tabs — horizontal scroll */}
          {groups.length > 1 && (
            <div
              className="flex gap-2 border-b border-white/10 bg-[#13151c] px-5 py-3 overflow-x-auto"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    activeGroup === g
                      ? "bg-[#39FF14] text-black"
                      : "border border-white/10 bg-white/5 text-gray-300 hover:border-[#39FF14]/40 hover:text-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {/* Table — horizontal scroll on mobile with visible scrollbar */}
          <div
            className="overflow-x-auto"
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(57,255,20,0.4) rgba(255,255,255,0.05)",
            }}
          >
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-[#181b24]">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Tim
                  </th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">M</th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">W</th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">S</th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">K</th>
                  <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-[#39FF14]/60">
                    PTS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-white/[0.02] ${
                      i < 2 ? "border-l-2 border-[#39FF14]/60" : i === 2 ? "border-l-2 border-yellow-500/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            i < 2 ? "text-[#39FF14]" : "text-gray-500"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="font-medium text-white whitespace-nowrap">{row.team_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-gray-300">{row.played}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-gray-300">{row.won}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-gray-300">{row.drawn}</td>
                    <td className="px-3 py-3 text-center tabular-nums text-gray-300">{row.lost}</td>
                    <td className="px-3 py-3 text-center font-bold text-[#39FF14] tabular-nums">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile scroll hint */}
          <div className="flex items-center justify-center gap-1.5 border-t border-white/5 py-2 sm:hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#39FF14]/40"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span className="text-[10px] text-gray-600">Geser untuk lihat lebih</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#39FF14]/40 rotate-180"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 border-t border-white/5 px-5 py-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#39FF14]" />
              <span className="text-[10px] text-gray-500">Lolos (Juara/Runner-up)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <span className="text-[10px] text-gray-500">Kandidat Peringkat 3</span>
            </div>
          </div>
          {/* Keterangan kolom */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/5 px-5 py-2.5">
            {[
              ["M", "Main"],
              ["W", "Menang"],
              ["S", "Imbang"],
              ["K", "Kalah"],
              ["PTS", "Poin"],
            ].map(([key, val]) => (
              <span key={key} className="text-[10px] text-gray-600">
                <span className="font-bold text-gray-400">{key}</span> = {val}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Transfer Pemain Card ───────────────────────────────────────────────────────
// Matches screenshot 1-4: dark table with league tabs, player list, transfer value, status

export interface TransferRow {
  id: string
  widget_id: string
  league_label: string
  player_name: string
  player_initials: string
  position: string
  age: number
  from_club: string
  from_club_color: string
  to_club: string
  league_dest: string
  transfer_value: number | null
  is_free: boolean
  status: "confirmed" | "official" | "medical" | "rumor"
  transfer_date: string | null
}

interface TransferCardProps {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string) => void
}

export function TransferCard({ widgetId, isAdmin, onEdit }: TransferCardProps) {
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeLeague, setActiveLeague] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("widget_transfer")
          .select("*")
          .eq("widget_id", widgetId)
          .order("transfer_date", { ascending: false })
        if (error) throw error
        setTransfers(data ?? [])
        if (data && data.length > 0) setActiveLeague(data[0].league_label)
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat data transfer.")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [widgetId])

  const leagues = [...new Set(transfers.map((t) => t.league_label))].sort()
  const filtered = activeLeague ? transfers.filter((t) => t.league_label === activeLeague) : transfers

  const statusConfig = {
    confirmed: { label: "CONFIRMED", color: "#39FF14", bg: "rgba(57,255,20,0.1)", border: "rgba(57,255,20,0.4)" },
    official:  { label: "OFFICIAL",  color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.4)" },
    medical:   { label: "MEDICAL",   color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.4)" },
    rumor:     { label: "RUMOR",     color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.4)" },
  }

  function formatDate(d: string | null) {
    if (!d) return ""
    try {
      return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
    } catch { return d }
  }

  // Format numeric transfer value to readable string (in millions €)
  function formatTransferValue(val: number | null): string {
    if (val === null || val === undefined) return "-"
    if (val >= 1000) return `€${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}M`
    if (val >= 1) return `€${val}M`
    return `€${(val * 1000).toFixed(0)}K`
  }

  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg min-h-[220px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#13151c] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🔄</span>
          <span className="font-semibold text-white">Transfer Pemain</span>
        </div>
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(widgetId)}
            className="flex items-center gap-1.5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-1.5 text-xs font-medium text-[#39FF14] transition-all hover:bg-[#39FF14]/20 hover:border-[#39FF14]/60"
          >
            <Pencil size={12} />
            Edit Widget
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : transfers.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Belum ada data transfer.</p>
      ) : (
        <>
          {/* League tabs — horizontal scroll */}
          {leagues.length > 0 && (
            <div
              className="flex gap-2 border-b border-white/10 bg-[#13151c] px-5 py-3 overflow-x-auto"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              <button
                onClick={() => setActiveLeague(null)}
                className={`shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  activeLeague === null
                    ? "bg-[#39FF14] text-black"
                    : "border border-white/10 bg-white/5 text-gray-300 hover:border-[#39FF14]/40 hover:text-white"
                }`}
              >
                Semua Liga
              </button>
              {leagues.map((l) => (
                <button
                  key={l}
                  onClick={() => setActiveLeague(l)}
                  className={`shrink-0 rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    activeLeague === l
                      ? "bg-[#39FF14] text-black"
                      : "border border-white/10 bg-white/5 text-gray-300 hover:border-[#39FF14]/40 hover:text-white"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Table — horizontal scroll on mobile with visible scrollbar */}
          <div
            className="overflow-x-auto"
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(57,255,20,0.4) rgba(255,255,255,0.05)",
            }}
          >
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-[#181b24]">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#39FF14]/80">#</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#39FF14]/80">Pemain</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Ke</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Liga</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Nilai Transfer</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Tanggal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {/* Group header */}
                {activeLeague && (
                  <tr className="bg-[#39FF14]/5">
                    <td colSpan={7} className="px-4 py-2">
                      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#39FF14]/70">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#39FF14]/60" />
                        {activeLeague}
                      </span>
                    </td>
                  </tr>
                )}
                {filtered.map((row, i) => {
                  const st = statusConfig[row.status] ?? statusConfig.rumor
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-xs font-mono text-gray-500 tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#39FF14]/40 text-xs font-black text-[#39FF14]"
                            style={{ background: "rgba(57,255,20,0.08)" }}
                          >
                            {row.player_initials || row.player_name.slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm whitespace-nowrap">{row.player_name}</p>
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                              {row.position}{row.age ? ` · ${row.age} TH` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-green-400">→</span>
                          <div
                            className="h-3 w-3 shrink-0 rounded-sm"
                            style={{ background: row.from_club_color || "#888" }}
                          />
                          <span className="font-semibold text-white text-sm whitespace-nowrap">{row.to_club}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-[#a78bfa]/40 bg-[#a78bfa]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a78bfa] whitespace-nowrap">
                          {row.league_dest || row.league_label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.is_free ? (
                          <span className="font-black text-blue-400 text-sm">Free</span>
                        ) : (
                          <span className="font-black text-[#39FF14] text-sm tabular-nums">
                            {formatTransferValue(row.transfer_value)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: st.color, background: st.bg, borderColor: st.border }}
                        >
                          <span
                            className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                            style={{ background: st.color }}
                          />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                        {formatDate(row.transfer_date)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile scroll hint */}
          <div className="flex items-center justify-center gap-1.5 border-t border-white/5 py-2 sm:hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#39FF14]/40"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span className="text-[10px] text-gray-600">Geser untuk lihat lebih</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#39FF14]/40 rotate-180"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </>
      )}
    </div>
  )
}

// ── Peluang Juara Card ──────────────────────────────────────────────────────
// Matches screenshot 5-7: ranked list with win %, pros/cons per team/country

export interface PeluangRow {
  id: string
  widget_id: string
  rank: number
  team_name: string
  team_flag: string
  category: string
  win_pct: number
  reasons_win: string[]
  reasons_lose: string[]
}

interface PeluangCardProps {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string) => void
}

export function PeluangCard({ widgetId, isAdmin, onEdit }: PeluangCardProps) {
  const [teams, setTeams] = useState<PeluangRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("widget_peluang")
          .select("*")
          .eq("widget_id", widgetId)
          .order("rank", { ascending: true })
        if (error) throw error
        const parsed = (data ?? []).map((r: any) => ({
          ...r,
          reasons_win: Array.isArray(r.reasons_win)
            ? r.reasons_win
            : (r.reasons_win ? JSON.parse(r.reasons_win) : []),
          reasons_lose: Array.isArray(r.reasons_lose)
            ? r.reasons_lose
            : (r.reasons_lose ? JSON.parse(r.reasons_lose) : []),
        }))
        setTeams(parsed)
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat data peluang.")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [widgetId])

  // Group by category
  const categories = [...new Set(teams.map((t) => t.category))].filter(Boolean)

  const categoryColors: Record<string, string> = {
    "FAVORIT UTAMA": "#39FF14",
    "KANDIDAT KUAT": "#fbbf24",
    "DARK HORSE": "#60a5fa",
    "PELENGKAP": "#9ca3af",
  }

  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg min-h-[220px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#13151c] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🏆</span>
          <span className="font-semibold text-white">Peluang Juara</span>
        </div>
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(widgetId)}
            className="flex items-center gap-1.5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-1.5 text-xs font-medium text-[#39FF14] transition-all hover:bg-[#39FF14]/20 hover:border-[#39FF14]/60"
          >
            <Pencil size={12} />
            Edit Widget
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : teams.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Belum ada data peluang juara.</p>
      ) : (
        <>
        <div
          className="overflow-x-auto"
          style={{
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(57,255,20,0.4) rgba(255,255,255,0.05)",
          }}
        >
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-[#181b24]">
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#39FF14]/80">#</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#39FF14]/80">Tim Nasional</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Kategori</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Peluang Juara</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Peluang Tidak Juara</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">✅ Alasan Bisa Juara</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">❌ Alasan Tidak Juara</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {(() => {
                const rows: React.ReactNode[] = []
                let lastCat = ""
                teams.forEach((team) => {
                  if (team.category && team.category !== lastCat) {
                    lastCat = team.category
                    const catColor = categoryColors[team.category] || "#39FF14"
                    rows.push(
                      <tr key={`cat-${team.category}`} className="bg-[#39FF14]/5">
                        <td colSpan={7} className="px-4 py-2">
                          <span
                            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest"
                            style={{ color: `${catColor}99` }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor }} />
                            {team.category}
                          </span>
                        </td>
                      </tr>
                    )
                  }
                  const catColor = categoryColors[team.category] || "#39FF14"
                  const losePct = Math.max(0, 100 - team.win_pct)
                  rows.push(
                    <tr key={team.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-4 align-top">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-black"
                          style={{ background: catColor }}
                        >
                          {team.rank}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl leading-none">{team.team_flag}</span>
                          <div>
                            <p className="font-bold text-white">{team.team_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span
                          className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: catColor, background: `${catColor}15`, borderColor: `${catColor}40` }}
                        >
                          {team.category}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-3 min-w-[120px]">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${team.win_pct}%`, background: "#39FF14" }}
                            />
                          </div>
                          <span className="w-12 text-right text-sm font-bold text-[#39FF14]">{team.win_pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-3 min-w-[120px]">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-red-500"
                              style={{ width: `${losePct}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-sm font-bold text-red-400">{losePct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top max-w-[200px]">
                        <ul className="space-y-1">
                          {team.reasons_win.map((r: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                              <span className="mt-0.5 shrink-0 text-[#39FF14]">▲</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-4 align-top max-w-[200px]">
                        <ul className="space-y-1">
                          {team.reasons_lose.map((r: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                              <span className="mt-0.5 shrink-0 text-red-400">▼</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )
                })
                return rows
              })()}
            </tbody>
          </table>
        </div>
        {/* Mobile scroll hint */}
        <div className="flex items-center justify-center gap-1.5 border-t border-white/5 py-2 sm:hidden">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#39FF14]/40"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          <span className="text-[10px] text-gray-600">Geser untuk lihat lebih</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#39FF14]/40 rotate-180"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
        </>
      )}
    </div>
  )
}

// ── Analisa Taktis Card ────────────────────────────────────────────────────────

export interface AnalisaTaktisRow {
  id: string
  widget_id: string
  team_name: string
  coach_name: string
  formation: string
  play_style: string
  main_weapons: string[] // stored as JSON array in Supabase
}

interface AnalisaTaktisCardProps {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string) => void
}

export function AnalisaTaktisCard({ widgetId, isAdmin, onEdit }: AnalisaTaktisCardProps) {
  const [data, setData] = useState<AnalisaTaktisRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllWeapons, setShowAllWeapons] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data: rows, error } = await supabase
          .from("widget_analisa_taktis")
          .select("*")
          .eq("widget_id", widgetId)
          .limit(1)
        if (error) throw error
        if (rows && rows.length > 0) {
          const r = rows[0]
          setData({
            ...r,
            main_weapons: Array.isArray(r.main_weapons)
              ? r.main_weapons
              : (r.main_weapons ? JSON.parse(r.main_weapons) : []),
          })
        }
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat data analisa taktis.")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [widgetId])

  // Parse formation string like "4-3-3" into position groups
  function parseFormation(formation: string): { gk: number; lines: number[] } {
    const parts = formation.split("-").map(Number)
    if (parts.length < 2 || parts.some(isNaN)) return { gk: 1, lines: [4, 3, 3] }
    return { gk: 1, lines: parts }
  }

  function FormationViz({ formation }: { formation: string }) {
    const { gk, lines } = parseFormation(formation)

    // Positions map based on line count
    const positionLabels: Record<number, string[]> = {
      1: ["GK"],
      2: ["CB", "CB"],
      3: ["LB", "CB", "RB"],
      4: ["LB", "CB", "CB", "RB"],
      5: ["LWB", "CB", "CB", "CB", "RWB"],
    }
    const midLabels: Record<number, string[]> = {
      1: ["CM"],
      2: ["CM", "CM"],
      3: ["CM", "CM", "CM"],
      4: ["CM", "CM", "CM", "CM"],
      5: ["CM", "CM", "CM", "CM", "CM"],
    }
    const fwdLabels: Record<number, string[]> = {
      1: ["ST"],
      2: ["ST", "ST"],
      3: ["LW", "ST", "RW"],
      4: ["LW", "CF", "CF", "RW"],
      5: ["LW", "CF", "ST", "CF", "RW"],
    }

    const allLines = [lines[lines.length - 1], ...lines.slice(0, -1).reverse(), [gk]]
    const lineConfigs = allLines.map((count, lineIdx) => {
      const isGK = lineIdx === allLines.length - 1
      const isFwd = lineIdx === 0
      const isMid = lineIdx > 0 && !isGK && lines.length >= 3 && lineIdx < lines.length - 1
      let labels: string[]
      if (isGK) labels = ["GK"]
      else if (isFwd) labels = fwdLabels[count] ?? Array(count).fill("FW")
      else if (isMid && lineIdx === 1 && lines.length === 3) labels = midLabels[count] ?? Array(count).fill("MF")
      else labels = positionLabels[count] ?? Array(count).fill("DF")
      return { count, labels }
    })

    const totalLines = lineConfigs.length
    const lineSpacing = 100 / (totalLines + 1)

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          borderRadius: "12px",
          border: "1px solid rgba(57,255,20,0.2)",
          overflow: "hidden",
          background: "linear-gradient(180deg, #0a1a0a 0%, #0d2210 50%, #0a1a0a 100%)",
        }}
      >
        <svg viewBox="0 0 100 130" style={{ width: "100%", display: "block" }}>
          {/* Field markings */}
          <rect x="4" y="4" width="92" height="122" fill="none" stroke="rgba(57,255,20,0.15)" strokeWidth="0.5" />
          <line x1="4" y1="65" x2="96" y2="65" stroke="rgba(57,255,20,0.15)" strokeWidth="0.5" />
          <circle cx="50" cy="65" r="12" fill="none" stroke="rgba(57,255,20,0.15)" strokeWidth="0.5" />
          <circle cx="50" cy="65" r="1" fill="rgba(57,255,20,0.3)" />
          <rect x="22" y="4" width="56" height="22" fill="none" stroke="rgba(57,255,20,0.12)" strokeWidth="0.5" />
          <rect x="33" y="4" width="34" height="10" fill="none" stroke="rgba(57,255,20,0.12)" strokeWidth="0.5" />
          <rect x="38" y="2" width="24" height="4" fill="rgba(57,255,20,0.08)" stroke="rgba(57,255,20,0.2)" strokeWidth="0.5" />
          <rect x="22" y="104" width="56" height="22" fill="none" stroke="rgba(57,255,20,0.12)" strokeWidth="0.5" />
          <rect x="33" y="116" width="34" height="10" fill="none" stroke="rgba(57,255,20,0.12)" strokeWidth="0.5" />
          <rect x="38" y="124" width="24" height="4" fill="rgba(57,255,20,0.08)" stroke="rgba(57,255,20,0.2)" strokeWidth="0.5" />
          <path d="M 33 26 A 12 12 0 0 1 67 26" fill="none" stroke="rgba(57,255,20,0.12)" strokeWidth="0.5" />
          <path d="M 33 104 A 12 12 0 0 0 67 104" fill="none" stroke="rgba(57,255,20,0.12)" strokeWidth="0.5" />
          <defs>
            <filter id="at-glow">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {/* Players */}
          {lineConfigs.map((line, lineIdx) => {
            const y = 8 + (lineIdx + 1) * lineSpacing * 1.15
            const isGK = lineIdx === lineConfigs.length - 1
            return line.labels.map((label, posIdx) => {
              const x = line.count === 1 ? 50 : 10 + (posIdx / (line.count - 1)) * 80
              return (
                <g key={`${lineIdx}-${posIdx}`}>
                  <circle
                    cx={x} cy={y} r="4"
                    fill="#39FF14"
                    filter={isGK ? "url(#at-glow)" : undefined}
                  />
                  <text x={x} y={y + 2.5} textAnchor="middle" fontSize="3.5" fontWeight="900" fill="#000">
                    {label}
                  </text>
                </g>
              )
            })
          })}
        </svg>
      </div>
    )
  }

  const visibleWeapons = data
    ? showAllWeapons
      ? data.main_weapons
      : data.main_weapons.slice(0, 3)
    : []
  const hiddenCount = data ? data.main_weapons.length - 3 : 0

  return (
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg min-h-[220px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#13151c] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Brain size={18} className="text-[#39FF14]" style={{ filter: "drop-shadow(0 0 6px rgba(57,255,20,0.7))" }} />
          <span className="font-semibold text-white">Analisa Taktis</span>
          <span className="rounded-full border border-[#39FF14]/25 bg-[#39FF14]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#39FF14]">
            Taktik
          </span>
        </div>
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(widgetId)}
            className="flex items-center gap-1.5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-1.5 text-xs font-medium text-[#39FF14] transition-all hover:bg-[#39FF14]/20 hover:border-[#39FF14]/60"
          >
            <Pencil size={12} />
            Edit Widget
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-[140px] items-center justify-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin text-[#39FF14]" />
          <span className="text-sm">Memuat data...</span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center gap-2 py-10 text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-gray-500">Belum ada data analisa taktis.</p>
      ) : (
        <div className="p-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Left column */}
            <div className="flex flex-col gap-3.5">
              {/* Tim & Pelatih */}
              <div className="rounded-xl border border-white/10 bg-[#181b24] p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-[#39FF14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Tim &amp; Pelatih</span>
                </div>
                <p className="text-[22px] font-black leading-tight text-white" style={{ textShadow: "0 0 20px rgba(57,255,20,0.3)" }}>
                  {data.team_name}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Pelatih:</span>
                  <span className="text-[13px] font-semibold text-[#39FF14]">{data.coach_name}</span>
                </div>
              </div>

              {/* Formasi */}
              <div className="rounded-xl border border-[#39FF14]/20 bg-[#39FF14]/5 p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-[#39FF14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Formasi Utama</span>
                </div>
                <div className="flex items-center gap-3.5">
                  <span
                    className="text-[36px] font-black text-[#39FF14]"
                    style={{ textShadow: "0 0 20px rgba(57,255,20,0.5), 0 0 40px rgba(57,255,20,0.2)" }}
                  >
                    {data.formation}
                  </span>
                  <div className="h-10 w-px bg-[#39FF14]/20" />
                  <span className="max-w-[140px] text-[11px] leading-relaxed text-gray-400">
                    Formasi andalan yang digunakan di sebagian besar pertandingan
                  </span>
                </div>
              </div>

              {/* Gaya Bermain */}
              <div className="rounded-xl border border-white/10 bg-[#181b24] p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-[#39FF14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Gaya Bermain</span>
                </div>
                <p className="text-[13px] leading-relaxed text-gray-300">{data.play_style}</p>
              </div>

              {/* Senjata Utama */}
              <div className="rounded-xl border border-white/10 bg-[#181b24] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-[#39FF14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Senjata Utama</span>
                  <span className="rounded-full bg-[#39FF14]/15 px-2 py-0.5 text-[10px] font-bold text-[#39FF14]">
                    {data.main_weapons.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {visibleWeapons.map((w, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-black"
                        style={{ background: "#39FF14", boxShadow: "0 0 6px rgba(57,255,20,0.5)", marginTop: "1px" }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[13px] leading-snug text-gray-200">{w}</span>
                    </li>
                  ))}
                </ul>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllWeapons((v) => !v)}
                    className="mt-2 bg-transparent border-none p-0 text-[11px] font-semibold text-[#39FF14]/70 cursor-pointer hover:text-[#39FF14] transition-colors"
                  >
                    {showAllWeapons ? "Sembunyikan" : `+${hiddenCount} lainnya`}
                  </button>
                )}
              </div>
            </div>

            {/* Right column: Formation viz */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Visualisasi Formasi</span>
                <div className="h-px flex-1 bg-gradient-to-r from-[#39FF14]/20 to-transparent" />
              </div>
              <FormationViz formation={data.formation} />
              <p className="text-center text-[11px] text-gray-600">
                Posisi pemain dalam formasi {data.formation}
              </p>
            </div>
          </div>

          {/* Footer divider */}
          <div className="mt-5 h-px bg-gradient-to-r from-transparent via-[#39FF14]/30 to-transparent" />
        </div>
      )}
    </div>
  )
}
