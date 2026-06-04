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
    jadwal:         "Edit Jadwal Pertandingan",
    klasemen:       "Edit Klasemen Grup",
    transfer:       "Edit Transfer Pemain",
    peluang:        "Edit Peluang Juara",
    analisa_taktis: "Edit Analisa Taktis",
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
