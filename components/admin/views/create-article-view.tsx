"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { Image as TiptapImage } from "@tiptap/extension-image"
import { Link as TiptapLink } from "@tiptap/extension-link"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableCell } from "@tiptap/extension-table-cell"
import {
  ArrowLeft, Save, Image as ImageIcon, X, Plus, Eye,
  Bold, Italic, List, ListOrdered, Link2, Quote,
  Code2, Minus, Heading1, Heading2, Heading3,
  Undo2, Redo2, Table as TableIcon, Star, Trophy,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateArticleViewProps {
  onBack: () => void
  articleId?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 8)
}

// ─── Match Card Widget ────────────────────────────────────────────────────────

interface MatchEntry {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: string   // kosong = belum main, isi angka = sudah/sedang main
  awayScore: string
  date: string
  time: string
  stadium: string
}

interface MatchTab {
  id: string
  label: string
  matches: MatchEntry[]
}

function makeMatch(): MatchEntry {
  return { id: generateId(), homeTeam: "", awayTeam: "", homeScore: "", awayScore: "", date: "", time: "", stadium: "" }
}

function makeMatchTab(index: number): MatchTab {
  return { id: generateId(), label: `Grup ${String.fromCharCode(65 + index)}`, matches: [makeMatch()] }
}

function renderMatchTabHtml(tab: MatchTab): string {
  const hasScore = (m: MatchEntry) => m.homeScore !== "" && m.awayScore !== ""
  const cards = tab.matches.map((m) => `
<div class="match-card">
  <div class="match-card-top">
    <span class="match-card-badge">${tab.label.toUpperCase()}</span>
    <span class="match-card-date">${m.date}</span>
  </div>
  <div class="match-card-teams">
    <span class="match-card-team">${m.homeTeam}</span>
    ${hasScore(m)
      ? `<span class="match-card-score">${m.homeScore} <span class="match-card-score-sep">–</span> ${m.awayScore}</span>`
      : `<span class="match-card-vs">vs</span>`
    }
    <span class="match-card-team">${m.awayTeam}</span>
  </div>
  <div class="match-card-bottom">
    <span class="match-card-time">⏰ ${m.time}</span>
    <span class="match-card-stadium">${m.stadium}</span>
  </div>
</div>`).join("")
  return `<div class="match-card-grid">${cards}</div>`
}

function buildMatchTabbedHtml(tabs: MatchTab[], blockId: string): string {
  const buttons = tabs
    .map((t, i) => `<button class="tbb${i === 0 ? " tbb-active" : ""}" data-tab="${i}">${t.label}</button>`)
    .join("")
  const panels = tabs
    .map((t, i) => `<div class="tbp${i === 0 ? " tbp-active" : ""}" data-panel="${i}">${renderMatchTabHtml(t)}</div>`)
    .join("")
  return (
    `<div class="tabbed-block" data-block-id="${blockId}">` +
    `<div class="tb-nav">${buttons}</div>` +
    `<div class="tb-content">${panels}</div>` +
    `</div>`
  )
}

function MatchCardWidget({ onInsert }: { onInsert: (html: string, blockId: string) => void }) {
  const [tabs, setTabs] = useState<MatchTab[]>([makeMatchTab(0)])
  const [activeTab, setActiveTab] = useState<string>(() => "")

  useEffect(() => {
    if (!activeTab && tabs.length > 0) setActiveTab(tabs[0].id)
  }, [tabs, activeTab])

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0]

  const updateTab = (id: string, patch: Partial<MatchTab>) =>
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const addTab = () => {
    const t = makeMatchTab(tabs.length)
    setTabs((prev) => [...prev, t])
    setActiveTab(t.id)
  }

  const removeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeTab === id && next.length > 0) setActiveTab(next[0].id)
      return next
    })
  }

  const updateMatch = (tabId: string, matchId: string, patch: Partial<MatchEntry>) => {
    setTabs((prev) => prev.map((t) => t.id !== tabId ? t : {
      ...t,
      matches: t.matches.map((m) => m.id === matchId ? { ...m, ...patch } : m),
    }))
  }

  const addMatch = (tabId: string) =>
    setTabs((prev) => prev.map((t) => t.id !== tabId ? t : { ...t, matches: [...t.matches, makeMatch()] }))

  const removeMatch = (tabId: string, matchId: string) =>
    setTabs((prev) => prev.map((t) => t.id !== tabId ? t : {
      ...t, matches: t.matches.filter((m) => m.id !== matchId),
    }))

  const handleInsert = () => {
    const blockId = generateId()
    const validTabs = tabs.filter((t) => t.matches.some((m) => m.homeTeam || m.awayTeam))
    if (!validTabs.length) return
    const html = validTabs.length === 1
      ? `<div class="match-block" data-block-id="${blockId}">${renderMatchTabHtml(validTabs[0])}</div>`
      : buildMatchTabbedHtml(validTabs, blockId)
    onInsert(html, blockId)
  }

  if (!currentTab) return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Jadwal Pertandingan</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">Tab = Grup / Ronde</span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-secondary/20 px-3 py-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              tab.id === activeTab
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            ].join(" ")}
          >
            <input
              value={tab.label}
              onChange={(e) => { e.stopPropagation(); updateTab(tab.id, { label: e.target.value }) }}
              onClick={(e) => e.stopPropagation()}
              className="w-14 bg-transparent text-inherit outline-none text-xs font-semibold"
            />
            {tabs.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); removeTab(tab.id) }}
                className="text-muted-foreground/50 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addTab}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-primary transition-colors">
          <Plus className="h-3 w-3" /> Grup
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto p-3 space-y-2">
        {currentTab.matches.map((match, idx) => (
          <div key={match.id} className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Pertandingan {idx + 1}</span>
              {currentTab.matches.length > 1 && (
                <button onClick={() => removeMatch(currentTab.id, match.id)}
                  className="text-muted-foreground/50 hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={match.homeTeam}
                onChange={(e) => updateMatch(currentTab.id, match.id, { homeTeam: e.target.value })}
                placeholder="Tim Kandang"
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
              <div className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={match.homeScore}
                  onChange={(e) => updateMatch(currentTab.id, match.id, { homeScore: e.target.value })}
                  placeholder="–"
                  className="w-9 rounded border border-border bg-card px-1 py-1 text-center text-xs font-bold text-primary outline-none focus:border-primary"
                />
                <span className="text-[10px] font-bold text-primary">:</span>
                <input
                  type="number"
                  min={0}
                  value={match.awayScore}
                  onChange={(e) => updateMatch(currentTab.id, match.id, { awayScore: e.target.value })}
                  placeholder="–"
                  className="w-9 rounded border border-border bg-card px-1 py-1 text-center text-xs font-bold text-primary outline-none focus:border-primary"
                />
              </div>
              <input
                value={match.awayTeam}
                onChange={(e) => updateMatch(currentTab.id, match.id, { awayTeam: e.target.value })}
                placeholder="Tim Tamu"
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                value={match.date}
                onChange={(e) => updateMatch(currentTab.id, match.id, { date: e.target.value })}
                placeholder="Jumat, 12 Juni 2026"
                className="col-span-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
              <input
                value={match.time}
                onChange={(e) => updateMatch(currentTab.id, match.id, { time: e.target.value })}
                placeholder="02.00 WIB"
                className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
              <input
                value={match.stadium}
                onChange={(e) => updateMatch(currentTab.id, match.id, { stadium: e.target.value })}
                placeholder="Nama Stadion"
                className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
            </div>
          </div>
        ))}
        <button
          onClick={() => addMatch(currentTab.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
          <Plus className="h-3.5 w-3.5" /> Tambah Pertandingan
        </button>
      </div>

      <div className="border-t border-border px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {tabs.length > 1 ? `${tabs.length} grup · tab interaktif` : "1 grup · tanpa tab"}
        </span>
        <button
          onClick={handleInsert}
          className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
          <TableIcon className="h-3.5 w-3.5" />
          Insert ke Artikel
        </button>
      </div>
    </div>
  )
}

// ─── Group Standings Widget ───────────────────────────────────────────────────

interface StandingsTeamEntry {
  id: string
  code: string      // kode negara 2 huruf, e.g. "MX"
  name: string      // nama tim
  played: number
  won: number
  drawn: number
  lost: number
  gf: number        // gol masuk
  ga: number        // gol kebobolan
  pts: number
  form: string[]    // array "W"/"D"/"L" max 3
}

interface StandingsGroup {
  id: string
  label: string     // e.g. "Grup A"
  teams: StandingsTeamEntry[]
}

function makeTeam(): StandingsTeamEntry {
  return {
    id: generateId(), code: "", name: "",
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0,
    form: [],
  }
}

function makeStandingsGroup(index: number): StandingsGroup {
  return {
    id: generateId(),
    label: `Grup ${String.fromCharCode(65 + index)}`,
    teams: [makeTeam(), makeTeam(), makeTeam(), makeTeam()],
  }
}

/** Hitung SG (selisih gol) */
function calcSG(team: StandingsTeamEntry): number {
  return team.gf - team.ga
}

/** Sort tim dalam grup: pts desc → SG desc → GF desc */
function sortedTeams(teams: StandingsTeamEntry[]): StandingsTeamEntry[] {
  return [...teams].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (calcSG(b) !== calcSG(a)) return calcSG(b) - calcSG(a)
    return b.gf - a.gf
  })
}

/** Render satu grup sebagai tabel HTML */
function renderGroupTableHtml(group: StandingsGroup): string {
  const sorted = sortedTeams(group.teams)
  const rows = sorted.map((t, i) => {
    const sg = calcSG(t)
    const sgStr = sg > 0 ? `+${sg}` : `${sg}`
    const rankClass = i < 2 ? "gs-rank-qualify" : i === 2 ? "gs-rank-candidate" : "gs-rank-out"
    const formBadges = (t.form || []).map((r) => {
      const cls = r === "W" ? "gs-form-w" : r === "D" ? "gs-form-d" : "gs-form-l"
      return `<span class="gs-form-badge ${cls}">${r}</span>`
    }).join("")
    return `<tr class="gs-row">
  <td class="gs-td gs-td-rank"><span class="gs-rank ${rankClass}">${i + 1}</span></td>
  <td class="gs-td gs-td-team">
    <span class="gs-flag">${t.code.toUpperCase()}</span>
    <span class="gs-team-name">${t.name || "—"}</span>
  </td>
  <td class="gs-td gs-td-num">${t.played}</td>
  <td class="gs-td gs-td-num">${t.won}</td>
  <td class="gs-td gs-td-num">${t.drawn}</td>
  <td class="gs-td gs-td-num">${t.lost}</td>
  <td class="gs-td gs-td-num">${t.gf}</td>
  <td class="gs-td gs-td-num">${t.ga}</td>
  <td class="gs-td gs-td-num">${sgStr}</td>
  <td class="gs-td gs-td-pts">${t.pts}</td>
  <td class="gs-td gs-td-form"><div class="gs-form">${formBadges}</div></td>
</tr>`
  }).join("")

  return `<div class="gs-table-wrap">
  <table class="gs-table">
    <thead>
      <tr class="gs-thead-row">
        <th class="gs-th gs-th-rank">#</th>
        <th class="gs-th gs-th-team">TIM</th>
        <th class="gs-th gs-th-num">M</th>
        <th class="gs-th gs-th-num">W</th>
        <th class="gs-th gs-th-num">S</th>
        <th class="gs-th gs-th-num">K</th>
        <th class="gs-th gs-th-num">GM</th>
        <th class="gs-th gs-th-num">GK</th>
        <th class="gs-th gs-th-num">SG</th>
        <th class="gs-th gs-th-pts">PTS</th>
        <th class="gs-th gs-th-form">FORM</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="gs-legend">
    <span class="gs-legend-item gs-legend-qualify">● Lolos (Juara/Runner-up)</span>
    <span class="gs-legend-item gs-legend-candidate">● Kandidat Peringkat 3</span>
  </div>
</div>`
}

/** Bungkus semua grup dalam tabbed block HTML */
function buildGroupStandingsHtml(groups: StandingsGroup[], blockId: string, title: string): string {
  const buttons = groups
    .map((g, i) => `<button class="tbb${i === 0 ? " tbb-active" : ""}" data-tab="${i}">${g.label}</button>`)
    .join("")
  const panels = groups
    .map((g, i) => `<div class="tbp${i === 0 ? " tbp-active" : ""}" data-panel="${i}">${renderGroupTableHtml(g)}</div>`)
    .join("")
  return (
    `<div class="group-standings-block tabbed-block" data-block-id="${blockId}">` +
    `<div class="gs-header"><span class="gs-header-icon">🏆</span><span class="gs-header-title">${title}</span><span class="gs-header-sub">Klasemen Sementara</span></div>` +
    `<div class="tb-nav">${buttons}</div>` +
    `<div class="tb-content">${panels}</div>` +
    `</div>`
  )
}

function GroupStandingsWidget({ onInsert }: { onInsert: (html: string, blockId: string) => void }) {
  const [title, setTitle] = useState("Klasemen Fase Grup")
  const [groups, setGroups] = useState<StandingsGroup[]>([makeStandingsGroup(0)])
  const [activeGroup, setActiveGroup] = useState<string>(() => "")
  const [activeTeamIdx, setActiveTeamIdx] = useState<number>(0)

  useEffect(() => {
    if (!activeGroup && groups.length > 0) setActiveGroup(groups[0].id)
  }, [groups, activeGroup])

  const currentGroup = groups.find((g) => g.id === activeGroup) ?? groups[0]

  const addGroup = () => {
    const g = makeStandingsGroup(groups.length)
    setGroups((prev) => [...prev, g])
    setActiveGroup(g.id)
    setActiveTeamIdx(0)
  }

  const removeGroup = (id: string) => {
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id)
      if (activeGroup === id && next.length > 0) setActiveGroup(next[0].id)
      return next
    })
  }

  const updateGroupLabel = (id: string, label: string) =>
    setGroups((prev) => prev.map((g) => g.id === id ? { ...g, label } : g))

  const updateTeam = (groupId: string, teamId: string, patch: Partial<StandingsTeamEntry>) => {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g,
      teams: g.teams.map((t) => t.id !== teamId ? t : { ...t, ...patch }),
    }))
  }

  const addTeam = (groupId: string) => {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, teams: [...g.teams, makeTeam()],
    }))
  }

  const removeTeam = (groupId: string, teamId: string) => {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, teams: g.teams.filter((t) => t.id !== teamId),
    }))
  }

  const handleInsert = () => {
    const blockId = generateId()
    const validGroups = groups.filter((g) => g.teams.some((t) => t.name))
    if (!validGroups.length) return
    const html = buildGroupStandingsHtml(validGroups, blockId, title)
    onInsert(html, blockId)
  }

  if (!currentGroup) return null

  const numField = (val: number, onChange: (n: number) => void, label: string) => (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{label}</span>
      <input
        type="number"
        min={0}
        value={val}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-10 rounded border border-border bg-card px-1 py-0.5 text-center text-xs text-foreground outline-none focus:border-primary"
      />
    </div>
  )

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Klasemen Fase Grup</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">Tab = Grup</span>
      </div>

      {/* Title input */}
      <div className="border-b border-border bg-secondary/10 px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul klasemen, e.g. Klasemen Fase Grup Piala Dunia 2026"
          className="w-full bg-transparent text-xs font-medium text-foreground placeholder:text-muted-foreground/40 outline-none"
        />
      </div>

      {/* Group tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-secondary/20 px-3 py-2">
        {groups.map((grp) => (
          <div
            key={grp.id}
            onClick={() => { setActiveGroup(grp.id); setActiveTeamIdx(0) }}
            className={[
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              grp.id === activeGroup
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            ].join(" ")}
          >
            <input
              value={grp.label}
              onChange={(e) => { e.stopPropagation(); updateGroupLabel(grp.id, e.target.value) }}
              onClick={(e) => e.stopPropagation()}
              className="w-14 bg-transparent text-inherit outline-none text-xs font-semibold"
            />
            {groups.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); removeGroup(grp.id) }}
                className="text-muted-foreground/50 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addGroup}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-primary transition-colors">
          <Plus className="h-3 w-3" /> Grup
        </button>
      </div>

      {/* Team list for active group */}
      <div className="max-h-80 overflow-y-auto p-3 space-y-2">
        {currentGroup.teams.map((team, idx) => (
          <div
            key={team.id}
            className={[
              "rounded-lg border bg-secondary/10 p-3 space-y-2 cursor-pointer transition-colors",
              activeTeamIdx === idx ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80",
            ].join(" ")}
            onClick={() => setActiveTeamIdx(idx)}
          >
            {/* Team header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={[
                  "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                  idx < 2 ? "bg-primary/20 text-primary" : idx === 2 ? "bg-yellow-500/20 text-yellow-400" : "text-muted-foreground",
                ].join(" ")}>{idx + 1}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tim {idx + 1}</span>
              </div>
              {currentGroup.teams.length > 2 && (
                <button onClick={(e) => { e.stopPropagation(); removeTeam(currentGroup.id, team.id) }}
                  className="text-muted-foreground/50 hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Name & code */}
            <div className="flex items-center gap-1.5">
              <input
                value={team.code}
                onChange={(e) => updateTeam(currentGroup.id, team.id, { code: e.target.value.toUpperCase().slice(0, 3) })}
                placeholder="MX"
                className="w-10 rounded border border-border bg-card px-1.5 py-1 text-center text-xs font-bold text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary uppercase"
              />
              <input
                value={team.name}
                onChange={(e) => updateTeam(currentGroup.id, team.id, { name: e.target.value })}
                placeholder="Nama Tim (e.g. Meksiko)"
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary"
              />
            </div>

            {/* Stats row */}
            <div className="flex items-end gap-2 flex-wrap">
              {numField(team.played, (n) => updateTeam(currentGroup.id, team.id, { played: n }), "M")}
              {numField(team.won, (n) => updateTeam(currentGroup.id, team.id, { won: n }), "W")}
              {numField(team.drawn, (n) => updateTeam(currentGroup.id, team.id, { drawn: n }), "S")}
              {numField(team.lost, (n) => updateTeam(currentGroup.id, team.id, { lost: n }), "K")}
              {numField(team.gf, (n) => updateTeam(currentGroup.id, team.id, { gf: n }), "GM")}
              {numField(team.ga, (n) => updateTeam(currentGroup.id, team.id, { ga: n }), "GK")}
              {numField(team.pts, (n) => updateTeam(currentGroup.id, team.id, { pts: n }), "PTS")}
              {/* Form badges */}
              <div className="flex flex-col items-start gap-0.5 ml-1">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60">FORM</span>
                <div className="flex gap-0.5">
                  {["W", "D", "L"].map((r) => (
                    <button
                      key={r}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (team.form.length >= 3) return
                        updateTeam(currentGroup.id, team.id, { form: [...team.form, r] })
                      }}
                      className={[
                        "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold border transition-colors",
                        r === "W" ? "border-green-500/40 text-green-400 hover:bg-green-500/20" :
                        r === "D" ? "border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/20" :
                                    "border-destructive/40 text-destructive hover:bg-destructive/20",
                      ].join(" ")}
                    >{r}</button>
                  ))}
                  {team.form.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); updateTeam(currentGroup.id, team.id, { form: team.form.slice(0, -1) }) }}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-muted-foreground hover:text-destructive border border-border"
                    >✕</button>
                  )}
                </div>
                <div className="flex gap-0.5 mt-0.5">
                  {team.form.map((r, fi) => (
                    <span key={fi} className={[
                      "flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold",
                      r === "W" ? "bg-green-500/20 text-green-400" :
                      r === "D" ? "bg-yellow-500/20 text-yellow-400" :
                                  "bg-destructive/20 text-destructive",
                    ].join(" ")}>{r}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={() => addTeam(currentGroup.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
          <Plus className="h-3.5 w-3.5" /> Tambah Tim
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {groups.length} grup · {groups.reduce((s, g) => s + g.teams.length, 0)} tim total
        </span>
        <button
          onClick={handleInsert}
          className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors">
          <Trophy className="h-3.5 w-3.5" />
          Insert ke Artikel
        </button>
      </div>
    </div>
  )
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarButton({
  onClick, active, title, disabled, children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-7 min-w-[1.75rem] items-center justify-center rounded px-1.5 text-sm transition-all duration-100",
        "disabled:pointer-events-none disabled:opacity-30",
        active
          ? [
              "text-[#39FF14] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]",
              "bg-[#39FF14]/15 ring-1 ring-[#39FF14]/50",
              "translate-y-px",
            ].join(" ")
          : "text-muted-foreground hover:bg-secondary hover:text-foreground active:translate-y-px active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]",
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function ToolbarSeparator() {
  return <div className="mx-1 h-4 w-px bg-border" aria-hidden />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CreateArticleView({ onBack, articleId }: CreateArticleViewProps) {
  const isEditMode = !!articleId
  const supabase   = createClient()

  const [title,           setTitle]           = useState("")
  const [category,        setCategory]        = useState("")
  const [excerpt,         setExcerpt]         = useState("")
  const [metaTitle,       setMetaTitle]       = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [categories,      setCategories]      = useState<{ id: string; name: string }[]>([])
  const [isLoading,       setIsLoading]       = useState(false)
  const [isFetching,      setIsFetching]      = useState(isEditMode)
  const [message,         setMessage]         = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [isEditorChoice, setIsEditorChoice] = useState(false)

  // ── Link Dialog ─────────────────────────────────────────────────────────────
  const [linkDialogOpen,  setLinkDialogOpen]  = useState(false)
  const [linkText,        setLinkText]        = useState("")
  const [linkUrl,         setLinkUrl]         = useState("https://")

  const [featuredImagePreview, setFeaturedImagePreview] = useState<string | null>(null)
  const [featuredImageUrl,     setFeaturedImageUrl]     = useState<string | null>(null)
  const featuredImageRef = useRef<HTMLInputElement>(null)

  const [tags,           setTags]           = useState<string[]>([])
  const [tagInput,       setTagInput]       = useState("")
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [allTags,        setAllTags]        = useState<{ id: string; name: string; slug: string }[]>([])
  const [showSuggestions,setShowSuggestions]= useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const [editorTab,   setEditorTab]   = useState<"write" | "preview">("write")
  const [previewHtml, setPreviewHtml] = useState("")
  const cardMapRef = useRef<Map<string, string>>(new Map())

  // ── Tiptap editor ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TiptapImage,
      TiptapLink.configure({ openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    editorProps: {
      attributes: {
        class: [
          "min-h-[540px] focus:outline-none",
          "prose prose-invert prose-lg max-w-none",
          "prose-headings:text-foreground prose-headings:font-semibold",
          "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
          "prose-p:text-foreground/90 prose-p:leading-[1.8]",
          "prose-a:text-[#39FF14] prose-a:no-underline hover:prose-a:underline prose-a:font-semibold",
          "prose-strong:text-foreground",
          "prose-blockquote:border-l-primary prose-blockquote:text-foreground/70 prose-blockquote:italic",
          "prose-code:bg-secondary prose-code:text-primary prose-code:rounded prose-code:px-1",
          "prose-ul:text-foreground/90 prose-ol:text-foreground/90",
          "prose-hr:border-border",
          "prose-img:rounded-lg",
          // ── match-card styles (agar widget jadwal terlihat visual di editor) ──
          "[&_.match-block]:my-4 [&_.match-block]:pointer-events-none",
          "[&_.match-card-grid]:grid [&_.match-card-grid]:gap-3 [&_.match-card-grid]:my-3 [&_.match-card-grid]:grid-cols-1",
          "[&_.match-card]:rounded-xl [&_.match-card]:border [&_.match-card]:border-border [&_.match-card]:bg-secondary/30 [&_.match-card]:p-3 [&_.match-card]:flex [&_.match-card]:flex-col [&_.match-card]:gap-2",
          "[&_.match-card-top]:flex [&_.match-card-top]:items-center [&_.match-card-top]:justify-between",
          "[&_.match-card-badge]:rounded-full [&_.match-card-badge]:bg-primary [&_.match-card-badge]:text-[10px] [&_.match-card-badge]:font-extrabold [&_.match-card-badge]:tracking-wide [&_.match-card-badge]:text-black [&_.match-card-badge]:px-2 [&_.match-card-badge]:py-0.5",
          "[&_.match-card-date]:text-xs [&_.match-card-date]:text-muted-foreground",
          "[&_.match-card-teams]:flex [&_.match-card-teams]:items-center [&_.match-card-teams]:gap-2",
          "[&_.match-card-team]:text-sm [&_.match-card-team]:font-bold [&_.match-card-team]:text-foreground",
          "[&_.match-card-vs]:text-xs [&_.match-card-vs]:font-bold [&_.match-card-vs]:text-primary",
          "[&_.match-card-score]:flex [&_.match-card-score]:items-center [&_.match-card-score]:gap-1 [&_.match-card-score]:rounded-md [&_.match-card-score]:bg-primary/10 [&_.match-card-score]:px-2 [&_.match-card-score]:py-0.5 [&_.match-card-score]:text-sm [&_.match-card-score]:font-extrabold [&_.match-card-score]:text-primary",
          "[&_.match-card-score-sep]:text-muted-foreground [&_.match-card-score-sep]:font-normal",
          "[&_.match-card-bottom]:flex [&_.match-card-bottom]:items-center [&_.match-card-bottom]:justify-between [&_.match-card-bottom]:flex-wrap [&_.match-card-bottom]:gap-1",
          "[&_.match-card-time]:rounded [&_.match-card-time]:border [&_.match-card-time]:border-border [&_.match-card-time]:bg-black/30 [&_.match-card-time]:px-1.5 [&_.match-card-time]:py-0.5 [&_.match-card-time]:text-xs [&_.match-card-time]:font-bold [&_.match-card-time]:text-foreground",
          "[&_.match-card-stadium]:text-xs [&_.match-card-stadium]:text-muted-foreground",
          // ── tabbed-block styles ──
          "[&_.tabbed-block]:rounded-xl [&_.tabbed-block]:border [&_.tabbed-block]:border-primary/40 [&_.tabbed-block]:overflow-hidden [&_.tabbed-block]:my-4 [&_.tabbed-block]:pointer-events-none",
          "[&_.tb-nav]:flex [&_.tb-nav]:flex-wrap [&_.tb-nav]:gap-1 [&_.tb-nav]:p-2 [&_.tb-nav]:bg-secondary/40 [&_.tb-nav]:border-b [&_.tb-nav]:border-border",
          "[&_.tbb]:rounded-md [&_.tbb]:px-2.5 [&_.tbb]:py-1 [&_.tbb]:text-xs [&_.tbb]:font-semibold [&_.tbb]:border [&_.tbb]:border-border [&_.tbb]:bg-secondary [&_.tbb]:text-muted-foreground",
          "[&_.tbb-active]:bg-primary [&_.tbb-active]:border-primary [&_.tbb-active]:text-black",
          "[&_.tb-content]:p-3 [&_.tb-content]:bg-card",
          "[&_.tbp]:hidden",
          "[&_.tbp-active]:block",
          // ── group standings styles ──
          "[&_.group-standings-block]:my-4 [&_.group-standings-block]:pointer-events-none",
          "[&_.gs-header]:flex [&_.gs-header]:items-center [&_.gs-header]:gap-2 [&_.gs-header]:px-3 [&_.gs-header]:py-2.5 [&_.gs-header]:border-b [&_.gs-header]:border-border [&_.gs-header]:bg-secondary/20",
          "[&_.gs-header-icon]:text-base",
          "[&_.gs-header-title]:font-bold [&_.gs-header-title]:text-foreground [&_.gs-header-title]:text-xs [&_.gs-header-title]:flex-1",
          "[&_.gs-header-sub]:text-xs [&_.gs-header-sub]:text-muted-foreground",
          "[&_.gs-table-wrap]:overflow-x-auto",
          "[&_.gs-table]:w-full [&_.gs-table]:text-xs [&_.gs-table]:border-collapse",
          "[&_.gs-thead-row]:border-b [&_.gs-thead-row]:border-border",
          "[&_.gs-th]:px-1.5 [&_.gs-th]:py-2 [&_.gs-th]:text-[10px] [&_.gs-th]:font-bold [&_.gs-th]:uppercase [&_.gs-th]:tracking-wider [&_.gs-th]:text-muted-foreground",
          "[&_.gs-th-rank]:text-left [&_.gs-th-rank]:pl-2",
          "[&_.gs-th-team]:text-left",
          "[&_.gs-th-num]:text-center",
          "[&_.gs-th-pts]:text-center [&_.gs-th-pts]:text-primary",
          "[&_.gs-th-form]:text-center",
          "[&_.gs-row]:border-b [&_.gs-row]:border-border/40",
          "[&_.gs-td]:px-1.5 [&_.gs-td]:py-1.5",
          "[&_.gs-td-rank]:pl-2",
          "[&_.gs-td-num]:text-center [&_.gs-td-num]:text-muted-foreground",
          "[&_.gs-td-pts]:text-center [&_.gs-td-pts]:font-bold [&_.gs-td-pts]:text-foreground",
          "[&_.gs-td-form]:text-center",
          "[&_.gs-td-team]:min-w-[100px]",
          "[&_.gs-rank]:flex [&_.gs-rank]:h-4 [&_.gs-rank]:w-4 [&_.gs-rank]:items-center [&_.gs-rank]:justify-center [&_.gs-rank]:rounded [&_.gs-rank]:text-[10px] [&_.gs-rank]:font-bold",
          "[&_.gs-rank-qualify]:bg-primary/20 [&_.gs-rank-qualify]:text-primary",
          "[&_.gs-rank-candidate]:bg-yellow-500/20 [&_.gs-rank-candidate]:text-yellow-400",
          "[&_.gs-rank-out]:text-muted-foreground",
          "[&_.gs-flag]:inline-flex [&_.gs-flag]:items-center [&_.gs-flag]:justify-center [&_.gs-flag]:rounded [&_.gs-flag]:bg-secondary [&_.gs-flag]:px-1 [&_.gs-flag]:text-[9px] [&_.gs-flag]:font-bold [&_.gs-flag]:text-muted-foreground [&_.gs-flag]:mr-1 [&_.gs-flag]:shrink-0",
          "[&_.gs-team-name]:font-medium [&_.gs-team-name]:text-foreground",
          "[&_.gs-form]:flex [&_.gs-form]:gap-0.5 [&_.gs-form]:justify-center",
          "[&_.gs-form-badge]:flex [&_.gs-form-badge]:h-3.5 [&_.gs-form-badge]:w-3.5 [&_.gs-form-badge]:items-center [&_.gs-form-badge]:justify-center [&_.gs-form-badge]:rounded-full [&_.gs-form-badge]:text-[8px] [&_.gs-form-badge]:font-bold",
          "[&_.gs-form-w]:bg-green-500/20 [&_.gs-form-w]:text-green-400",
          "[&_.gs-form-d]:bg-yellow-500/20 [&_.gs-form-d]:text-yellow-400",
          "[&_.gs-form-l]:bg-destructive/20 [&_.gs-form-l]:text-destructive",
          "[&_.gs-legend]:flex [&_.gs-legend]:gap-3 [&_.gs-legend]:px-2 [&_.gs-legend]:py-1.5 [&_.gs-legend]:border-t [&_.gs-legend]:border-border/40",
          "[&_.gs-legend-item]:text-[10px] [&_.gs-legend-item]:text-muted-foreground",
          "[&_.gs-legend-qualify]:text-primary",
          "[&_.gs-legend-candidate]:text-yellow-400",
        ].join(" "),
      },
    },
    content: "",
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const node = (e as CustomEvent<object>).detail
      if (editor && node) {
        editor.chain().focus().insertContent(node).run()
      }
    }
    window.addEventListener("insert-table-node", handler)
    return () => window.removeEventListener("insert-table-node", handler)
  }, [editor])

  useEffect(() => {
    const handler = (e: Event) => {
      const cardId = (e as CustomEvent<string>).detail
      if (!editor || !cardId) return
      const html = cardMapRef.current.get(cardId)
      if (!html) return
      // Insert HTML card langsung ke editor agar tampil visual
      editor.chain().focus().insertContent(html).run()
    }
    window.addEventListener("insert-card-placeholder", handler)
    return () => window.removeEventListener("insert-card-placeholder", handler)
  }, [editor])

  useEffect(() => {
    async function fetchMeta() {
      const [catRes, tagRes] = await Promise.all([
        supabase.from("categories").select("*").order("name"),
        supabase.from("tags").select("*").order("name"),
      ])
      if (catRes.data) setCategories(catRes.data)
      if (tagRes.data)  setAllTags(tagRes.data)
    }
    fetchMeta()
  }, [])

  useEffect(() => {
    if (!articleId || !editor) return
    async function fetchArticle() {
      setIsFetching(true)
      const { data } = await supabase.from("articles").select("*").eq("id", articleId).single()
      if (data) {
        setTitle(data.title || "")
        setExcerpt(data.excerpt || "")
        setCategory(data.category_id || "")
        setFeaturedImageUrl(data.featured_image_url || null)
        setFeaturedImagePreview(data.featured_image_url || null)
        setMetaTitle(data.meta_title || "")
        setMetaDescription(data.meta_description || "")
        setIsEditorChoice(data.is_editor_choice || false)
        const raw = data.content || ""

        // Langsung set konten HTML ke editor — card widget akan tampil visual
        // karena editorProps sudah punya CSS yang sesuai
        editor.commands.setContent(raw || "")
      }
      const { data: articleTags } = await supabase
        .from("article_tags").select("tags(name)").eq("article_id", articleId)
      if (articleTags) {
        setTags(articleTags.map((at: any) => at.tags?.name).filter(Boolean))
      }
      setIsFetching(false)
    }
    fetchArticle()
  }, [articleId, editor])

  useEffect(() => {
    if (!tagInput.trim()) { setTagSuggestions([]); setShowSuggestions(false); return }
    const filtered = allTags
      .map((t) => t.name)
      .filter((name) => name.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(name))
    setTagSuggestions(filtered)
    setShowSuggestions(true)
  }, [tagInput, allTags, tags])

  const addTag    = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || tags.includes(trimmed)) return
    setTags((prev) => [...prev, trimmed])
    setTagInput(""); setShowSuggestions(false)
    tagInputRef.current?.focus()
  }
  const removeTag = (name: string) => setTags((prev) => prev.filter((t) => t !== name))
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput) }
    else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) removeTag(tags[tags.length - 1])
  }

  const resolveCards = (html: string): string => {
    // Tidak ada lagi [[CARD:xxx]] placeholder — editor menyimpan HTML card langsung
    // Fungsi ini tetap ada untuk kompatibilitas jika ada konten lama dengan placeholder
    return html.replace(/\[\[CARD:([a-z0-9]+)\]\]/g, (_, id) => {
      return cardMapRef.current.get(id) ?? ""
    })
  }

  useEffect(() => {
    if (editorTab !== "preview" || !editor) return
    const raw = editor.getHTML()
    // Preserve empty paragraphs as visible spacing in preview
    // resolveCards juga tetap dijalankan untuk kompatibilitas konten lama dengan [[CARD:xxx]]
    const withSpacing = raw.replace(/<p><\/p>/g, "<p>&nbsp;</p>")
    setPreviewHtml(resolveCards(withSpacing))
  }, [editorTab, editor])

  const handleFeaturedImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setFeaturedImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    const fileExt  = file.name.split(".").pop()
    const fileName = `featured-${Date.now()}.${fileExt}`
    const { data, error } = await supabase.storage.from("media").upload(fileName, file, { upsert: true })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName)
      setFeaturedImageUrl(urlData.publicUrl)
    }
  }

  const handleInsertImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt("URL gambar:", "https://"); if (!url || url === "https://") return
    const alt = window.prompt("Alt text:", "") || ""
    editor.chain().focus().setImage({ src: url, alt }).run()
  }, [editor])

  const handleInsertLink = useCallback(() => {
    if (!editor) return
    const selectedText = editor.state.doc.cut(
      editor.state.selection.from,
      editor.state.selection.to,
    ).textContent
    setLinkText(selectedText || "")
    setLinkUrl("https://")
    setLinkDialogOpen(true)
  }, [editor])

  const handleConfirmLink = useCallback(() => {
    if (!editor) return
    const url   = linkUrl.trim()
    const label = linkText.trim()
    if (!url || url === "https://") { setLinkDialogOpen(false); return }

    if (label) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
        .run()
    } else {
      editor.chain().focus().setLink({ href: url, target: "_blank" }).run()
    }
    setLinkDialogOpen(false)
    setLinkText("")
    setLinkUrl("https://")
  }, [editor, linkUrl, linkText])

  const handleInsertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  const generateSlug = (text: string) =>
    text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

  const syncTags = async (artId: string) => {
    const tagIds: string[] = []
    for (const tagName of tags) {
      const slug = generateSlug(tagName)
      const { data: existing } = await supabase.from("tags").select("id").eq("slug", slug).single()
      if (existing) { tagIds.push(existing.id); continue }
      const { data: newTag } = await supabase.from("tags").insert({ name: tagName, slug }).select("id").single()
      if (newTag) tagIds.push(newTag.id)
    }
    await supabase.from("article_tags").delete().eq("article_id", artId)
    if (tagIds.length > 0) {
      await supabase.from("article_tags").insert(tagIds.map((tag_id) => ({ article_id: artId, tag_id })))
    }
  }

  const handleSave = async (publish: boolean) => {
    if (!title) { setMessage({ type: "error", text: "Judul artikel wajib diisi!" }); return }
    if (!editor) return
    setIsLoading(true); setMessage(null)

    const htmlContent = resolveCards(editor.getHTML())
    const payload = {
      title, slug: generateSlug(title), excerpt, content: htmlContent,
      category_id: category || null, featured_image_url: featuredImageUrl,
      meta_title: metaTitle || null, meta_description: metaDescription || null,
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
      is_editor_choice: isEditorChoice,
    }

    let savedArticleId = articleId
    if (isEditMode) {
      const { error } = await supabase.from("articles").update(payload).eq("id", articleId)
      if (error) { setIsLoading(false); setMessage({ type: "error", text: error.message }); return }
    } else {
      const { data: inserted, error } = await supabase.from("articles").insert(payload).select("id").single()
      if (error || !inserted) { setIsLoading(false); setMessage({ type: "error", text: error?.message || "Gagal menyimpan" }); return }
      savedArticleId = inserted.id
    }

    if (savedArticleId) await syncTags(savedArticleId)
    setIsLoading(false)
    setMessage({
      type: "success",
      text: publish
        ? isEditMode ? "Artikel diupdate & dipublish!" : "Artikel berhasil dipublish!"
        : isEditMode ? "Draft diupdate!" : "Draft disimpan!",
    })
    if (publish) setTimeout(onBack, 1500)
  }

  if (isFetching) {
    return (
      <div className="flex h-full items-center justify-center py-24 text-muted-foreground">
        Memuat artikel...
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="p-6">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Posts
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={isLoading}
            className="border-border text-foreground hover:border-primary hover:text-primary"
          >
            {isLoading ? "Menyimpan..." : isEditMode ? "Update Draft" : "Simpan Draft"}
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? "Menyimpan..." : isEditMode ? "Update & Publish" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={[
          "mb-6 rounded-lg px-4 py-3 text-sm",
          message.type === "success" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
        ].join(" ")}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Kolom utama: editor ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Title & Excerpt */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Judul Artikel
              </label>
              <input
                placeholder="Tulis judul yang menarik..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={[
                  "w-full rounded-md border border-border bg-secondary/50 px-3 py-2.5",
                  "text-xl font-semibold text-foreground placeholder:text-muted-foreground/40",
                  "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors",
                ].join(" ")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Excerpt
              </label>
              <textarea
                placeholder="Ringkasan singkat (untuk SEO dan preview)..."
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                className={[
                  "w-full resize-none rounded-md border border-border bg-secondary/50 px-3 py-2.5",
                  "text-sm text-foreground placeholder:text-muted-foreground/40 leading-relaxed",
                  "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors",
                ].join(" ")}
              />
            </div>
          </div>

          {/* ── Editor Card ── */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">

            {/* Tab bar */}
            <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
              <div className="flex gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setEditorTab("write")}
                  className={[
                    "rounded px-3 py-1.5 font-medium transition-colors",
                    editorTab === "write"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  ✏️ Tulis
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab("preview")}
                  className={[
                    "flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors",
                    editorTab === "preview"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>
              </div>
              <span className="font-mono text-xs text-muted-foreground/50 tracking-tight">Markdown + HTML</span>
            </div>

            {editorTab === "write" ? (
              <>
                {/* ── Toolbar ── */}
                <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-secondary/20 px-3 py-2">

                  <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={editor?.isActive("heading", { level: 1 })} title="Heading 1">
                    <Heading1 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} title="Heading 2">
                    <Heading2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive("heading", { level: 3 })} title="Heading 3">
                    <Heading3 className="h-4 w-4" />
                  </ToolbarButton>

                  <ToolbarSeparator />

                  <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold (Ctrl+B)">
                    <Bold className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic (Ctrl+I)">
                    <Italic className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleCode().run()} active={editor?.isActive("code")} title="Inline Code">
                    <Code2 className="h-4 w-4" />
                  </ToolbarButton>

                  <ToolbarSeparator />

                  <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullet List">
                    <List className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} title="Ordered List">
                    <ListOrdered className="h-4 w-4" />
                  </ToolbarButton>

                  <ToolbarSeparator />

                  <ToolbarButton onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive("blockquote")} title="Blockquote">
                    <Quote className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Garis Pemisah">
                    <Minus className="h-4 w-4" />
                  </ToolbarButton>

                  <ToolbarSeparator />

                  <ToolbarButton onClick={handleInsertLink} active={editor?.isActive("link")} title="Sisipkan Link">
                    <Link2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={handleInsertImage} title="Sisipkan Gambar">
                    <ImageIcon className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={handleInsertTable} title="Sisipkan Tabel">
                    <TableIcon className="h-4 w-4" />
                  </ToolbarButton>

                  <ToolbarSeparator />

                  <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Undo">
                    <Undo2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Redo">
                    <Redo2 className="h-4 w-4" />
                  </ToolbarButton>
                </div>

                {/* ── Area tulis ── */}
                <div className="px-10 py-8 bg-card min-h-[540px]">
                  <EditorContent editor={editor} />
                </div>
              </>
            ) : (
              <div className="min-h-[540px] bg-card">
                {!previewHtml.trim() ? (
                  <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                    Belum ada konten untuk dipreview.
                  </div>
                ) : (
                  <div
                    className={[
                      "px-10 py-8",
                      "prose prose-invert prose-lg max-w-none",
                      "prose-p:text-foreground/90 prose-p:leading-[1.85]",
                      "prose-headings:text-foreground prose-headings:font-semibold",
                      "prose-h1:text-3xl prose-h1:font-extrabold prose-h1:mt-8 prose-h1:mb-4",
                      "prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-7 prose-h2:mb-3 prose-h2:border-b prose-h2:pb-3",
                      "prose-h3:text-xl prose-h3:font-bold prose-h3:mt-6 prose-h3:mb-2",
                      "prose-a:text-[#39FF14] prose-a:no-underline hover:prose-a:underline prose-a:font-semibold",
                      "prose-strong:text-foreground",
                      "prose-blockquote:border-l-2 prose-blockquote:border-l-primary",
                      "prose-blockquote:bg-secondary/60 prose-blockquote:rounded-r-lg prose-blockquote:not-italic",
                      "prose-code:bg-secondary prose-code:text-primary prose-code:rounded prose-code:px-1.5",
                      "prose-code:before:content-none prose-code:after:content-none",
                      "prose-img:rounded-xl prose-img:w-full",
                      "prose-table:w-full prose-table:border-collapse prose-table:my-6 prose-table:text-sm",
                      "prose-th:border prose-th:border-border prose-th:bg-secondary/80 prose-th:px-4 prose-th:py-2.5 prose-th:font-semibold prose-th:text-foreground prose-th:text-left",
                      "prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2.5 prose-td:text-foreground/80 prose-td:align-top",
                      "[&_tbody_tr:nth-child(even)]:bg-secondary/30",
                      "prose-hr:border-border",
                      // match-card styles
                      "[&_.match-block]:my-6",
                      "[&_.match-card-grid]:grid [&_.match-card-grid]:gap-4 [&_.match-card-grid]:my-4 [&_.match-card-grid]:grid-cols-1 sm:[&_.match-card-grid]:grid-cols-2",
                      "[&_.match-card]:rounded-xl [&_.match-card]:border [&_.match-card]:border-border [&_.match-card]:bg-secondary/30 [&_.match-card]:p-4 [&_.match-card]:flex [&_.match-card]:flex-col [&_.match-card]:gap-2.5",
                      "[&_.match-card-top]:flex [&_.match-card-top]:items-center [&_.match-card-top]:justify-between",
                      "[&_.match-card-badge]:rounded-full [&_.match-card-badge]:bg-primary [&_.match-card-badge]:text-[10px] [&_.match-card-badge]:font-extrabold [&_.match-card-badge]:tracking-wide [&_.match-card-badge]:text-black [&_.match-card-badge]:px-2.5 [&_.match-card-badge]:py-0.5",
                      "[&_.match-card-date]:text-xs [&_.match-card-date]:text-muted-foreground",
                      "[&_.match-card-teams]:flex [&_.match-card-teams]:items-center [&_.match-card-teams]:gap-2 [&_.match-card-teams]:flex-wrap",
                      "[&_.match-card-team]:text-base [&_.match-card-team]:font-bold [&_.match-card-team]:text-foreground",
                      "[&_.match-card-vs]:text-sm [&_.match-card-vs]:font-bold [&_.match-card-vs]:text-primary",
                      "[&_.match-card-score]:flex [&_.match-card-score]:items-center [&_.match-card-score]:gap-1 [&_.match-card-score]:rounded-md [&_.match-card-score]:bg-primary/10 [&_.match-card-score]:px-2.5 [&_.match-card-score]:py-0.5 [&_.match-card-score]:text-base [&_.match-card-score]:font-extrabold [&_.match-card-score]:text-primary [&_.match-card-score]:tabular-nums",
                      "[&_.match-card-score-sep]:text-muted-foreground [&_.match-card-score-sep]:font-normal",
                      "[&_.match-card-bottom]:flex [&_.match-card-bottom]:items-center [&_.match-card-bottom]:justify-between [&_.match-card-bottom]:flex-wrap [&_.match-card-bottom]:gap-2",
                      "[&_.match-card-time]:rounded [&_.match-card-time]:border [&_.match-card-time]:border-border [&_.match-card-time]:bg-black/30 [&_.match-card-time]:px-2 [&_.match-card-time]:py-1 [&_.match-card-time]:text-xs [&_.match-card-time]:font-bold [&_.match-card-time]:text-foreground",
                      "[&_.match-card-stadium]:text-xs [&_.match-card-stadium]:text-muted-foreground",
                      // tabbed-block nav styles
                      "[&_.tabbed-block]:rounded-xl [&_.tabbed-block]:border [&_.tabbed-block]:border-border [&_.tabbed-block]:overflow-hidden [&_.tabbed-block]:my-6",
                      "[&_.tb-nav]:flex [&_.tb-nav]:flex-wrap [&_.tb-nav]:gap-1.5 [&_.tb-nav]:p-2.5 [&_.tb-nav]:bg-secondary/40 [&_.tb-nav]:border-b [&_.tb-nav]:border-border",
                      "[&_.tbb]:rounded-md [&_.tbb]:px-3 [&_.tbb]:py-1 [&_.tbb]:text-xs [&_.tbb]:font-semibold [&_.tbb]:cursor-pointer [&_.tbb]:border [&_.tbb]:border-border [&_.tbb]:bg-secondary [&_.tbb]:text-muted-foreground [&_.tbb]:transition-colors",
                      "[&_.tbb-active]:bg-primary [&_.tbb-active]:border-primary [&_.tbb-active]:text-black",
                      "[&_.tb-content]:p-4 [&_.tb-content]:bg-card",
                      "[&_.tbp]:hidden",
                      "[&_.tbp-active]:block",
                      // group standings styles
                      "[&_.group-standings-block]:my-6",
                      "[&_.gs-header]:flex [&_.gs-header]:items-center [&_.gs-header]:gap-2 [&_.gs-header]:px-4 [&_.gs-header]:py-3 [&_.gs-header]:border-b [&_.gs-header]:border-border [&_.gs-header]:bg-secondary/20",
                      "[&_.gs-header-icon]:text-lg",
                      "[&_.gs-header-title]:font-bold [&_.gs-header-title]:text-foreground [&_.gs-header-title]:text-sm [&_.gs-header-title]:flex-1",
                      "[&_.gs-header-sub]:text-xs [&_.gs-header-sub]:text-muted-foreground",
                      "[&_.gs-table-wrap]:overflow-x-auto",
                      "[&_.gs-table]:w-full [&_.gs-table]:text-xs [&_.gs-table]:border-collapse",
                      "[&_.gs-thead-row]:border-b [&_.gs-thead-row]:border-border",
                      "[&_.gs-th]:px-2 [&_.gs-th]:py-2.5 [&_.gs-th]:text-[10px] [&_.gs-th]:font-bold [&_.gs-th]:uppercase [&_.gs-th]:tracking-wider [&_.gs-th]:text-muted-foreground",
                      "[&_.gs-th-rank]:text-left [&_.gs-th-rank]:pl-3",
                      "[&_.gs-th-team]:text-left",
                      "[&_.gs-th-num]:text-center",
                      "[&_.gs-th-pts]:text-center [&_.gs-th-pts]:text-primary",
                      "[&_.gs-th-form]:text-center",
                      "[&_.gs-row]:border-b [&_.gs-row]:border-border/40 [&_.gs-row]:transition-colors hover:[&_.gs-row]:bg-secondary/30",
                      "[&_.gs-td]:px-2 [&_.gs-td]:py-2",
                      "[&_.gs-td-rank]:pl-3",
                      "[&_.gs-td-num]:text-center [&_.gs-td-num]:text-muted-foreground",
                      "[&_.gs-td-pts]:text-center [&_.gs-td-pts]:font-bold [&_.gs-td-pts]:text-foreground",
                      "[&_.gs-td-form]:text-center",
                      "[&_.gs-td-team]:min-w-[120px]",
                      "[&_.gs-rank]:flex [&_.gs-rank]:h-5 [&_.gs-rank]:w-5 [&_.gs-rank]:items-center [&_.gs-rank]:justify-center [&_.gs-rank]:rounded [&_.gs-rank]:text-[10px] [&_.gs-rank]:font-bold",
                      "[&_.gs-rank-qualify]:bg-primary/20 [&_.gs-rank-qualify]:text-primary [&_.gs-rank-qualify]:border-l-2 [&_.gs-rank-qualify]:border-l-primary",
                      "[&_.gs-rank-candidate]:bg-yellow-500/20 [&_.gs-rank-candidate]:text-yellow-400",
                      "[&_.gs-rank-out]:text-muted-foreground",
                      "[&_.gs-flag]:inline-flex [&_.gs-flag]:items-center [&_.gs-flag]:justify-center [&_.gs-flag]:rounded [&_.gs-flag]:bg-secondary [&_.gs-flag]:px-1 [&_.gs-flag]:text-[10px] [&_.gs-flag]:font-bold [&_.gs-flag]:text-muted-foreground [&_.gs-flag]:mr-1.5 [&_.gs-flag]:shrink-0",
                      "[&_.gs-team-name]:font-medium [&_.gs-team-name]:text-foreground",
                      "[&_.gs-form]:flex [&_.gs-form]:gap-0.5 [&_.gs-form]:justify-center",
                      "[&_.gs-form-badge]:flex [&_.gs-form-badge]:h-4 [&_.gs-form-badge]:w-4 [&_.gs-form-badge]:items-center [&_.gs-form-badge]:justify-center [&_.gs-form-badge]:rounded-full [&_.gs-form-badge]:text-[8px] [&_.gs-form-badge]:font-bold",
                      "[&_.gs-form-w]:bg-green-500/20 [&_.gs-form-w]:text-green-400",
                      "[&_.gs-form-d]:bg-yellow-500/20 [&_.gs-form-d]:text-yellow-400",
                      "[&_.gs-form-l]:bg-destructive/20 [&_.gs-form-l]:text-destructive",
                      "[&_.gs-legend]:flex [&_.gs-legend]:gap-4 [&_.gs-legend]:px-3 [&_.gs-legend]:py-2 [&_.gs-legend]:border-t [&_.gs-legend]:border-border/40",
                      "[&_.gs-legend-item]:text-[10px] [&_.gs-legend-item]:text-muted-foreground",
                      "[&_.gs-legend-qualify]:text-primary",
                      "[&_.gs-legend-candidate]:text-yellow-400",
                    ].join(" ")}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  ref={(el) => {
                    if (!el) return
                    setTimeout(() => {
                      el.querySelectorAll<HTMLElement>(".tabbed-block").forEach((block) => {
                        if (block.dataset.tabInit) return
                        block.dataset.tabInit = "1"
                        block.querySelectorAll<HTMLElement>(".tbb").forEach((btn) => {
                          btn.addEventListener("click", () => {
                            const idx = btn.dataset.tab
                            block.querySelectorAll(".tbb").forEach((b) => b.classList.remove("tbb-active"))
                            block.querySelectorAll(".tbp").forEach((p) => p.classList.remove("tbp-active"))
                            btn.classList.add("tbb-active")
                            block.querySelector(`.tbp[data-panel="${idx}"]`)?.classList.add("tbp-active")
                          })
                        })
                      })
                    }, 50)
                  }}
                  />
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* ── Jadwal Pertandingan Widget ── */}
          <MatchCardWidget
            onInsert={(html, blockId) => {
              if (!editor) return
              cardMapRef.current.set(blockId, html)
              // Insert HTML card langsung ke editor agar tampil visual
              editor.chain().focus().insertContent(html).run()
            }}
          />

          {/* ── Klasemen Fase Grup Widget ── */}
          <GroupStandingsWidget
            onInsert={(html, blockId) => {
              if (!editor) return
              cardMapRef.current.set(blockId, html)
              // Insert HTML card langsung ke editor agar tampil visual
              editor.chain().focus().insertContent(html).run()
            }}
          />

          {/* ── Editor Choice Toggle ── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className={`h-4 w-4 ${isEditorChoice ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                <h3 className="text-sm font-semibold text-foreground">Editor Choice</h3>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isEditorChoice}
                onClick={() => setIsEditorChoice((v) => !v)}
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
                  isEditorChoice ? "bg-primary" : "bg-secondary",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    isEditorChoice ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {isEditorChoice
                ? "✅ Artikel ini akan tampil di bagian Editor Choice di halaman utama."
                : "Aktifkan untuk menampilkan artikel ini di bagian Editor Choice."}
            </p>
            {isEditorChoice && (
              <p className="mt-1 text-xs text-amber-500/80">
                ⚠️ Artikel Editor Choice tidak akan muncul di bagian Trending.
              </p>
            )}
          </div>

          {/* Category */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Kategori</h3>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Pilih kategori...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-0.5 text-sm font-semibold text-foreground">Tags</h3>
            <p className="mb-3 text-xs text-muted-foreground">Enter atau koma untuk menambah</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="text-primary/60 hover:text-primary">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Input
                ref={tagInputRef}
                placeholder="Tambah tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="border-border bg-secondary/50 text-sm"
              />
              {showSuggestions && tagSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
                  {tagSuggestions.slice(0, 6).map((s) => (
                    <button key={s} onMouseDown={() => addTag(s)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary/60">
                      <span className="text-primary">#</span>{s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {allTags.filter((t) => !tags.includes(t.name)).length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-muted-foreground">Tag tersedia:</p>
                <div className="flex flex-wrap gap-1">
                  {allTags.filter((t) => !tags.includes(t.name)).slice(0, 10).map((t) => (
                    <button key={t.id} onClick={() => addTag(t.name)}
                      className="flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                      <Plus className="h-2.5 w-2.5" />{t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Featured Image */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Gambar Unggulan</h3>
            <input ref={featuredImageRef} type="file" accept="image/*" className="hidden" onChange={handleFeaturedImageUpload} />
            <div
              onClick={() => featuredImageRef.current?.click()}
              className="flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-secondary/30 hover:border-primary/50 transition-colors"
            >
              {featuredImagePreview ? (
                <img src={featuredImagePreview} alt="Featured" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center">
                  <ImageIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Klik untuk upload</p>
                </div>
              )}
            </div>
            {featuredImagePreview && (
              <button onClick={() => { setFeaturedImagePreview(null); setFeaturedImageUrl(null) }} className="mt-2 text-xs text-destructive hover:underline">
                Hapus gambar
              </button>
            )}
          </div>

          {/* SEO */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-0.5 text-sm font-semibold text-foreground">SEO</h3>
            <p className="mb-4 text-xs text-muted-foreground">Kosongkan untuk pakai judul & excerpt</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Meta Title</label>
                <Input placeholder={title || "SEO title"} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} className="border-border bg-secondary/50 text-sm" />
                <p className="mt-1 text-right text-xs text-muted-foreground">{metaTitle.length}/60</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Meta Description</label>
                <textarea
                  placeholder={excerpt || "SEO description"}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{metaDescription.length}/160</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ── Link Dialog ── */}
    {linkDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Sisipkan Link</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Nama Artikel / Teks Link <span className="text-muted-foreground">(wajib)</span>
              </label>
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Contoh: Artikel tentang Messi"
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">URL Artikel</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmLink() }}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => { setLinkDialogOpen(false); setLinkText(""); setLinkUrl("https://") }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary"
            >
              Batal
            </button>
            <button
              onClick={handleConfirmLink}
              disabled={!linkText.trim() || !linkUrl.trim() || linkUrl === "https://"}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black hover:bg-primary/90 disabled:opacity-40"
            >
              Sisipkan
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
