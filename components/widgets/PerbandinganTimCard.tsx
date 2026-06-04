"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormResult { result: "W" | "D" | "L" }

interface H2HMatch {
  date: string          // "Mar 2024"
  home_team: string
  away_team: string
  home_score: number
  away_score: number
}

interface StatItem {
  label: string
  home_value: string
  away_value: string
  home_pct: number      // 0–100, persentase bar kiri
}

interface PerbandinganTimData {
  id: string
  home_team: string
  away_team: string
  competition: string   // badge atas: "FRIENDLY", "WCQ", dll.
  // Info Tim
  home_rank: string     // "#3"
  away_rank: string
  home_value: string    // "€920M"
  away_value: string
  home_form: FormResult[]   // max 5
  away_form: FormResult[]
  home_coach: string
  away_coach: string
  // H2H
  total_matches: number
  home_wins: number
  draws: number
  away_wins: number
  h2h_matches: H2HMatch[]   // 5 terakhir
  // Statistik
  stats: StatItem[]
}

interface Props {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string, widgetType: "perbandingan_tim") => void
  refreshKey?: number
}

// ─── Helper: form dot ─────────────────────────────────────────────────────────

function FormDot({ result }: { result: "W" | "D" | "L" }) {
  const cls = result === "W"
    ? "bg-[#1a3320] text-[#39FF14] border border-[#2a4a30]"
    : result === "D"
    ? "bg-[#2a2510] text-[#FFD700] border border-[#3a3515]"
    : "bg-[#301515] text-[#FF4444] border border-[#401a1a]"
  return (
    <span className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-[9px] font-black ${cls}`}>
      {result}
    </span>
  )
}

// ─── Helper: stat bar row ─────────────────────────────────────────────────────

function StatBar({ item }: { item: StatItem }) {
  const rightPct = 100 - item.home_pct
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-['Rajdhani'] text-[15px] font-bold text-[#39FF14] min-w-[36px]">{item.home_value}</span>
        <span className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase text-[#3d5a44] text-center flex-1">{item.label}</span>
        <span className="font-['Rajdhani'] text-[15px] font-bold text-[#4488FF] min-w-[36px] text-right">{item.away_value}</span>
      </div>
      <div className="flex h-[5px] rounded-[3px] overflow-hidden gap-px bg-[#162019]">
        <div className="h-full rounded-l-[3px] bg-gradient-to-l from-[#39FF14] to-[#1a8a00]" style={{ width: `${item.home_pct}%` }} />
        <div className="h-full rounded-r-[3px] bg-gradient-to-r from-[#4488FF] to-[#1a44aa]" style={{ width: `${rightPct}%` }} />
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PerbandinganTimCard({ widgetId, isAdmin, onEdit, refreshKey = 0 }: Props) {
  const [data, setData] = useState<PerbandinganTimData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"info" | "h2h" | "stats">("info")
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: row } = await supabase
        .from("widget_perbandingan_tim")
        .select("*")
        .eq("id", widgetId)
        .maybeSingle()
      setData(row as PerbandinganTimData | null)
      setLoading(false)
    }
    fetchData()
  }, [widgetId, refreshKey])

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden animate-pulse">
        <div className="h-12 bg-[#111a14] border-b border-[#1e2e22]" />
        <div className="h-10 bg-[#162019]/40 border-b border-[#1e2e22]" />
        <div className="p-5 space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-8 rounded bg-[#162019]" />)}
        </div>
      </div>
    )
  }

  // ── Empty state ──
  if (!data) {
    return (
      <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
          <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Perbandingan Tim</span>
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "perbandingan_tim")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
        <div className="flex items-center justify-center py-10 text-sm text-[#3d5a44]">Belum ada data perbandingan tim.</div>
      </div>
    )
  }

  return (
    <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden relative transition-all hover:border-[#2a4030] hover:shadow-[0_0_30px_#39FF1410]">
      {/* top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#39FF1455] to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
        <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Perbandingan Tim</span>
        <div className="flex items-center gap-2">
          <span className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase px-2 py-[3px] rounded bg-[#39FF1422] border border-[#39FF1455] text-[#39FF14]">
            {data.competition}
          </span>
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "perbandingan_tim")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-[#1e2e22] px-5 gap-0">
        {(["info", "h2h", "stats"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              "font-['Barlow_Condensed'] text-[11px] font-bold tracking-[1.5px] uppercase py-3 px-4 border-b-2 -mb-px transition-all",
              activeTab === tab
                ? "text-[#39FF14] border-[#39FF14]"
                : "text-[#3d5a44] border-transparent hover:text-[#7a9a80]",
            ].join(" ")}
          >
            {tab === "info" ? "Info Tim" : tab === "h2h" ? "Head to Head" : "Statistik"}
          </button>
        ))}
      </div>

      {/* ── TAB: Info Tim ── */}
      {activeTab === "info" && (
        <div>
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="flex-1 text-center font-['Rajdhani'] text-[26px] font-bold text-[#e8f5ea]">{data.home_team}</div>
            <div className="font-['Barlow_Condensed'] text-[11px] font-black tracking-[1px] text-[#3d5a44] bg-[#162019] border border-[#1e2e22] rounded-md px-2 py-1 flex-shrink-0">VS</div>
            <div className="flex-1 text-center font-['Rajdhani'] text-[26px] font-bold text-[#e8f5ea]">{data.away_team}</div>
          </div>
          <div className="px-5 pb-5 flex flex-col gap-0">
            {/* Ranking */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center py-[9px] border-b border-[#1e2e22] gap-2">
              <div className="text-center font-['Barlow_Condensed'] text-[18px] font-bold text-[#39FF14]">{data.home_rank}</div>
              <div className="font-['Barlow_Condensed'] text-[10px] font-semibold tracking-[1.5px] uppercase text-[#3d5a44] bg-[#162019] rounded px-2 py-1">Ranking FIFA</div>
              <div className="text-center font-['Barlow_Condensed'] text-[18px] font-bold text-[#e8f5ea]">{data.away_rank}</div>
            </div>
            {/* Nilai skuad */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center py-[9px] border-b border-[#1e2e22] gap-2">
              <div className="text-center font-['Barlow_Condensed'] text-[14px] font-bold text-[#e8f5ea]">{data.home_value}</div>
              <div className="font-['Barlow_Condensed'] text-[10px] font-semibold tracking-[1.5px] uppercase text-[#3d5a44] bg-[#162019] rounded px-2 py-1">Nilai Skuad</div>
              <div className="text-center font-['Barlow_Condensed'] text-[14px] font-bold text-[#e8f5ea]">{data.away_value}</div>
            </div>
            {/* Form */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center py-[9px] border-b border-[#1e2e22] gap-2">
              <div className="flex justify-center gap-1">
                {data.home_form.map((f, i) => <FormDot key={i} result={f.result} />)}
              </div>
              <div className="font-['Barlow_Condensed'] text-[10px] font-semibold tracking-[1.5px] uppercase text-[#3d5a44] bg-[#162019] rounded px-2 py-1">Form 5 Laga</div>
              <div className="flex justify-center gap-1">
                {data.away_form.map((f, i) => <FormDot key={i} result={f.result} />)}
              </div>
            </div>
            {/* Pelatih */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center py-[9px] gap-2">
              <div className="text-center font-['Barlow_Condensed'] text-[13px] font-bold text-[#e8f5ea]">{data.home_coach}</div>
              <div className="font-['Barlow_Condensed'] text-[10px] font-semibold tracking-[1.5px] uppercase text-[#3d5a44] bg-[#162019] rounded px-2 py-1">Pelatih</div>
              <div className="text-center font-['Barlow_Condensed'] text-[13px] font-bold text-[#e8f5ea]">{data.away_coach}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Head to Head ── */}
      {activeTab === "h2h" && (
        <div>
          {/* Scoreline */}
          <div className="flex items-center justify-center gap-4 px-5 py-5">
            <div className="flex-1 text-center">
              <div className="font-['Barlow_Condensed'] text-[11px] font-bold tracking-[2px] uppercase text-[#7a9a80] mb-1">{data.home_team}</div>
              <div className="font-['Rajdhani'] text-[36px] font-bold text-[#39FF14] leading-none" style={{ textShadow: "0 0 20px #39FF1460" }}>{data.home_wins}</div>
              <div className="font-['Barlow_Condensed'] text-[9px] tracking-[1.5px] uppercase text-[#3d5a44] mt-1">Menang</div>
            </div>
            <div className="flex-shrink-0 text-center">
              <div className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1px] text-[#3d5a44] mb-1">{data.total_matches} LAGA</div>
              <div className="font-['Rajdhani'] text-[20px] font-bold text-[#FFD700]">{data.draws}</div>
              <div className="font-['Barlow_Condensed'] text-[9px] tracking-[1.5px] uppercase text-[#3d5a44] mt-0.5">Seri</div>
            </div>
            <div className="flex-1 text-center">
              <div className="font-['Barlow_Condensed'] text-[11px] font-bold tracking-[2px] uppercase text-[#7a9a80] mb-1">{data.away_team}</div>
              <div className="font-['Rajdhani'] text-[36px] font-bold text-[#4488FF] leading-none">{data.away_wins}</div>
              <div className="font-['Barlow_Condensed'] text-[9px] tracking-[1.5px] uppercase text-[#3d5a44] mt-1">Menang</div>
            </div>
          </div>
          {/* Match list */}
          <div className="px-5 pb-5 flex flex-col gap-1.5">
            <div className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[2px] uppercase text-[#3d5a44] mb-1">5 Pertemuan Terakhir</div>
            {data.h2h_matches.map((m, i) => {
              const homeWon = m.home_score > m.away_score
              const awayWon = m.away_score > m.home_score
              return (
                <div key={i} className="grid grid-cols-[60px_1fr_auto_1fr_52px] items-center gap-2 px-3 py-[9px] bg-[#162019] border border-[#1e2e22] rounded-lg hover:border-[#2a4030] transition-colors font-['Barlow_Condensed']">
                  <div className="text-[10px] text-[#3d5a44] font-semibold tracking-[0.5px]">{m.date}</div>
                  <div className="text-[13px] font-bold text-[#7a9a80] text-right">{m.home_team}</div>
                  <div className="font-['Rajdhani'] text-[15px] font-bold text-[#e8f5ea] bg-[#111a14] border border-[#1e2e22] rounded px-2 py-0.5 text-center whitespace-nowrap tracking-[1px]">
                    {m.home_score} – {m.away_score}
                  </div>
                  <div className="text-[13px] font-bold text-[#7a9a80] text-left">{m.away_team}</div>
                  <div className={[
                    "text-[9px] font-black tracking-[1px] uppercase px-1.5 py-0.5 rounded text-center",
                    homeWon ? "text-[#39FF14] bg-[#39FF1422]"
                    : awayWon ? "text-[#4488FF] bg-[#4488FF15]"
                    : "text-[#FFD700] bg-[#FFD70015]",
                  ].join(" ")}>
                    {homeWon ? m.home_team.slice(0,3).toUpperCase() : awayWon ? m.away_team.slice(0,3).toUpperCase() : "SERI"}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TAB: Statistik ── */}
      {activeTab === "stats" && (
        <div className="px-5 py-4 flex flex-col gap-3.5">
          <div className="flex justify-between pb-2 border-b border-[#1e2e22]">
            <span className="font-['Barlow_Condensed'] text-[11px] font-bold tracking-[1.5px] uppercase text-[#39FF14]">{data.home_team}</span>
            <span className="font-['Barlow_Condensed'] text-[11px] font-bold tracking-[1.5px] uppercase text-[#4488FF]">{data.away_team}</span>
          </div>
          {data.stats.map((s, i) => <StatBar key={i} item={s} />)}
        </div>
      )}
    </div>
  )
}
