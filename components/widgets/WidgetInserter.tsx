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


// ─── Type ─────────────────────────────────────────────────────────────────────
export type WidgetType =
  | "jadwal"
  | "klasemen"
  | "transfer"
  | "peluang"
  | "analisa_taktis"
  | "perbandingan_tim"
  | "timeline_pertandingan"
  | "profil_stadion"
  | "daftar_pemain"
  | "pemain_andalan"

// ─── Shortcode map ────────────────────────────────────────────────────────────
export const SHORTCODE_MAP: Record<WidgetType, string> = {
  jadwal:                  "match_data",
  klasemen:                "klasemen_data",
  transfer:                "transfer_data",
  peluang:                 "peluang_data",
  analisa_taktis:          "analisa_taktis_data",
  perbandingan_tim:        "perbandingan_tim_data",
  timeline_pertandingan:   "timeline_pertandingan_data",
  profil_stadion:          "profil_stadion_data",
  daftar_pemain:           "daftar_pemain_data",
  pemain_andalan:          "pemain_andalan_data",
}

export const TABLE_MAP: Record<WidgetType, string> = {
  jadwal:                  "widget_jadwal",
  klasemen:                "widget_klasemen",
  transfer:                "widget_transfer",
  peluang:                 "widget_peluang",
  analisa_taktis:          "widget_analisa_taktis",
  perbandingan_tim:        "widget_perbandingan_tim",
  timeline_pertandingan:   "widget_timeline_pertandingan",
  profil_stadion:          "widget_profil_stadion",
  daftar_pemain:           "widget_daftar_pemain",
  pemain_andalan:          "widget_pemain_andalan",
}

export const WIDGET_META: Record<WidgetType, { icon: string; label: string }> = {
  jadwal:                  { icon: "📅", label: "Jadwal Pertandingan" },
  klasemen:                { icon: "🏆", label: "Klasemen Grup" },
  transfer:                { icon: "🔄", label: "Transfer Pemain" },
  peluang:                 { icon: "⭐", label: "Peluang Juara" },
  analisa_taktis:          { icon: "🧠", label: "Analisa Taktis" },
  perbandingan_tim:        { icon: "⚔️", label: "Perbandingan Tim" },
  timeline_pertandingan:   { icon: "📋", label: "Timeline Pertandingan" },
  profil_stadion:          { icon: "🏟️", label: "Profil Stadion" },
  daftar_pemain:           { icon: "👥", label: "Daftar Pemain Tim" },
  pemain_andalan:          { icon: "⭐", label: "Pemain Andalan" },
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

// ─── Shared form helpers ──────────────────────────────────────────────────────

function FInput({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm text-foreground placeholder-muted-foreground/50 outline-none focus:border-primary/50" />
    </div>
  )
}

function FSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/50">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─── Form: Jadwal ─────────────────────────────────────────────────────────────

function JadwalForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([{
    id: crypto.randomUUID(), group_label: "A", home_team: "", away_team: "",
    match_date: "", match_time: "", stadium: "", status: "scheduled",
    score_home: "", score_away: "",
  }])

  useEffect(() => {
    supabase.from("widget_jadwal").select("*").eq("widget_id", widgetId).order("match_date", { ascending: true })
      .then(({ data }) => { if (data && data.length > 0) setRows(data.map(r => ({ ...r, score_home: r.score_home ?? "", score_away: r.score_away ?? "" }))) })
  }, [widgetId])

  function updateRow(i: number, field: string, value: string) {
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c })
  }
  function addRow() {
    setRows(prev => [...prev, { id: crypto.randomUUID(), group_label: prev[0]?.group_label ?? "A", home_team: "", away_team: "", match_date: "", match_time: "", stadium: "", status: "scheduled", score_home: "", score_away: "" }])
  }
  async function removeRow(i: number) {
    const row = rows[i] as any
    if (!row._isNew) await supabase.from("widget_jadwal").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    for (const row of rows) {
      await supabase.from("widget_jadwal").upsert({
        id: row.id, widget_id: widgetId, group_label: row.group_label,
        home_team: row.home_team, away_team: row.away_team,
        match_date: row.match_date || null, match_time: row.match_time || null,
        stadium: (row as any).stadium || null, status: (row as any).status ?? "scheduled",
        score_home: row.score_home !== "" ? Number(row.score_home) : null,
        score_away: row.score_away !== "" ? Number(row.score_away) : null,
      }, { onConflict: "id" })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <button onClick={() => removeRow(i)} className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-destructive">✕</button>
          <div className="grid grid-cols-2 gap-2">
            <FInput label="Grup" value={row.group_label} onChange={v => updateRow(i, "group_label", v)} placeholder="A" />
            <FSelect label="Status" value={(row as any).status ?? "scheduled"} onChange={v => updateRow(i, "status", v)}
              options={[{ label: "Akan Datang", value: "scheduled" }, { label: "Live", value: "live" }, { label: "Selesai", value: "finished" }]} />
            <FInput label="Tim Kandang" value={row.home_team} onChange={v => updateRow(i, "home_team", v)} placeholder="Tim A" />
            <FInput label="Tim Tamu" value={row.away_team} onChange={v => updateRow(i, "away_team", v)} placeholder="Tim B" />
            <FInput label="Tanggal" value={row.match_date} onChange={v => updateRow(i, "match_date", v)} type="date" />
            <FInput label="Waktu" value={row.match_time} onChange={v => updateRow(i, "match_time", v)} type="time" />
            <div className="col-span-2">
              <FInput label="Stadion" value={(row as any).stadium ?? ""} onChange={v => updateRow(i, "stadium", v)} placeholder="Nama stadion" />
            </div>
            {((row as any).status === "live" || (row as any).status === "finished") && (
              <>
                <FInput label="Skor Kandang" value={row.score_home} onChange={v => updateRow(i, "score_home", v)} type="number" />
                <FInput label="Skor Tamu" value={row.score_away} onChange={v => updateRow(i, "score_away", v)} type="number" />
              </>
            )}
          </div>
        </div>
      ))}
      <button onClick={addRow} className="w-full rounded-lg border border-dashed border-primary/30 py-2 text-xs text-primary/70 hover:border-primary/60 hover:text-primary">
        + Tambah Pertandingan
      </button>
      <button onClick={save} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
      </button>
    </div>
  )
}

// ─── Form: Klasemen ───────────────────────────────────────────────────────────

function KlasemenForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([{
    id: crypto.randomUUID(), group_label: "A", rank: 1, team_name: "",
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
  }])

  useEffect(() => {
    supabase.from("widget_klasemen").select("*").eq("widget_id", widgetId).order("rank", { ascending: true })
      .then(({ data }) => { if (data && data.length > 0) setRows(data as any) })
  }, [widgetId])

  function updateRow(i: number, field: string, value: string) {
    const isNum = !["group_label", "team_name"].includes(field)
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: isNum ? Number(value) : value }; return c })
  }
  function addRow() {
    const lastRank = rows.length > 0 ? rows[rows.length - 1].rank + 1 : 1
    setRows(prev => [...prev, { id: crypto.randomUUID(), group_label: prev[0]?.group_label ?? "A", rank: lastRank, team_name: "", played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }])
  }
  async function removeRow(i: number) {
    const row = rows[i] as any
    if (!row._isNew) await supabase.from("widget_klasemen").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    for (const row of rows) {
      await supabase.from("widget_klasemen").upsert({ ...row, widget_id: widgetId }, { onConflict: "id" })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <button onClick={() => removeRow(i)} className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-destructive">✕</button>
          <div className="grid grid-cols-3 gap-2">
            <FInput label="Grup" value={row.group_label} onChange={v => updateRow(i, "group_label", v)} placeholder="A" />
            <div className="col-span-2"><FInput label="Nama Tim" value={row.team_name} onChange={v => updateRow(i, "team_name", v)} placeholder="Nama Tim" /></div>
            <FInput label="Rank" value={row.rank} onChange={v => updateRow(i, "rank", v)} type="number" />
            <FInput label="Main" value={row.played} onChange={v => updateRow(i, "played", v)} type="number" />
            <FInput label="Menang" value={row.won} onChange={v => updateRow(i, "won", v)} type="number" />
            <FInput label="Seri" value={row.drawn} onChange={v => updateRow(i, "drawn", v)} type="number" />
            <FInput label="Kalah" value={row.lost} onChange={v => updateRow(i, "lost", v)} type="number" />
            <FInput label="GF" value={row.gf} onChange={v => updateRow(i, "gf", v)} type="number" />
            <FInput label="GA" value={row.ga} onChange={v => updateRow(i, "ga", v)} type="number" />
            <FInput label="Poin" value={row.points} onChange={v => updateRow(i, "points", v)} type="number" />
          </div>
        </div>
      ))}
      <button onClick={addRow} className="w-full rounded-lg border border-dashed border-primary/30 py-2 text-xs text-primary/70 hover:border-primary/60 hover:text-primary">
        + Tambah Tim
      </button>
      <button onClick={save} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
      </button>
    </div>
  )
}

// ─── Form: Transfer ───────────────────────────────────────────────────────────

function TransferForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([{
    id: crypto.randomUUID(), league_label: "", player_name: "", player_initials: "",
    position: "", age: "", from_club: "", from_club_color: "#888", to_club: "",
    league_dest: "", transfer_value: "", is_free: false, status: "confirmed", transfer_date: "",
  }])

  useEffect(() => {
    supabase.from("widget_transfer").select("*").eq("widget_id", widgetId).order("transfer_date", { ascending: false })
      .then(({ data }) => { if (data && data.length > 0) setRows(data.map(r => ({ ...r, age: r.age ?? "", transfer_value: r.transfer_value ?? "", is_free: r.is_free ?? false })) as any) })
  }, [widgetId])

  function updateRow(i: number, field: string, value: any) {
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c })
  }
  function addRow() {
    setRows(prev => [...prev, { id: crypto.randomUUID(), league_label: "", player_name: "", player_initials: "", position: "", age: "", from_club: "", from_club_color: "#888", to_club: "", league_dest: "", transfer_value: "", is_free: false, status: "confirmed", transfer_date: "" }])
  }
  async function removeRow(i: number) {
    const row = rows[i] as any
    if (!row._isNew) await supabase.from("widget_transfer").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    for (const row of rows) {
      await supabase.from("widget_transfer").upsert({
        id: row.id, widget_id: widgetId, league_label: row.league_label,
        player_name: row.player_name, player_initials: row.player_initials || row.player_name.slice(0, 2).toUpperCase(),
        position: row.position, age: row.age ? Number(row.age) : null,
        from_club: row.from_club, from_club_color: row.from_club_color,
        to_club: row.to_club, league_dest: row.league_dest,
        transfer_value: row.transfer_value !== "" ? Number(row.transfer_value) : null,
        is_free: (row as any).is_free, status: (row as any).status,
        transfer_date: row.transfer_date || null,
      }, { onConflict: "id" })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <button onClick={() => removeRow(i)} className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-destructive">✕</button>
          <div className="grid grid-cols-2 gap-2">
            <FInput label="Liga" value={row.league_label} onChange={v => updateRow(i, "league_label", v)} placeholder="Premier League" />
            <FInput label="Liga Tujuan" value={row.league_dest} onChange={v => updateRow(i, "league_dest", v)} placeholder="La Liga" />
            <FInput label="Nama Pemain" value={row.player_name} onChange={v => updateRow(i, "player_name", v)} placeholder="Nama Pemain" />
            <FInput label="Inisial" value={row.player_initials} onChange={v => updateRow(i, "player_initials", v)} placeholder="NP" />
            <FInput label="Posisi" value={row.position} onChange={v => updateRow(i, "position", v)} placeholder="ST" />
            <FInput label="Umur" value={row.age} onChange={v => updateRow(i, "age", v)} type="number" placeholder="25" />
            <FInput label="Dari Klub" value={row.from_club} onChange={v => updateRow(i, "from_club", v)} placeholder="Man City" />
            <FInput label="Ke Klub" value={row.to_club} onChange={v => updateRow(i, "to_club", v)} placeholder="Real Madrid" />
            <FInput label="Nilai Transfer (M€)" value={row.transfer_value} onChange={v => updateRow(i, "transfer_value", v)} type="number" placeholder="80" />
            <FInput label="Tanggal" value={row.transfer_date} onChange={v => updateRow(i, "transfer_date", v)} type="date" />
            <FSelect label="Status" value={(row as any).status} onChange={v => updateRow(i, "status", v)}
              options={[{ label: "Confirmed", value: "confirmed" }, { label: "Official", value: "official" }, { label: "Medical", value: "medical" }, { label: "Rumor", value: "rumor" }]} />
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" checked={(row as any).is_free} onChange={e => updateRow(i, "is_free", e.target.checked)} id={`free-${i}`} />
              <label htmlFor={`free-${i}`} className="text-xs text-muted-foreground">Free Transfer</label>
            </div>
          </div>
        </div>
      ))}
      <button onClick={addRow} className="w-full rounded-lg border border-dashed border-primary/30 py-2 text-xs text-primary/70 hover:border-primary/60 hover:text-primary">
        + Tambah Transfer
      </button>
      <button onClick={save} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
      </button>
    </div>
  )
}

// ─── Form: Peluang ────────────────────────────────────────────────────────────

function PeluangForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([{
    id: crypto.randomUUID(), rank: 1, team_name: "", team_flag: "🏳️",
    category: "FAVORIT UTAMA", win_pct: 50, reasons_win: [""], reasons_lose: [""],
  }])

  useEffect(() => {
    supabase.from("widget_peluang").select("*").eq("widget_id", widgetId).order("rank", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) setRows(data.map(r => ({
          ...r,
          reasons_win: Array.isArray(r.reasons_win) ? r.reasons_win : (r.reasons_win ? JSON.parse(r.reasons_win) : [""]),
          reasons_lose: Array.isArray(r.reasons_lose) ? r.reasons_lose : (r.reasons_lose ? JSON.parse(r.reasons_lose) : [""]),
        })) as any)
      })
  }, [widgetId])

  function updateRow(i: number, field: string, value: any) {
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c })
  }
  function addRow() {
    setRows(prev => [...prev, { id: crypto.randomUUID(), rank: prev.length + 1, team_name: "", team_flag: "🏳️", category: "FAVORIT UTAMA", win_pct: 50, reasons_win: [""], reasons_lose: [""] }])
  }
  async function removeRow(i: number) {
    const row = rows[i] as any
    if (!row._isNew) await supabase.from("widget_peluang").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    for (const row of rows) {
      await supabase.from("widget_peluang").upsert({
        id: row.id, widget_id: widgetId, rank: Number(row.rank),
        team_name: row.team_name, team_flag: row.team_flag, category: row.category,
        win_pct: Number(row.win_pct),
        reasons_win: row.reasons_win.filter((r: string) => r.trim()),
        reasons_lose: row.reasons_lose.filter((r: string) => r.trim()),
      }, { onConflict: "id" })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <button onClick={() => removeRow(i)} className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-destructive">✕</button>
          <div className="grid grid-cols-2 gap-2">
            <FInput label="Rank" value={row.rank} onChange={v => updateRow(i, "rank", Number(v))} type="number" />
            <FInput label="Flag (emoji)" value={row.team_flag} onChange={v => updateRow(i, "team_flag", v)} placeholder="🇧🇷" />
            <div className="col-span-2"><FInput label="Nama Tim" value={row.team_name} onChange={v => updateRow(i, "team_name", v)} placeholder="Brasil" /></div>
            <FSelect label="Kategori" value={row.category} onChange={v => updateRow(i, "category", v)}
              options={[{ label: "Favorit Utama", value: "FAVORIT UTAMA" }, { label: "Kandidat Kuat", value: "KANDIDAT KUAT" }, { label: "Dark Horse", value: "DARK HORSE" }, { label: "Pelengkap", value: "PELENGKAP" }]} />
            <FInput label="Peluang Juara (%)" value={row.win_pct} onChange={v => updateRow(i, "win_pct", Number(v))} type="number" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Alasan Bisa Juara</label>
            {row.reasons_win.map((r: string, ri: number) => (
              <div key={ri} className="flex gap-1">
                <input value={r} onChange={e => { const arr = [...row.reasons_win]; arr[ri] = e.target.value; updateRow(i, "reasons_win", arr) }}
                  className="flex-1 rounded border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50" placeholder="Alasan..." />
                <button onClick={() => { const arr = row.reasons_win.filter((_: string, idx: number) => idx !== ri); updateRow(i, "reasons_win", arr.length ? arr : [""]) }} className="text-muted-foreground hover:text-destructive text-xs px-1">✕</button>
              </div>
            ))}
            <button onClick={() => updateRow(i, "reasons_win", [...row.reasons_win, ""])} className="text-[10px] text-primary/60 hover:text-primary">+ Tambah</button>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Alasan Tidak Juara</label>
            {row.reasons_lose.map((r: string, ri: number) => (
              <div key={ri} className="flex gap-1">
                <input value={r} onChange={e => { const arr = [...row.reasons_lose]; arr[ri] = e.target.value; updateRow(i, "reasons_lose", arr) }}
                  className="flex-1 rounded border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50" placeholder="Alasan..." />
                <button onClick={() => { const arr = row.reasons_lose.filter((_: string, idx: number) => idx !== ri); updateRow(i, "reasons_lose", arr.length ? arr : [""]) }} className="text-muted-foreground hover:text-destructive text-xs px-1">✕</button>
              </div>
            ))}
            <button onClick={() => updateRow(i, "reasons_lose", [...row.reasons_lose, ""])} className="text-[10px] text-primary/60 hover:text-primary">+ Tambah</button>
          </div>
        </div>
      ))}
      <button onClick={addRow} className="w-full rounded-lg border border-dashed border-primary/30 py-2 text-xs text-primary/70 hover:border-primary/60 hover:text-primary">
        + Tambah Tim
      </button>
      <button onClick={save} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
      </button>
    </div>
  )
}

// ─── Form: Analisa Taktis ─────────────────────────────────────────────────────

function AnalisaTaktisForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    team_name: "", coach_name: "", formation: "4-3-3",
    play_style: "", main_weapons: [""],
  })

  useEffect(() => {
    supabase.from("widget_analisa_taktis").select("*").eq("widget_id", widgetId).limit(1)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0) {
          const r = rows[0]
          setData({ ...r, main_weapons: Array.isArray(r.main_weapons) ? r.main_weapons : (r.main_weapons ? JSON.parse(r.main_weapons) : [""]) } as any)
        }
      })
  }, [widgetId])

  async function save() {
    setSaving(true)
    await supabase.from("widget_analisa_taktis").upsert({
      id: widgetId, widget_id: widgetId, team_name: data.team_name,
      coach_name: data.coach_name, formation: data.formation,
      play_style: data.play_style,
      main_weapons: data.main_weapons.filter(w => w.trim()),
    }, { onConflict: "id" })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><FInput label="Nama Tim" value={data.team_name} onChange={v => setData(p => ({ ...p, team_name: v }))} placeholder="Brasil" /></div>
        <FInput label="Pelatih" value={data.coach_name} onChange={v => setData(p => ({ ...p, coach_name: v }))} placeholder="Ancelotti" />
        <FInput label="Formasi" value={data.formation} onChange={v => setData(p => ({ ...p, formation: v }))} placeholder="4-3-3" />
        <div className="col-span-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Gaya Bermain</label>
            <textarea value={data.play_style} onChange={e => setData(p => ({ ...p, play_style: e.target.value }))}
              className="rounded border border-border bg-secondary/50 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" rows={3} placeholder="Deskripsi gaya bermain..." />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Senjata Utama</label>
        {data.main_weapons.map((w, wi) => (
          <div key={wi} className="flex gap-1">
            <input value={w} onChange={e => { const arr = [...data.main_weapons]; arr[wi] = e.target.value; setData(p => ({ ...p, main_weapons: arr })) }}
              className="flex-1 rounded border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50" placeholder="Senjata utama..." />
            <button onClick={() => { const arr = data.main_weapons.filter((_, idx) => idx !== wi); setData(p => ({ ...p, main_weapons: arr.length ? arr : [""] })) }} className="text-muted-foreground hover:text-destructive text-xs px-1">✕</button>
          </div>
        ))}
        <button onClick={() => setData(p => ({ ...p, main_weapons: [...p.main_weapons, ""] }))} className="text-[10px] text-primary/60 hover:text-primary">+ Tambah</button>
      </div>
      <button onClick={save} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
      </button>
    </div>
  )
}

// ─── Form: Profil Stadion ─────────────────────────────────────────────────────

function ProfilStadionForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    nama_stadion: "",
    kota: "",
    kapasitas: 0,
    jenis_rumput: "",
    jenis_atap: "",
    negara: "",
    tahun_berdiri: "",
    foto_url: "",
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
    onSaved()
  }

  return (
    <div className="space-y-3">
      <FInput label="Nama Stadion" value={data.nama_stadion}
        onChange={v => setData(p => ({ ...p, nama_stadion: v }))} placeholder="Gelora Bung Karno" />
      <div className="grid grid-cols-2 gap-2">
        <FInput label="Kota" value={data.kota}
          onChange={v => setData(p => ({ ...p, kota: v }))} placeholder="Jakarta" />
        <FInput label="Negara" value={data.negara}
          onChange={v => setData(p => ({ ...p, negara: v }))} placeholder="Indonesia" />
      </div>
      <FInput label="Kapasitas (penonton)" value={data.kapasitas}
        onChange={v => setData(p => ({ ...p, kapasitas: Number(v) }))} type="number" placeholder="77000" />
      <div className="grid grid-cols-2 gap-2">
        <FInput label="Jenis Rumput" value={data.jenis_rumput}
          onChange={v => setData(p => ({ ...p, jenis_rumput: v }))} placeholder="Natural / Sintetis" />
        <FInput label="Jenis Atap" value={data.jenis_atap}
          onChange={v => setData(p => ({ ...p, jenis_atap: v }))} placeholder="Terbuka / Tertutup" />
      </div>
      <FInput label="Tahun Berdiri (opsional)" value={data.tahun_berdiri}
        onChange={v => setData(p => ({ ...p, tahun_berdiri: v }))} type="number" placeholder="1962" />
      <FInput label="URL Foto (opsional)" value={data.foto_url}
        onChange={v => setData(p => ({ ...p, foto_url: v }))} placeholder="https://..." />
      <button onClick={save} disabled={saving}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
      </button>
    </div>
  )
}

// ─── Form: Daftar Pemain Tim ──────────────────────────────────────────────────

function DaftarPemainForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([{
    id: crypto.randomUUID(),
    nomor_punggung: 1,
    nama_pemain: "",
    usia: 0,
    asal_klub: "",
    nilai_pasar: "",
    posisi: "",
  }])



  useEffect(() => {
    supabase.from("widget_daftar_pemain").select("*").eq("widget_id", widgetId)
      .order("nomor_punggung", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) setRows(data.map(r => ({
          id: r.id,
          nomor_punggung: r.nomor_punggung,
          nama_pemain: r.nama_pemain,
          usia: r.usia,
          asal_klub: r.asal_klub,
          nilai_pasar: r.nilai_pasar,
          posisi: r.posisi ?? "",
        })))
      })
  }, [widgetId])

  function updateRow(i: number, field: string, value: any) {
    setRows(prev => { const c = [...prev]; c[i] = { ...c[i], [field]: value }; return c })
  }
  function addRow() {
    setRows(prev => [...prev, {
      id: crypto.randomUUID(), nomor_punggung: prev.length + 1,
      nama_pemain: "", usia: 0, asal_klub: "", nilai_pasar: "", posisi: "",
    }])
  }
  async function removeRow(i: number) {
    const row = rows[i]
    await supabase.from("widget_daftar_pemain").delete().eq("id", row.id)
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    for (const row of rows) {
      await supabase.from("widget_daftar_pemain").upsert({
        id: row.id,
        widget_id: widgetId,
        nomor_punggung: Number(row.nomor_punggung),
        nama_pemain: row.nama_pemain,
        usia: Number(row.usia),
        asal_klub: row.asal_klub,
        nilai_pasar: row.nilai_pasar,
        posisi: row.posisi || null,
      }, { onConflict: "id" })
    }
    setSaving(false)
    onSaved()
  }

  const posisiOptions = [
    { label: "— Pilih Posisi —", value: "" },
    { label: "GK - Kiper", value: "GK" },
    { label: "CB - Bek Tengah", value: "CB" },
    { label: "LB - Bek Kiri", value: "LB" },
    { label: "RB - Bek Kanan", value: "RB" },
    { label: "LWB - Wingback Kiri", value: "LWB" },
    { label: "RWB - Wingback Kanan", value: "RWB" },
    { label: "DM - Gelandang Bertahan", value: "DM" },
    { label: "CM - Gelandang Tengah", value: "CM" },
    { label: "AM - Gelandang Serang", value: "AM" },
    { label: "LW - Sayap Kiri", value: "LW" },
    { label: "RW - Sayap Kanan", value: "RW" },
    { label: "SS - Second Striker", value: "SS" },
    { label: "ST - Striker", value: "ST" },
    { label: "CF - Centre Forward", value: "CF" },
  ]

  return (
    <div className="space-y-3">

      {rows.map((row, i) => (
        <div key={row.id} className="relative rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <button onClick={() => removeRow(i)} className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-destructive">✕</button>
          <div className="grid grid-cols-2 gap-2">
            <FInput label="No. Punggung" value={row.nomor_punggung}
              onChange={v => updateRow(i, "nomor_punggung", Number(v))} type="number" placeholder="10" />
            <FSelect label="Posisi" value={row.posisi}
              onChange={v => updateRow(i, "posisi", v)} options={posisiOptions} />
            <div className="col-span-2">
              <FInput label="Nama Pemain" value={row.nama_pemain}
                onChange={v => updateRow(i, "nama_pemain", v)} placeholder="Lionel Messi" />
            </div>
            <FInput label="Usia" value={row.usia}
              onChange={v => updateRow(i, "usia", Number(v))} type="number" placeholder="25" />
            <FInput label="Asal Klub" value={row.asal_klub}
              onChange={v => updateRow(i, "asal_klub", v)} placeholder="Inter Miami" />
            <div className="col-span-2">
              <FInput label="Nilai Pasar" value={row.nilai_pasar}
                onChange={v => updateRow(i, "nilai_pasar", v)} placeholder="€30M" />
            </div>
          </div>
        </div>
      ))}
      <button onClick={addRow} className="w-full rounded-lg border border-dashed border-primary/30 py-2 text-xs text-primary/70 hover:border-primary/60 hover:text-primary">
        + Tambah Pemain
      </button>
      <button onClick={save} disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
      </button>
    </div>
  )
}

// ─── Form: Pemain Andalan ─────────────────────────────────────────────────────

function PemainAndalanForm({ widgetId, onSaved }: { widgetId: string; onSaved: () => void }) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    nama_pemain: "",
    nomor_punggung: 10,
    posisi: "ST",
    usia: 25,
    tinggi_badan: 175,
    berat_badan: 70,
    kaki_dominan: "Kanan",
    jumlah_pertandingan: 0,
    kontribusi_goal: 0,
    kontribusi_assist: 0,
    menit_bermain: 0,
    rating_performa: 7.0,
    kebangsaan: "",
    foto_url: "",
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
    onSaved()
  }

  const kakiOptions = [
    { label: "Kanan", value: "Kanan" },
    { label: "Kiri", value: "Kiri" },
    { label: "Kedua", value: "Kedua" },
  ]

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-1">Identitas Pemain</p>
      <FInput label="Nama Pemain" value={data.nama_pemain}
        onChange={v => setData(p => ({ ...p, nama_pemain: v }))} placeholder="Erling Haaland" />
      <div className="grid grid-cols-2 gap-2">
        <FInput label="No. Punggung" value={data.nomor_punggung}
          onChange={v => setData(p => ({ ...p, nomor_punggung: Number(v) }))} type="number" />
        <FInput label="Posisi" value={data.posisi}
          onChange={v => setData(p => ({ ...p, posisi: v }))} placeholder="ST" />
        <FInput label="Usia" value={data.usia}
          onChange={v => setData(p => ({ ...p, usia: Number(v) }))} type="number" />
        <FInput label="Kebangsaan (opsional)" value={data.kebangsaan}
          onChange={v => setData(p => ({ ...p, kebangsaan: v }))} placeholder="Norwegia" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-1">Data Fisik</p>
      <div className="grid grid-cols-3 gap-2">
        <FInput label="Tinggi (cm)" value={data.tinggi_badan}
          onChange={v => setData(p => ({ ...p, tinggi_badan: Number(v) }))} type="number" placeholder="194" />
        <FInput label="Berat (kg)" value={data.berat_badan}
          onChange={v => setData(p => ({ ...p, berat_badan: Number(v) }))} type="number" placeholder="88" />
        <FSelect label="Kaki Dominan" value={data.kaki_dominan}
          onChange={v => setData(p => ({ ...p, kaki_dominan: v }))} options={kakiOptions} />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-1">Statistik</p>
      <div className="grid grid-cols-2 gap-2">
        <FInput label="Jumlah Pertandingan" value={data.jumlah_pertandingan}
          onChange={v => setData(p => ({ ...p, jumlah_pertandingan: Number(v) }))} type="number" />
        <FInput label="Menit Bermain" value={data.menit_bermain}
          onChange={v => setData(p => ({ ...p, menit_bermain: Number(v) }))} type="number" />
        <FInput label="Kontribusi Gol" value={data.kontribusi_goal}
          onChange={v => setData(p => ({ ...p, kontribusi_goal: Number(v) }))} type="number" />
        <FInput label="Kontribusi Assist" value={data.kontribusi_assist}
          onChange={v => setData(p => ({ ...p, kontribusi_assist: Number(v) }))} type="number" />
        <div className="col-span-2">
          <FInput label="Rating Performa (0–10)" value={data.rating_performa}
            onChange={v => setData(p => ({ ...p, rating_performa: Number(v) }))} type="number" placeholder="7.5" />
        </div>
      </div>
      <FInput label="URL Foto (opsional)" value={data.foto_url}
        onChange={v => setData(p => ({ ...p, foto_url: v }))} placeholder="https://..." />
      <button onClick={save} disabled={saving}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan & Sisipkan"}
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
    setActiveWidgetId(crypto.randomUUID())
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
          {selectedType === "jadwal" && (
            <JadwalForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "klasemen" && (
            <KlasemenForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "transfer" && (
            <TransferForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "peluang" && (
            <PeluangForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "analisa_taktis" && (
            <AnalisaTaktisForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "profil_stadion" && (
            <ProfilStadionForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "daftar_pemain" && (
            <DaftarPemainForm widgetId={activeWidgetId} onSaved={handleSaved} />
          )}
          {selectedType === "pemain_andalan" && (
            <PemainAndalanForm widgetId={activeWidgetId} onSaved={handleSaved} />
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
