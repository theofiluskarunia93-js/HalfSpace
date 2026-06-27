"use client"

/**
 * StatistikPertandinganCard.tsx
 *
 * Widget baru: Statistik Pertandingan.
 * Referensi tampilan: perbandingan stat tim (tembakan, penguasaan bola, dll)
 * dengan tambahan grafik (donut penguasaan bola + bar chart perbandingan)
 * agar lebih menarik dibanding tabel polos.
 *
 * Arsitektur mengikuti widget lain yang sudah ada (TimelinePertandinganCard,
 * PerbandinganTimCard): "use client", fetch by id dari Supabase, skeleton
 * loading, empty state, header dengan tombol Edit Widget untuk admin.
 */

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatDirection = "higher_better" | "lower_better" | "neutral"

export interface StatRow {
  label: string        // "Tembakan"
  home_value: number   // 10
  away_value: number   // 19
  is_percent?: boolean // true → tampil dengan suffix "%"
  direction: StatDirection // menentukan sisi mana yang dikasih badge "unggul"
}

export interface StatistikPertandinganData {
  id: string
  home_team: string
  away_team: string
  home_flag: string   // emoji bendera "🇹🇷"
  away_flag: string
  competition: string // "Piala Dunia 2026 · Grup D"
  home_score?: number | null
  away_score?: number | null
  possession_home: number // 0–100, dipakai khusus untuk donut chart
  stats: StatRow[]
}

interface Props {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string, widgetType: "statistik_pertandingan") => void
  refreshKey?: number
}

const HOME_COLOR = "#39FF14"
const AWAY_COLOR = "#4488FF"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function winnerSide(s: StatRow): "home" | "away" | null {
  if (s.home_value === s.away_value) return null
  if (s.direction === "neutral") return null
  if (s.direction === "lower_better") {
    return s.home_value < s.away_value ? "home" : "away"
  }
  return s.home_value > s.away_value ? "home" : "away"
}

function formatValue(v: number, isPercent?: boolean): string {
  return isPercent ? `${v}%` : `${v}`
}

function ValueBadge({
  value, isPercent, highlighted, side,
}: { value: number; isPercent?: boolean; highlighted: boolean; side: "home" | "away" }) {
  if (!highlighted) {
    return (
      <span className="font-['Rajdhani'] text-[15px] font-bold text-[#7a9a80] min-w-[40px] text-center">
        {formatValue(value, isPercent)}
      </span>
    )
  }
  const color = side === "home" ? HOME_COLOR : AWAY_COLOR
  return (
    <span
      className="font-['Rajdhani'] inline-flex min-w-[40px] items-center justify-center rounded-full px-2.5 py-0.5 text-[14px] font-bold text-black"
      style={{ background: color, boxShadow: `0 0 10px ${color}60` }}
    >
      {formatValue(value, isPercent)}
    </span>
  )
}

// ─── Custom tooltip untuk bar chart ───────────────────────────────────────────

function StatTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const home = payload.find((p: any) => p.dataKey === "home_share")
  const away = payload.find((p: any) => p.dataKey === "away_share")
  return (
    <div className="rounded-lg border border-[#1e2e22] bg-[#0d1410] px-3 py-2 text-[11px] shadow-lg">
      <p className="mb-1 font-['Barlow_Condensed'] font-bold tracking-wider text-[#e8f5ea]">{label}</p>
      {home && <p style={{ color: HOME_COLOR }}>{home.payload.home_label}</p>}
      {away && <p style={{ color: AWAY_COLOR }}>{away.payload.away_label}</p>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StatistikPertandinganCard({ widgetId, isAdmin, onEdit, refreshKey = 0 }: Props) {
  const [data, setData] = useState<StatistikPertandinganData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: row } = await supabase
        .from("widget_statistik_pertandingan")
        .select("*")
        .eq("id", widgetId)
        .maybeSingle()
      setData(row as StatistikPertandinganData | null)
      setLoading(false)
    }
    fetchData()
  }, [widgetId, refreshKey])

  // Data untuk bar chart: dikonversi ke "share" (0–100) per kategori supaya
  // tembakan (skala puluhan) dan operan (skala ratusan) tetap proporsional
  // dalam satu chart yang sama, tapi label tooltip tetap pakai angka asli.
  const chartData = useMemo(() => {
    if (!data) return []
    return data.stats.map((s) => {
      const total = s.home_value + s.away_value
      const homeShare = total > 0 ? (s.home_value / total) * 100 : 50
      const awayShare = 100 - homeShare
      return {
        name: s.label,
        home_share: homeShare,
        away_share: awayShare,
        home_label: `${data.home_team}: ${formatValue(s.home_value, s.is_percent)}`,
        away_label: `${data.away_team}: ${formatValue(s.away_value, s.is_percent)}`,
      }
    })
  }, [data])

  const possessionData = data
    ? [
        { name: data.home_team, value: data.possession_home, fill: HOME_COLOR },
        { name: data.away_team, value: 100 - data.possession_home, fill: AWAY_COLOR },
      ]
    : []

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden animate-pulse">
        <div className="h-12 bg-[#111a14] border-b border-[#1e2e22]" />
        <div className="h-44 bg-[#162019]/40 border-b border-[#1e2e22]" />
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 rounded bg-[#162019]" />)}
        </div>
      </div>
    )
  }

  // ── Empty state ──
  if (!data) {
    return (
      <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
          <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Statistik Pertandingan</span>
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "statistik_pertandingan")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
        <div className="flex items-center justify-center py-10 text-sm text-[#3d5a44]">Belum ada data statistik pertandingan.</div>
      </div>
    )
  }

  const hasScore = data.home_score != null && data.away_score != null

  return (
    <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden relative transition-all hover:border-[#2a4030] hover:shadow-[0_0_30px_#39FF1410]">
      {/* top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#39FF1455] to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
        <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Statistik Pertandingan</span>
        <div className="flex items-center gap-2">
          <span className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase px-2 py-[3px] rounded bg-[#39FF1422] border border-[#39FF1455] text-[#39FF14]">
            {data.competition}
          </span>
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "statistik_pertandingan")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
      </div>

      {/* Scoreboard strip */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
        <div className="flex flex-1 items-center gap-2.5">
          <span className="text-2xl leading-none">{data.home_flag}</span>
          <span className="font-['Rajdhani'] text-[17px] font-bold text-[#e8f5ea]">{data.home_team}</span>
        </div>
        {hasScore ? (
          <div className="flex items-center bg-[#162019] border border-[#1e2e22] rounded-[10px] overflow-hidden mx-3 flex-shrink-0">
            <div className="font-['Rajdhani'] text-[22px] font-bold leading-none px-3 py-1.5 text-[#e8f5ea]">{data.home_score}</div>
            <div className="font-['Barlow_Condensed'] text-[12px] text-[#3d5a44] px-0.5">–</div>
            <div className="font-['Rajdhani'] text-[22px] font-bold leading-none px-3 py-1.5 text-[#e8f5ea]">{data.away_score}</div>
          </div>
        ) : (
          <div className="font-['Barlow_Condensed'] text-[11px] font-black tracking-[1px] text-[#3d5a44] bg-[#162019] border border-[#1e2e22] rounded-md px-2 py-1 flex-shrink-0">VS</div>
        )}
        <div className="flex flex-1 items-center justify-end gap-2.5">
          <span className="font-['Rajdhani'] text-[17px] font-bold text-[#e8f5ea]">{data.away_team}</span>
          <span className="text-2xl leading-none">{data.away_flag}</span>
        </div>
      </div>

      {/* Donut: Penguasaan Bola */}
      <div className="flex items-center gap-6 px-5 py-5 border-b border-[#1e2e22]">
        <div className="relative h-[120px] w-[120px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={possessionData}
                dataKey="value"
                innerRadius={38}
                outerRadius={56}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {possessionData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-['Rajdhani'] text-[20px] font-bold text-[#e8f5ea] leading-none">{data.possession_home}%</span>
            <span className="font-['Barlow_Condensed'] text-[8px] uppercase tracking-wider text-[#3d5a44]">vs {100 - data.possession_home}%</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[2px] uppercase text-[#3d5a44] mb-2">Penguasaan Bola</p>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: HOME_COLOR }} />
            <span className="font-['Rajdhani'] text-[14px] font-semibold text-[#e8f5ea]">{data.home_team}</span>
            <span className="font-['Rajdhani'] text-[14px] font-bold ml-auto" style={{ color: HOME_COLOR }}>{data.possession_home}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: AWAY_COLOR }} />
            <span className="font-['Rajdhani'] text-[14px] font-semibold text-[#e8f5ea]">{data.away_team}</span>
            <span className="font-['Rajdhani'] text-[14px] font-bold ml-auto" style={{ color: AWAY_COLOR }}>{100 - data.possession_home}%</span>
          </div>
        </div>
      </div>

      {/* Bar chart: Perbandingan Statistik (semua kategori, dinormalisasi ke %) */}
      {chartData.length > 0 && (
        <div className="px-5 py-4 border-b border-[#1e2e22]">
          <p className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[2px] uppercase text-[#3d5a44] mb-2">Perbandingan Visual</p>
          <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 34)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barGap={0} barCategoryGap="28%">
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "#7a9a80", fontSize: 11, fontFamily: "Barlow Condensed" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<StatTooltip />} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="home_share" stackId="a" fill={HOME_COLOR} radius={[3, 0, 0, 3]} />
              <Bar dataKey="away_share" stackId="a" fill={AWAY_COLOR} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daftar angka statistik */}
      <div className="px-5 py-3 flex flex-col">
        {data.stats.map((s, i) => {
          const win = winnerSide(s)
          return (
            <div key={i}>
              {i > 0 && <div className="h-px bg-[#1e2e22] my-0.5 opacity-60" />}
              <div className="grid grid-cols-[64px_1fr_64px] items-center gap-2 py-2.5">
                <div className="flex justify-start">
                  <ValueBadge value={s.home_value} isPercent={s.is_percent} highlighted={win === "home"} side="home" />
                </div>
                <span className="font-['Barlow_Condensed'] text-[11px] font-semibold tracking-[1px] uppercase text-[#7a9a80] text-center">{s.label}</span>
                <div className="flex justify-end">
                  <ValueBadge value={s.away_value} isPercent={s.is_percent} highlighted={win === "away"} side="away" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
