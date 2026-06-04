"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "goal" | "yellow_card" | "red_card" | "substitution" | "var" | "penalty"
type MatchStatus = "upcoming" | "live" | "finished"

interface TimelineEvent {
  minute: string          // "23'", "45+2'", "90+3'"
  type: EventType
  player: string          // "Vinicius Jr." atau "Mbappé ↗ Lautaro" untuk subs
  team: "home" | "away"
  score_after: string     // "1–0", "1–1", "2–1"
}

interface TimelinePertandinganData {
  id: string
  home_team: string
  away_team: string
  home_flag: string       // emoji bendera: "🇧🇷"
  away_flag: string
  home_abbr: string       // "BRA", "ARG"
  away_abbr: string
  home_score: number
  away_score: number
  status: MatchStatus
  live_minute?: string    // "67'" — hanya saat live
  competition: string     // "Copa América · Grupo A"
  match_info: string      // "Finalizado · Copa América · Grupo A"
  events: TimelineEvent[]
}

interface Props {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string, widgetType: "timeline_pertandingan") => void
  refreshKey?: number
}

// ─── Icon map ────────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<EventType, string> = {
  goal:         "⚽",
  yellow_card:  "🟨",
  red_card:     "🟥",
  substitution: "🔄",
  var:          "📺",
  penalty:      "⚽",
}

const EVENT_LABELS: Record<EventType, string> = {
  goal:         "Gol",
  yellow_card:  "Kartu Kuning",
  red_card:     "Kartu Merah",
  substitution: "Substitusi",
  var:          "VAR",
  penalty:      "Penalti",
}

const EVENT_COLOR: Record<EventType, string> = {
  goal:         "text-[#39FF14]",
  yellow_card:  "text-[#FFD700]",
  red_card:     "text-[#FF4444]",
  substitution: "text-[#4488FF]",
  var:          "text-[#7a9a80]",
  penalty:      "text-[#39FF14]",
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TimelinePertandinganCard({ widgetId, isAdmin, onEdit, refreshKey = 0 }: Props) {
  const [data, setData] = useState<TimelinePertandinganData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: row } = await supabase
        .from("widget_timeline_pertandingan")
        .select("*")
        .eq("id", widgetId)
        .maybeSingle()
      setData(row as TimelinePertandinganData | null)
      setLoading(false)
    }
    fetchData()
  }, [widgetId, refreshKey])

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden animate-pulse">
        <div className="h-12 bg-[#111a14] border-b border-[#1e2e22]" />
        <div className="h-20 bg-[#162019]/40 border-b border-[#1e2e22]" />
        <div className="p-5 space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded bg-[#162019]" />)}
        </div>
      </div>
    )
  }

  // ── Empty state ──
  if (!data) {
    return (
      <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
          <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Timeline Pertandingan</span>
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "timeline_pertandingan")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
        <div className="flex items-center justify-center py-10 text-sm text-[#3d5a44]">Belum ada data timeline pertandingan.</div>
      </div>
    )
  }

  const isLive = data.status === "live"
  const homeLeading = data.home_score > data.away_score

  return (
    <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden relative transition-all hover:border-[#2a4030] hover:shadow-[0_0_30px_#39FF1410]">
      {/* top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#39FF1455] to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
        <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Timeline Pertandingan</span>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1.5 font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase px-2 py-[3px] rounded bg-[#39FF1422] border border-[#39FF1455] text-[#39FF14]">
              <span className="w-[7px] h-[7px] rounded-full bg-[#39FF14] shadow-[0_0_8px_#39FF14] animate-pulse flex-shrink-0" />
              {data.live_minute ?? "LIVE"}
            </span>
          ) : (
            <span className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase px-2 py-[3px] rounded bg-[#162019] border border-[#1e2e22] text-[#3d5a44]">
              {data.status === "finished" ? "SELESAI" : "SEGERA"}
            </span>
          )}
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "timeline_pertandingan")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
      </div>

      {/* Score header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-[#1e2e22]">
        {/* Home team */}
        <div className="flex-1">
          <div className="font-['Barlow_Condensed'] text-[11px] font-bold tracking-[2px] uppercase text-[#7a9a80] mb-1">{data.home_team}</div>
          <div className="font-['Barlow_Condensed'] text-[10px] tracking-[1px] uppercase text-[#3d5a44]">{data.home_flag} {data.home_abbr}</div>
        </div>
        {/* Score block */}
        <div className="flex items-center bg-[#162019] border border-[#1e2e22] rounded-[10px] overflow-hidden mx-3 flex-shrink-0">
          <div className={`font-['Rajdhani'] text-[32px] font-bold leading-none px-4 py-2 ${homeLeading ? "text-[#39FF14]" : "text-[#e8f5ea]"}`}
            style={homeLeading ? { textShadow: "0 0 16px #39FF1450" } : {}}>
            {data.home_score}
          </div>
          <div className="font-['Barlow_Condensed'] text-[14px] text-[#3d5a44] px-1">–</div>
          <div className={`font-['Rajdhani'] text-[32px] font-bold leading-none px-4 py-2 ${!homeLeading && data.away_score > data.home_score ? "text-[#39FF14]" : "text-[#e8f5ea]"}`}
            style={!homeLeading && data.away_score > data.home_score ? { textShadow: "0 0 16px #39FF1450" } : {}}>
            {data.away_score}
          </div>
        </div>
        {/* Away team */}
        <div className="flex-1 text-right">
          <div className="font-['Barlow_Condensed'] text-[11px] font-bold tracking-[2px] uppercase text-[#7a9a80] mb-1">{data.away_team}</div>
          <div className="font-['Barlow_Condensed'] text-[10px] tracking-[1px] uppercase text-[#3d5a44]">{data.away_abbr} {data.away_flag}</div>
        </div>
      </div>

      {/* Match info row */}
      <div className="flex items-center justify-center gap-2 px-5 py-2.5 border-b border-[#1e2e22]">
        {isLive && <span className="w-[7px] h-[7px] rounded-full bg-[#39FF14] shadow-[0_0_8px_#39FF14] animate-pulse flex-shrink-0" />}
        <span className="font-['Barlow_Condensed'] text-[11px] font-semibold tracking-[1px] uppercase text-[#3d5a44] text-center">{data.match_info}</span>
      </div>

      {/* Timeline events */}
      <div className="px-5 py-4 flex flex-col gap-1">
        {data.events.length === 0 ? (
          <p className="text-sm text-center text-[#3d5a44] py-6">Belum ada kejadian dicatat.</p>
        ) : (
          data.events.map((ev, i) => {
            const isGoal = ev.type === "goal" || ev.type === "penalty"
            const isLastGoal = isGoal && i === 0 // anggap event pertama (terbaru) = gol terakhir
            const teamColor = ev.team === "home" ? "text-[#39FF14] bg-[#39FF1422] border-[#39FF1455]" : "text-[#4488FF] bg-[#4488FF15] border-[#4488FF30]"
            return (
              <div key={i}>
                {i > 0 && <div className="h-px bg-[#1e2e22] my-1 opacity-50" />}
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[#162019] ${isGoal ? "group" : ""}`}>
                  <div className={`font-['Barlow_Condensed'] text-[11px] font-bold text-right min-w-[36px] flex-shrink-0 ${isGoal ? "text-[#39FF14]" : "text-[#3d5a44]"}`}>
                    {ev.minute}
                  </div>
                  <div className={`text-base flex-shrink-0 w-6 text-center leading-none ${isGoal ? "drop-shadow-[0_0_6px_#39FF1460]" : ""}`}>
                    {EVENT_ICONS[ev.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase mb-0.5 ${EVENT_COLOR[ev.type]}`}>
                      {EVENT_LABELS[ev.type]}
                    </div>
                    <div className="font-['Rajdhani'] text-[15px] font-semibold text-[#e8f5ea] truncate">{ev.player}</div>
                  </div>
                  <div className={`font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1px] uppercase px-1.5 py-[2px] rounded border flex-shrink-0 ${teamColor}`}>
                    {ev.team === "home" ? data.home_abbr : data.away_abbr}
                  </div>
                  <div className={[
                    "font-['Rajdhani'] text-[12px] font-bold text-[#e8f5ea] bg-[#111a14] border border-[#1e2e22] rounded px-[7px] py-[2px] flex-shrink-0 tracking-[1px]",
                    isLastGoal ? "border-[#39FF1455] text-[#39FF14] bg-[#39FF1422]" : "",
                  ].join(" ")}>
                    {ev.score_after}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
