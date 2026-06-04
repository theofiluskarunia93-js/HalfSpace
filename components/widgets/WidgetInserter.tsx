"use client"

/**
 * WidgetInserter.tsx
 *
 * Panel sidebar di editor artikel untuk membuat / mengedit widget.
 * Setiap WidgetType punya form input sendiri.
 *
 * WidgetType yang didukung:
 *  jadwal | klasemen | transfer | peluang | analisa_taktis
 *  perbandingan_tim | timeline_pertandingan   ← BARU
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { v4 as uuidv4 } from "uuid"

// ─── Type ─────────────────────────────────────────────────────────────────────
export type WidgetType =
  | "jadwal"
  | "klasemen"
  | "transfer"
  | "peluang"
  | "analisa_taktis"
  | "perbandingan_tim"
  | "timeline_pertandingan"

// ─── Shortcode map ────────────────────────────────────────────────────────────
export const SHORTCODE_MAP: Record<WidgetType, string> = {
  jadwal:                  "match_data",
  klasemen:                "klasemen_data",
  transfer:                "transfer_data",
  peluang:                 "peluang_data",
  analisa_taktis:          "analisa_taktis_data",
  perbandingan_tim:        "perbandingan_tim_data",
  timeline_pertandingan:   "timeline_pertandingan_data",
}

export const TABLE_MAP: Record<WidgetType, string> = {
  jadwal:                  "widget_jadwal",
  klasemen:                "widget_klasemen",
  transfer:                "widget_transfer",
  peluang:                 "widget_peluang",
  analisa_taktis:          "widget_analisa_taktis",
  perbandingan_tim:        "widget_perbandingan_tim",
  timeline_pertandingan:   "widget_timeline_pertandingan",
}

export const WIDGET_META: Record<WidgetType, { icon: string; label: string }> = {
  jadwal:                  { icon: "📅", label: "Jadwal Pertandingan" },
  klasemen:                { icon: "🏆", label: "Klasemen Grup" },
  transfer:                { icon: "🔄", label: "Transfer Pemain" },
  peluang:                 { icon: "⭐", label: "Peluang Juara" },
  analisa_taktis:          { icon: "🧠", label: "Analisa Taktis" },
  perbandingan_tim:        { icon: "⚔️", label: "Perbandingan Tim" },
  timeline_pertandingan:   { icon: "📋", label: "Timeline Pertandingan" },
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  onInsert: (shortcode: string, widgetId: string, widgetType: WidgetType) => void
  editWidgetId?: string | null
  editWidgetType?: WidgetType | null
  onResetEdit?: () => void
  initialWidgets?: { widgetId: string; widgetType: WidgetType }[]
}

// ─── Form: Perbandingan Tim ───────────────────────────────────────────────────

interface FormResult { result: "W" | "D" | "L" }
interface H2HMatch { date: string; home_team: string; away_team: string; home_score: number; away_score: number }
interface StatItem { label: string; home_value: string; away_value: string; home_pct: number }

function defaultFormResults(): FormResult[] {
  return [{ result: "W" }, { result: "W" }, { result: "D" }, { result: "W" }, { result: "L" }]
}

function PerbandinganTimForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    home_team: "", away_team: "", competition: "FRIENDLY",
    home_rank: "#1", away_rank: "#2",
    home_value: "€500M", away_value: "€500M",
    home_form: defaultFormResults(),
    away_form: defaultFormResults(),
    home_coach: "", away_coach: "",
    total_matches: 0, home_wins: 0, draws: 0, away_wins: 0,
    h2h_matches: [] as H2HMatch[],
    stats: [] as StatItem[],
  })

  useEffect(() => {
    supabase.from("widget_perbandingan_tim").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row }) => { if (row) setData(row as any) })
  }, [widgetId])

  const save = async () => {
    setSaving(true)
    await supabase.from("widget_perbandingan_tim").upsert({ id: widgetId, ...data })
    setSaving(false)
    onSaved()
  }

  const F = (label: string, key: keyof typeof data, type = "text") => (
    <div key={key}>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input type={type} value={String(data[key])}
        onChange={e => setData(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        className="w-full rounded border border-border bg-secondary/50 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary" />
    </div>
  )

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        {F("Tim Tuan Rumah", "home_team")}
        {F("Tim Tamu", "away_team")}
      </div>
      {F("Kompetisi (badge)", "competition")}
      <div className="grid grid-cols-2 gap-2">
        {F("Ranking FIFA (Home)", "home_rank")}
        {F("Ranking FIFA (Away)", "away_rank")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {F("Nilai Skuad (Home)", "home_value")}
        {F("Nilai Skuad (Away)", "away_value")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {F("Pelatih (Home)", "home_coach")}
        {F("Pelatih (Away)", "away_coach")}
      </div>
      <p className="text-xs text-muted-foreground pt-1">Form 5 laga, H2H, dan statistik diisi langsung via Supabase Table Editor atau bisa diperluas ke form di sini.</p>
      <div className="grid grid-cols-3 gap-2">
        {F("Total Laga H2H", "total_matches", "number")}
        {F("Menang Home", "home_wins", "number")}
        {F("Seri", "draws", "number")}
      </div>
      {F("Menang Away", "away_wins", "number")}
      <button onClick={save} disabled={saving}
        className="w-full rounded bg-primary py-2 text-xs font-bold text-black hover:bg-primary/90 disabled:opacity-40">
        {saving ? "Menyimpan..." : "Simpan Widget"}
      </button>
    </div>
  )
}

// ─── Form: Timeline Pertandingan ──────────────────────────────────────────────

type EventType = "goal" | "yellow_card" | "red_card" | "substitution" | "var" | "penalty"
type MatchStatus = "upcoming" | "live" | "finished"

interface TimelineEvent { minute: string; type: EventType; player: string; team: "home" | "away"; score_after: string }

function TimelineForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    home_team: "", away_team: "",
    home_flag: "🏳️", away_flag: "🏳️",
    home_abbr: "HOM", away_abbr: "AWY",
    home_score: 0, away_score: 0,
    status: "upcoming" as MatchStatus,
    live_minute: "",
    competition: "",
    match_info: "",
    events: [] as TimelineEvent[],
  })
  const [newEvent, setNewEvent] = useState<TimelineEvent>({ minute: "", type: "goal", player: "", team: "home", score_after: "" })

  useEffect(() => {
    supabase.from("widget_timeline_pertandingan").select("*").eq("id", widgetId).maybeSingle()
      .then(({ data: row }) => { if (row) setData(row as any) })
  }, [widgetId])

  const addEvent = () => {
    if (!newEvent.minute || !newEvent.player) return
    setData(p => ({ ...p, events: [newEvent, ...p.events] }))
    setNewEvent({ minute: "", type: "goal", player: "", team: "home", score_after: "" })
  }

  const removeEvent = (i: number) => setData(p => ({ ...p, events: p.events.filter((_, j) => j !== i) }))

  const save = async () => {
    setSaving(true)
    await supabase.from("widget_timeline_pertandingan").upsert({ id: widgetId, ...data })
    setSaving(false)
    onSaved()
  }

  const F = (label: string, key: keyof typeof data, type = "text") => (
    <div key={key}>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input type={type} value={String(data[key])}
        onChange={e => setData(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        className="w-full rounded border border-border bg-secondary/50 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary" />
    </div>
  )

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        {F("Tim Tuan Rumah", "home_team")}
        {F("Tim Tamu", "away_team")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {F("Bendera Home (emoji)", "home_flag")}
        {F("Bendera Away (emoji)", "away_flag")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {F("Singkatan Home", "home_abbr")}
        {F("Singkatan Away", "away_abbr")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {F("Skor Home", "home_score", "number")}
        {F("Skor Away", "away_score", "number")}
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Status</label>
        <select value={data.status} onChange={e => setData(p => ({ ...p, status: e.target.value as MatchStatus }))}
          className="w-full rounded border border-border bg-secondary/50 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary">
          <option value="upcoming">Upcoming</option>
          <option value="live">Live</option>
          <option value="finished">Finished</option>
        </select>
      </div>
      {data.status === "live" && F("Menit Live (contoh: 67')", "live_minute")}
      {F("Info Pertandingan", "match_info")}
      {F("Kompetisi", "competition")}

      {/* Event input */}
      <div className="rounded border border-border p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">Tambah Event</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Menit</label>
            <input value={newEvent.minute} onChange={e => setNewEvent(p => ({ ...p, minute: e.target.value }))} placeholder="45'" className="w-full rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tipe</label>
            <select value={newEvent.type} onChange={e => setNewEvent(p => ({ ...p, type: e.target.value as EventType }))} className="w-full rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm">
              <option value="goal">Gol ⚽</option>
              <option value="yellow_card">Kartu Kuning 🟨</option>
              <option value="red_card">Kartu Merah 🟥</option>
              <option value="substitution">Substitusi 🔄</option>
              <option value="penalty">Penalti ⚽</option>
              <option value="var">VAR 📺</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Pemain</label>
          <input value={newEvent.player} onChange={e => setNewEvent(p => ({ ...p, player: e.target.value }))} placeholder="Nama Pemain" className="w-full rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tim</label>
            <select value={newEvent.team} onChange={e => setNewEvent(p => ({ ...p, team: e.target.value as "home" | "away" }))} className="w-full rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm">
              <option value="home">Tuan Rumah</option>
              <option value="away">Tamu</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Skor setelah</label>
            <input value={newEvent.score_after} onChange={e => setNewEvent(p => ({ ...p, score_after: e.target.value }))} placeholder="1–0" className="w-full rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm" />
          </div>
        </div>
        <button onClick={addEvent} className="w-full rounded border border-primary/50 text-primary text-xs py-1.5 hover:bg-primary/10 transition-colors">
          + Tambah Event
        </button>
      </div>

      {/* Event list */}
      {data.events.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">Events ({data.events.length})</p>
          {data.events.map((ev, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded border border-border bg-secondary/30 px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">{ev.minute}</span>
              <span className="text-xs font-medium text-foreground flex-1 truncate">{ev.player}</span>
              <span className="text-xs text-muted-foreground">{ev.score_after}</span>
              <button onClick={() => removeEvent(i)} className="text-destructive/60 hover:text-destructive text-xs">✕</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="w-full rounded bg-primary py-2 text-xs font-bold text-black hover:bg-primary/90 disabled:opacity-40">
        {saving ? "Menyimpan..." : "Simpan Widget"}
      </button>
    </div>
  )
}

// ─── Main WidgetInserter ──────────────────────────────────────────────────────

export function WidgetInserter({ onInsert, editWidgetId, editWidgetType, onResetEdit, initialWidgets = [] }: Props) {
  const supabase = createClient()
  const [selectedType, setSelectedType] = useState<WidgetType>("jadwal")
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // Saat masuk mode edit dari luar (klik badge di editor)
  useEffect(() => {
    if (editWidgetId && editWidgetType) {
      setSelectedType(editWidgetType)
      setActiveWidgetId(editWidgetId)
    }
  }, [editWidgetId, editWidgetType])

  function startNew(type: WidgetType) {
    setSelectedType(type)
    setActiveWidgetId(uuidv4())
    setJustSaved(false)
    onResetEdit?.()
  }

  function handleSaved() {
    if (!activeWidgetId) return
    const scKey = SHORTCODE_MAP[selectedType]
    const shortcode = `[${scKey} id="${activeWidgetId}"]`
    onInsert(shortcode, activeWidgetId, selectedType)
    setJustSaved(true)
    // Kalau edit mode, reset
    if (editWidgetId) onResetEdit?.()
  }

  const ALL_TYPES = Object.keys(WIDGET_META) as WidgetType[]

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {/* Pilih tipe widget */}
      {!activeWidgetId && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pilih Jenis Widget</p>
          <div className="grid grid-cols-1 gap-1.5">
            {ALL_TYPES.map(type => (
              <button key={type} onClick={() => startNew(type)}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm hover:border-primary/50 hover:bg-primary/5 transition-colors text-left">
                <span>{WIDGET_META[type].icon}</span>
                <span className="text-foreground font-medium">{WIDGET_META[type].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form widget aktif */}
      {activeWidgetId && !justSaved && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>{WIDGET_META[selectedType].icon}</span>
              {editWidgetId ? "Edit" : "Buat"} {WIDGET_META[selectedType].label}
            </p>
            <button onClick={() => { setActiveWidgetId(null); onResetEdit?.() }}
              className="text-xs text-muted-foreground hover:text-foreground">Batal</button>
          </div>

          {/* Render form sesuai tipe */}
          {selectedType === "perbandingan_tim" && (
            <PerbandinganTimForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "timeline_pertandingan" && (
            <TimelineForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {/* Form tipe lama (jadwal, klasemen, transfer, peluang, analisa_taktis)
              tetap menggunakan komponen form masing-masing yang sudah ada */}
          {!["perbandingan_tim", "timeline_pertandingan"].includes(selectedType) && (
            <p className="text-xs text-muted-foreground">
              Form untuk <strong>{WIDGET_META[selectedType].label}</strong> sudah tersedia di komponen form lama.
              Ganti komponen ini sesuai implementasi yang sudah ada.
            </p>
          )}
        </div>
      )}

      {/* Konfirmasi setelah simpan */}
      {justSaved && (
        <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-3 text-xs text-primary space-y-1">
          <p className="font-bold">✅ Widget disisipkan ke artikel!</p>
          <button onClick={() => { setActiveWidgetId(null); setJustSaved(false) }}
            className="underline text-primary/70 hover:text-primary">Tambah widget lagi</button>
        </div>
      )}

      {/* Widget yang sudah ada di artikel (preloaded) */}
      {initialWidgets.length > 0 && !activeWidgetId && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Widget di Artikel</p>
          {initialWidgets.map(w => (
            <button key={w.widgetId}
              onClick={() => { setSelectedType(w.widgetType); setActiveWidgetId(w.widgetId); setJustSaved(false) }}
              className="flex w-full items-center gap-2 rounded border border-border bg-secondary/20 px-2.5 py-1.5 text-xs hover:border-primary/50 hover:text-primary transition-colors">
              <span>{WIDGET_META[w.widgetType]?.icon ?? "📦"}</span>
              <span className="flex-1 text-left text-muted-foreground">{WIDGET_META[w.widgetType]?.label}</span>
              <span className="text-primary/40">Edit →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
