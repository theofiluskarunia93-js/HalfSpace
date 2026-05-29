"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Pencil, CalendarDays, Trophy, Loader2, AlertCircle, Clock, MapPin } from "lucide-react"

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
  // timeStr is "HH:MM" — convert to "HH.MM WIB"
  return timeStr.replace(":", ".") + " WIB"
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
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
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg">
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
          {/* Group tabs */}
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-2 border-b border-white/10 bg-[#13151c] px-5 py-3">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    activeGroup === g
                      ? "bg-[#39FF14] text-black"
                      : "border border-white/10 bg-white/5 text-gray-300 hover:border-[#39FF14]/40 hover:text-white"
                  }`}
                >
                  Grup {g}
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
          Grup {m.group_label}
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
    <div className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg">
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
          {/* Group tabs */}
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-2 border-b border-white/10 bg-[#13151c] px-5 py-3">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    activeGroup === g
                      ? "bg-[#39FF14] text-black"
                      : "border border-white/10 bg-white/5 text-gray-300 hover:border-[#39FF14]/40 hover:text-white"
                  }`}
                >
                  Grup {g}
                </button>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                        <span className="font-medium text-white">{row.team_name}</span>
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
        </>
      )}
    </div>
  )
}
