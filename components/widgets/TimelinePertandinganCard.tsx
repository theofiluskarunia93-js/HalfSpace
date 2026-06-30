"use client"

/**
 * TimelinePertandinganCard.tsx
 *
 * REWRITE: setiap event timeline kini dirender sebagai "kartu" tersendiri
 * (bukan baris ringkas) — banner besar "GOOLLL!!!" untuk gol, kartu
 * pergantian dengan baris MASUK/KELUAR, dan kartu kuning/merah dengan foto
 * pemain — meniru gaya match center (referensi: kartu gol & kartu pergantian
 * pada live commentary).
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { User, ArrowUp, ArrowDown, RefreshCw, Square, Tv } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "goal" | "yellow_card" | "red_card" | "substitution" | "var" | "penalty"
type MatchStatus = "upcoming" | "live" | "finished"

export interface TimelineEvent {
  minute: string          // "23'", "45+2'", "90+8'"
  type: EventType
  team: "home" | "away"
  score_after: string     // "3-2" — hanya dipakai untuk gol/penalti

  // Pemain utama event ini (pencetak gol / pemain kartu / yang masuk untuk VAR dsb)
  player_name: string
  player_number?: string
  player_position?: string
  player_photo?: string

  // Khusus gol/penalti
  assist_name?: string

  // Khusus substitusi
  sub_in_name?: string
  sub_in_number?: string
  sub_in_position?: string
  sub_in_photo?: string
  sub_out_name?: string
  sub_out_number?: string
  sub_out_position?: string
  sub_out_photo?: string
}

interface TimelinePertandinganData {
  id: string
  home_team: string
  away_team: string
  home_flag: string       // emoji bendera: "🇹🇷"
  away_flag: string
  home_abbr: string        // "TUR", "USA"
  away_abbr: string
  home_score: number
  away_score: number
  status: MatchStatus
  live_minute?: string     // "67'" — hanya saat live
  competition: string      // "Piala Dunia 2026 · Grup D"
  match_info: string       // "Selesai · Piala Dunia 2026 · Grup D"
  events: TimelineEvent[]
}

interface Props {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string, widgetType: "timeline_pertandingan") => void
  refreshKey?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitScore(s: string): [string, string] {
  const parts = s.split(/[-–—]/).map((p) => p.trim())
  return [parts[0] ?? "-", parts[1] ?? "-"]
}

function AvatarPhoto({
  photo, name, ringColor, size = 44,
}: { photo?: string | null; name: string; ringColor: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className="flex-shrink-0 overflow-hidden rounded-full border-2"
      style={{ width: size, height: size, borderColor: ringColor, boxShadow: `0 0 10px ${ringColor}40` }}
    >
      {photo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={name} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#1e2e22] text-[#5a7a64]">
          <User size={size * 0.5} />
        </div>
      )}
    </div>
  )
}

function PlayerInfoRow({
  name, number, position, teamLabel, photo, ringColor, subtitle,
}: {
  name: string; number?: string; position?: string; teamLabel: string
  photo?: string | null; ringColor: string; subtitle?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-['Rajdhani'] text-[16px] font-bold text-[#e8f5ea] truncate">{name}</p>
        <p className="font-['Barlow_Condensed'] text-[11px] font-medium tracking-[0.5px] text-[#7a9a80] truncate">
          {teamLabel}{position ? ` · ${position}` : ""}{number ? ` #${number}` : ""}
        </p>
        {subtitle && (
          <p className="font-['Barlow_Condensed'] text-[10px] text-[#3d5a44] truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      <AvatarPhoto photo={photo} name={name} ringColor={ringColor} />
    </div>
  )
}

function CardHeader({ icon, label, minute, accent }: { icon: React.ReactNode; label: string; minute: string; accent: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e2e22]">
      <span className="flex items-center gap-2 font-['Barlow_Condensed'] text-[11px] font-bold tracking-[2px] uppercase" style={{ color: accent }}>
        {icon}
        {label}
      </span>
      <span className="font-['Barlow_Condensed'] text-[11px] font-bold text-[#3d5a44]">{minute}</span>
    </div>
  )
}

// ─── Event Card variants ──────────────────────────────────────────────────────

function GoalEventCard({ ev, data }: { ev: TimelineEvent; data: TimelinePertandinganData }) {
  const [homeAfter, awayAfter] = splitScore(ev.score_after)
  const teamColor = ev.team === "home" ? "#39FF14" : "#4488FF"
  const teamLabel = ev.team === "home"
    ? `${data.home_flag} ${data.home_team}`
    : `${data.away_flag} ${data.away_team}`

  return (
    <div className="rounded-xl border border-[#1e2e22] overflow-hidden">
      {/* Banner besar */}
      <div className="bg-gradient-to-b from-[#FF3B3B] to-[#C81818] px-4 py-4 text-center">
        <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-base">⚽</div>
        <p className="font-['Rajdhani'] text-[20px] font-black tracking-wide text-white">GOOLLL!!!</p>
        <p className="font-['Barlow_Condensed'] text-[12px] font-semibold text-white/80">{ev.minute}</p>
      </div>
      {/* Skor strip */}
      <div className="bg-[#8f1414] px-4 py-2 text-center">
        <p className="font-['Barlow_Condensed'] text-[12px] font-bold tracking-[1px] text-white">
          {data.home_team} {homeAfter} – {awayAfter} {data.away_team}
        </p>
      </div>
      {/* Info pemain */}
      <div className="bg-[#0d1410]">
        <PlayerInfoRow
          name={ev.player_name}
          number={ev.player_number}
          position={ev.player_position}
          teamLabel={teamLabel}
          photo={ev.player_photo}
          ringColor={teamColor}
          subtitle={ev.assist_name ? `Umpan dari ${ev.assist_name}` : undefined}
        />
      </div>
    </div>
  )
}

function SubstitutionEventCard({ ev, data }: { ev: TimelineEvent; data: TimelinePertandinganData }) {
  const teamColor = ev.team === "home" ? "#39FF14" : "#4488FF"
  const teamLabel = ev.team === "home"
    ? `${data.home_flag} ${data.home_team}`
    : `${data.away_flag} ${data.away_team}`

  return (
    <div className="rounded-xl border border-[#1e2e22] overflow-hidden bg-[#0d1410]">
      <CardHeader
        icon={<RefreshCw size={13} />}
        label="Pergantian"
        minute={ev.minute}
        accent="#7a9a80"
      />
      <div className="divide-y divide-[#1e2e22]">
        <div>
          <div className="px-4 pt-2.5 flex items-center gap-1.5">
            <ArrowUp size={12} className="text-[#39FF14]" />
            <span className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase text-[#39FF14]">Masuk</span>
          </div>
          <PlayerInfoRow
            name={ev.sub_in_name ?? "-"}
            number={ev.sub_in_number}
            position={ev.sub_in_position}
            teamLabel={teamLabel}
            photo={ev.sub_in_photo}
            ringColor={teamColor}
          />
        </div>
        <div>
          <div className="px-4 pt-2.5 flex items-center gap-1.5">
            <ArrowDown size={12} className="text-[#FF8844]" />
            <span className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase text-[#FF8844]">Keluar</span>
          </div>
          <PlayerInfoRow
            name={ev.sub_out_name ?? "-"}
            number={ev.sub_out_number}
            position={ev.sub_out_position}
            teamLabel={teamLabel}
            photo={ev.sub_out_photo}
            ringColor="#3d5a44"
          />
        </div>
      </div>
    </div>
  )
}

function CardEventCard({ ev, data }: { ev: TimelineEvent; data: TimelinePertandinganData }) {
  const isRed = ev.type === "red_card"
  const accent = isRed ? "#FF4444" : "#FFD700"
  const teamColor = ev.team === "home" ? "#39FF14" : "#4488FF"
  const teamLabel = ev.team === "home"
    ? `${data.home_flag} ${data.home_team}`
    : `${data.away_flag} ${data.away_team}`

  return (
    <div className="rounded-xl border border-[#1e2e22] overflow-hidden bg-[#0d1410]">
      <CardHeader
        icon={<Square size={11} fill={accent} stroke="none" />}
        label={isRed ? "Kartu Merah" : "Kartu Kuning"}
        minute={ev.minute}
        accent={accent}
      />
      <PlayerInfoRow
        name={ev.player_name}
        number={ev.player_number}
        position={ev.player_position}
        teamLabel={teamLabel}
        photo={ev.player_photo}
        ringColor={teamColor}
      />
    </div>
  )
}

function VarEventCard({ ev, data }: { ev: TimelineEvent; data: TimelinePertandinganData }) {
  const teamColor = ev.team === "home" ? "#39FF14" : "#4488FF"
  const teamLabel = ev.team === "home"
    ? `${data.home_flag} ${data.home_team}`
    : `${data.away_flag} ${data.away_team}`

  return (
    <div className="rounded-xl border border-[#1e2e22] overflow-hidden bg-[#0d1410]">
      <CardHeader icon={<Tv size={12} />} label="VAR" minute={ev.minute} accent="#7a9a80" />
      <PlayerInfoRow
        name={ev.player_name}
        number={ev.player_number}
        position={ev.player_position}
        teamLabel={teamLabel}
        photo={ev.player_photo}
        ringColor={teamColor}
      />
    </div>
  )
}

function EventCard({ ev, data }: { ev: TimelineEvent; data: TimelinePertandinganData }) {
  if (ev.type === "goal" || ev.type === "penalty") return <GoalEventCard ev={ev} data={data} />
  if (ev.type === "substitution") return <SubstitutionEventCard ev={ev} data={data} />
  if (ev.type === "yellow_card" || ev.type === "red_card") return <CardEventCard ev={ev} data={data} />
  return <VarEventCard ev={ev} data={data} />
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
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-[#162019]" />)}
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

      {/* Timeline events — kini berupa kartu, bukan baris ringkas */}
      <div className="px-5 py-5 flex flex-col gap-4">
        {data.events.length === 0 ? (
          <p className="text-sm text-center text-[#3d5a44] py-6">Belum ada kejadian dicatat.</p>
        ) : (
          data.events.map((ev, i) => <EventCard key={i} ev={ev} data={data} />)
        )}
      </div>
    </div>
  )
}
