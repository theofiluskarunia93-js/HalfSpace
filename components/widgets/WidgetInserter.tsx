"use client"

/**
 * WidgetInserter.tsx
 * Mendukung 4 widget: jadwal, klasemen, transfer, peluang
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Plus, X, Save, Loader2, TableIcon, Trophy, ChevronDown, ChevronUp, Pencil,
  ArrowRightLeft, Star,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

export type WidgetType = "jadwal" | "klasemen" | "transfer" | "peluang"

interface ActiveWidget {
  widgetId: string
  widgetType: WidgetType
}

interface MatchEntry {
  _localId: string
  group_label: string
  home_team: string
  away_team: string
  match_date: string
  match_time: string
  score_home: string
  score_away: string
  status: "scheduled" | "live" | "finished"
  stadium: string
}

interface StandingEntry {
  _localId: string
  group_label: string
  rank: number
  team_name: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
}

interface TransferEntry {
  _localId: string
  league_label: string
  player_name: string
  player_initials: string
  position: string
  age: string
  from_club: string
  from_club_color: string
  to_club: string
  league_dest: string
  transfer_value: string
  is_free: boolean
  status: "confirmed" | "official" | "medical" | "rumor"
  transfer_date: string
}

interface PeluangEntry {
  _localId: string
  rank: number
  team_name: string
  team_flag: string
  category: string
  win_pct: string
  reasons_win: string   // newline-separated
  reasons_lose: string  // newline-separated
}

interface WidgetInserterProps {
  onInsert: (shortcode: string, widgetId: string, widgetType: WidgetType) => void
  editWidgetId?: string | null
  editWidgetType?: WidgetType | null
  onResetEdit?: () => void
  initialWidgets?: ActiveWidget[]
}

// ── Helper factory functions ──────────────────────────────────────────────────

function makeMatch(group = "A"): MatchEntry {
  return {
    _localId: crypto.randomUUID(),
    group_label: group,
    home_team: "", away_team: "",
    match_date: "", match_time: "",
    score_home: "", score_away: "",
    status: "scheduled", stadium: "",
  }
}

function makeStanding(group = "A", rank = 1): StandingEntry {
  return {
    _localId: crypto.randomUUID(),
    group_label: group, rank,
    team_name: "", played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
  }
}

function makeTransfer(league = "Premier League"): TransferEntry {
  return {
    _localId: crypto.randomUUID(),
    league_label: league,
    player_name: "", player_initials: "", position: "", age: "",
    from_club: "", from_club_color: "#888888",
    to_club: "", league_dest: league,
    transfer_value: "", is_free: false,
    status: "confirmed", transfer_date: "",
  }
}

function makePeluang(): PeluangEntry {
  return {
    _localId: crypto.randomUUID(),
    rank: 1, team_name: "", team_flag: "",
    category: "FAVORIT UTAMA", win_pct: "",
    reasons_win: "", reasons_lose: "",
  }
}

// ── Shared input helpers ──────────────────────────────────────────────────────

function FField({
  label, value, onChange, type = "text", placeholder, className = "",
}: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; placeholder?: string; className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none transition focus:border-[#39FF14]/50 focus:ring-1 focus:ring-[#39FF14]/20"
      />
    </div>
  )
}

function FTextarea({
  label, value, onChange, placeholder, className = "",
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none transition focus:border-[#39FF14]/50 focus:ring-1 focus:ring-[#39FF14]/20 resize-none"
      />
    </div>
  )
}

function FSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-white/10 bg-[#111] px-2.5 py-1.5 text-xs text-white outline-none transition focus:border-[#39FF14]/50"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function FCheckbox({
  label, checked, onChange,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[#39FF14]"
      />
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>
    </div>
  )
}

// ── Jadwal Widget ─────────────────────────────────────────────────────────────

function JadwalForm({
  onInsert, editWidgetId, onResetEdit,
}: {
  onInsert: (shortcode: string, widgetId: string) => void
  editWidgetId?: string | null
  onResetEdit?: () => void
}) {
  const [rows, setRows] = useState<MatchEntry[]>([makeMatch()])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState("A")
  const supabase = createClient()

  useEffect(() => {
    if (!editWidgetId) { setRows([makeMatch()]); return }
    setLoading(true)
    supabase.from("widget_jadwal").select("*").eq("widget_id", editWidgetId)
      .order("match_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (data && data.length > 0) {
          setRows(data.map((r) => ({
            _localId: r.id,
            group_label: r.group_label ?? "A",
            home_team: r.home_team ?? "", away_team: r.away_team ?? "",
            match_date: r.match_date ?? "", match_time: r.match_time ?? "",
            score_home: r.score_home != null ? String(r.score_home) : "",
            score_away: r.score_away != null ? String(r.score_away) : "",
            status: r.status ?? "scheduled", stadium: r.stadium ?? "",
          })))
          setActiveGroup(data[0].group_label ?? "A")
        }
        setLoading(false)
      })
  }, [editWidgetId])

  const groups = [...new Set(rows.map((r) => r.group_label))].sort()

  function updateRow(localId: string, patch: Partial<MatchEntry>) {
    setRows((prev) => prev.map((r) => r._localId === localId ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.home_team.trim() || r.away_team.trim())
    if (!validRows.length) { setError("Tambahkan minimal satu pertandingan."); return }
    setSaving(true); setError(null)
    try {
      const widgetId = editWidgetId || crypto.randomUUID()
      await supabase.from("widget_jadwal").delete().eq("widget_id", widgetId)
      const payload = validRows.map((r) => ({
        widget_id: widgetId, group_label: r.group_label,
        home_team: r.home_team, away_team: r.away_team,
        match_date: r.match_date || null, match_time: r.match_time || null,
        score_home: r.score_home !== "" ? Number(r.score_home) : null,
        score_away: r.score_away !== "" ? Number(r.score_away) : null,
        status: r.status, stadium: r.stadium || null,
      }))
      const { error: insertErr } = await supabase.from("widget_jadwal").insert(payload)
      if (insertErr) throw insertErr
      onInsert(`[match_data id="${widgetId}"]`, widgetId)
      if (!editWidgetId) { setRows([makeMatch()]); setActiveGroup("A") }
      onResetEdit?.()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-[#39FF14]" /></div>
  const activeRows = rows.filter((r) => r.group_label === activeGroup)

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => (
          <button key={g} onClick={() => setActiveGroup(g)}
            className={`rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all ${activeGroup === g ? "bg-[#39FF14] text-black" : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white"}`}>
            Grup {g}
          </button>
        ))}
        <button onClick={() => { const n = String.fromCharCode(65 + groups.length); setActiveGroup(n); setRows((p) => [...p, makeMatch(n)]) }}
          className="flex items-center gap-1 rounded-md border border-dashed border-[#39FF14]/30 px-2 py-1 text-[11px] text-[#39FF14]/60 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]">
          <Plus size={11} /> Grup
        </button>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {activeRows.map((row) => (
          <div key={row._localId} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <button onClick={() => setRows((p) => p.filter((r) => r._localId !== row._localId))}
              className="absolute right-2 top-2 text-zinc-600 transition hover:text-red-400"><X size={12} /></button>
            <div className="grid grid-cols-2 gap-2">
              <FField label="Tim Kandang" value={row.home_team} onChange={(v) => updateRow(row._localId, { home_team: v })} placeholder="Tim A" />
              <FField label="Tim Tamu" value={row.away_team} onChange={(v) => updateRow(row._localId, { away_team: v })} placeholder="Tim B" />
              <FField label="Tanggal" value={row.match_date} onChange={(v) => updateRow(row._localId, { match_date: v })} type="date" />
              <FField label="Waktu" value={row.match_time} onChange={(v) => updateRow(row._localId, { match_time: v })} type="time" />
              <FField label="Stadion" value={row.stadium} onChange={(v) => updateRow(row._localId, { stadium: v })} placeholder="Nama Stadion" className="col-span-2" />
              <FSelect label="Status" value={row.status} onChange={(v) => updateRow(row._localId, { status: v as MatchEntry["status"] })}
                options={[{ label: "Akan Datang", value: "scheduled" }, { label: "Live", value: "live" }, { label: "Selesai", value: "finished" }]} />
              {(row.status === "live" || row.status === "finished") && (
                <>
                  <FField label="Skor Kandang" value={row.score_home} onChange={(v) => updateRow(row._localId, { score_home: v })} type="number" />
                  <FField label="Skor Tamu" value={row.score_away} onChange={(v) => updateRow(row._localId, { score_away: v })} type="number" />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => setRows((p) => [...p, makeMatch(activeGroup)])}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#39FF14]/30 py-2.5 text-xs text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={14} /> Tambah Pertandingan
      </button>
      <div className="flex items-center justify-between gap-2 pt-1">
        {editWidgetId && onResetEdit && (
          <button onClick={onResetEdit} className="text-xs text-zinc-500 transition hover:text-white">Batal Edit</button>
        )}
        <button onClick={handleSave} disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-black transition hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {editWidgetId ? "Update & Sync" : "Simpan & Insert"}
        </button>
      </div>
    </div>
  )
}

// ── Klasemen Widget ───────────────────────────────────────────────────────────

function KlasemenForm({
  onInsert, editWidgetId, onResetEdit,
}: {
  onInsert: (shortcode: string, widgetId: string) => void
  editWidgetId?: string | null
  onResetEdit?: () => void
}) {
  const [rows, setRows] = useState<StandingEntry[]>([makeStanding("A", 1)])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState("A")
  const supabase = createClient()

  useEffect(() => {
    if (!editWidgetId) { setRows([makeStanding("A", 1)]); return }
    setLoading(true)
    supabase.from("widget_klasemen").select("*").eq("widget_id", editWidgetId)
      .order("rank", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (data && data.length > 0) {
          setRows(data.map((r) => ({
            _localId: r.id,
            group_label: r.group_label ?? "A", rank: r.rank ?? 1,
            team_name: r.team_name ?? "",
            played: r.played ?? 0, won: r.won ?? 0, drawn: r.drawn ?? 0, lost: r.lost ?? 0,
            gf: r.gf ?? 0, ga: r.ga ?? 0, points: r.points ?? 0,
          })))
          setActiveGroup(data[0].group_label ?? "A")
        }
        setLoading(false)
      })
  }, [editWidgetId])

  const groups = [...new Set(rows.map((r) => r.group_label))].sort()

  function updateRow(localId: string, patch: Partial<StandingEntry>) {
    setRows((prev) => prev.map((r) => r._localId === localId ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.team_name.trim())
    if (!validRows.length) { setError("Tambahkan minimal satu tim."); return }
    setSaving(true); setError(null)
    try {
      const widgetId = editWidgetId || crypto.randomUUID()
      await supabase.from("widget_klasemen").delete().eq("widget_id", widgetId)
      const payload = validRows.map((r, idx) => ({
        widget_id: widgetId, group_label: r.group_label, rank: r.rank || idx + 1,
        team_name: r.team_name, played: Number(r.played), won: Number(r.won),
        drawn: Number(r.drawn), lost: Number(r.lost), gf: Number(r.gf), ga: Number(r.ga), points: Number(r.points),
      }))
      const { error: insertErr } = await supabase.from("widget_klasemen").insert(payload)
      if (insertErr) throw insertErr
      onInsert(`[klasemen_data id="${widgetId}"]`, widgetId)
      if (!editWidgetId) { setRows([makeStanding("A", 1)]); setActiveGroup("A") }
      onResetEdit?.()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-[#39FF14]" /></div>
  const activeRows = rows.filter((r) => r.group_label === activeGroup)

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => (
          <button key={g} onClick={() => setActiveGroup(g)}
            className={`rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all ${activeGroup === g ? "bg-[#39FF14] text-black" : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white"}`}>
            Grup {g}
          </button>
        ))}
        <button onClick={() => { const n = String.fromCharCode(65 + groups.length); setActiveGroup(n); setRows((p) => [...p, makeStanding(n, 1)]) }}
          className="flex items-center gap-1 rounded-md border border-dashed border-[#39FF14]/30 px-2 py-1 text-[11px] text-[#39FF14]/60 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]">
          <Plus size={11} /> Grup
        </button>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {activeRows.map((row) => (
          <div key={row._localId} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <button onClick={() => setRows((p) => p.filter((r) => r._localId !== row._localId))}
              className="absolute right-2 top-2 text-zinc-600 transition hover:text-red-400"><X size={12} /></button>
            <div className="grid grid-cols-4 gap-2">
              <FField label="Nama Tim" value={row.team_name} onChange={(v) => updateRow(row._localId, { team_name: v })} placeholder="Nama Tim" className="col-span-3" />
              <FField label="Rank" value={row.rank} onChange={(v) => updateRow(row._localId, { rank: Number(v) })} type="number" />
              <FField label="Main" value={row.played} onChange={(v) => updateRow(row._localId, { played: Number(v) })} type="number" />
              <FField label="Menang" value={row.won} onChange={(v) => updateRow(row._localId, { won: Number(v) })} type="number" />
              <FField label="Seri" value={row.drawn} onChange={(v) => updateRow(row._localId, { drawn: Number(v) })} type="number" />
              <FField label="Kalah" value={row.lost} onChange={(v) => updateRow(row._localId, { lost: Number(v) })} type="number" />
              <FField label="GF" value={row.gf} onChange={(v) => updateRow(row._localId, { gf: Number(v) })} type="number" />
              <FField label="GA" value={row.ga} onChange={(v) => updateRow(row._localId, { ga: Number(v) })} type="number" />
              <FField label="Poin" value={row.points} onChange={(v) => updateRow(row._localId, { points: Number(v) })} type="number" />
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => setRows((p) => { const n = p.filter((r) => r.group_label === activeGroup).length; return [...p, makeStanding(activeGroup, n + 1)] })}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#39FF14]/30 py-2.5 text-xs text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={14} /> Tambah Tim
      </button>
      <div className="flex items-center justify-between gap-2 pt-1">
        {editWidgetId && onResetEdit && (
          <button onClick={onResetEdit} className="text-xs text-zinc-500 transition hover:text-white">Batal Edit</button>
        )}
        <button onClick={handleSave} disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-black transition hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {editWidgetId ? "Update & Sync" : "Simpan & Insert"}
        </button>
      </div>
    </div>
  )
}

// ── Transfer Widget ───────────────────────────────────────────────────────────

function TransferForm({
  onInsert, editWidgetId, onResetEdit,
}: {
  onInsert: (shortcode: string, widgetId: string) => void
  editWidgetId?: string | null
  onResetEdit?: () => void
}) {
  const [rows, setRows] = useState<TransferEntry[]>([makeTransfer()])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeLeague, setActiveLeague] = useState("Premier League")
  const supabase = createClient()

  useEffect(() => {
    if (!editWidgetId) { setRows([makeTransfer()]); return }
    setLoading(true)
    supabase.from("widget_transfer").select("*").eq("widget_id", editWidgetId)
      .order("transfer_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (data && data.length > 0) {
          setRows(data.map((r) => ({
            _localId: r.id,
            league_label: r.league_label ?? "Premier League",
            player_name: r.player_name ?? "", player_initials: r.player_initials ?? "",
            position: r.position ?? "", age: r.age != null ? String(r.age) : "",
            from_club: r.from_club ?? "", from_club_color: r.from_club_color ?? "#888888",
            to_club: r.to_club ?? "", league_dest: r.league_dest ?? "",
            transfer_value: r.transfer_value ?? "", is_free: r.is_free ?? false,
            status: r.status ?? "confirmed", transfer_date: r.transfer_date ?? "",
          })))
          setActiveLeague(data[0].league_label ?? "Premier League")
        }
        setLoading(false)
      })
  }, [editWidgetId])

  const leagues = [...new Set(rows.map((r) => r.league_label))].sort()

  function updateRow(localId: string, patch: Partial<TransferEntry>) {
    setRows((prev) => prev.map((r) => r._localId === localId ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.player_name.trim())
    if (!validRows.length) { setError("Tambahkan minimal satu pemain."); return }
    setSaving(true); setError(null)
    try {
      const widgetId = editWidgetId || crypto.randomUUID()
      await supabase.from("widget_transfer").delete().eq("widget_id", widgetId)
      const payload = validRows.map((r) => ({
        widget_id: widgetId,
        league_label: r.league_label,
        player_name: r.player_name,
        player_initials: r.player_initials || r.player_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2),
        position: r.position || null,
        age: r.age ? Number(r.age) : null,
        from_club: r.from_club || null,
        from_club_color: r.from_club_color || null,
        to_club: r.to_club || null,
        league_dest: r.league_dest || r.league_label,
        transfer_value: r.is_free ? null : (r.transfer_value || null),
        is_free: r.is_free,
        status: r.status,
        transfer_date: r.transfer_date || null,
      }))
      const { error: insertErr } = await supabase.from("widget_transfer").insert(payload)
      if (insertErr) throw insertErr
      onInsert(`[transfer_data id="${widgetId}"]`, widgetId)
      if (!editWidgetId) { setRows([makeTransfer()]); setActiveLeague("Premier League") }
      onResetEdit?.()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-[#39FF14]" /></div>
  const activeRows = rows.filter((r) => r.league_label === activeLeague)

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

      {/* League tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {leagues.map((l) => (
          <button key={l} onClick={() => setActiveLeague(l)}
            className={`rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all ${activeLeague === l ? "bg-[#39FF14] text-black" : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white"}`}>
            {l}
          </button>
        ))}
        <button
          onClick={() => {
            const name = prompt("Nama Liga baru (cth: La Liga):")
            if (name?.trim()) { setActiveLeague(name.trim()); setRows((p) => [...p, makeTransfer(name.trim())]) }
          }}
          className="flex items-center gap-1 rounded-md border border-dashed border-[#39FF14]/30 px-2 py-1 text-[11px] text-[#39FF14]/60 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]">
          <Plus size={11} /> Liga
        </button>
      </div>

      {/* Transfer rows */}
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {activeRows.map((row) => (
          <div key={row._localId} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <button onClick={() => setRows((p) => p.filter((r) => r._localId !== row._localId))}
              className="absolute right-2 top-2 text-zinc-600 transition hover:text-red-400"><X size={12} /></button>
            <div className="grid grid-cols-2 gap-2">
              <FField label="Nama Pemain" value={row.player_name} onChange={(v) => updateRow(row._localId, { player_name: v })} placeholder="Jude Bellingham" className="col-span-2" />
              <FField label="Inisial (opsional)" value={row.player_initials} onChange={(v) => updateRow(row._localId, { player_initials: v })} placeholder="JB" />
              <FField label="Posisi" value={row.position} onChange={(v) => updateRow(row._localId, { position: v })} placeholder="CAM" />
              <FField label="Usia" value={row.age} onChange={(v) => updateRow(row._localId, { age: v })} type="number" placeholder="20" />
              <FField label="Asal Klub" value={row.from_club} onChange={(v) => updateRow(row._localId, { from_club: v })} placeholder="Real Madrid" />
              <FField label="Ke Klub" value={row.to_club} onChange={(v) => updateRow(row._localId, { to_club: v })} placeholder="Manchester City" />
              <FField label="Liga Tujuan" value={row.league_dest} onChange={(v) => updateRow(row._localId, { league_dest: v })} placeholder="Premier League" />
              <FField label="Warna Klub Asal" value={row.from_club_color} onChange={(v) => updateRow(row._localId, { from_club_color: v })} type="color" />
              <div className="col-span-2 flex items-end gap-2">
                <FField label="Nilai Transfer" value={row.transfer_value} onChange={(v) => updateRow(row._localId, { transfer_value: v })} placeholder="180M" className="flex-1" />
                <div className="mb-0.5 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5">
                  <FCheckbox label="Free Transfer" checked={row.is_free} onChange={(v) => updateRow(row._localId, { is_free: v })} />
                </div>
              </div>
              <FSelect label="Status" value={row.status} onChange={(v) => updateRow(row._localId, { status: v as TransferEntry["status"] })}
                options={[
                  { label: "Confirmed ✅", value: "confirmed" },
                  { label: "Official 🔵", value: "official" },
                  { label: "Medical 🟡", value: "medical" },
                  { label: "Rumor 💜", value: "rumor" },
                ]} />
              <FField label="Tanggal Transfer" value={row.transfer_date} onChange={(v) => updateRow(row._localId, { transfer_date: v })} type="date" />
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setRows((p) => [...p, makeTransfer(activeLeague)])}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#39FF14]/30 py-2.5 text-xs text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={14} /> Tambah Pemain
      </button>
      <div className="flex items-center justify-between gap-2 pt-1">
        {editWidgetId && onResetEdit && (
          <button onClick={onResetEdit} className="text-xs text-zinc-500 transition hover:text-white">Batal Edit</button>
        )}
        <button onClick={handleSave} disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-black transition hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {editWidgetId ? "Update & Sync" : "Simpan & Insert"}
        </button>
      </div>
    </div>
  )
}

// ── Peluang Juara Widget ──────────────────────────────────────────────────────

function PeluangForm({
  onInsert, editWidgetId, onResetEdit,
}: {
  onInsert: (shortcode: string, widgetId: string) => void
  editWidgetId?: string | null
  onResetEdit?: () => void
}) {
  const [rows, setRows] = useState<PeluangEntry[]>([makePeluang()])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const CATEGORIES = ["FAVORIT UTAMA", "KANDIDAT KUAT", "DARK HORSE", "PELENGKAP"]

  useEffect(() => {
    if (!editWidgetId) { setRows([makePeluang()]); return }
    setLoading(true)
    supabase.from("widget_peluang").select("*").eq("widget_id", editWidgetId)
      .order("rank", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (data && data.length > 0) {
          setRows(data.map((r) => ({
            _localId: r.id,
            rank: r.rank ?? 1,
            team_name: r.team_name ?? "",
            team_flag: r.team_flag ?? "",
            category: r.category ?? "FAVORIT UTAMA",
            win_pct: r.win_pct != null ? String(r.win_pct) : "",
            reasons_win: Array.isArray(r.reasons_win)
              ? r.reasons_win.join("\n")
              : (r.reasons_win ? JSON.parse(r.reasons_win).join("\n") : ""),
            reasons_lose: Array.isArray(r.reasons_lose)
              ? r.reasons_lose.join("\n")
              : (r.reasons_lose ? JSON.parse(r.reasons_lose).join("\n") : ""),
          })))
        }
        setLoading(false)
      })
  }, [editWidgetId])

  function updateRow(localId: string, patch: Partial<PeluangEntry>) {
    setRows((prev) => prev.map((r) => r._localId === localId ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.team_name.trim())
    if (!validRows.length) { setError("Tambahkan minimal satu tim."); return }
    setSaving(true); setError(null)
    try {
      const widgetId = editWidgetId || crypto.randomUUID()
      await supabase.from("widget_peluang").delete().eq("widget_id", widgetId)
      const payload = validRows.map((r, idx) => ({
        widget_id: widgetId,
        rank: r.rank || idx + 1,
        team_name: r.team_name,
        team_flag: r.team_flag || null,
        category: r.category,
        win_pct: r.win_pct ? Number(r.win_pct) : 0,
        reasons_win: JSON.stringify(r.reasons_win.split("\n").map((s) => s.trim()).filter(Boolean)),
        reasons_lose: JSON.stringify(r.reasons_lose.split("\n").map((s) => s.trim()).filter(Boolean)),
      }))
      const { error: insertErr } = await supabase.from("widget_peluang").insert(payload)
      if (insertErr) throw insertErr
      onInsert(`[peluang_data id="${widgetId}"]`, widgetId)
      if (!editWidgetId) setRows([makePeluang()])
      onResetEdit?.()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-[#39FF14]" /></div>

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
      <p className="text-[10px] text-zinc-500">Isi satu per satu per negara/klub. Alasan dipisah baris baru (Enter).</p>

      <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
        {rows.map((row, idx) => (
          <div key={row._localId} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <button onClick={() => setRows((p) => p.filter((r) => r._localId !== row._localId))}
              className="absolute right-2 top-2 text-zinc-600 transition hover:text-red-400"><X size={12} /></button>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded bg-[#39FF14]/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#39FF14]">#{idx + 1}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FField label="Nama Negara/Klub" value={row.team_name} onChange={(v) => updateRow(row._localId, { team_name: v })} placeholder="Spanyol" className="col-span-2" />
              <FField label="Flag Emoji" value={row.team_flag} onChange={(v) => updateRow(row._localId, { team_flag: v })} placeholder="🇪🇸" />
              <FField label="Rank" value={row.rank} onChange={(v) => updateRow(row._localId, { rank: Number(v) })} type="number" />
              <FSelect label="Kategori" value={row.category} onChange={(v) => updateRow(row._localId, { category: v })}
                options={CATEGORIES.map((c) => ({ label: c, value: c }))} />
              <FField label="% Peluang Juara (0-100)" value={row.win_pct} onChange={(v) => updateRow(row._localId, { win_pct: v })} type="number" placeholder="18.2" />
              <FTextarea label="✅ Alasan Bisa Juara (1 per baris)" value={row.reasons_win}
                onChange={(v) => updateRow(row._localId, { reasons_win: v })}
                placeholder={"Juara Euro 2024\nSkuad muda & berbakat\nTiki-taka modern"} className="col-span-2" />
              <FTextarea label="❌ Alasan Tidak Juara (1 per baris)" value={row.reasons_lose}
                onChange={(v) => updateRow(row._localId, { reasons_lose: v })}
                placeholder={"Tekanan sebagai favorit\nBelum ada striker dominan"} className="col-span-2" />
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setRows((p) => [...p, { ...makePeluang(), rank: p.length + 1 }])}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#39FF14]/30 py-2.5 text-xs text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={14} /> Tambah Negara/Klub
      </button>
      <div className="flex items-center justify-between gap-2 pt-1">
        {editWidgetId && onResetEdit && (
          <button onClick={onResetEdit} className="text-xs text-zinc-500 transition hover:text-white">Batal Edit</button>
        )}
        <button onClick={handleSave} disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-black transition hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {editWidgetId ? "Update & Sync" : "Simpan & Insert"}
        </button>
      </div>
    </div>
  )
}

// ── Main WidgetInserter ───────────────────────────────────────────────────────

export function WidgetInserter({
  onInsert,
  editWidgetId,
  editWidgetType,
  onResetEdit,
  initialWidgets,
}: WidgetInserterProps) {
  const [jadwalOpen,   setJadwalOpen]   = useState(false)
  const [klasemenOpen, setKlasemenOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [peluangOpen,  setPeluangOpen]  = useState(false)

  const [insertedWidgets, setInsertedWidgets] = useState<ActiveWidget[]>(initialWidgets ?? [])

  useEffect(() => {
    if (initialWidgets && initialWidgets.length > 0) {
      setInsertedWidgets((prev) => {
        const existingIds = new Set(prev.map((w) => w.widgetId))
        const newOnes = initialWidgets.filter((w) => !existingIds.has(w.widgetId))
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev
      })
    }
  }, [initialWidgets])

  useEffect(() => {
    setJadwalOpen(editWidgetType === "jadwal")
    setKlasemenOpen(editWidgetType === "klasemen")
    setTransferOpen(editWidgetType === "transfer")
    setPeluangOpen(editWidgetType === "peluang")
  }, [editWidgetType])

  const isEditing = !!editWidgetId

  function handleInsert(shortcode: string, widgetId: string, widgetType: WidgetType) {
    setInsertedWidgets((prev) => {
      const exists = prev.some((w) => w.widgetId === widgetId)
      return exists ? prev : [...prev, { widgetId, widgetType }]
    })
    onInsert(shortcode, widgetId, widgetType)
  }

  const widgetMeta: Record<WidgetType, { icon: string; label: string }> = {
    jadwal:   { icon: "📅", label: "Jadwal Pertandingan" },
    klasemen: { icon: "🏆", label: "Klasemen Grup" },
    transfer: { icon: "🔄", label: "Transfer Pemain" },
    peluang:  { icon: "⭐", label: "Peluang Juara" },
  }

  function SectionHeader({
    icon, label, open, onToggle, isActive,
  }: {
    icon: React.ReactNode; label: string; open: boolean; onToggle: () => void; isActive: boolean
  }) {
    return (
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-white">{label}</span>
          {isActive && (
            <span className="flex items-center gap-1 rounded-full bg-[#39FF14]/10 px-2 py-0.5 text-[10px] font-bold text-[#39FF14]">
              <Pencil size={9} /> Mode Edit
            </span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Panel: Widget di Artikel ── */}
      {insertedWidgets.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0d0d0d] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Widget di Artikel</p>
          <div className="space-y-1.5">
            {insertedWidgets.map((w) => {
              const meta = widgetMeta[w.widgetType]
              return (
                <div
                  key={w.widgetId}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                    editWidgetId === w.widgetId ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/8 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-white">{meta.label}</p>
                      <p className="font-mono text-[9px] text-zinc-600">{w.widgetId.slice(0, 8)}…</p>
                    </div>
                  </div>
                  {editWidgetId === w.widgetId ? (
                    <span className="flex items-center gap-1 rounded-full bg-[#39FF14]/10 px-2 py-0.5 text-[10px] font-bold text-[#39FF14]">
                      <Pencil size={9} /> Editing
                    </span>
                  ) : (
                    <button
                      onClick={() =>
                        window.dispatchEvent(new CustomEvent("widget-request-edit", {
                          detail: { widgetId: w.widgetId, widgetType: w.widgetType }
                        }))
                      }
                      className="flex items-center gap-1 rounded-md bg-[#39FF14]/10 px-2.5 py-1 text-[10px] font-bold text-[#39FF14] transition hover:bg-[#39FF14]/20"
                    >
                      <Pencil size={9} /> Edit
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Jadwal Section ── */}
      <div className={`overflow-hidden rounded-xl border transition-colors ${isEditing && editWidgetType === "jadwal" ? "border-[#39FF14]/40" : "border-white/10"} bg-[#0d0d0d]`}>
        <SectionHeader
          icon={<TableIcon size={15} className="text-[#39FF14]" />}
          label="Jadwal Pertandingan"
          open={jadwalOpen}
          onToggle={() => setJadwalOpen((o) => !o)}
          isActive={isEditing && editWidgetType === "jadwal"}
        />
        {jadwalOpen && (
          <div className="border-t border-white/10 p-4">
            <JadwalForm
              onInsert={(shortcode, widgetId) => handleInsert(shortcode, widgetId, "jadwal")}
              editWidgetId={isEditing && editWidgetType === "jadwal" ? editWidgetId : null}
              onResetEdit={onResetEdit}
            />
          </div>
        )}
      </div>

      {/* ── Klasemen Section ── */}
      <div className={`overflow-hidden rounded-xl border transition-colors ${isEditing && editWidgetType === "klasemen" ? "border-[#39FF14]/40" : "border-white/10"} bg-[#0d0d0d]`}>
        <SectionHeader
          icon={<Trophy size={15} className="text-[#39FF14]" />}
          label="Klasemen Grup"
          open={klasemenOpen}
          onToggle={() => setKlasemenOpen((o) => !o)}
          isActive={isEditing && editWidgetType === "klasemen"}
        />
        {klasemenOpen && (
          <div className="border-t border-white/10 p-4">
            <KlasemenForm
              onInsert={(shortcode, widgetId) => handleInsert(shortcode, widgetId, "klasemen")}
              editWidgetId={isEditing && editWidgetType === "klasemen" ? editWidgetId : null}
              onResetEdit={onResetEdit}
            />
          </div>
        )}
      </div>

      {/* ── Transfer Section ── */}
      <div className={`overflow-hidden rounded-xl border transition-colors ${isEditing && editWidgetType === "transfer" ? "border-[#39FF14]/40" : "border-white/10"} bg-[#0d0d0d]`}>
        <SectionHeader
          icon={<ArrowRightLeft size={15} className="text-[#39FF14]" />}
          label="Transfer Pemain"
          open={transferOpen}
          onToggle={() => setTransferOpen((o) => !o)}
          isActive={isEditing && editWidgetType === "transfer"}
        />
        {transferOpen && (
          <div className="border-t border-white/10 p-4">
            <TransferForm
              onInsert={(shortcode, widgetId) => handleInsert(shortcode, widgetId, "transfer")}
              editWidgetId={isEditing && editWidgetType === "transfer" ? editWidgetId : null}
              onResetEdit={onResetEdit}
            />
          </div>
        )}
      </div>

      {/* ── Peluang Juara Section ── */}
      <div className={`overflow-hidden rounded-xl border transition-colors ${isEditing && editWidgetType === "peluang" ? "border-[#39FF14]/40" : "border-white/10"} bg-[#0d0d0d]`}>
        <SectionHeader
          icon={<Star size={15} className="text-[#39FF14]" />}
          label="Peluang Juara"
          open={peluangOpen}
          onToggle={() => setPeluangOpen((o) => !o)}
          isActive={isEditing && editWidgetType === "peluang"}
        />
        {peluangOpen && (
          <div className="border-t border-white/10 p-4">
            <PeluangForm
              onInsert={(shortcode, widgetId) => handleInsert(shortcode, widgetId, "peluang")}
              editWidgetId={isEditing && editWidgetType === "peluang" ? editWidgetId : null}
              onResetEdit={onResetEdit}
            />
          </div>
        )}
      </div>

    </div>
  )
}
