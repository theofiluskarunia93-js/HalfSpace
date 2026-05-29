"use client"

/**
 * WidgetInserter.tsx
 *
 * Komponen sidebar untuk editor artikel.
 * Menggantikan MatchCardWidget dan GroupStandingsWidget lama.
 *
 * Alur kerja:
 * 1. Admin mengisi form widget (jadwal/klasemen)
 * 2. Klik "Insert ke Artikel" → data di-save ke Supabase → shortcode di-insert ke editor
 * 3. Shortcode format: [match_data id="<uuid>"] atau [klasemen_data id="<uuid>"]
 * 4. parseWidgetContent akan mendeteksi shortcode dan merender JadwalCard / KlasemenCard
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Plus, X, Save, Loader2, TableIcon, Trophy, ChevronDown, ChevronUp, Pencil,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

export type WidgetType = "jadwal" | "klasemen"

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

interface WidgetInserterProps {
  /** Dipanggil setelah data tersimpan ke Supabase, dengan shortcode yang perlu di-insert ke editor */
  onInsert: (shortcode: string, widgetId: string, widgetType: WidgetType) => void
  /** Jika diberikan, widget dalam mode Edit (pre-load data dari Supabase) */
  editWidgetId?: string | null
  editWidgetType?: WidgetType | null
  onResetEdit?: () => void
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeMatch(group = "A"): MatchEntry {
  return {
    _localId: crypto.randomUUID(),
    group_label: group,
    home_team: "",
    away_team: "",
    match_date: "",
    match_time: "",
    score_home: "",
    score_away: "",
    status: "scheduled",
    stadium: "",
  }
}

function makeStanding(group = "A", rank = 1): StandingEntry {
  return {
    _localId: crypto.randomUUID(),
    group_label: group,
    rank,
    team_name: "",
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    points: 0,
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

  // Load existing data when in edit mode
  useEffect(() => {
    if (!editWidgetId) {
      setRows([makeMatch()])
      return
    }
    setLoading(true)
    supabase
      .from("widget_jadwal")
      .select("*")
      .eq("widget_id", editWidgetId)
      .order("match_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (data && data.length > 0) {
          setRows(
            data.map((r) => ({
              _localId: r.id,
              group_label: r.group_label ?? "A",
              home_team: r.home_team ?? "",
              away_team: r.away_team ?? "",
              match_date: r.match_date ?? "",
              match_time: r.match_time ?? "",
              score_home: r.score_home != null ? String(r.score_home) : "",
              score_away: r.score_away != null ? String(r.score_away) : "",
              status: r.status ?? "scheduled",
              stadium: r.stadium ?? "",
            }))
          )
          setActiveGroup(data[0].group_label ?? "A")
        }
        setLoading(false)
      })
  }, [editWidgetId])

  const groups = [...new Set(rows.map((r) => r.group_label))].sort()

  function updateRow(localId: string, patch: Partial<MatchEntry>) {
    setRows((prev) => prev.map((r) => r._localId === localId ? { ...r, ...patch } : r))
  }

  function addRow() {
    const newRow = makeMatch(activeGroup)
    setRows((prev) => [...prev, newRow])
  }

  function removeRow(localId: string) {
    setRows((prev) => prev.filter((r) => r._localId !== localId))
  }

  function addGroup() {
    const nextChar = String.fromCharCode(65 + groups.length)
    const newGroup = nextChar
    setActiveGroup(newGroup)
    setRows((prev) => [...prev, makeMatch(newGroup)])
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.home_team.trim() || r.away_team.trim())
    if (!validRows.length) { setError("Tambahkan minimal satu pertandingan."); return }

    setSaving(true)
    setError(null)
    try {
      const widgetId = editWidgetId || crypto.randomUUID()

      // Delete lama, insert baru (bersih)
      await supabase.from("widget_jadwal").delete().eq("widget_id", widgetId)

      const payload = validRows.map((r) => ({
        widget_id: widgetId,
        group_label: r.group_label,
        home_team: r.home_team,
        away_team: r.away_team,
        match_date: r.match_date || null,
        match_time: r.match_time || null,
        score_home: r.score_home !== "" ? Number(r.score_home) : null,
        score_away: r.score_away !== "" ? Number(r.score_away) : null,
        status: r.status,
        stadium: r.stadium || null,
      }))

      const { error: insertErr } = await supabase.from("widget_jadwal").insert(payload)
      if (insertErr) throw insertErr

      const shortcode = `[match_data id="${widgetId}"]`
      onInsert(shortcode, widgetId)

      if (!editWidgetId) {
        setRows([makeMatch()])
        setActiveGroup("A")
      }
      onResetEdit?.()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-[#39FF14]" /></div>

  const activeRows = rows.filter((r) => r.group_label === activeGroup)

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      {/* Group tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all ${
              activeGroup === g
                ? "bg-[#39FF14] text-black"
                : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Grup {g}
          </button>
        ))}
        <button
          onClick={addGroup}
          className="flex items-center gap-1 rounded-md border border-dashed border-[#39FF14]/30 px-2 py-1 text-[11px] text-[#39FF14]/60 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]"
        >
          <Plus size={11} /> Grup
        </button>
      </div>

      {/* Match rows for active group */}
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {activeRows.map((row) => (
          <div key={row._localId} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <button
              onClick={() => removeRow(row._localId)}
              className="absolute right-2 top-2 text-zinc-600 transition hover:text-red-400"
            >
              <X size={12} />
            </button>
            <div className="grid grid-cols-2 gap-2">
              <FField label="Tim Kandang" value={row.home_team} onChange={(v) => updateRow(row._localId, { home_team: v })} placeholder="Tim A" />
              <FField label="Tim Tamu" value={row.away_team} onChange={(v) => updateRow(row._localId, { away_team: v })} placeholder="Tim B" />
              <FField label="Tanggal" value={row.match_date} onChange={(v) => updateRow(row._localId, { match_date: v })} type="date" />
              <FField label="Waktu" value={row.match_time} onChange={(v) => updateRow(row._localId, { match_time: v })} type="time" />
              <FField label="Stadion" value={row.stadium} onChange={(v) => updateRow(row._localId, { stadium: v })} placeholder="Nama Stadion" className="col-span-2" />
              <FSelect
                label="Status"
                value={row.status}
                onChange={(v) => updateRow(row._localId, { status: v as MatchEntry["status"] })}
                options={[
                  { label: "Akan Datang", value: "scheduled" },
                  { label: "Live", value: "live" },
                  { label: "Selesai", value: "finished" },
                ]}
              />
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

      <button
        onClick={addRow}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#39FF14]/30 py-2.5 text-xs text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]"
      >
        <Plus size={14} /> Tambah Pertandingan
      </button>

      <div className="flex items-center justify-between gap-2 pt-1">
        {editWidgetId && onResetEdit && (
          <button onClick={onResetEdit} className="text-xs text-zinc-500 transition hover:text-white">
            Batal Edit
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-black transition hover:opacity-90 disabled:opacity-50"
        >
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
    if (!editWidgetId) {
      setRows([makeStanding("A", 1)])
      return
    }
    setLoading(true)
    supabase
      .from("widget_klasemen")
      .select("*")
      .eq("widget_id", editWidgetId)
      .order("rank", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (data && data.length > 0) {
          setRows(
            data.map((r) => ({
              _localId: r.id,
              group_label: r.group_label ?? "A",
              rank: r.rank ?? 1,
              team_name: r.team_name ?? "",
              played: r.played ?? 0,
              won: r.won ?? 0,
              drawn: r.drawn ?? 0,
              lost: r.lost ?? 0,
              gf: r.gf ?? 0,
              ga: r.ga ?? 0,
              points: r.points ?? 0,
            }))
          )
          setActiveGroup(data[0].group_label ?? "A")
        }
        setLoading(false)
      })
  }, [editWidgetId])

  const groups = [...new Set(rows.map((r) => r.group_label))].sort()

  function updateRow(localId: string, patch: Partial<StandingEntry>) {
    setRows((prev) => prev.map((r) => r._localId === localId ? {
      ...r,
      ...Object.fromEntries(
        Object.entries(patch).map(([k, v]) =>
          typeof r[k as keyof StandingEntry] === "number" && k !== "_localId" && k !== "group_label" && k !== "team_name"
            ? [k, Number(v)]
            : [k, v]
        )
      ),
    } : r))
  }

  function addRow() {
    const activeGroupRows = rows.filter((r) => r.group_label === activeGroup)
    setRows((prev) => [...prev, makeStanding(activeGroup, activeGroupRows.length + 1)])
  }

  function removeRow(localId: string) {
    setRows((prev) => prev.filter((r) => r._localId !== localId))
  }

  function addGroup() {
    const nextChar = String.fromCharCode(65 + groups.length)
    setActiveGroup(nextChar)
    setRows((prev) => [...prev, makeStanding(nextChar, 1)])
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.team_name.trim())
    if (!validRows.length) { setError("Tambahkan minimal satu tim."); return }

    setSaving(true)
    setError(null)
    try {
      const widgetId = editWidgetId || crypto.randomUUID()

      await supabase.from("widget_klasemen").delete().eq("widget_id", widgetId)

      const payload = validRows.map((r, idx) => ({
        widget_id: widgetId,
        group_label: r.group_label,
        rank: r.rank || idx + 1,
        team_name: r.team_name,
        played: Number(r.played),
        won: Number(r.won),
        drawn: Number(r.drawn),
        lost: Number(r.lost),
        gf: Number(r.gf),
        ga: Number(r.ga),
        points: Number(r.points),
      }))

      const { error: insertErr } = await supabase.from("widget_klasemen").insert(payload)
      if (insertErr) throw insertErr

      const shortcode = `[klasemen_data id="${widgetId}"]`
      onInsert(shortcode, widgetId)

      if (!editWidgetId) {
        setRows([makeStanding("A", 1)])
        setActiveGroup("A")
      }
      onResetEdit?.()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-[#39FF14]" /></div>

  const activeRows = rows.filter((r) => r.group_label === activeGroup)

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      {/* Group tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-all ${
              activeGroup === g
                ? "bg-[#39FF14] text-black"
                : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            Grup {g}
          </button>
        ))}
        <button
          onClick={addGroup}
          className="flex items-center gap-1 rounded-md border border-dashed border-[#39FF14]/30 px-2 py-1 text-[11px] text-[#39FF14]/60 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]"
        >
          <Plus size={11} /> Grup
        </button>
      </div>

      {/* Standing rows */}
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {activeRows.map((row) => (
          <div key={row._localId} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <button
              onClick={() => removeRow(row._localId)}
              className="absolute right-2 top-2 text-zinc-600 transition hover:text-red-400"
            >
              <X size={12} />
            </button>
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

      <button
        onClick={addRow}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#39FF14]/30 py-2.5 text-xs text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]"
      >
        <Plus size={14} /> Tambah Tim
      </button>

      <div className="flex items-center justify-between gap-2 pt-1">
        {editWidgetId && onResetEdit && (
          <button onClick={onResetEdit} className="text-xs text-zinc-500 transition hover:text-white">
            Batal Edit
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {editWidgetId ? "Update & Sync" : "Simpan & Insert"}
        </button>
      </div>
    </div>
  )
}

// ── Main WidgetInserter ───────────────────────────────────────────────────────

export function WidgetInserter({ onInsert, editWidgetId, editWidgetType, onResetEdit }: WidgetInserterProps) {
  const [activeTab, setActiveTab] = useState<WidgetType>(editWidgetType ?? "jadwal")
  const [jadwalOpen, setJadwalOpen] = useState(true)
  const [klasemenOpen, setKlasemenOpen] = useState(false)

  // Sync activeTab when editWidgetType changes
  useEffect(() => {
    if (editWidgetType) setActiveTab(editWidgetType)
  }, [editWidgetType])

  const isEditing = !!editWidgetId

  return (
    <div className="space-y-3">
      {/* Jadwal Section */}
      <div className={`overflow-hidden rounded-xl border transition-colors ${isEditing && editWidgetType === "jadwal" ? "border-[#39FF14]/40" : "border-white/10"} bg-[#0d0d0d]`}>
        <button
          onClick={() => setJadwalOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <TableIcon size={15} className="text-[#39FF14]" />
            <span className="font-semibold text-white">Jadwal Pertandingan</span>
            {isEditing && editWidgetType === "jadwal" && (
              <span className="flex items-center gap-1 rounded-full bg-[#39FF14]/10 px-2 py-0.5 text-[10px] font-bold text-[#39FF14]">
                <Pencil size={9} /> Mode Edit
              </span>
            )}
          </div>
          {jadwalOpen ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
        </button>
        {jadwalOpen && (
          <div className="border-t border-white/10 p-4">
            <JadwalForm
              onInsert={(shortcode, widgetId) => onInsert(shortcode, widgetId, "jadwal")}
              editWidgetId={isEditing && editWidgetType === "jadwal" ? editWidgetId : null}
              onResetEdit={onResetEdit}
            />
          </div>
        )}
      </div>

      {/* Klasemen Section */}
      <div className={`overflow-hidden rounded-xl border transition-colors ${isEditing && editWidgetType === "klasemen" ? "border-[#39FF14]/40" : "border-white/10"} bg-[#0d0d0d]`}>
        <button
          onClick={() => setKlasemenOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-[#39FF14]" />
            <span className="font-semibold text-white">Klasemen Grup</span>
            {isEditing && editWidgetType === "klasemen" && (
              <span className="flex items-center gap-1 rounded-full bg-[#39FF14]/10 px-2 py-0.5 text-[10px] font-bold text-[#39FF14]">
                <Pencil size={9} /> Mode Edit
              </span>
            )}
          </div>
          {klasemenOpen ? <ChevronUp size={14} className="text-zinc-400" /> : <ChevronDown size={14} className="text-zinc-400" />}
        </button>
        {klasemenOpen && (
          <div className="border-t border-white/10 p-4">
            <KlasemenForm
              onInsert={(shortcode, widgetId) => onInsert(shortcode, widgetId, "klasemen")}
              editWidgetId={isEditing && editWidgetType === "klasemen" ? editWidgetId : null}
              onResetEdit={onResetEdit}
            />
          </div>
        )}
      </div>
    </div>
  )
}
