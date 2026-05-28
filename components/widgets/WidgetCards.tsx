"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Pencil, CalendarDays, Trophy, Loader2, AlertCircle } from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

export interface MatchRow {
  id: string
  group_label: string   // e.g. "A"
  home_team: string
  away_team: string
  match_date?: string   // ISO string, nullable
  match_time?: string   // "HH:MM", nullable
  score_home?: number | null
  score_away?: number | null
  status?: "scheduled" | "live" | "finished"
}

export interface StandingRow {
  id: string
  rank: number
  team_name: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
  group_label: string
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

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function CardShell({
  icon,
  title,
  widgetId,
  isAdmin,
  onEdit,
  children,
}: {
  icon: React.ReactNode
  title: string
  widgetId: string
  isAdmin?: boolean
  onEdit?: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="my-6 overflow-hidden rounded-2xl border border-[#39FF14]/20 bg-[#0d0d0d] shadow-[0_0_24px_rgba(57,255,20,0.07)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#39FF14]/15 bg-[#111]/80 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[#39FF14]">{icon}</span>
          <span className="font-semibold tracking-wide text-white">{title}</span>
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
      {children}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
      <Loader2 size={16} className="animate-spin" />
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

export function JadwalCard({ widgetId, isAdmin, onEdit }: JadwalCardProps) {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat data jadwal.")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [widgetId])

  // Group by group_label
  const grouped = matches.reduce<Record<string, MatchRow[]>>((acc, m) => {
    const key = m.group_label ?? "Umum"
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  return (
    <CardShell
      icon={<CalendarDays size={18} />}
      title="Jadwal Pertandingan"
      widgetId={widgetId}
      isAdmin={isAdmin}
      onEdit={onEdit}
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : matches.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Belum ada jadwal.</p>
      ) : (
        <div className="divide-y divide-white/5 px-5 py-2">
          {Object.entries(grouped).map(([group, rows]) => (
            <div key={group} className="py-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#39FF14]/70">
                Grup {group}
              </p>
              <div className="space-y-2">
                {rows.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  )
}

function MatchRow({ match: m }: { match: MatchRow }) {
  const statusColor =
    m.status === "live"
      ? "text-red-400 animate-pulse"
      : m.status === "finished"
      ? "text-zinc-400"
      : "text-[#39FF14]/80"

  const statusLabel =
    m.status === "live" ? "LIVE" : m.status === "finished" ? "Selesai" : "Akan Datang"

  const hasScore =
    m.status === "live" || m.status === "finished"

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      {/* Home */}
      <span className="w-[35%] text-right text-sm font-semibold text-white">
        {m.home_team}
      </span>

      {/* Score / VS + time */}
      <div className="flex flex-col items-center gap-0.5">
        {hasScore ? (
          <span className="text-base font-bold tabular-nums text-white">
            {m.score_home ?? 0} <span className="text-[#39FF14]">–</span> {m.score_away ?? 0}
          </span>
        ) : (
          <span className="text-sm font-bold text-zinc-400">VS</span>
        )}
        <span className={`text-[10px] font-medium uppercase ${statusColor}`}>
          {statusLabel}
        </span>
        {m.match_date && (
          <span className="text-[10px] text-zinc-600">
            {new Date(m.match_date).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
            })}
            {m.match_time ? ` · ${m.match_time}` : ""}
          </span>
        )}
      </div>

      {/* Away */}
      <span className="w-[35%] text-left text-sm font-semibold text-white">
        {m.away_team}
      </span>
    </div>
  )
}

// ── Klasemen Grup Card ────────────────────────────────────────────────────────

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
          .order("rank", { ascending: true })

        if (error) throw error
        setStandings(data ?? [])
        if (data && data.length > 0) {
          setActiveGroup(data[0].group_label)
        }
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat data klasemen.")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [widgetId])

  const groups = [...new Set(standings.map((s) => s.group_label))].sort()
  const filtered = standings.filter((s) => s.group_label === activeGroup)

  return (
    <CardShell
      icon={<Trophy size={18} />}
      title="Klasemen Grup"
      widgetId={widgetId}
      isAdmin={isAdmin}
      onEdit={onEdit}
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : standings.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Belum ada data klasemen.</p>
      ) : (
        <>
          {/* Group tabs */}
          {groups.length > 1 && (
            <div className="flex gap-1 border-b border-white/5 px-5 pt-3 pb-0">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`rounded-t-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                    activeGroup === g
                      ? "border border-b-0 border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Grup {g}
                </button>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  <th className="pb-2 text-left">#</th>
                  <th className="pb-2 text-left">Tim</th>
                  <th className="pb-2 text-center">M</th>
                  <th className="pb-2 text-center">M</th>
                  <th className="pb-2 text-center">S</th>
                  <th className="pb-2 text-center">K</th>
                  <th className="pb-2 text-center">GD</th>
                  <th className="pb-2 text-center font-bold text-[#39FF14]/70">Poin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-white/[0.03] ${
                      i < 2 ? "border-l-2 border-[#39FF14]/40" : ""
                    }`}
                  >
                    <td className="py-2.5 pl-1 pr-3 text-zinc-400">{row.rank}</td>
                    <td className="py-2.5 font-medium text-white">{row.team_name}</td>
                    <td className="py-2.5 text-center tabular-nums text-zinc-300">{row.played}</td>
                    <td className="py-2.5 text-center tabular-nums text-zinc-300">{row.won}</td>
                    <td className="py-2.5 text-center tabular-nums text-zinc-300">{row.drawn}</td>
                    <td className="py-2.5 text-center tabular-nums text-zinc-300">{row.lost}</td>
                    <td className="py-2.5 text-center tabular-nums text-zinc-400">
                      {row.gf - row.ga > 0 ? "+" : ""}
                      {row.gf - row.ga}
                    </td>
                    <td className="py-2.5 text-center font-bold text-[#39FF14]">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CardShell>
  )
}
