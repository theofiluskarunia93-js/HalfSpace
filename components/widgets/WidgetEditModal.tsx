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
import { X, Plus, Trash2, Save, Loader2, Zap } from "lucide-react"
import type { MatchRow, StandingRow } from "./WidgetCards"

// ── Types for new widgets (mirrored from WidgetInserter) ──────────────────────
type MatchStatus2 = "upcoming" | "live" | "finished"
type EventType2 = "goal" | "yellow_card" | "red_card" | "substitution" | "var" | "penalty"
interface TimelineEvent2 {
  minute: string
  type: EventType2
  team: "home" | "away"
  score_after: string
  player_name: string
  player_number?: string
  player_position?: string
  player_photo?: string
  assist_name?: string
  sub_in_name?: string
  sub_in_number?: string
  sub_in_position?: string
  sub_in_photo?: string
  sub_out_name?: string
  sub_out_number?: string
  sub_out_position?: string
  sub_out_photo?: string
}
const EMPTY_TIMELINE_EVENT_2: TimelineEvent2 = {
  minute: "", type: "goal", team: "home", score_after: "",
  player_name: "", player_number: "", player_position: "", player_photo: "",
  assist_name: "",
  sub_in_name: "", sub_in_number: "", sub_in_position: "", sub_in_photo: "",
  sub_out_name: "", sub_out_number: "", sub_out_position: "", sub_out_photo: "",
}
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

// ── Bzzoiro Autofill ──────────────────────────────────────────────────────────

function useBzzAutofill(widgetType: string) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function autofill(onData: (data: any) => void) {
    if (!query.trim()) { setError("Masukkan nama tim, pemain, atau stadion."); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/widget-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget_type: widgetType, query: query.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? "Gagal mengambil data.")
      onData(json.data)
    } catch (e: any) {
      setError(e.message ?? "Bzzoiro tidak merespons.")
    } finally {
      setLoading(false)
    }
  }

  return { query, setQuery, loading, error, autofill }
}

function BzzBar({
  placeholder, loading, error, query, setQuery, onFill,
}: {
  placeholder: string
  loading: boolean
  error: string | null
  query: string
  setQuery: (v: string) => void
  onFill: () => void
}) {
  return (
    <div className="rounded-xl border border-[#39FF14]/20 bg-[#39FF14]/5 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#39FF14]/70">
        Isi Otomatis dari Bzzoiro
      </p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onFill()}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50 placeholder:text-zinc-600"
        />
        <button
          onClick={onFill}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-[#39FF14] px-4 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          Isi
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
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
  const bzz = useBzzAutofill("jadwal")

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
      <BzzBar
        placeholder="Contoh: Inggris vs Prancis"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any[]) => {
          setRows(d.map(m => ({ ...m, id: crypto.randomUUID(), widget_id: widgetId, _isNew: true })))
        })}
      />
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
// Tampilan diKELOMPOKKAN PER GRUP (Grup A peringkat 1-4, lalu Grup B 1-4, dst)
// alih-alih diurutkan hanya berdasarkan rank global (yang sebelumnya membuat
// urutannya jadi A1, B1, C1... A2, B2...). Pengelompokan ini HANYA soal
// tampilan/urutan render di editor — skema data & cara simpan ke Supabase
// tidak berubah sama sekali.

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
  const bzz = useBzzAutofill("klasemen")

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

  // Tambah tim baru langsung di grup yang sedang diedit — rank otomatis
  // lanjut dari rank tertinggi yang sudah ada di grup tersebut.
  function addRowToGroup(groupLabel: string) {
    setRows((prev) => {
      const rowsInGroup = prev.filter((r) => r.group_label === groupLabel)
      const lastRank = rowsInGroup.length > 0
        ? Math.max(...rowsInGroup.map((r) => Number(r.rank) || 0)) + 1
        : 1
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          widget_id: widgetId,
          rank: lastRank,
          group_label: groupLabel,
          team_name: "",
          played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
          _isNew: true,
        } as any,
      ]
    })
  }

  // Tambah grup baru — buat huruf grup berikutnya yang belum dipakai (A, B, C, ...)
  // dengan satu baris tim kosong di rank 1.
  function addNewGroup() {
    setRows((prev) => {
      const existingGroups = new Set(prev.map((r) => (r.group_label || "").toUpperCase()))
      const alphabet = "ABCDEFGHIJKL"
      const nextLetter = alphabet.split("").find((l) => !existingGroups.has(l)) ?? "A"
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          widget_id: widgetId,
          rank: 1,
          group_label: nextLetter,
          team_name: "",
          played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
          _isNew: true,
        } as any,
      ]
    })
  }

  async function deleteRow(rowId: string) {
    const row = rows.find((r) => r.id === rowId) as any
    if (row && !row._isNew) {
      await supabase.from("widget_klasemen").delete().eq("id", row.id)
    }
    setRows((prev) => prev.filter((r) => r.id !== rowId))
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

  // ── Kelompokkan baris per Grup, urut alfabetis, dan di dalam grup diurut
  //    berdasarkan rank (1, 2, 3, 4, ...) — bukan dicampur antar grup lagi.
  const groupLabels: string[] = [...new Set(rows.map((r) => r.group_label || "—"))].sort(
    (a, b) => a.localeCompare(b, "id", { numeric: true })
  )

  return (
    <div className="space-y-6">
      <BzzBar
        placeholder="Contoh: Liga Champions atau nama liga"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any[]) => {
          setRows(d.map(r => ({ ...r, id: crypto.randomUUID(), widget_id: widgetId, _isNew: true })))
        })}
      />
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
      )}

      {groupLabels.length === 0 && (
        <p className="py-6 text-center text-sm text-zinc-500">Belum ada grup. Tambahkan grup pertama di bawah.</p>
      )}

      {groupLabels.map((groupLabel) => {
        const groupRows = rows
          .filter((r) => r.group_label === groupLabel)
          .sort((a, b) => Number(a.rank) - Number(b.rank))

        return (
          <div key={groupLabel} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            {/* Header grup, misal: "Grup A · 4 Tim" */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#39FF14] px-2.5 py-1 text-xs font-black uppercase tracking-widest text-black">
                  Grup {groupLabel}
                </span>
                <span className="text-xs text-zinc-500">
                  {groupRows.length} {groupRows.length === 1 ? "Tim" : "Tim"} · Peringkat 1–{groupRows.length || 0}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {groupRows.map((row) => {
                // Index asli di array rows — dibutuhkan oleh updateRow()
                const originalIndex = rows.findIndex((r) => r.id === row.id)
                return (
                  <div key={row.id} className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="absolute right-3 top-3 text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                      <Input label="Grup" value={row.group_label} onChange={(v) => updateRow(originalIndex, "group_label", v)} placeholder="A" />
                      <div className="col-span-2 sm:col-span-2">
                        <Input label="Nama Tim" value={row.team_name} onChange={(v) => updateRow(originalIndex, "team_name", v)} placeholder="Nama Tim" />
                      </div>
                      <Input label="Rank" value={row.rank} onChange={(v) => updateRow(originalIndex, "rank", v)} type="number" />
                      <Input label="Main" value={row.played} onChange={(v) => updateRow(originalIndex, "played", v)} type="number" />
                      <Input label="Menang" value={row.won} onChange={(v) => updateRow(originalIndex, "won", v)} type="number" />
                      <Input label="Seri" value={row.drawn} onChange={(v) => updateRow(originalIndex, "drawn", v)} type="number" />
                      <Input label="Kalah" value={row.lost} onChange={(v) => updateRow(originalIndex, "lost", v)} type="number" />
                      <Input label="GF" value={row.gf} onChange={(v) => updateRow(originalIndex, "gf", v)} type="number" />
                      <Input label="GA" value={row.ga} onChange={(v) => updateRow(originalIndex, "ga", v)} type="number" />
                      <Input label="Poin" value={row.points} onChange={(v) => updateRow(originalIndex, "points", v)} type="number" />
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => addRowToGroup(groupLabel)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#39FF14]/30 py-2.5 text-sm text-[#39FF14]/70 transition hover:border-[#39FF14]/60 hover:text-[#39FF14]"
            >
              <Plus size={14} /> Tambah Tim ke Grup {groupLabel}
            </button>
          </div>
        )
      })}

      <button
        onClick={addNewGroup}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-sm text-zinc-400 transition hover:border-[#39FF14]/40 hover:text-[#39FF14]"
      >
        <Plus size={16} /> Tambah Grup Baru
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
  const bzz = useBzzAutofill("transfer")
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
      <BzzBar
        placeholder="Contoh: Erling Haaland"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          const initials = (d.nama_pemain ?? "").split(" ").map((w: string) => w[0] ?? "").join("").toUpperCase().slice(0, 3)
          setRows(prev => [{
            id: prev[0]?.id ?? crypto.randomUUID(),
            widget_id: widgetId,
            _isNew: !prev[0]?.id,
            league_label: prev[0]?.league_label ?? "",
            league_dest: prev[0]?.league_dest ?? "",
            player_name: d.nama_pemain ?? "",
            player_initials: initials,
            position: d.posisi ?? "",
            age: d.usia ?? 0,
            from_club: d.asal_klub ?? "",
            from_club_color: prev[0]?.from_club_color ?? "#1a1a2e",
            to_club: "",
            transfer_value: d.transfer_value ?? null,
            is_free: d.is_free ?? false,
            status: "rumor" as const,
            transfer_date: d.transfer_date ?? null,
          }])
        })}
      />
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
  const bzz = useBzzAutofill("peluang")
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
      <BzzBar
        placeholder="Contoh: Spanyol vs Jerman"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any[]) => {
          setRows(d.map((r, i) => ({
            id: crypto.randomUUID(),
            widget_id: widgetId,
            _isNew: true,
            rank: r.rank ?? i + 1,
            team_name: r.team_name ?? "",
            team_flag: "",
            category: i === 0 ? "FAVORIT UTAMA" : i === 1 ? "KANDIDAT KUAT" : "DARK HORSE",
            win_pct: r.win_pct ?? 50,
            reasons_win: r.pros?.length ? r.pros : [""],
            reasons_lose: r.cons?.length ? r.cons : [""],
          })))
        })}
      />
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
  const bzz = useBzzAutofill("analisa_taktis")

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
      <BzzBar
        placeholder="Contoh: Brasil atau nama pelatih"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          setData({
            team_name: d.team_name ?? "",
            coach_name: d.coach_name ?? "",
            formation: d.formation ?? "4-3-3",
            play_style: d.play_style ?? "",
            main_weapons: d.main_weapons?.length ? d.main_weapons : [""],
          })
        })}
      />
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
  const bzz = useBzzAutofill("perbandingan_tim")
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
      <BzzBar
        placeholder="Contoh: Spanyol vs Jerman"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          setData(p => ({ ...p,
            home_team: d.home_team ?? p.home_team,
            away_team: d.away_team ?? p.away_team,
            competition: d.competition ?? p.competition,
            home_rank: d.home_rank ?? p.home_rank,
            away_rank: d.away_rank ?? p.away_rank,
            home_coach: d.home_coach ?? p.home_coach,
            away_coach: d.away_coach ?? p.away_coach,
            total_matches: d.total_matches ?? p.total_matches,
            home_wins: d.home_wins ?? p.home_wins,
            draws: d.draws ?? p.draws,
            away_wins: d.away_wins ?? p.away_wins,
            home_form: d.home_form ?? p.home_form,
            away_form: d.away_form ?? p.away_form,
          }))
        })}
      />
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
  const bzz = useBzzAutofill("timeline_pertandingan")
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
  const [newEvent, setNewEvent] = useState<TimelineEvent2>({ ...EMPTY_TIMELINE_EVENT_2 })

  useEffect(() => {
    supabase.from("widget_timeline_pertandingan").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row, error }) => {
        if (error) setError(error.message)
        else if (row) setData(row as any)
        setLoading(false)
      })
  }, [widgetId])

  const isSub = newEvent.type === "substitution"
  const isGoal = newEvent.type === "goal" || newEvent.type === "penalty"

  function addEvent() {
    if (!newEvent.minute) return
    if (isSub && !newEvent.sub_in_name && !newEvent.sub_out_name) return
    if (!isSub && !newEvent.player_name) return
    setData(p => ({ ...p, events: [newEvent, ...p.events] }))
    setNewEvent({ ...EMPTY_TIMELINE_EVENT_2, type: newEvent.type, team: newEvent.team })
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

  // Helper input untuk field-field di dalam newEvent
  const E = (label: string, key: keyof TimelineEvent2, placeholder = "") => (
    <Input key={key} label={label} value={(newEvent[key] as string) ?? ""} placeholder={placeholder}
      onChange={v => setNewEvent(p => ({ ...p, [key]: v }))} />
  )

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      <BzzBar
        placeholder="Contoh: Brasil vs Argentina"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          setData(p => ({ ...p,
            home_team: d.home_team ?? p.home_team,
            away_team: d.away_team ?? p.away_team,
            home_abbr: d.home_abbr ?? p.home_abbr,
            away_abbr: d.away_abbr ?? p.away_abbr,
            home_score: d.home_score ?? p.home_score,
            away_score: d.away_score ?? p.away_score,
            status: d.status ?? p.status,
            competition: d.competition ?? p.competition,
            match_info: d.match_info ?? p.match_info,
          }))
          if (d.events?.length) setData(p => ({ ...p, events: d.events }))
        })}
      />
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

      {/* Add event — field menyesuaikan tipe event yang dipilih */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-xs font-semibold text-white">Tambah Event</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Menit" value={newEvent.minute} onChange={v => setNewEvent(p => ({ ...p, minute: v }))} placeholder="45'" />
          <Select label="Tipe" value={newEvent.type} onChange={v => setNewEvent(p => ({ ...p, type: v as EventType2 }))}
            options={[
              { label: "Gol ⚽", value: "goal" },
              { label: "Penalti ⚽", value: "penalty" },
              { label: "Kartu Kuning 🟨", value: "yellow_card" },
              { label: "Kartu Merah 🟥", value: "red_card" },
              { label: "Substitusi 🔄", value: "substitution" },
              { label: "VAR 📺", value: "var" },
            ]} />
        </div>
        <Select label="Tim" value={newEvent.team} onChange={v => setNewEvent(p => ({ ...p, team: v as "home" | "away" }))}
          options={[{ label: "Tuan Rumah", value: "home" }, { label: "Tamu", value: "away" }]} />

        {isGoal && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {E("Nama Pencetak Gol", "player_name", "Arda Güler")}
              {E("Nomor", "player_number", "8")}
              {E("Posisi", "player_position", "Penyerang")}
            </div>
            {E("URL Foto Pemain (opsional)", "player_photo", "https://...")}
            {E("Assist oleh (opsional)", "assist_name", "Barış Alper Yılmaz")}
            <Input label="Skor setelah gol ini" value={newEvent.score_after} onChange={v => setNewEvent(p => ({ ...p, score_after: v }))} placeholder="1-0" />
          </>
        )}

        {!isGoal && !isSub && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {E("Nama Pemain", "player_name", "Sebastian Berhalter")}
              {E("Nomor", "player_number", "14")}
              {E("Posisi", "player_position", "Gelandang")}
            </div>
            {E("URL Foto Pemain (opsional)", "player_photo", "https://...")}
          </>
        )}

        {isSub && (
          <>
            <p className="text-[11px] font-semibold text-[#39FF14]/80 pt-1">Pemain Masuk</p>
            <div className="grid grid-cols-3 gap-3">
              {E("Nama Masuk", "sub_in_name", "Irfan Kahveci")}
              {E("Nomor", "sub_in_number", "17")}
              {E("Posisi", "sub_in_position", "Penyerang")}
            </div>
            {E("URL Foto Masuk (opsional)", "sub_in_photo", "https://...")}
            <p className="text-[11px] font-semibold text-orange-400/80 pt-1">Pemain Keluar</p>
            <div className="grid grid-cols-3 gap-3">
              {E("Nama Keluar", "sub_out_name", "Barış Alper Yılmaz")}
              {E("Nomor", "sub_out_number", "21")}
              {E("Posisi", "sub_out_position", "Penyerang")}
            </div>
            {E("URL Foto Keluar (opsional)", "sub_out_photo", "https://...")}
          </>
        )}

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
              <span className="text-xs font-medium text-white flex-1 truncate">
                {ev.type === "substitution" ? `${ev.sub_in_name ?? "?"} ↗ ${ev.sub_out_name ?? "?"}` : ev.player_name}
              </span>
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

// ── Editor: Statistik Pertandingan ────────────────────────────────────────────

type StatDirection2 = "higher_better" | "lower_better" | "neutral"
interface StatRowDraft2 { label: string; home_value: number; away_value: number; is_percent: boolean; direction: StatDirection2 }

const DEFAULT_STAT_PRESETS_2: StatRowDraft2[] = [
  { label: "Tembakan",               home_value: 0, away_value: 0, is_percent: false, direction: "higher_better" },
  { label: "Tembakan ke Arah Gawang", home_value: 0, away_value: 0, is_percent: false, direction: "higher_better" },
  { label: "Operan",                 home_value: 0, away_value: 0, is_percent: false, direction: "higher_better" },
  { label: "Akurasi Operan",         home_value: 0, away_value: 0, is_percent: true,  direction: "higher_better" },
  { label: "Pelanggaran",            home_value: 0, away_value: 0, is_percent: false, direction: "lower_better" },
  { label: "Kartu Kuning",           home_value: 0, away_value: 0, is_percent: false, direction: "lower_better" },
  { label: "Kartu Merah",            home_value: 0, away_value: 0, is_percent: false, direction: "lower_better" },
  { label: "Offside",                home_value: 0, away_value: 0, is_percent: false, direction: "lower_better" },
  { label: "Tendangan Sudut",        home_value: 0, away_value: 0, is_percent: false, direction: "neutral" },
]

function StatistikPertandinganEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const bzz = useBzzAutofill("statistik_pertandingan")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState({
    home_team: "", away_team: "",
    home_flag: "🏳️", away_flag: "🏳️",
    competition: "",
    home_score: null as number | null,
    away_score: null as number | null,
    possession_home: 50,
    stats: [] as StatRowDraft2[],
  })

  useEffect(() => {
    supabase.from("widget_statistik_pertandingan").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row, error }) => {
        if (error) setError(error.message)
        else if (row) setData(row as any)
        setLoading(false)
      })
  }, [widgetId])

  const loadPreset = () => setData(p => ({ ...p, stats: DEFAULT_STAT_PRESETS_2.map(s => ({ ...s })) }))
  const addStatRow = () => setData(p => ({ ...p, stats: [...p.stats, { label: "", home_value: 0, away_value: 0, is_percent: false, direction: "higher_better" }] }))
  const removeStatRow = (i: number) => setData(p => ({ ...p, stats: p.stats.filter((_, j) => j !== i) }))
  const updateStatRow = (i: number, patch: Partial<StatRowDraft2>) =>
    setData(p => ({ ...p, stats: p.stats.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))

  async function save() {
    setSaving(true); setError(null)
    try {
      const { error } = await supabase.from("widget_statistik_pertandingan").upsert({ id: widgetId, ...data })
      if (error) throw error
      onSaved?.(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      <BzzBar
        placeholder="Contoh: Inggris vs Prancis"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          setData(p => ({ ...p,
            home_team: d.home_team ?? p.home_team,
            away_team: d.away_team ?? p.away_team,
            competition: d.competition ?? p.competition,
            home_score: d.home_score ?? p.home_score,
            away_score: d.away_score ?? p.away_score,
            possession_home: d.possession_home ?? p.possession_home,
          }))
          if (d.stats?.length) setData(p => ({ ...p, stats: d.stats }))
        })}
      />
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Tim Tuan Rumah" value={data.home_team} onChange={v => setData(p => ({ ...p, home_team: v }))} />
        <Input label="Tim Tamu" value={data.away_team} onChange={v => setData(p => ({ ...p, away_team: v }))} />
        <Input label="Bendera Home (emoji)" value={data.home_flag} onChange={v => setData(p => ({ ...p, home_flag: v }))} />
        <Input label="Bendera Away (emoji)" value={data.away_flag} onChange={v => setData(p => ({ ...p, away_flag: v }))} />
        <Input label="Skor Home (opsional)" type="number" value={data.home_score ?? ""} onChange={v => setData(p => ({ ...p, home_score: v === "" ? null : Number(v) }))} />
        <Input label="Skor Away (opsional)" type="number" value={data.away_score ?? ""} onChange={v => setData(p => ({ ...p, away_score: v === "" ? null : Number(v) }))} />
      </div>
      <Input label="Kompetisi" value={data.competition} onChange={v => setData(p => ({ ...p, competition: v }))} />
      <Input label="Penguasaan Bola — Home (%)" type="number" value={data.possession_home}
        onChange={v => setData(p => ({ ...p, possession_home: Math.min(100, Math.max(0, Number(v))) }))} />

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-white">Statistik ({data.stats.length})</p>
          <button onClick={loadPreset} className="text-[11px] text-[#39FF14] hover:underline">Muat preset</button>
        </div>
        {data.stats.map((s, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input value={s.label} placeholder="Nama statistik" onChange={e => updateStatRow(i, { label: e.target.value })}
                className="flex-1 rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <button onClick={() => removeStatRow(i)} className="text-zinc-600 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={s.home_value} placeholder="Home" onChange={e => updateStatRow(i, { home_value: Number(e.target.value) })}
                className="rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <input type="number" value={s.away_value} placeholder="Away" onChange={e => updateStatRow(i, { away_value: Number(e.target.value) })}
                className="rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <select value={s.direction} onChange={e => updateStatRow(i, { direction: e.target.value as StatDirection2 })}
                className="rounded border border-white/10 bg-[#111] px-1 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50">
                <option value="higher_better">Besar = unggul</option>
                <option value="lower_better">Kecil = unggul</option>
                <option value="neutral">Netral</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <input type="checkbox" checked={s.is_percent} onChange={e => updateStatRow(i, { is_percent: e.target.checked })} />
              Tampilkan sebagai persen (%)
            </label>
          </div>
        ))}
        <button onClick={addStatRow} className="w-full rounded-lg border border-[#39FF14]/30 py-2 text-xs text-[#39FF14]/70 hover:border-[#39FF14]/60 hover:text-[#39FF14]">
          <Plus size={12} className="inline mr-1" /> Tambah Statistik
        </button>
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

// ── Editor: Starting Lineup ────────────────────────────────────────────────────

interface LineupPlayerDraft2 { number: number; name: string; position: string; rating: number | null; photo_url: string; subbed_off: boolean }
interface TeamLineupDraft2 { team_name: string; flag: string; formation: string; players: LineupPlayerDraft2[] }
const EMPTY_LINEUP_PLAYER_2: LineupPlayerDraft2 = { number: 0, name: "", position: "", rating: null, photo_url: "", subbed_off: false }
function emptyTeamLineup2(): TeamLineupDraft2 { return { team_name: "", flag: "🏳️", formation: "4-3-3", players: [] } }

function TeamLineupEditor2({ team, onChange }: { team: TeamLineupDraft2; onChange: (t: TeamLineupDraft2) => void }) {
  const addPlayer = () => onChange({ ...team, players: [...team.players, { ...EMPTY_LINEUP_PLAYER_2 }] })
  const removePlayer = (i: number) => onChange({ ...team, players: team.players.filter((_, j) => j !== i) })
  const updatePlayer = (i: number, patch: Partial<LineupPlayerDraft2>) =>
    onChange({ ...team, players: team.players.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input label="Nama Tim" value={team.team_name} onChange={v => onChange({ ...team, team_name: v })} />
        <Input label="Bendera (emoji)" value={team.flag} onChange={v => onChange({ ...team, flag: v })} />
        <Input label="Formasi" value={team.formation} onChange={v => onChange({ ...team, formation: v })} placeholder="4-2-3-1" />
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Urutkan pemain: <b className="text-zinc-300">kiper → bek → gelandang (sesuai urutan formasi) → penyerang</b>.
        Total harus pas dengan formasi (cth 4-2-3-1 = 11 pemain).
      </p>
      <div className="space-y-2">
        {team.players.map((p, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 w-5">#{i + 1}</span>
              <input type="number" value={p.number} placeholder="No." onChange={e => updatePlayer(i, { number: Number(e.target.value) })}
                className="w-16 rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <input value={p.name} placeholder="Nama Pemain" onChange={e => updatePlayer(i, { name: e.target.value })}
                className="flex-1 rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <input value={p.position} placeholder="Posisi" onChange={e => updatePlayer(i, { position: e.target.value })}
                className="w-28 rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <button onClick={() => removePlayer(i)} className="text-zinc-600 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" step="0.1" value={p.rating ?? ""} placeholder="Rating"
                onChange={e => updatePlayer(i, { rating: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-24 rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <input value={p.photo_url} placeholder="URL Foto (opsional)" onChange={e => updatePlayer(i, { photo_url: e.target.value })}
                className="flex-1 rounded border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white outline-none focus:border-[#39FF14]/50" />
              <label className="flex items-center gap-1 text-[10px] text-zinc-400 whitespace-nowrap">
                <input type="checkbox" checked={p.subbed_off} onChange={e => updatePlayer(i, { subbed_off: e.target.checked })} />
                Diganti
              </label>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addPlayer} className="w-full rounded-lg border border-[#39FF14]/30 py-2 text-xs text-[#39FF14]/70 hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={12} className="inline mr-1" /> Tambah Pemain ({team.players.length}/11)
      </button>
    </div>
  )
}

function StartingLineupEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const bzz = useBzzAutofill("starting_lineup")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [competition, setCompetition] = useState("")
  const [home, setHome] = useState<TeamLineupDraft2>(emptyTeamLineup2())
  const [away, setAway] = useState<TeamLineupDraft2>(emptyTeamLineup2())
  const [activeTeam, setActiveTeam] = useState<"home" | "away">("home")

  useEffect(() => {
    supabase.from("widget_starting_lineup").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row, error }) => {
        if (error) setError(error.message)
        else if (row) {
          setCompetition((row as any).competition ?? "")
          if ((row as any).home) setHome((row as any).home)
          if ((row as any).away) setAway((row as any).away)
        }
        setLoading(false)
      })
  }, [widgetId])

  async function save() {
    setSaving(true); setError(null)
    try {
      const { error } = await supabase.from("widget_starting_lineup").upsert({ id: widgetId, competition, home, away })
      if (error) throw error
      onSaved?.(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-[#39FF14]" size={24} /></div>

  return (
    <div className="space-y-4">
      <BzzBar
        placeholder="Contoh: Portugal vs Maroko"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          setCompetition(d.competition ?? "")
          if (d.home) setHome(prev => ({
            ...prev,
            team_name: d.home.team_name ?? prev.team_name,
            flag: d.home.flag || prev.flag,
            formation: d.home.formation ?? prev.formation,
            players: d.home.players?.length ? d.home.players : prev.players,
          }))
          if (d.away) setAway(prev => ({
            ...prev,
            team_name: d.away.team_name ?? prev.team_name,
            flag: d.away.flag || prev.flag,
            formation: d.away.formation ?? prev.formation,
            players: d.away.players?.length ? d.away.players : prev.players,
          }))
        })}
      />
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      <Input label="Kompetisi" value={competition} onChange={setCompetition} placeholder="Piala Dunia 2026 · Grup D" />
      <div className="flex gap-2">
        <button onClick={() => setActiveTeam("home")}
          className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${activeTeam === "home" ? "border-[#39FF14] text-[#39FF14] bg-[#39FF14]/10" : "border-white/10 text-zinc-400"}`}>
          Tim Tuan Rumah
        </button>
        <button onClick={() => setActiveTeam("away")}
          className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${activeTeam === "away" ? "border-[#39FF14] text-[#39FF14] bg-[#39FF14]/10" : "border-white/10 text-zinc-400"}`}>
          Tim Tamu
        </button>
      </div>
      {activeTeam === "home"
        ? <TeamLineupEditor2 team={home} onChange={setHome} />
        : <TeamLineupEditor2 team={away} onChange={setAway} />}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 hover:text-white">Batal</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
      </div>
    </div>
  )
}
// ── Editor: Profil Stadion ────────────────────────────────────────────────────

function ProfilStadionEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const bzz = useBzzAutofill("profil_stadion")
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    nama_stadion: "", kota: "", kapasitas: 0, jenis_rumput: "",
    jenis_atap: "", negara: "", tahun_berdiri: "", foto_url: "",
  })

  useEffect(() => {
    supabase.from("widget_profil_stadion").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row }) => {
        if (row) setData({
          nama_stadion: row.nama_stadion ?? "",
          kota: row.kota ?? "",
          kapasitas: row.kapasitas ?? 0,
          jenis_rumput: row.jenis_rumput ?? "",
          jenis_atap: row.jenis_atap ?? "",
          negara: row.negara ?? "",
          tahun_berdiri: row.tahun_berdiri ? String(row.tahun_berdiri) : "",
          foto_url: row.foto_url ?? "",
        })
      })
  }, [widgetId])

  async function save() {
    setSaving(true)
    await supabase.from("widget_profil_stadion").upsert({
      id: widgetId,
      nama_stadion: data.nama_stadion,
      kota: data.kota,
      kapasitas: Number(data.kapasitas),
      jenis_rumput: data.jenis_rumput,
      jenis_atap: data.jenis_atap,
      negara: data.negara || null,
      tahun_berdiri: data.tahun_berdiri ? Number(data.tahun_berdiri) : null,
      foto_url: data.foto_url || null,
    }, { onConflict: "id" })
    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <div className="space-y-4">
      <BzzBar
        placeholder="Contoh: Gelora Bung Karno atau Allianz Arena"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          setData({
            nama_stadion: d.nama_stadion ?? "",
            kota: d.kota ?? "",
            negara: d.negara ?? "",
            kapasitas: d.kapasitas ?? 0,
            jenis_rumput: d.jenis_rumput ?? "Natural",
            jenis_atap: d.jenis_atap ?? "Terbuka",
            tahun_berdiri: d.tahun_berdiri ? String(d.tahun_berdiri) : "",
            foto_url: "",
          })
        })}
      />
      <Input label="Nama Stadion" value={data.nama_stadion} onChange={v => setData(p => ({ ...p, nama_stadion: v }))} placeholder="Gelora Bung Karno" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Kota" value={data.kota} onChange={v => setData(p => ({ ...p, kota: v }))} placeholder="Jakarta" />
        <Input label="Negara" value={data.negara} onChange={v => setData(p => ({ ...p, negara: v }))} placeholder="Indonesia" />
      </div>
      <Input label="Kapasitas (penonton)" value={data.kapasitas} onChange={v => setData(p => ({ ...p, kapasitas: Number(v) }))} type="number" placeholder="77000" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Jenis Rumput" value={data.jenis_rumput} onChange={v => setData(p => ({ ...p, jenis_rumput: v }))} placeholder="Natural / Sintetis" />
        <Input label="Jenis Atap" value={data.jenis_atap} onChange={v => setData(p => ({ ...p, jenis_atap: v }))} placeholder="Terbuka / Tertutup" />
      </div>
      <Input label="Tahun Berdiri (opsional)" value={data.tahun_berdiri} onChange={v => setData(p => ({ ...p, tahun_berdiri: v }))} type="number" placeholder="1962" />
      <Input label="URL Foto (opsional)" value={data.foto_url} onChange={v => setData(p => ({ ...p, foto_url: v }))} placeholder="https://..." />
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="rounded-lg border border-white/10 px-5 py-2 text-sm text-zinc-400 hover:text-white">Batal</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#39FF14] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
        </button>
      </div>
    </div>
  )
}

// ── Editor: Daftar Pemain Tim ─────────────────────────────────────────────────

function DaftarPemainEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const bzz = useBzzAutofill("daftar_pemain")
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([{
    id: crypto.randomUUID(), widget_id: widgetId, nomor_punggung: 1,
    nama_pemain: "", usia: 0, asal_klub: "", nilai_pasar: "", posisi: "", _isNew: true,
  }])

  useEffect(() => {
    supabase.from("widget_daftar_pemain").select("*").eq("widget_id", widgetId)
      .order("nomor_punggung", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) setRows(data.map(r => ({ ...r, posisi: r.posisi ?? "", _isNew: false })) as any)
      })
  }, [widgetId])

  function updateRow(i: number, field: string, value: any) {
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c })
  }
  function addRow() {
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), widget_id: widgetId, nomor_punggung: prev.length + 1,
      nama_pemain: "", usia: 0, asal_klub: "", nilai_pasar: "", posisi: "", _isNew: true,
    }])
  }
  async function removeRow(i: number) {
    const row = rows[i] as any
    if (!row._isNew) await supabase.from("widget_daftar_pemain").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    for (const row of rows) {
      await supabase.from("widget_daftar_pemain").upsert({
        id: row.id, widget_id: widgetId,
        nomor_punggung: Number(row.nomor_punggung),
        nama_pemain: row.nama_pemain,
        usia: Number(row.usia),
        asal_klub: row.asal_klub,
        nilai_pasar: row.nilai_pasar,
        posisi: row.posisi || null,
      }, { onConflict: "id" })
    }
    setSaving(false)
    onSaved?.()
    onClose()
  }

  const posisiOptions = [
    "", "GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LW", "RW", "SS", "ST", "CF",
  ]

  return (
    <div className="space-y-3">
      <BzzBar
        placeholder="Contoh: Manchester City atau nama tim"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any[]) => {
          setRows(d.map(p => ({ ...p, id: crypto.randomUUID(), widget_id: widgetId, _isNew: true })))
        })}
      />
      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <button onClick={() => removeRow(i)} className="absolute right-3 top-3 text-zinc-600 hover:text-red-400"><Trash2 size={14} /></button>
          <div className="grid grid-cols-2 gap-3">
            <Input label="No. Punggung" value={row.nomor_punggung} onChange={v => updateRow(i, "nomor_punggung", Number(v))} type="number" />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Posisi</label>
              <select value={row.posisi} onChange={e => updateRow(i, "posisi", e.target.value)}
                className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50">
                {posisiOptions.map(p => <option key={p} value={p}>{p || "— Pilih —"}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Input label="Nama Pemain" value={row.nama_pemain} onChange={v => updateRow(i, "nama_pemain", v)} placeholder="Lionel Messi" />
            </div>
            <Input label="Usia" value={row.usia} onChange={v => updateRow(i, "usia", Number(v))} type="number" />
            <Input label="Asal Klub" value={row.asal_klub} onChange={v => updateRow(i, "asal_klub", v)} placeholder="Inter Miami" />
            <div className="col-span-2">
              <Input label="Nilai Pasar" value={row.nilai_pasar} onChange={v => updateRow(i, "nilai_pasar", v)} placeholder="€30M" />
            </div>
          </div>
        </div>
      ))}
      <button onClick={addRow} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#39FF14]/30 py-2.5 text-sm text-[#39FF14]/70 hover:border-[#39FF14]/60 hover:text-[#39FF14]">
        <Plus size={14} /> Tambah Pemain
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

// ── Editor: Pemain Andalan ────────────────────────────────────────────────────

function PemainAndalanEditor({ widgetId, onClose, onSaved }: { widgetId: string; onClose: () => void; onSaved?: () => void }) {
  const supabase = createClient()
  const bzz = useBzzAutofill("pemain_andalan")
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    nama_pemain: "", nomor_punggung: 10, posisi: "ST", usia: 25,
    tinggi_badan: 175, berat_badan: 70, kaki_dominan: "Kanan",
    jumlah_pertandingan: 0, kontribusi_goal: 0, kontribusi_assist: 0,
    menit_bermain: 0, rating_performa: 7.0, kebangsaan: "", foto_url: "",
  })

  useEffect(() => {
    supabase.from("widget_pemain_andalan").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row }) => {
        if (row) setData({
          nama_pemain: row.nama_pemain ?? "",
          nomor_punggung: row.nomor_punggung ?? 10,
          posisi: row.posisi ?? "ST",
          usia: row.usia ?? 25,
          tinggi_badan: row.tinggi_badan ?? 175,
          berat_badan: row.berat_badan ?? 70,
          kaki_dominan: row.kaki_dominan ?? "Kanan",
          jumlah_pertandingan: row.jumlah_pertandingan ?? 0,
          kontribusi_goal: row.kontribusi_goal ?? 0,
          kontribusi_assist: row.kontribusi_assist ?? 0,
          menit_bermain: row.menit_bermain ?? 0,
          rating_performa: row.rating_performa ?? 7.0,
          kebangsaan: row.kebangsaan ?? "",
          foto_url: row.foto_url ?? "",
        })
      })
  }, [widgetId])

  async function save() {
    setSaving(true)
    await supabase.from("widget_pemain_andalan").upsert({
      id: widgetId,
      nama_pemain: data.nama_pemain,
      nomor_punggung: Number(data.nomor_punggung),
      posisi: data.posisi,
      usia: Number(data.usia),
      tinggi_badan: Number(data.tinggi_badan),
      berat_badan: Number(data.berat_badan),
      kaki_dominan: data.kaki_dominan,
      jumlah_pertandingan: Number(data.jumlah_pertandingan),
      kontribusi_goal: Number(data.kontribusi_goal),
      kontribusi_assist: Number(data.kontribusi_assist),
      menit_bermain: Number(data.menit_bermain),
      rating_performa: Number(data.rating_performa),
      kebangsaan: data.kebangsaan || null,
      foto_url: data.foto_url || null,
    }, { onConflict: "id" })
    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <div className="space-y-4">
      <BzzBar
        placeholder="Contoh: Erling Haaland atau nama pemain"
        query={bzz.query} setQuery={bzz.setQuery}
        loading={bzz.loading} error={bzz.error}
        onFill={() => bzz.autofill((d: any) => {
          setData({
            nama_pemain: d.nama_pemain ?? "",
            nomor_punggung: d.nomor_punggung ?? 10,
            posisi: d.posisi ?? "ST",
            usia: d.usia ?? 25,
            tinggi_badan: d.tinggi_badan ?? 175,
            berat_badan: d.berat_badan ?? 70,
            kaki_dominan: d.kaki_dominan ?? "Kanan",
            jumlah_pertandingan: d.jumlah_pertandingan ?? 0,
            kontribusi_goal: d.kontribusi_goal ?? 0,
            kontribusi_assist: d.kontribusi_assist ?? 0,
            menit_bermain: d.menit_bermain ?? 0,
            rating_performa: d.rating_performa ?? 7.0,
            kebangsaan: d.kebangsaan ?? "",
            foto_url: "",
          })
        })}
      />
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Identitas Pemain</p>
      <Input label="Nama Pemain" value={data.nama_pemain} onChange={v => setData(p => ({ ...p, nama_pemain: v }))} placeholder="Erling Haaland" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="No. Punggung" value={data.nomor_punggung} onChange={v => setData(p => ({ ...p, nomor_punggung: Number(v) }))} type="number" />
        <Input label="Posisi" value={data.posisi} onChange={v => setData(p => ({ ...p, posisi: v }))} placeholder="ST" />
        <Input label="Usia" value={data.usia} onChange={v => setData(p => ({ ...p, usia: Number(v) }))} type="number" />
        <Input label="Kebangsaan" value={data.kebangsaan} onChange={v => setData(p => ({ ...p, kebangsaan: v }))} placeholder="Norwegia" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Data Fisik</p>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Tinggi (cm)" value={data.tinggi_badan} onChange={v => setData(p => ({ ...p, tinggi_badan: Number(v) }))} type="number" />
        <Input label="Berat (kg)" value={data.berat_badan} onChange={v => setData(p => ({ ...p, berat_badan: Number(v) }))} type="number" />
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Kaki Dominan</label>
          <select value={data.kaki_dominan} onChange={e => setData(p => ({ ...p, kaki_dominan: e.target.value }))}
            className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-[#39FF14]/50">
            <option value="Kanan">Kanan</option>
            <option value="Kiri">Kiri</option>
            <option value="Kedua">Kedua</option>
          </select>
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Statistik</p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Jumlah Pertandingan" value={data.jumlah_pertandingan} onChange={v => setData(p => ({ ...p, jumlah_pertandingan: Number(v) }))} type="number" />
        <Input label="Menit Bermain" value={data.menit_bermain} onChange={v => setData(p => ({ ...p, menit_bermain: Number(v) }))} type="number" />
        <Input label="Kontribusi Gol" value={data.kontribusi_goal} onChange={v => setData(p => ({ ...p, kontribusi_goal: Number(v) }))} type="number" />
        <Input label="Kontribusi Assist" value={data.kontribusi_assist} onChange={v => setData(p => ({ ...p, kontribusi_assist: Number(v) }))} type="number" />
        <div className="col-span-2">
          <Input label="Rating Performa (0–10)" value={data.rating_performa} onChange={v => setData(p => ({ ...p, rating_performa: Number(v) }))} type="number" placeholder="7.5" />
        </div>
      </div>
      <Input label="URL Foto (opsional)" value={data.foto_url} onChange={v => setData(p => ({ ...p, foto_url: v }))} placeholder="https://..." />
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
    profil_stadion:          "Edit Profil Stadion",
    daftar_pemain:           "Edit Daftar Pemain Tim",
    pemain_andalan:          "Edit Pemain Andalan",
    statistik_pertandingan:  "Edit Statistik Pertandingan",
    starting_lineup:         "Edit Starting Lineup",
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
          ) : widgetType === "profil_stadion" ? (
            <ProfilStadionEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "daftar_pemain" ? (
            <DaftarPemainEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "pemain_andalan" ? (
            <PemainAndalanEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "statistik_pertandingan" ? (
            <StatistikPertandinganEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
          ) : widgetType === "starting_lineup" ? (
            <StartingLineupEditor widgetId={widgetId} onClose={onClose} onSaved={onSaved} />
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
