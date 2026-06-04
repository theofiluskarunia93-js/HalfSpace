"use client"

/**
 * WidgetEditModal.tsx
 *
 * Modal yang muncul saat admin mengklik tombol "Edit Widget" pada
 * JadwalCard / KlasemenCard di halaman artikel (posts/edit).
 *
 * Menggunakan komponen editor inline untuk mengubah data di Supabase
 * berdasarkan widget_id dari shortcode yang sudah tersimpan.
 * Setelah disimpan, card di halaman akan di-refresh otomatis.
 */

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { X, Plus, Trash2, Save, Loader2 } from "lucide-react"
import type { MatchRow, StandingRow } from "./WidgetCards"

// ── Types for new widgets (mirrored from WidgetInserter) ──────────────────────
type MatchStatus2 = "upcoming" | "live" | "finished"
type EventType2 = "goal" | "yellow_card" | "red_card" | "substitution" | "var" | "penalty"
interface TimelineEvent2 { minute: string; type: EventType2; player: string; team: "home" | "away"; score_after: string }
interface H2HMatch2 { date: string; home_team: string; away_team: string; home_score: number; away_score: number }
interface StatItem2 { label: string; home_value: string; away_value: string; home_pct: number }
type FormResult2 = { result: "W" | "D" | "L" }
import type { WidgetType } from "./useWidgetModal"

// ── Types ─────────────────────────────────────────────────────────────────────
// EditableMatchRow: score_home/away bisa string (dari input user) atau number|null (dari DB)
type EditableMatchRow = Omit<MatchRow, "score_home" | "score_away"> & {
  score_home: string | number | null
  score_away: string | number | null
  _isNew?: boolean
}

interface WidgetEditModalProps {
  widgetId: string | null
  widgetType: WidgetType | null
  onClose: () => void
  onSaved?: () => void
}

// ── Input/Select helpers ──────────────────────────────────────────────────────

function Input({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-[#39FF14]/50 focus:ring-1 focus:ring-[#39FF14]/20"
      />
    </div>
  )
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white outline-none transition focus:border-[#39FF14]/50"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Jadwal Editor ─────────────────────────────────────────────────────────────

function JadwalEditor({
  widgetId, onClose, onSaved,
}: {
  widgetId: string; onClose: () => void; onSaved?: () => void
}) {
  const [rows, setRows] = useState<EditableMatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from("widget_jadwal")
      .select("*")
      .eq("widget_id", widgetId)
      .order("match_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows(data ?? [])
        setLoading(false)
      })
  }, [widgetId])

  function updateRow(index: number, field: keyof EditableMatchRow, value: string) {
    setRows((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        widget_id: widgetId,
        group_label: prev[0]?.group_label ?? "A",
        home_team: "",
        away_team: "",
        match_date: "",
        match_time: "",
        score_home: null,
        score_away: null,
        stadium: "",
        status: "scheduled",
        _isNew: true,
      } as any,
    ])
  }

  async function deleteRow(index: number) {
    const row = rows[index] as any
    if (!row._isNew) {
      await supabase.from("widget_jadwal").delete().eq("id", row.id)
    }
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const row of rows) {
        const payload = {
          widget_id: widgetId,
          group_label: row.group_label,
          home_team: row.home_team,
          away_team: row.away_team,
          match_date: row.match_date || null,
          match_time: row.match_time || null,
          score_home: row.score_home != null && String(row.score_home) !== "" ? Number(row.score_home) : null,
          score_away: row.score_away != null && String(row.score_away) !== "" ? Number(row.score_away) : null,
          status: (row as any).status ?? "scheduled",
          stadium: (row as any).stadium || null,
        }
        const { error } = await supabase
          .from("widget_jadwal")
          .upsert({ id: row.id, ...payload }, { onConflict: "id" })
        if (error) throw error
      }
      onSaved?.()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-[#39FF14]" size={24} />
    </div>
  )

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
      )}

      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <button
            onClick={() => deleteRow(i)}
            className="absolute right-3 top-3 text-zinc-600 transition-colors hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input label="Grup" value={row.group_label} onChange={(v) => updateRow(i, "group_label", v)} placeholder="A" />
            <Input label="Tim Kandang" value={row.home_team} onChange={(v) => updateRow(i, "home_team", v)} placeholder="Tim A" />
            <Input label="Tim Tamu" value={row.away_team} onChange={(v) => updateRow(i, "away_team", v)} placeholder="Tim B" />
            <Input label="Tanggal" value={row.match_date ?? ""} onChange={(v) => updateRow(i, "match_date", v)} type="date" />
            <Input label="Waktu" value={row.match_time ?? ""} onChange={(v) => updateRow(i, "match_time", v)} type="time" />
            <Input label="Stadion" value={(row as any).stadium ?? ""} onChange={(v) => updateRow(i, "stadium" as any, v)} placeholder="Nama Stadion" />
            <Select
              label="Status"
              value={(row as any).status ?? "scheduled"}
              onChange={(v) => updateRow(i, "status" as any, v)}
              options={[
                { label: "Akan Datang", value: "scheduled" },
                { label: "Live", value: "live" },
                { label: "Selesai", value: "finished" },
              ]}
            />
            {((row as any).status === "live" || (row as any).status === "finished") && (
              <>
                <Input label="Skor Kandang" value={row.score_home ?? ""} onChange={(v) => updateRow(i, "score_home" as any, v)} type="number" />
                <Input label="Skor Tamu" value={row.score_away ?? ""} onChange={(v) => updateRow(i, "score_away" as any, v)} type="number" />
              </>
            )}
          </div>
        </div>
      ))}

      <button
        onClick={addRow}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#39FF14]/30 py-3 text-sm text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]"
      >
        <Plus size={16} /> Tambah Pertandingan
      </button>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 transition hover:text-white">
          Batal
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Simpan
        </button>
      </div>
    </div>
  )
}

// ── Klasemen Editor ───────────────────────────────────────────────────────────

function KlasemenEditor({
  widgetId, onClose, onSaved,
}: {
  widgetId: string; onClose: () => void; onSaved?: () => void
}) {
  const [rows, setRows] = useState<(StandingRow & { _isNew?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from("widget_klasemen")
      .select("*")
      .eq("widget_id", widgetId)
      .order("rank", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows(data ?? [])
        setLoading(false)
      })
  }, [widgetId])

  function updateRow(index: number, field: keyof StandingRow, value: string) {
    setRows((prev) => {
      const copy = [...prev]
      copy[index] = {
        ...copy[index],
        [field]: field === "team_name" || field === "group_label" ? value : Number(value),
      }
      return copy
    })
  }

  function addRow() {
    const lastRank = rows.length > 0 ? rows[rows.length - 1].rank + 1 : 1
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        widget_id: widgetId,
        rank: lastRank,
        group_label: prev[0]?.group_label ?? "A",
        team_name: "",
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
        _isNew: true,
      } as any,
    ])
  }

  async function deleteRow(index: number) {
    const row = rows[index] as any
    if (!row._isNew) {
      await supabase.from("widget_klasemen").delete().eq("id", row.id)
    }
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const row of rows) {
        const payload = {
          widget_id: widgetId,
          rank: Number(row.rank),
          group_label: row.group_label,
          team_name: row.team_name,
          played: Number(row.played),
          won: Number(row.won),
          drawn: Number(row.drawn),
          lost: Number(row.lost),
          gf: Number(row.gf),
          ga: Number(row.ga),
          points: Number(row.points),
        }
        const { error } = await supabase
          .from("widget_klasemen")
          .upsert({ id: row.id, ...payload }, { onConflict: "id" })
        if (error) throw error
      }
      onSaved?.()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-[#39FF14]" size={24} />
    </div>
  )

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
      )}

      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <button
            onClick={() => deleteRow(i)}
            className="absolute right-3 top-3 text-zinc-600 transition-colors hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <Input label="Grup" value={row.group_label} onChange={(v) => updateRow(i, "group_label", v)} placeholder="A" />
            <div className="col-span-2 sm:col-span-2">
              <Input label="Nama Tim" value={row.team_name} onChange={(v) => updateRow(i, "team_name", v)} placeholder="Nama Tim" />
            </div>
            <Input label="Rank" value={row.rank} onChange={(v) => updateRow(i, "rank", v)} type="number" />
            <Input label="Main" value={row.played} onChange={(v) => updateRow(i, "played", v)} type="number" />
            <Input label="Menang" value={row.won} onChange={(v) => updateRow(i, "won", v)} type="number" />
            <Input label="Seri" value={row.drawn} onChange={(v) => updateRow(i, "drawn", v)} type="number" />
            <Input label="Kalah" value={row.lost} onChange={(v) => updateRow(i, "lost", v)} type="number" />
            <Input label="GF" value={row.gf} onChange={(v) => updateRow(i, "gf", v)} type="number" />
            <Input label="GA" value={row.ga} onChange={(v) => updateRow(i, "ga", v)} type="number" />
            <Input label="Poin" value={row.points} onChange={(v) => updateRow(i, "points", v)} type="number" />
          </div>
        </div>
      ))}

      <button
        onClick={addRow}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#39FF14]/30 py-3 text-sm text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]"
      >
        <Plus size={16} /> Tambah Tim
      </button>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 transition hover:text-white">
          Batal
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Simpan
        </button>
      </div>
    </div>
  )
}

// ── Transfer Editor ──────────────────────────────────────────────────────────

function TransferEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from("widget_transfer").select("*").eq("widget_id", widgetId).order("transfer_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows(data ?? [])
        setLoading(false)
      })
  }, [widgetId])

  function updateRow(i: number, field: string, value: any) {
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c })
  }
  function addRow() {
    setRows(prev => [...prev, { id: crypto.randomUUID(), widget_id: widgetId, league_label: "", player_name: "", player_initials: "", position: "", age: null, from_club: "", from_club_color: "#888", to_club: "", league_dest: "", transfer_value: null, is_free: false, status: "confirmed", transfer_date: null, _isNew: true }])
  }
  async function deleteRow(i: number) {
    const row = rows[i]
    if (!row._isNew) await supabase.from("widget_transfer").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      for (const row of rows) {
        const { error } = await supabase.from("widget_transfer").upsert({
          id: row.id, widget_id: widgetId, league_label: row.league_label,
          player_name: row.player_name, player_initials: row.player_initials || row.player_name.slice(0, 2).toUpperCase(),
          position: row.position, age: row.age ? Number(row.age) : null,
          from_club: row.from_club, from_club_color: row.from_club_color,
          to_club: row.to_club, league_dest: row.league_dest,
          transfer_value: row.transfer_value !== "" && row.transfer_value != null ? Number(row.transfer_value) : null,
          is_free: row.is_free, status: row.status,
          transfer_date: row.transfer_date || null,
        }, { onConflict: "id" })
        if (error) throw error
      }
      onSaved?.(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <button onClick={() => deleteRow(i)} className="absolute right-3 top-3 text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Liga" value={row.league_label ?? ""} onChange={v => updateRow(i, "league_label", v)} placeholder="Premier League" />
            <Input label="Liga Tujuan" value={row.league_dest ?? ""} onChange={v => updateRow(i, "league_dest", v)} placeholder="La Liga" />
            <Input label="Nama Pemain" value={row.player_name ?? ""} onChange={v => updateRow(i, "player_name", v)} placeholder="Nama Pemain" />
            <Input label="Inisial" value={row.player_initials ?? ""} onChange={v => updateRow(i, "player_initials", v)} placeholder="NP" />
            <Input label="Posisi" value={row.position ?? ""} onChange={v => updateRow(i, "position", v)} placeholder="ST" />
            <Input label="Umur" value={row.age ?? ""} onChange={v => updateRow(i, "age", v)} type="number" placeholder="25" />
            <Input label="Dari Klub" value={row.from_club ?? ""} onChange={v => updateRow(i, "from_club", v)} placeholder="Man City" />
            <Input label="Ke Klub" value={row.to_club ?? ""} onChange={v => updateRow(i, "to_club", v)} placeholder="Real Madrid" />
            <Input label="Nilai Transfer (M€)" value={row.transfer_value ?? ""} onChange={v => updateRow(i, "transfer_value", v)} type="number" placeholder="80" />
            <Input label="Tanggal" value={row.transfer_date ?? ""} onChange={v => updateRow(i, "transfer_date", v)} type="date" />
            <Select label="Status" value={row.status ?? "confirmed"} onChange={v => updateRow(i, "status", v)}
              options={[{ label: "Confirmed", value: "confirmed" }, { label: "Official", value: "official" }, { label: "Medical", value: "medical" }, { label: "Rumor", value: "rumor" }]} />
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={row.is_free ?? false} onChange={e => updateRow(i, "is_free", e.target.checked)} id={`free-${i}`} />
              <label htmlFor={`free-${i}`} className="text-xs text-zinc-400">Free Transfer</label>
            </div>
          </div>
        </div>
      ))}
      <button onClick={addRow} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#39FF14]/30 py-3 text-sm text-[#39FF14]/70 hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={16} /> Tambah Transfer
      </button>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 hover:text-white">Batal</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
      </div>
    </div>
  )
}

// ── Peluang Editor ────────────────────────────────────────────────────────────

function PeluangEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from("widget_peluang").select("*").eq("widget_id", widgetId).order("rank", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows((data ?? []).map(r => ({
          ...r,
          reasons_win: Array.isArray(r.reasons_win) ? r.reasons_win : (r.reasons_win ? JSON.parse(r.reasons_win) : [""]),
          reasons_lose: Array.isArray(r.reasons_lose) ? r.reasons_lose : (r.reasons_lose ? JSON.parse(r.reasons_lose) : [""]),
        })))
        setLoading(false)
      })
  }, [widgetId])

  function updateRow(i: number, field: string, value: any) {
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c })
  }
  function addRow() {
    setRows(prev => [...prev, { id: crypto.randomUUID(), widget_id: widgetId, rank: prev.length + 1, team_name: "", team_flag: "🏳️", category: "FAVORIT UTAMA", win_pct: 50, reasons_win: [""], reasons_lose: [""], _isNew: true }])
  }
  async function deleteRow(i: number) {
    const row = rows[i]
    if (!row._isNew) await supabase.from("widget_peluang").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      for (const row of rows) {
        const { error } = await supabase.from("widget_peluang").upsert({
          id: row.id, widget_id: widgetId, rank: Number(row.rank),
          team_name: row.team_name, team_flag: row.team_flag, category: row.category,
          win_pct: Number(row.win_pct),
          reasons_win: row.reasons_win.filter((r: string) => r.trim()),
          reasons_lose: row.reasons_lose.filter((r: string) => r.trim()),
        }, { onConflict: "id" })
        if (error) throw error
      }
      onSaved?.(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <button onClick={() => deleteRow(i)} className="absolute right-3 top-3 text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Rank" value={row.rank ?? 1} onChange={v => updateRow(i, "rank", v)} type="number" />
            <Input label="Flag (emoji)" value={row.team_flag ?? ""} onChange={v => updateRow(i, "team_flag", v)} placeholder="🇧🇷" />
            <div className="col-span-2"><Input label="Nama Tim" value={row.team_name ?? ""} onChange={v => updateRow(i, "team_name", v)} placeholder="Brasil" /></div>
            <Select label="Kategori" value={row.category ?? "FAVORIT UTAMA"} onChange={v => updateRow(i, "category", v)}
              options={[{ label: "Favorit Utama", value: "FAVORIT UTAMA" }, { label: "Kandidat Kuat", value: "KANDIDAT KUAT" }, { label: "Dark Horse", value: "DARK HORSE" }, { label: "Pelengkap", value: "PELENGKAP" }]} />
            <Input label="Peluang Juara (%)" value={row.win_pct ?? 50} onChange={v => updateRow(i, "win_pct", v)} type="number" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Alasan Bisa Juara</p>
            {row.reasons_win.map((r: string, ri: number) => (
              <div key={ri} className="flex gap-1">
                <input value={r} onChange={e => { const arr = [...row.reasons_win]; arr[ri] = e.target.value; updateRow(i, "reasons_win", arr) }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/40" placeholder="Alasan..." />
                <button onClick={() => { const arr = row.reasons_win.filter((_: any, idx: number) => idx !== ri); updateRow(i, "reasons_win", arr.length ? arr : [""]) }} className="text-zinc-600 hover:text-red-400 px-1 text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => updateRow(i, "reasons_win", [...row.reasons_win, ""])} className="text-[10px] text-[#39FF14]/60 hover:text-[#39FF14]">+ Tambah</button>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Alasan Tidak Juara</p>
            {row.reasons_lose.map((r: string, ri: number) => (
              <div key={ri} className="flex gap-1">
                <input value={r} onChange={e => { const arr = [...row.reasons_lose]; arr[ri] = e.target.value; updateRow(i, "reasons_lose", arr) }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/40" placeholder="Alasan..." />
                <button onClick={() => { const arr = row.reasons_lose.filter((_: any, idx: number) => idx !== ri); updateRow(i, "reasons_lose", arr.length ? arr : [""]) }} className="text-zinc-600 hover:text-red-400 px-1 text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => updateRow(i, "reasons_lose", [...row.reasons_lose, ""])} className="text-[10px] text-[#39FF14]/60 hover:text-[#39FF14]">+ Tambah</button>
          </div>
        </div>
      ))}
      <button onClick={addRow} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#39FF14]/30 py-3 text-sm text-[#39FF14]/70 hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={16} /> Tambah Tim
      </button>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 hover:text-white">Batal</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
      </div>
    </div>
  )
}

// ── Analisa Taktis Editor ──────────────────────────────────────────────────────

function AnalisaTaktisEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState({ team_name: "", coach_name: "", formation: "4-3-3", play_style: "", main_weapons: [""] })

  useEffect(() => {
    supabase.from("widget_analisa_taktis").select("*").eq("widget_id", widgetId).limit(1)
      .then(({ data: rows, error }) => {
        if (error) setError(error.message)
        else if (rows && rows.length > 0) {
          const r = rows[0]
          setData({ ...r, main_weapons: Array.isArray(r.main_weapons) ? r.main_weapons : (r.main_weapons ? JSON.parse(r.main_weapons) : [""]) } as any)
        }
        setLoading(false)
      })
  }, [widgetId])

  async function save() {
    setSaving(true); setError(null)
    try {
      const { error } = await supabase.from("widget_analisa_taktis").upsert({
        id: widgetId, widget_id: widgetId, team_name: data.team_name,
        coach_name: data.coach_name, formation: data.formation,
        play_style: data.play_style,
        main_weapons: data.main_weapons.filter(w => w.trim()),
      }, { onConflict: "id" })
      if (error) throw error
      onSaved?.(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Input label="Nama Tim" value={data.team_name} onChange={v => setData(p => ({ ...p, team_name: v }))} placeholder="Brasil" /></div>
        <Input label="Pelatih" value={data.coach_name} onChange={v => setData(p => ({ ...p, coach_name: v }))} placeholder="Ancelotti" />
        <Input label="Formasi" value={data.formation} onChange={v => setData(p => ({ ...p, formation: v }))} placeholder="4-3-3" />
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Gaya Bermain</label>
          <textarea value={data.play_style} onChange={e => setData(p => ({ ...p, play_style: e.target.value }))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50 resize-none" rows={3} placeholder="Deskripsi gaya bermain..." />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Senjata Utama</p>
        {data.main_weapons.map((w, wi) => (
          <div key={wi} className="flex gap-1">
            <input value={w} onChange={e => { const arr = [...data.main_weapons]; arr[wi] = e.target.value; setData(p => ({ ...p, main_weapons: arr })) }}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50" placeholder="Senjata utama..." />
            <button onClick={() => { const arr = data.main_weapons.filter((_, idx) => idx !== wi); setData(p => ({ ...p, main_weapons: arr.length ? arr : [""] })) }} className="text-zinc-600 hover:text-red-400 px-2 text-xs"><Trash2 size={14} /></button>
          </div>
        ))}
        <button onClick={() => setData(p => ({ ...p, main_weapons: [...p.main_weapons, ""] }))} className="flex items-center gap-1.5 text-xs text-[#39FF14]/60 hover:text-[#39FF14]"><Plus size={12} /> Tambah Senjata</button>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 hover:text-white">Batal</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
      </div>
    </div>
  )
}

// ── Perbandingan Tim Editor ───────────────────────────────────────────────────

function defaultFormResults2(): FormResult2[] {
  return [{ result: "W" }, { result: "W" }, { result: "D" }, { result: "W" }, { result: "L" }]
}

function PerbandinganTimEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState({
    home_team: "", away_team: "", competition: "FRIENDLY",
    home_rank: "#1", away_rank: "#2",
    home_value: "€500M", away_value: "€500M",
    home_form: defaultFormResults2(),
    away_form: defaultFormResults2(),
    home_coach: "", away_coach: "",
    total_matches: 0, home_wins: 0, draws: 0, away_wins: 0,
    h2h_matches: [] as H2HMatch2[],
    stats: [] as StatItem2[],
  })

  useEffect(() => {
    supabase.from("widget_perbandingan_tim").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row, error }) => {
        if (error) setError(error.message)
        else if (row) setData(row as any)
        setLoading(false)
      })
  }, [widgetId])

  async function save() {
    setSaving(true); setError(null)
    try {
      const { error } = await supabase.from("widget_perbandingan_tim").upsert({ id: widgetId, ...data })
      if (error) throw error
      onSaved?.(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const F = (label: string, key: keyof typeof data, type = "text") => (
    <div key={key}>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <input type={type} value={String((data as any)[key])}
        onChange={e => setData(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50" />
    </div>
  )

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        {F("Tim Tuan Rumah", "home_team")}
        {F("Tim Tamu", "away_team")}
        {F("Kompetisi (badge)", "competition")}
        {F("Ranking FIFA (Home)", "home_rank")}
        {F("Ranking FIFA (Away)", "away_rank")}
        {F("Nilai Skuad (Home)", "home_value")}
        {F("Nilai Skuad (Away)", "away_value")}
        {F("Pelatih (Home)", "home_coach")}
        {F("Pelatih (Away)", "away_coach")}
        {F("Total Laga H2H", "total_matches", "number")}
        {F("Menang Home", "home_wins", "number")}
        {F("Seri", "draws", "number")}
        {F("Menang Away", "away_wins", "number")}
      </div>
      <p className="text-xs text-zinc-500">Form 5 laga, H2H detail, dan statistik dapat diisi via Supabase Table Editor.</p>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 hover:text-white">Batal</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
      </div>
    </div>
  )
}

// ── Timeline Pertandingan Editor ──────────────────────────────────────────────

function TimelinePertandinganEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState({
    home_team: "", away_team: "",
    home_flag: "🏳️", away_flag: "🏳️",
    home_abbr: "HOM", away_abbr: "AWY",
    home_score: 0, away_score: 0,
    status: "upcoming" as MatchStatus2,
    live_minute: "", competition: "", match_info: "",
    events: [] as TimelineEvent2[],
  })
  const [newEvent, setNewEvent] = useState<TimelineEvent2>({ minute: "", type: "goal", player: "", team: "home", score_after: "" })

  useEffect(() => {
    supabase.from("widget_timeline_pertandingan").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row, error }) => {
        if (error) setError(error.message)
        else if (row) setData(row as any)
        setLoading(false)
      })
  }, [widgetId])

  function addEvent() {
    if (!newEvent.minute || !newEvent.player) return
    setData(p => ({ ...p, events: [newEvent, ...p.events] }))
    setNewEvent({ minute: "", type: "goal", player: "", team: "home", score_after: "" })
  }
  function removeEvent(i: number) { setData(p => ({ ...p, events: p.events.filter((_, j) => j !== i) })) }

  async function save() {
    setSaving(true); setError(null)
    try {
      const { error } = await supabase.from("widget_timeline_pertandingan").upsert({ id: widgetId, ...data })
      if (error) throw error
      onSaved?.(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const F = (label: string, key: keyof typeof data, type = "text") => (
    <div key={key}>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <input type={type} value={String((data as any)[key])}
        onChange={e => setData(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50" />
    </div>
  )

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        {F("Tim Tuan Rumah", "home_team")}
        {F("Tim Tamu", "away_team")}
        {F("Bendera Home (emoji)", "home_flag")}
        {F("Bendera Away (emoji)", "away_flag")}
        {F("Singkatan Home", "home_abbr")}
        {F("Singkatan Away", "away_abbr")}
        {F("Skor Home", "home_score", "number")}
        {F("Skor Away", "away_score", "number")}
        {F("Info Pertandingan", "match_info")}
        {F("Kompetisi", "competition")}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</label>
        <select value={data.status} onChange={e => setData(p => ({ ...p, status: e.target.value as MatchStatus2 }))}
          className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50">
          <option value="upcoming">Upcoming</option>
          <option value="live">Live</option>
          <option value="finished">Finished</option>
        </select>
      </div>
      {data.status === "live" && F("Menit Live (contoh: 67')", "live_minute")}

      {/* Add event */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-xs font-semibold text-white">Tambah Event</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Menit" value={newEvent.minute} onChange={v => setNewEvent(p => ({ ...p, minute: v }))} placeholder="45'" />
          <Select label="Tipe" value={newEvent.type} onChange={v => setNewEvent(p => ({ ...p, type: v as EventType2 }))}
            options={[{ label: "Gol ⚽", value: "goal" }, { label: "Kartu Kuning 🟨", value: "yellow_card" }, { label: "Kartu Merah 🟥", value: "red_card" }, { label: "Substitusi 🔄", value: "substitution" }, { label: "Penalti ⚽", value: "penalty" }, { label: "VAR 📺", value: "var" }]} />
          <div className="col-span-2"><Input label="Pemain" value={newEvent.player} onChange={v => setNewEvent(p => ({ ...p, player: v }))} placeholder="Nama Pemain" /></div>
          <Select label="Tim" value={newEvent.team} onChange={v => setNewEvent(p => ({ ...p, team: v as "home" | "away" }))}
            options={[{ label: "Tuan Rumah", value: "home" }, { label: "Tamu", value: "away" }]} />
          <Input label="Skor Setelah" value={newEvent.score_after} onChange={v => setNewEvent(p => ({ ...p, score_after: v }))} placeholder="1–0" />
        </div>
        <button onClick={addEvent} className="w-full rounded-lg border border-[#39FF14]/30 py-2 text-xs text-[#39FF14]/70 hover:border-[#39FF14]/60 hover:text-[#39FF14]">
          <Plus size={12} className="inline mr-1" /> Tambah Event
        </button>
      </div>

      {data.events.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-white">Events ({data.events.length})</p>
          {data.events.map((ev, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-xs text-zinc-500 w-10">{ev.minute}</span>
              <span className="text-xs font-medium text-white flex-1 truncate">{ev.player}</span>
              <span className="text-xs text-zinc-500">{ev.score_after}</span>
              <button onClick={() => removeEvent(i)} className="text-zinc-600 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 hover:text-white">Batal</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
      </div>
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function WidgetEditModal({ widgetId, widgetType, onClose, onSaved }: WidgetEditModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!widgetId || !widgetType) return null

  const titleMap: Record<string, string> = {
    jadwal:                  "Edit Jadwal Pertandingan",
    klasemen:                "Edit Klasemen Grup",
    transfer:                "Edit Transfer Pemain",
    peluang:                 "Edit Peluang Juara",
    analisa_taktis:          "Edit Analisa Taktis",
    perbandingan_tim:        "Edit Perbandingan Tim",
    timeline_pertandingan:   "Edit Timeline Pertandingan",
  }
  const title = titleMap[widgetType] ?? "Edit Widget"

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d0d0d] px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#39FF14]/60">
              Widget ID: {widgetId}
            </p>
            <h2 className="text-lg font-bold text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {widgetType === "jadwal" ? (
            <JadwalEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "klasemen" ? (
            <KlasemenEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "transfer" ? (
            <TransferEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "peluang" ? (
            <PeluangEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "analisa_taktis" ? (
            <AnalisaTaktisEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "perbandingan_tim" ? (
            <PerbandinganTimEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "timeline_pertandingan" ? (
            <TimelinePertandinganEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-400">Gunakan panel <span className="font-bold text-[#39FF14]">Widget Inserter</span> di editor untuk mengedit widget ini.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
