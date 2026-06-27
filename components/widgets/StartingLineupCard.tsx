"use client"

/**
 * StartingLineupCard.tsx
 *
 * Widget baru: Starting Lineup / Susunan Pemain.
 * Menampilkan starting XI dua tim dalam visual lapangan (pitch view),
 * lengkap dengan foto pemain, rating performa, nomor punggung, dan
 * indikator pemain yang sudah diganti — mengikuti referensi tampilan
 * "performa" pada match center.
 *
 * Arsitektur mengikuti widget lain yang sudah ada: "use client", fetch by id
 * dari Supabase, skeleton loading, empty state, tombol Edit Widget admin.
 * Dua tim ditampilkan lewat tab (pola tab sama seperti PerbandinganTimCard).
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { User, ArrowDownCircle } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineupPlayer {
  number: number
  name: string
  position: string   // "GK" | "CB" | "LB" | "RB" | "CDM" | "CM" | "CAM" | "LW" | "RW" | "ST" dst
  rating?: number | null     // 7.6 — opsional, tampil sebagai pill warna
  photo_url?: string | null
  subbed_off?: boolean       // tampil ikon panah merah ke bawah
}

export interface TeamLineup {
  team_name: string
  flag: string        // emoji bendera
  formation: string   // "4-2-3-1"
  // Urutan players HARUS: [GK, ...baris pertahanan, ...baris tengah (sesuai urutan formasi), ...baris depan]
  // Total pemain harus 11 dan sesuai jumlah di setiap baris formasi.
  players: LineupPlayer[]
}

export interface StartingLineupData {
  id: string
  competition: string
  home: TeamLineup
  away: TeamLineup
}

interface Props {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string, widgetType: "starting_lineup") => void
  refreshKey?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFormationLines(formation: string): number[] {
  const parts = formation.split("-").map(Number)
  if (parts.length === 0 || parts.some(isNaN)) return [4, 3, 3]
  return parts
}

function chunkPlayers(players: LineupPlayer[], formation: string): LineupPlayer[][] {
  const lines = parseFormationLines(formation) // contoh [4,2,3,1]
  const rowSizes = [1, ...lines] // GK + sisanya, urut dari belakang ke depan
  const rows: LineupPlayer[][] = []
  let cursor = 0
  for (const size of rowSizes) {
    rows.push(players.slice(cursor, cursor + size))
    cursor += size
  }
  return rows
}

function ratingColor(r: number): string {
  if (r >= 7.5) return "#39FF14"
  if (r >= 7.0) return "#9be84a"
  if (r >= 6.5) return "#d9d94a"
  if (r >= 6.0) return "#FFD700"
  return "#FF8844"
}

function PlayerNode({ p }: { p: LineupPlayer }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[64px] flex-shrink-0">
      <div className="relative">
        {p.subbed_off && (
          <span className="absolute -left-1.5 -top-1.5 z-10 rounded-full bg-[#0d1410]">
            <ArrowDownCircle size={15} className="text-[#FF4444]" fill="#0d1410" />
          </span>
        )}
        <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white/70 bg-[#1e2e22] shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          {p.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#5a7a64]">
              <User size={22} />
            </div>
          )}
        </div>
        {p.rating != null && (
          <span
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-[1px] text-[10px] font-bold text-black shadow"
            style={{ background: ratingColor(p.rating) }}
          >
            {p.rating.toFixed(1)}
          </span>
        )}
      </div>
      <div className="mt-1 text-center leading-tight">
        <p className="font-['Rajdhani'] text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate max-w-[64px]">
          {p.number} {p.name}
        </p>
      </div>
    </div>
  )
}

function PitchMarkings() {
  return (
    <svg viewBox="0 0 300 420" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-90">
      <rect x="6" y="6" width="288" height="408" fill="none" stroke="#ffffff55" strokeWidth="2" />
      <line x1="6" y1="210" x2="294" y2="210" stroke="#ffffff40" strokeWidth="1.5" />
      <circle cx="150" cy="210" r="38" fill="none" stroke="#ffffff40" strokeWidth="1.5" />
      <circle cx="150" cy="210" r="2" fill="#ffffff40" />
      {/* gawang bawah (GK baris bawah) */}
      <rect x="95" y="350" width="110" height="64" fill="none" stroke="#ffffff55" strokeWidth="1.5" />
      <rect x="120" y="392" width="60" height="22" fill="none" stroke="#ffffff55" strokeWidth="1.5" />
      <path d="M 110 350 A 40 40 0 0 1 190 350" fill="none" stroke="#ffffff40" strokeWidth="1.5" />
    </svg>
  )
}

function PitchView({ team }: { team: TeamLineup }) {
  const rows = chunkPlayers(team.players, team.formation) // index 0 = GK (bawah) ... terakhir = FWD (atas)
  const rowsTopToBottom = [...rows].reverse() // render dari atas (FWD) ke bawah (GK)

  return (
    <div>
      {/* Header tim */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{team.flag}</span>
          <span className="font-['Rajdhani'] text-[16px] font-bold text-[#e8f5ea]">{team.team_name}</span>
        </div>
        <span className="font-['Barlow_Condensed'] text-[11px] font-bold tracking-[1px] px-2 py-[3px] rounded bg-[#39FF1422] border border-[#39FF1455] text-[#39FF14]">
          {team.formation}
        </span>
      </div>

      {/* Lapangan */}
      <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "300 / 420", background: "linear-gradient(180deg, #1d6e34 0%, #18602c 50%, #1d6e34 100%)" }}>
        <PitchMarkings />
        <div className="absolute inset-0 z-10 flex flex-col justify-between py-5">
          {rowsTopToBottom.map((row, idx) => (
            <div key={idx} className="flex justify-around px-2">
              {row.map((p, i) => <PlayerNode key={i} p={p} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StartingLineupCard({ widgetId, isAdmin, onEdit, refreshKey = 0 }: Props) {
  const [data, setData] = useState<StartingLineupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTeam, setActiveTeam] = useState<"home" | "away">("home")
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { data: row } = await supabase
        .from("widget_starting_lineup")
        .select("*")
        .eq("id", widgetId)
        .maybeSingle()
      setData(row as StartingLineupData | null)
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
        <div className="aspect-[3/4] m-5 rounded-xl bg-[#162019]" />
      </div>
    )
  }

  // ── Empty state ──
  if (!data) {
    return (
      <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
          <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Starting Lineup</span>
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "starting_lineup")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
        <div className="flex items-center justify-center py-10 text-sm text-[#3d5a44]">Belum ada data starting lineup.</div>
      </div>
    )
  }

  const team = activeTeam === "home" ? data.home : data.away

  return (
    <div className="my-6 rounded-2xl border border-[#1e2e22] bg-[#0d1410] overflow-hidden relative transition-all hover:border-[#2a4030] hover:shadow-[0_0_30px_#39FF1410]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#39FF1455] to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2e22]">
        <span className="font-['Barlow_Condensed'] text-[13px] font-bold tracking-[2px] uppercase text-[#7a9a80]">Starting Lineup</span>
        <div className="flex items-center gap-2">
          <span className="font-['Barlow_Condensed'] text-[10px] font-bold tracking-[1.5px] uppercase px-2 py-[3px] rounded bg-[#39FF1422] border border-[#39FF1455] text-[#39FF14]">
            {data.competition}
          </span>
          {isAdmin && onEdit && (
            <button onClick={() => onEdit(widgetId, "starting_lineup")} className="text-xs text-[#39FF14]/60 hover:text-[#39FF14] transition-colors">Edit</button>
          )}
        </div>
      </div>

      {/* Tab pemilih tim */}
      <div className="flex border-b border-[#1e2e22] px-5 gap-0">
        {(["home", "away"] as const).map((side) => {
          const t = side === "home" ? data.home : data.away
          return (
            <button
              key={side}
              onClick={() => setActiveTeam(side)}
              className={[
                "flex items-center gap-1.5 font-['Barlow_Condensed'] text-[11px] font-bold tracking-[1.5px] uppercase py-3 px-4 border-b-2 -mb-px transition-all",
                activeTeam === side
                  ? "text-[#39FF14] border-[#39FF14]"
                  : "text-[#3d5a44] border-transparent hover:text-[#7a9a80]",
              ].join(" ")}
            >
              <span>{t.flag}</span>
              {t.team_name}
            </button>
          )
        })}
      </div>

      {/* Pitch */}
      <div className="px-5 py-5">
        <PitchView team={team} />
      </div>
    </div>
  )
}
