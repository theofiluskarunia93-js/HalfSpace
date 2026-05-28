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
  Undo2, Redo2, Table as TableIcon, Star, Trophy, Pencil,
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
  homeScore: string
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
    `<div class="tabbed-block match-tabbed-block" data-block-id="${blockId}" data-block-type="match">` +
    `<div class="tb-nav">${buttons}</div>` +
    `<div class="tb-content">${panels}</div>` +
    `</div>`
  )
}

// ─── Parse match HTML back to state ──────────────────────────────────────────

function parseMatchBlockHtml(html: string): MatchTab[] | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")

    // tabbed (multi-tab) case
    const tabbedBlock = doc.querySelector(".match-tabbed-block, .tabbed-block.match-block, .tabbed-block")
    if (tabbedBlock) {
      const navBtns = Array.from(tabbedBlock.querySelectorAll(".tb-nav .tbb"))
      const panels = Array.from(tabbedBlock.querySelectorAll(".tb-content .tbp"))
      if (!navBtns.length || !panels.length) return null

      return navBtns.map((btn, i) => {
        const panel = panels[i]
        const label = btn.textContent?.trim() || `Grup ${String.fromCharCode(65 + i)}`
        const cards = panel ? Array.from(panel.querySelectorAll(".match-card")) : []
        const matches: MatchEntry[] = cards.map((card) => {
          const teams = Array.from(card.querySelectorAll(".match-card-team"))
          const scoreEl = card.querySelector(".match-card-score")
          let homeScore = ""
          let awayScore = ""
          if (scoreEl) {
            const sep = scoreEl.querySelector(".match-card-score-sep")
            const scoreText = sep ? scoreEl.textContent?.replace(sep.textContent || "", "–") : scoreEl.textContent
            const parts = (scoreText || "").split("–").map((s) => s.trim())
            homeScore = parts[0] || ""
            awayScore = parts[1] || ""
          }
          return {
            id: generateId(),
            homeTeam: teams[0]?.textContent?.trim() || "",
            awayTeam: teams[1]?.textContent?.trim() || "",
            homeScore,
            awayScore,
            date: card.querySelector(".match-card-date")?.textContent?.trim() || "",
            time: (card.querySelector(".match-card-time")?.textContent || "").replace("⏰", "").trim(),
            stadium: card.querySelector(".match-card-stadium")?.textContent?.trim() || "",
          }
        })
        return { id: generateId(), label, matches: matches.length > 0 ? matches : [makeMatch()] }
      })
    }

    // single (no tabs) case
    const singleCards = Array.from(doc.querySelectorAll(".match-card"))
    if (singleCards.length > 0) {
      const label = doc.querySelector(".match-card-badge")?.textContent?.trim() || "Grup A"
      const matches: MatchEntry[] = singleCards.map((card) => {
        const teams = Array.from(card.querySelectorAll(".match-card-team"))
        const scoreEl = card.querySelector(".match-card-score")
        let homeScore = ""
        let awayScore = ""
        if (scoreEl) {
          const sep = scoreEl.querySelector(".match-card-score-sep")
          const scoreText = sep ? scoreEl.textContent?.replace(sep.textContent || "", "–") : scoreEl.textContent
          const parts = (scoreText || "").split("–").map((s) => s.trim())
          homeScore = parts[0] || ""
          awayScore = parts[1] || ""
        }
        return {
          id: generateId(),
          homeTeam: teams[0]?.textContent?.trim() || "",
          awayTeam: teams[1]?.textContent?.trim() || "",
          homeScore,
          awayScore,
          date: card.querySelector(".match-card-date")?.textContent?.trim() || "",
          time: (card.querySelector(".match-card-time")?.textContent || "").replace("⏰", "").trim(),
          stadium: card.querySelector(".match-card-stadium")?.textContent?.trim() || "",
        }
      })
      return [{ id: generateId(), label, matches }]
    }
    return null
  } catch {
    return null
  }
}

// ─── Parse standings HTML back to state ──────────────────────────────────────

interface StandingsTeamEntry {
  id: string
  code: string
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  pts: number
  form: string[]
}

interface StandingsGroup {
  id: string
  label: string
  teams: StandingsTeamEntry[]
}

function parseStandingsBlockHtml(html: string): { title: string; groups: StandingsGroup[] } | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")

    const block = doc.querySelector(".group-standings-block")
    if (!block) return null

    const title = block.querySelector(".gs-header-title")?.textContent?.trim() || "Klasemen Fase Grup"
    const navBtns = Array.from(block.querySelectorAll(".tb-nav .tbb"))
    const panels = Array.from(block.querySelectorAll(".tb-content .tbp"))

    if (!navBtns.length || !panels.length) return null

    const groups: StandingsGroup[] = navBtns.map((btn, i) => {
      const label = btn.textContent?.trim() || `Grup ${String.fromCharCode(65 + i)}`
      const panel = panels[i]
      const rows = panel ? Array.from(panel.querySelectorAll("tbody tr.gs-row")) : []

      const teams: StandingsTeamEntry[] = rows.map((row) => {
        const tds = Array.from(row.querySelectorAll("td"))
        const numAt = (idx: number) => parseInt(tds[idx]?.textContent?.trim() || "0") || 0
        const formBadges = Array.from(row.querySelectorAll(".gs-form-badge")).map((b) => b.textContent?.trim() || "")
        return {
          id: generateId(),
          code: row.querySelector(".gs-flag")?.textContent?.trim() || "",
          name: row.querySelector(".gs-team-name")?.textContent?.trim() || "",
          played: numAt(2),
          won: numAt(3),
          drawn: numAt(4),
          lost: numAt(5),
          gf: numAt(6),
          ga: numAt(7),
          pts: numAt(9),
          form: formBadges,
        }
      })

      return {
        id: generateId(),
        label,
        teams: teams.length > 0 ? teams : [makeTeam(), makeTeam(), makeTeam(), makeTeam()],
      }
    })

    return { title, groups }
  } catch {
    return null
  }
}

// ─── MatchCardWidget ─────────────────────────────────────────────────────────

interface MatchCardWidgetProps {
  onInsert: (html: string, blockId: string) => void
  editData?: { blockId: string; tabs: MatchTab[] } | null
  onReset?: () => void
}

function MatchCardWidget({ onInsert, editData, onReset }: MatchCardWidgetProps) {
  const [tabs, setTabs] = useState<MatchTab[]>([makeMatchTab(0)])
  const [activeTab, setActiveTab] = useState<string>("")

  // Sync editData into state when it changes
  useEffect(() => {
    if (editData) {
      setTabs(editData.tabs)
      setActiveTab(editData.tabs[0]?.id || "")
    } else {
      // Reset saat editData di-clear
      setTabs([makeMatchTab(0)])
      setActiveTab("")
    }
  }, [editData?.blockId, editData])

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
    const blockId = editData?.blockId || generateId()
    const validTabs = tabs.filter((t) => t.matches.some((m) => m.homeTeam || m.awayTeam))
    if (!validTabs.length) return
    const html = validTabs.length === 1
      ? `<div class="match-block" data-block-id="${blockId}" data-block-type="match">${renderMatchTabHtml(validTabs[0])}</div>`
      : buildMatchTabbedHtml(validTabs, blockId)
    onInsert(html, blockId)
    // Reset after insert
    if (editData && onReset) {
      onReset()
      setTabs([makeMatchTab(0)])
      setActiveTab("")
    }
  }

  if (!currentTab) return null

  const isEditing = !!editData

  return (
    <div className={[
      "rounded-xl border bg-card overflow-hidden transition-colors",
      isEditing ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
    ].join(" ")}>
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <TableIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Jadwal Pertandingan</span>
          {isEditing && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              <Pencil className="h-2.5 w-2.5" /> Mode Edit
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing && onReset && (
            <button
              onClick={() => { onReset(); setTabs([makeMatchTab(0)]); setActiveTab("") }}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Batal
            </button>
          )}
          <span className="text-[10px] text-muted-foreground/60">Tab = Grup / Ronde</span>
        </div>
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
          className={[
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            isEditing
              ? "bg-primary text-black hover:bg-primary/90"
              : "bg-primary/10 text-primary hover:bg-primary/20",
          ].join(" ")}>
          <TableIcon className="h-3.5 w-3.5" />
          {isEditing ? "Update Card" : "Insert ke Artikel"}
        </button>
      </div>
    </div>
  )
}

// ─── Group Standings Widget ───────────────────────────────────────────────────

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

function calcSG(team: StandingsTeamEntry): number {
  return team.gf - team.ga
}

function sortedTeams(teams: StandingsTeamEntry[]): StandingsTeamEntry[] {
  return [...teams].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (calcSG(b) !== calcSG(a)) return calcSG(b) - calcSG(a)
    return b.gf - a.gf
  })
}

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

function buildGroupStandingsHtml(groups: StandingsGroup[], blockId: string, title: string): string {
  const buttons = groups
    .map((g, i) => `<button class="tbb${i === 0 ? " tbb-active" : ""}" data-tab="${i}">${g.label}</button>`)
    .join("")
  const panels = groups
    .map((g, i) => `<div class="tbp${i === 0 ? " tbp-active" : ""}" data-panel="${i}">${renderGroupTableHtml(g)}</div>`)
    .join("")
  return (
    `<div class="group-standings-block tabbed-block" data-block-id="${blockId}" data-block-type="standings">` +
    `<div class="gs-header"><span class="gs-header-icon">🏆</span><span class="gs-header-title">${title}</span><span class="gs-header-sub">Klasemen Sementara</span></div>` +
    `<div class="tb-nav">${buttons}</div>` +
    `<div class="tb-content">${panels}</div>` +
    `</div>`
  )
}

interface GroupStandingsWidgetProps {
  onInsert: (html: string, blockId: string) => void
  editData?: { blockId: string; title: string; groups: StandingsGroup[] } | null
  onReset?: () => void
}

function GroupStandingsWidget({ onInsert, editData, onReset }: GroupStandingsWidgetProps) {
  const [title, setTitle] = useState("Klasemen Fase Grup")
  const [groups, setGroups] = useState<StandingsGroup[]>([makeStandingsGroup(0)])
  const [activeGroup, setActiveGroup] = useState<string>("")
  const [activeTeamIdx, setActiveTeamIdx] = useState<number>(0)

  // Sync editData into state when it changes
  useEffect(() => {
    if (editData) {
      setTitle(editData.title)
      setGroups(editData.groups)
      setActiveGroup(editData.groups[0]?.id || "")
      setActiveTeamIdx(0)
    } else {
      // Reset saat editData di-clear
      setTitle("Klasemen Fase Grup")
      setGroups([makeStandingsGroup(0)])
      setActiveGroup("")
    }
  }, [editData?.blockId, editData])

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
    const blockId = editData?.blockId || generateId()
    const validGroups = groups.filter((g) => g.teams.some((t) => t.name))
    if (!validGroups.length) return
    const html = buildGroupStandingsHtml(validGroups, blockId, title)
    onInsert(html, blockId)
    // Reset after insert
    if (editData && onReset) {
      onReset()
      setTitle("Klasemen Fase Grup")
      setGroups([makeStandingsGroup(0)])
      setActiveGroup("")
    }
  }

  if (!currentGroup) return null

  const isEditing = !!editData

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
    <div className={[
      "rounded-xl border bg-card overflow-hidden transition-colors",
      isEditing ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
    ].join(" ")}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Klasemen Fase Grup</span>
          {isEditing && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              <Pencil className="h-2.5 w-2.5" /> Mode Edit
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing && onReset && (
            <button
              onClick={() => { onReset(); setTitle("Klasemen Fase Grup"); setGroups([makeStandingsGroup(0)]); setActiveGroup("") }}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Batal
            </button>
          )}
          <span className="text-[10px] text-muted-foreground/60">Tab = Grup</span>
        </div>
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

            <div className="flex items-end gap-2 flex-wrap">
              {numField(team.played, (n) => updateTeam(currentGroup.id, team.id, { played: n }), "M")}
              {numField(team.won, (n) => updateTeam(currentGroup.id, team.id, { won: n }), "W")}
              {numField(team.drawn, (n) => updateTeam(currentGroup.id, team.id, { drawn: n }), "S")}
              {numField(team.lost, (n) => updateTeam(currentGroup.id, team.id, { lost: n }), "K")}
              {numField(team.gf, (n) => updateTeam(currentGroup.id, team.id, { gf: n }), "GM")}
              {numField(team.ga, (n) => updateTeam(currentGroup.id, team.id, { ga: n }), "GK")}
              {numField(team.pts, (n) => updateTeam(currentGroup.id, team.id, { pts: n }), "PTS")}
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
          className={[
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            isEditing
              ? "bg-primary text-black hover:bg-primary/90"
              : "bg-primary/10 text-primary hover:bg-primary/20",
          ].join(" ")}>
          <Trophy className="h-3.5 w-3.5" />
          {isEditing ? "Update Card" : "Insert ke Artikel"}
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

// ─── Edit block state types ───────────────────────────────────────────────────

type EditingBlock =
  | { type: "match"; blockId: string; tabs: MatchTab[] }
  | { type: "standings"; blockId: string; title: string; groups: StandingsGroup[] }
  | null

// ─── Helper: build beautiful UI Card placeholder HTML ──────────────────────────
// Menghasilkan Card UI cantik (putih + neon green) yang:
// 1. Langsung terlihat indah di editor, preview, dan halaman artikel publik
// 2. Tetap menyimpan class card-ref-* & card-type-* agar logika edit/click tetap berjalan
// 3. Embed cardHtml sebagai base64 di data-card-html agar data bertahan saat refresh
function buildCardPlaceholderHtml(blockId: string, type: "match" | "standings", cardHtml?: string): string {
  const encodedHtml = cardHtml ? btoa(unescape(encodeURIComponent(cardHtml))) : ""
  const isMatch = type === "match"

  // Parse matches atau standings dari cardHtml untuk preview di dalam card
  let innerPreview = ""
  if (cardHtml) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(cardHtml, "text/html")

      if (isMatch) {
        // Ambil semua match-card untuk preview ringkas
        const matchCards = Array.from(doc.querySelectorAll(".match-card"))
        const tabBtns = Array.from(doc.querySelectorAll(".tbb"))
        const groupLabels = tabBtns.map(b => b.textContent?.trim()).filter(Boolean)
        const totalMatches = matchCards.length

        // Buat preview rows pertandingan (max 3)
        const rows = matchCards.slice(0, 3).map((card) => {
          const home = card.querySelector(".match-card-team")?.textContent?.trim() || "?"
          const away = Array.from(card.querySelectorAll(".match-card-team"))[1]?.textContent?.trim() || "?"
          const scoreEl = card.querySelector(".match-card-score")
          const vsEl = card.querySelector(".match-card-vs")
          const date = card.querySelector(".match-card-date")?.textContent?.trim() || ""
          const badge = card.querySelector(".match-card-badge")?.textContent?.trim() || ""
          const hasScore = !!scoreEl
          const sep = scoreEl?.querySelector(".match-card-score-sep")
          const scoreText = sep
            ? scoreEl!.textContent!.replace(sep.textContent || "", "–").trim()
            : scoreEl?.textContent?.trim() || "vs"
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(57,255,20,0.12);">
  <div style="display:flex;align-items:center;gap:6px;min-width:0;">
    <span style="background:rgba(57,255,20,0.15);color:#39FF14;font-size:9px;font-weight:800;padding:1px 5px;border-radius:20px;white-space:nowrap;">${badge}</span>
    <span style="color:#111;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;">${home}</span>
  </div>
  <span style="background:${hasScore ? "rgba(57,255,20,0.18)" : "transparent"};color:${hasScore ? "#0a7a00" : "#666"};font-size:11px;font-weight:900;padding:2px 8px;border-radius:6px;white-space:nowrap;border:1px solid ${hasScore ? "rgba(57,255,20,0.4)" : "transparent"};">${hasScore ? scoreText : "vs"}</span>
  <span style="color:#111;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;text-align:right;">${away}</span>
</div>`
        }).join("")

        const more = totalMatches > 3 ? `<div style="text-align:center;padding-top:4px;color:#39FF14;font-size:10px;font-weight:700;">+${totalMatches - 3} pertandingan lainnya</div>` : ""
        const tabPills = groupLabels.length > 1
          ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${groupLabels.map((g, i) => `<span style="background:${i === 0 ? "#39FF14" : "rgba(57,255,20,0.12)"};color:${i === 0 ? "#111" : "#39FF14"};font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;">${g}</span>`).join("")}</div>`
          : ""
        innerPreview = tabPills + rows + more
      } else {
        // Standings: tampilkan tabel ringkas
        const tabBtns = Array.from(doc.querySelectorAll(".tbb"))
        const groupLabels = tabBtns.map(b => b.textContent?.trim()).filter(Boolean)
        const firstPanel = doc.querySelector(".tbp")
        const rows = firstPanel ? Array.from(firstPanel.querySelectorAll(".gs-row")).slice(0, 4) : []

        const tabPills = groupLabels.length > 1
          ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${groupLabels.map((g, i) => `<span style="background:${i === 0 ? "#39FF14" : "rgba(57,255,20,0.12)"};color:${i === 0 ? "#111" : "#39FF14"};font-size:9px;font-weight:800;padding:2px 7px;border-radius:20px;">${g}</span>`).join("")}</div>`
          : ""

        const tableRows = rows.map((row, i) => {
          const name = row.querySelector(".gs-team-name")?.textContent?.trim() || "—"
          const code = row.querySelector(".gs-flag")?.textContent?.trim() || ""
          const pts = row.querySelector(".gs-td-pts")?.textContent?.trim() || "0"
          const played = Array.from(row.querySelectorAll(".gs-td-num"))[0]?.textContent?.trim() || "0"
          const qualClass = i < 2 ? "qualify" : i === 2 ? "candidate" : "out"
          const rankColor = qualClass === "qualify" ? "#39FF14" : qualClass === "candidate" ? "#f59e0b" : "#888"
          const rankBg = qualClass === "qualify" ? "rgba(57,255,20,0.15)" : qualClass === "candidate" ? "rgba(245,158,11,0.15)" : "transparent"
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(57,255,20,0.1);">
  <div style="display:flex;align-items:center;gap:6px;">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:${rankBg};color:${rankColor};font-size:9px;font-weight:800;">${i + 1}</span>
    <span style="background:rgba(0,0,0,0.07);color:#555;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;">${code}</span>
    <span style="color:#111;font-size:11px;font-weight:600;">${name}</span>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="color:#888;font-size:10px;">${played}M</span>
    <span style="background:rgba(57,255,20,0.18);color:#0a7a00;font-size:11px;font-weight:900;padding:1px 7px;border-radius:6px;border:1px solid rgba(57,255,20,0.35);">${pts}</span>
  </div>
</div>`
        }).join("")

        const headerTitle = doc.querySelector(".gs-header-title")?.textContent?.trim() || "Klasemen Fase Grup"
        innerPreview = tabPills + tableRows
      }
    } catch {
      innerPreview = ""
    }
  }

  const icon = isMatch ? "📅" : "🏆"
  const title = isMatch ? "Jadwal Pertandingan" : "Klasemen Grup"
  const accentColor = "#39FF14"
  const shortId = blockId.slice(0, 6)

  const editHint = `<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;padding-top:6px;">
  <span style="color:#39FF14;font-size:9px;opacity:0.7;">✎ klik untuk edit</span>
  <span style="background:rgba(57,255,20,0.1);color:#39FF14;font-size:8px;font-weight:700;padding:1px 5px;border-radius:10px;opacity:0.6;">${shortId}</span>
</div>`

  const emptyState = `<div style="text-align:center;padding:12px 0;color:#aaa;font-size:11px;">Klik untuk menambahkan data</div>`

  return (
    `<div class="widget-card-block card-editor-placeholder card-ref-${blockId} card-type-${type}" ` +
    `data-block-id="${blockId}" data-block-type="${type}" data-card-html="${encodedHtml}" contenteditable="false" ` +
    `style="` +
      `background:#ffffff;` +
      `border:1.5px solid rgba(57,255,20,0.45);` +
      `border-radius:14px;` +
      `overflow:hidden;` +
      `margin:20px 0;` +
      `box-shadow:0 0 0 1px rgba(57,255,20,0.1),0 4px 24px rgba(57,255,20,0.08),0 1px 4px rgba(0,0,0,0.08);` +
      `cursor:pointer;` +
      `transition:box-shadow 0.2s,border-color 0.2s;` +
      `font-family:inherit;` +
    `">` +
    // Header bar
    `<div style="` +
      `background:linear-gradient(135deg,#f8fff8 0%,#f0fff0 100%);` +
      `border-bottom:1.5px solid rgba(57,255,20,0.25);` +
      `padding:10px 14px;` +
      `display:flex;align-items:center;justify-content:space-between;` +
    `">` +
      `<div style="display:flex;align-items:center;gap:8px;">` +
        `<span style="font-size:16px;line-height:1;">${icon}</span>` +
        `<span style="font-size:12px;font-weight:800;color:#111;letter-spacing:-0.2px;">${title}</span>` +
        `<span style="` +
          `background:#39FF14;color:#111;` +
          `font-size:8px;font-weight:900;` +
          `padding:1px 6px;border-radius:20px;` +
          `letter-spacing:0.5px;text-transform:uppercase;` +
        `">WIDGET</span>` +
      `</div>` +
      `<div style="display:flex;align-items:center;gap:6px;">` +
        `<div style="` +
          `width:6px;height:6px;border-radius:50%;` +
          `background:${accentColor};` +
          `box-shadow:0 0 6px ${accentColor};` +
        `"></div>` +
        `<span style="color:#39FF14;font-size:9px;font-weight:700;letter-spacing:0.3px;">AKTIF</span>` +
      `</div>` +
    `</div>` +
    // Body content
    `<div style="padding:10px 14px 4px;">` +
      (innerPreview ? innerPreview : emptyState) +
    `</div>` +
    // Footer edit hint
    `<div style="padding:2px 14px 8px;">` +
      editHint +
    `</div>` +
    `</div>`
  )
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

  // ── Editing block state ─────────────────────────────────────────────────────
  const [editingBlock, setEditingBlock] = useState<EditingBlock>(null)
  // Modal inline edit: muncul langsung di atas editor saat badge diklik
  const [modalOpen, setModalOpen] = useState(false)

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
  // widgetMapRef: blockId → widgetId (UUID dari Supabase widget_jadwal/widget_klasemen)
  // Terisi saat onInsert dipanggil (widget baru/edit), atau saat load artikel edit mode
  const widgetMapRef = useRef<Map<string, string>>(new Map())

  // Expose cardMapRef & setEditingBlock ke TipTap handleClick (static closure)
  // Gunakan wrapper stabil agar tidak pernah stale
  const setEditingBlockRef = useRef<(block: EditingBlock) => void>(() => {})
  useEffect(() => {
    setEditingBlockRef.current = setEditingBlock
  }, [setEditingBlock])

  const openCardModalRef = useRef<() => void>(() => {})
  useEffect(() => {
    openCardModalRef.current = () => setModalOpen(true)
  })

  useEffect(() => {
    ;(window as any).__cardMapRef = cardMapRef.current
    ;(window as any).__setEditingBlock = (block: EditingBlock) => setEditingBlockRef.current(block)
    ;(window as any).__openCardModal = () => openCardModalRef.current()
  })

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
          // ── match-card styles ──
          "[&_.match-block]:my-4 [&_.match-block]:cursor-pointer [&_.match-block]:select-none",
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
          // Card yang sedang di-edit diberi highlight
          "[&_.tabbed-block]:rounded-xl [&_.tabbed-block]:border [&_.tabbed-block]:border-primary/40 [&_.tabbed-block]:overflow-hidden [&_.tabbed-block]:my-4 [&_.tabbed-block]:cursor-pointer [&_.tabbed-block]:select-none",
          "[&_.tabbed-block]:cursor-pointer",
          "[&_.tb-nav]:flex [&_.tb-nav]:flex-wrap [&_.tb-nav]:gap-1 [&_.tb-nav]:p-2 [&_.tb-nav]:bg-secondary/40 [&_.tb-nav]:border-b [&_.tb-nav]:border-border",
          "[&_.tbb]:rounded-md [&_.tbb]:px-2.5 [&_.tbb]:py-1 [&_.tbb]:text-xs [&_.tbb]:font-semibold [&_.tbb]:border [&_.tbb]:border-border [&_.tbb]:bg-secondary [&_.tbb]:text-muted-foreground",
          "[&_.tbb-active]:bg-primary [&_.tbb-active]:border-primary [&_.tbb-active]:text-black",
          "[&_.tb-content]:p-3 [&_.tb-content]:bg-card",
          "[&_.tbp]:hidden",
          "[&_.tbp-active]:block",
          // ── group standings styles ──
          "[&_.group-standings-block]:my-4 [&_.group-standings-block]:cursor-pointer [&_.group-standings-block]:select-none",
          // ── card-editor-placeholder badge styles ──
          "// widget-card-block uses inline styles — no Tailwind overrides needed",
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
      // ── Opsi A: klik card di editor → isi sidebar untuk edit ────────────────
      handleClick(view, _pos, event) {
        const target = event.target as HTMLElement
        // Cari placeholder dengan data-block-id ATAU via class card-ref-* (TipTap strip data-*)
        const block = target.closest<HTMLElement>(".card-editor-placeholder")
          ?? target.closest<HTMLElement>("[data-block-id]")
          ?? target.closest<HTMLElement>("[class*='card-ref-']")
          ?? target.closest<HTMLElement>(".tabbed-block")
          ?? target.closest<HTMLElement>(".group-standings-block")
        if (!block) return false

        // Baca blockId dari data-attribute ATAU dari class card-ref-* (lebih reliable karena TipTap strip data-*)
        let blockId = block.dataset.blockId
        let blockType = block.dataset.blockType
        block.classList.forEach((cls) => {
          if (cls.startsWith("card-ref-")) blockId = blockId ?? cls.replace("card-ref-", "")
          if (cls.startsWith("card-type-")) blockType = blockType ?? cls.replace("card-type-", "")
        })
        // Untuk full block (tabbed-block / group-standings-block) ambil dari data-block-id child
        if (!blockId) {
          const inner = block.querySelector<HTMLElement>("[data-block-id]")
          if (inner) { blockId = inner.dataset.blockId; blockType = inner.dataset.blockType }
        }
        if (!blockId) return false

        // Gunakan ref agar tidak stale closure
        const _setEditingBlock: (b: EditingBlock) => void =
          (window as any).__setEditingBlock ?? (() => {})

        // Handle simple placeholder clicks (new system)
        if (block.classList.contains("card-editor-placeholder")) {
          // Baca blockId & type dari class (data-* mungkin sudah di-strip TipTap)
          let resolvedBlockId = block.dataset.blockId
          let resolvedType = block.dataset.blockType
          block.classList.forEach((cls) => {
            if (cls.startsWith("card-ref-")) resolvedBlockId = cls.replace("card-ref-", "")
            if (cls.startsWith("card-type-")) resolvedType = cls.replace("card-type-", "")
          })
          if (!resolvedBlockId) return false

          const cardMap: Map<string, string> = (window as any).__cardMapRef ?? new Map()
          if (resolvedType === "match") {
            const cardHtml = cardMap.get(resolvedBlockId) ?? ""
            const parsed = cardHtml ? parseMatchBlockHtml(cardHtml) : null
            _setEditingBlock({ type: "match", blockId: resolvedBlockId, tabs: parsed ?? [makeMatchTab(0)] })
            ;(window as any).__openCardModal?.()
          } else if (resolvedType === "standings") {
            const cardHtml = cardMap.get(resolvedBlockId) ?? ""
            const parsed = cardHtml ? parseStandingsBlockHtml(cardHtml) : null
            _setEditingBlock({ type: "standings", blockId: resolvedBlockId, title: parsed?.title ?? "", groups: parsed?.groups ?? [makeStandingsGroup(0)] })
            ;(window as any).__openCardModal?.()
          }
          return true
        }

        if (blockType === "match" || block.classList.contains("match-tabbed-block") || block.classList.contains("match-block")) {
          const outerHtml = block.outerHTML
          const parsed = parseMatchBlockHtml(outerHtml)
          if (parsed) {
            _setEditingBlock({ type: "match", blockId, tabs: parsed })
            ;(window as any).__openCardModal?.()
          }
          return true
        }

        if (blockType === "standings" || block.classList.contains("group-standings-block")) {
          const outerHtml = block.outerHTML
          const parsed = parseStandingsBlockHtml(outerHtml)
          if (parsed) {
            _setEditingBlock({ type: "standings", blockId, ...parsed })
            ;(window as any).__openCardModal?.()
          }
          return true
        }

        return false
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
      // Reset cardMapRef sebelum load artikel baru agar tidak ada sisa data artikel lain
      cardMapRef.current.clear()
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

        // ── Gunakan card_data JSON jika tersedia (artikel baru / sudah di-save ulang) ──
        // Fallback ke HTML parsing untuk artikel lama yang belum punya card_data.
        const savedCardData: Record<string, any> = data.card_data || {}
        const hasJsonData = Object.keys(savedCardData).length > 0

        // ── Populate widgetMapRef dari marker teks yang tersimpan di content ──
        // Artikel yang sudah pakai sistem baru menyimpan marker seperti:
        // "📅JadwalPertandinganWIDGET AKTIF\n🖇 klik untuk edit<widgetId>:<blockId>"
        // Kita ekstrak pasangan blockId → widgetId agar resolveCards bisa tulis marker kembali.
        widgetMapRef.current.clear()
        const markerRe = /(?:📅|🏆)(?:JadwalPertandingan|KlasemenGrup)WIDGET\s+AKTIF[\s\S]*?🖇\s*klik untuk edit([a-zA-Z0-9-]+):([a-zA-Z0-9]+)/g
        let mMatch: RegExpExecArray | null
        while ((mMatch = markerRe.exec(raw)) !== null) {
          const [, wId, bId] = mMatch
          widgetMapRef.current.set(bId, wId)
        }

        // Convert all existing full HTML card blocks to badge placeholders for editor display
        // Full HTML tetap disimpan di cardMapRef, akan di-resolve kembali saat save
        let editorContent = raw
        if (raw) {
          const parser = new DOMParser()
          const doc = parser.parseFromString(raw, "text/html")

          // Collect semua block dengan data-block-id (match & standings)
          const blocks = Array.from(doc.querySelectorAll<HTMLElement>("[data-block-id]"))
            .filter(el => el.dataset.blockType === "match" || el.dataset.blockType === "standings")

          // PENTING: populate cardMapRef SEBELUM set content ke editor
          blocks.forEach((el) => {
            const id = el.dataset.blockId
            const type = el.dataset.blockType as "match" | "standings"
            if (!id) return

            let fullHtml: string

            if (hasJsonData && savedCardData[id]) {
              // ── PATH UTAMA: Rebuild HTML dari JSON (reliable, tidak bergantung struktur HTML lama) ──
              try {
                const json = savedCardData[id]
                if (json.type === "match") {
                  fullHtml = json.tabs?.length > 1
                    ? buildMatchTabbedHtml(json.tabs, id)
                    : `<div class="match-block" data-block-id="${id}" data-block-type="match">${renderMatchTabHtml(json.tabs[0])}</div>`
                } else {
                  fullHtml = buildGroupStandingsHtml(json.groups, id, json.title)
                }
              } catch {
                // Jika rebuild dari JSON gagal, fallback ke HTML lama
                fullHtml = el.outerHTML
              }
            } else {
              // ── FALLBACK: Pakai HTML lama (backward-compat untuk artikel sebelum migrasi) ──
              fullHtml = el.outerHTML
            }

            // Simpan full HTML ke cardMapRef dan sessionStorage
            cardMapRef.current.set(id, fullHtml)
            sessionStorage.setItem(`card-html-${id}`, fullHtml)
            // Gunakan buildCardPlaceholderHtml agar data-card-html (base64) ikut ter-embed
            // sehingga data tidak hilang saat browser di-refresh
            const badgeHtml = buildCardPlaceholderHtml(id, type, fullHtml)
            const tmp = doc.createElement("div")
            tmp.innerHTML = badgeHtml
            const badgeNode = tmp.firstChild
            if (badgeNode) el.replaceWith(badgeNode)
          })

          editorContent = doc.body.innerHTML
        }

        // Set content setelah cardMapRef sudah ter-populate
        editor.commands.setContent(editorContent || "")
        // Jika sedang di tab preview saat artikel di-load, paksa refresh preview
        // agar card HTML ter-resolve dari cardMapRef yang baru saja di-populate
        setTimeout(() => {
          const raw = editor.getHTML()
          const withSpacing = raw.replace(/<p><\/p>/g, "<p>&nbsp;</p>")
          // Trigger resolveCards — cardMapRef sudah terisi saat ini
          const resolved = (() => {
            let r = withSpacing.replace(/\[\[CARD:([a-z0-9]+)\]\]/g, (_, id) => {
              return (window as any).__cardMapRef?.get(id) ?? ""
            })
            try {
              const parser = new DOMParser()
              const doc = parser.parseFromString(r, "text/html")
              doc.querySelectorAll<HTMLElement>(".card-editor-placeholder").forEach((el) => {
                let bId: string | undefined
                el.classList.forEach((cls) => { if (cls.startsWith("card-ref-")) bId = cls.replace("card-ref-", "") })
                if (!bId) bId = el.dataset.blockId
                if (!bId) { el.closest("p")?.remove() ?? el.remove(); return }
                const cardHtml = cardMapRef.current.get(bId)
                if (cardHtml) {
                  const tmp = parser.parseFromString(cardHtml, "text/html")
                  const newNode = tmp.body.firstChild
                  const parentP = el.closest("p")
                  if (parentP && newNode) parentP.replaceWith(newNode)
                  else if (newNode) el.replaceWith(newNode)
                  else el.remove()
                } else {
                  const parentP = el.closest("p")
                  if (parentP) parentP.remove()
                  else el.remove()
                }
              })
              r = doc.body.innerHTML
            } catch { /* noop */ }
            return r
          })()
          setPreviewHtml(resolved)
        }, 150)
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

  // Replace card block di editor setelah user selesai edit dan klik Insert/Update
  const replaceCardPlaceholderInEditor = (blockId: string, type: "match" | "standings", cardHtml?: string) => {
    if (!editor) return
    const currentHtml = editor.getHTML()
    const parser = new DOMParser()
    const doc = parser.parseFromString(currentHtml, "text/html")

    const existing = doc.querySelector(`.card-ref-${blockId}`)
      ?? doc.querySelector(`[data-block-id="${blockId}"]`)
    if (!existing) return

    // Gunakan cardHtml yang diberikan, atau ambil dari cardMapRef sebagai fallback
    const resolvedCardHtml = cardHtml ?? cardMapRef.current.get(blockId)
    const newPlaceholder = buildCardPlaceholderHtml(blockId, type, resolvedCardHtml)
    const newDoc = parser.parseFromString(newPlaceholder, "text/html")
    const newNode = newDoc.body.firstChild

    if (newNode) {
      const parentP = existing.closest("p")
      if (parentP && parentP !== existing) {
        parentP.replaceWith(newNode)
      } else {
        existing.replaceWith(newNode)
      }
      editor.commands.setContent(doc.body.innerHTML, { emitUpdate: false })
    }
  }

  /**
   * resolveCards — mengubah badge placeholder menjadi output final.
   *
   * mode "preview" : placeholder → full HTML card static (untuk dangerouslySetInnerHTML di tab preview)
   * mode "save"    : placeholder → marker teks widget (untuk disimpan ke DB, lalu dirender
   *                  oleh ArticleBody / parseWidgetContent sebagai komponen React dinamis)
   */
  const resolveCards = useCallback((html: string, mode: "preview" | "save" = "preview"): string => {
    // Resolve [[CARD:id]] legacy format
    let resolved = html.replace(/\[\[CARD:([a-z0-9]+)\]\]/g, (_, id) => {
      return cardMapRef.current.get(id) ?? ""
    })

    const parser = new DOMParser()
    const doc = parser.parseFromString(resolved, "text/html")

    doc.querySelectorAll<HTMLElement>(".card-editor-placeholder").forEach((el) => {
      let blockId: string | undefined
      let type: "match" | "standings" | undefined

      el.classList.forEach((cls) => {
        if (cls.startsWith("card-ref-")) blockId = cls.replace("card-ref-", "")
        if (cls.startsWith("card-type-")) type = cls.replace("card-type-", "") as "match" | "standings"
      })
      if (!blockId) blockId = el.dataset.blockId
      if (!type) type = el.dataset.blockType as "match" | "standings"
      if (!blockId) { el.closest("p")?.remove() ?? el.remove(); return }

      // Prioritas 1: ambil dari cardMapRef (in-memory, paling up-to-date)
      let cardHtml = cardMapRef.current.get(blockId)

      // Prioritas 2: decode dari data-card-html attribute (embedded di badge — paling reliable)
      if (!cardHtml) {
        const encoded = el.dataset.cardHtml || el.getAttribute("data-card-html")
        if (encoded) {
          try { cardHtml = decodeURIComponent(escape(atob(encoded))) } catch { cardHtml = undefined }
        }
      }

      // Prioritas 3: sessionStorage sebagai last resort
      if (!cardHtml) {
        const stored = sessionStorage.getItem(`card-html-${blockId}`)
        if (stored) cardHtml = stored
      }

      if (cardHtml) {
        cardMapRef.current.set(blockId, cardHtml)

        if (mode === "preview") {
          // ── Mode preview: render full HTML card static ──
          // Placeholder diganti dengan HTML card lengkap agar tampil visual di tab preview.
          const tmp = parser.parseFromString(cardHtml, "text/html")
          const newNode = tmp.body.firstChild
          const parentP = el.closest("p")
          if (parentP && newNode) parentP.replaceWith(newNode)
          else if (newNode) el.replaceWith(newNode)
          else el.remove()
        } else {
          // ── Mode save: output marker teks jika sudah disync ke Supabase ──
          // parseWidgetContent di ArticleBody akan membaca marker ini dan
          // me-render komponen <JadwalCard> / <KlasemenCard> yang fetch data dari DB.
          const widgetId = widgetMapRef.current.get(blockId)
          if (widgetId) {
            const isMatch = type === "match"
            const markerText = isMatch
              ? `📅JadwalPertandinganWIDGET AKTIF\n🖇 klik untuk edit${widgetId}:${blockId}`
              : `🏆KlasemenGrupWIDGET AKTIF\n🖇 klik untuk edit${widgetId}:${blockId}`
            const markerEl = doc.createElement("p")
            markerEl.textContent = markerText
            const parentP = el.closest("p")
            if (parentP) parentP.replaceWith(markerEl)
            else el.replaceWith(markerEl)
          } else {
            // Belum ada widgetId (belum disync ke Supabase) — fallback ke full HTML
            const tmp = parser.parseFromString(cardHtml, "text/html")
            const newNode = tmp.body.firstChild
            const parentP = el.closest("p")
            if (parentP && newNode) parentP.replaceWith(newNode)
            else if (newNode) el.replaceWith(newNode)
            else el.remove()
          }
        }
      } else {
        // Tidak ada data card — hapus placeholder daripada menampilkan badge rusak
        const parentP = el.closest("p")
        if (parentP) parentP.remove()
        else el.remove()
      }
    })

    return doc.body.innerHTML
  }, [])

  // Update preview setiap kali tab preview aktif, dan juga setiap kali content editor berubah saat di preview
  useEffect(() => {
    if (editorTab !== "preview" || !editor) return
    const updatePreview = () => {
      const raw = editor.getHTML()
      const withSpacing = raw.replace(/<p><\/p>/g, "<p>&nbsp;</p>")
      setPreviewHtml(resolveCards(withSpacing, "preview"))
    }
    updatePreview()
    // Subscribe ke perubahan content saat di tab preview
    editor.on("update", updatePreview)
    return () => { editor.off("update", updatePreview) }
  }, [editorTab, editor, resolveCards])

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

    const rawHtml = editor.getHTML()

    // ── Restore cardMapRef dari sessionStorage untuk placeholder yang cardMapRef-nya kosong
    // Ini terjadi jika user me-refresh halaman setelah insert widget
    const preParser = new DOMParser()
    const preDoc = preParser.parseFromString(rawHtml, "text/html")
    preDoc.querySelectorAll<HTMLElement>(".card-editor-placeholder").forEach((el) => {
      let id: string | undefined
      el.classList.forEach((cls) => { if (cls.startsWith("card-ref-")) id = cls.replace("card-ref-", "") })
      if (!id) id = el.dataset.blockId
      if (!id) return
      if (!cardMapRef.current.has(id)) {
        // Prioritas 1: decode dari data-card-html (paling reliable, tidak bergantung session)
        const encoded = el.dataset.cardHtml || el.getAttribute("data-card-html")
        if (encoded) {
          try {
            const decoded = decodeURIComponent(escape(atob(encoded)))
            if (decoded) { cardMapRef.current.set(id, decoded); return }
          } catch { /* lanjut ke fallback */ }
        }
        // Prioritas 2: sessionStorage
        const stored = sessionStorage.getItem(`card-html-${id}`)
        if (stored) cardMapRef.current.set(id, stored)
      }
    })
    // Juga scan full card HTML yang mungkin masih ada di editor (bukan placeholder)
    preDoc.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      if (el.classList.contains("card-editor-placeholder")) return
      const id = el.dataset.blockId
      if (!id) return
      if (!cardMapRef.current.has(id)) {
        cardMapRef.current.set(id, el.outerHTML)
        sessionStorage.setItem(`card-html-${id}`, el.outerHTML)
      }
    })

    const htmlContent = resolveCards(rawHtml, "save")

    // Jika masih ada placeholder yang tidak ter-resolve, berarti cardMapRef kosong
    // (terjadi saat user refresh halaman) — tampilkan error
    if (htmlContent.includes("card-editor-placeholder")) {
      setIsLoading(false)
      setMessage({ type: "error", text: "Widget kartu tidak dapat disimpan karena data tidak ditemukan. Klik badge widget di editor lalu klik 'Update Card' di sidebar, kemudian simpan kembali." })
      return
    }

    // ── Kumpulkan card_data JSON dari cardMapRef ──────────────────────────────
    // Menyimpan data widget dalam bentuk JSON terstruktur agar bisa diedit kembali
    // tanpa harus parse HTML (lebih reliable daripada DOM parsing).
    const cardData: Record<string, any> = {}
    cardMapRef.current.forEach((cardHtml, blockId) => {
      try {
        const tmpDoc = new DOMParser().parseFromString(cardHtml, "text/html")
        const root = tmpDoc.body.firstElementChild as HTMLElement | null
        const blockType = root?.dataset.blockType
        if (blockType === "match") {
          const parsed = parseMatchBlockHtml(cardHtml)
          if (parsed) cardData[blockId] = { type: "match", tabs: parsed }
        } else if (blockType === "standings") {
          const parsed = parseStandingsBlockHtml(cardHtml)
          if (parsed) cardData[blockId] = { type: "standings", ...parsed }
        }
      } catch { /* skip block yang gagal di-parse */ }
    })
    // ─────────────────────────────────────────────────────────────────────────

    const payload = {
      title, slug: generateSlug(title), excerpt, content: htmlContent,
      card_data: cardData,
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
              <div className="flex items-center gap-2">
                {editingBlock && (
                  <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary animate-pulse">
                    <Pencil className="h-3 w-3" />
                    Klik card lain atau edit di sidebar
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground/50 tracking-tight">Markdown + HTML</span>
              </div>
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
          <div id="match-widget-anchor">
            <MatchCardWidget
              editData={editingBlock?.type === "match" ? editingBlock : null}
              onReset={() => setEditingBlock(null)}
              onInsert={async (html, blockId) => {
                if (!editor) return
                cardMapRef.current.set(blockId, html)
                sessionStorage.setItem(`card-html-${blockId}`, html)

                // ── Sync data ke Supabase widget_jadwal ──
                try {
                  const parsed = parseMatchBlockHtml(html)
                  if (parsed) {
                    // Gunakan widgetId yang sudah ada (edit) atau buat baru (insert)
                    const existingWidgetId = widgetMapRef.current.get(blockId)
                    const widgetId = existingWidgetId || crypto.randomUUID()

                    // Hapus baris lama untuk widget ini agar tidak duplikat
                    await supabase.from("widget_jadwal").delete().eq("widget_id", widgetId)

                    // Insert semua match dari semua tab
                    const rows = parsed.flatMap((tab) =>
                      tab.matches
                        .filter((m) => m.homeTeam || m.awayTeam)
                        .map((m) => ({
                          widget_id: widgetId,
                          group_label: tab.label,
                          home_team: m.homeTeam,
                          away_team: m.awayTeam,
                          match_date: m.date || null,
                          match_time: m.time || null,
                          score_home: m.homeScore !== "" ? Number(m.homeScore) : null,
                          score_away: m.awayScore !== "" ? Number(m.awayScore) : null,
                          status: (m.homeScore !== "" && m.awayScore !== "") ? "finished" : "scheduled",
                        }))
                    )
                    if (rows.length > 0) {
                      await supabase.from("widget_jadwal").insert(rows)
                    }
                    widgetMapRef.current.set(blockId, widgetId)
                  }
                } catch (err) {
                  console.error("Gagal sync widget_jadwal:", err)
                }

                if (editingBlock?.blockId === blockId) {
                  replaceCardPlaceholderInEditor(blockId, "match", html)
                } else {
                  const placeholder = buildCardPlaceholderHtml(blockId, "match", html)
                  editor.chain().focus().insertContent(placeholder).run()
                }
                setEditingBlock(null)
                setModalOpen(false)
              }}
            />
          </div>

          {/* ── Klasemen Fase Grup Widget ── */}
          <div id="standings-widget-anchor">
            <GroupStandingsWidget
              editData={editingBlock?.type === "standings" ? editingBlock : null}
              onReset={() => setEditingBlock(null)}
              onInsert={async (html, blockId) => {
                if (!editor) return
                cardMapRef.current.set(blockId, html)
                sessionStorage.setItem(`card-html-${blockId}`, html)

                // ── Sync data ke Supabase widget_klasemen ──
                try {
                  const parsed = parseStandingsBlockHtml(html)
                  if (parsed) {
                    const existingWidgetId = widgetMapRef.current.get(blockId)
                    const widgetId = existingWidgetId || crypto.randomUUID()

                    await supabase.from("widget_klasemen").delete().eq("widget_id", widgetId)

                    const rows = parsed.groups.flatMap((group, _gi) =>
                      group.teams
                        .filter((t) => t.name)
                        .map((t, idx) => ({
                          widget_id: widgetId,
                          group_label: group.label,
                          rank: idx + 1,
                          team_name: t.name,
                          played: t.played,
                          won: t.won,
                          drawn: t.drawn,
                          lost: t.lost,
                          gf: t.gf,
                          ga: t.ga,
                          points: t.pts,
                        }))
                    )
                    if (rows.length > 0) {
                      await supabase.from("widget_klasemen").insert(rows)
                    }
                    widgetMapRef.current.set(blockId, widgetId)
                  }
                } catch (err) {
                  console.error("Gagal sync widget_klasemen:", err)
                }

                if (editingBlock?.blockId === blockId) {
                  replaceCardPlaceholderInEditor(blockId, "standings", html)
                } else {
                  const placeholder = buildCardPlaceholderHtml(blockId, "standings", html)
                  editor.chain().focus().insertContent(placeholder).run()
                }
                setEditingBlock(null)
                setModalOpen(false)
              }}
            />
          </div>

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

    {/* ── Card Inline Edit Modal ── */}
    {modalOpen && editingBlock && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm py-8 px-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setModalOpen(false)
            setEditingBlock(null)
          }
        }}
      >
        <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

          {/* Modal header */}
          <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="text-base">
                {editingBlock.type === "match" ? "📅" : "🏆"}
              </span>
              <span className="font-semibold text-foreground text-sm">
                Edit {editingBlock.type === "match" ? "Jadwal Pertandingan" : "Klasemen Grup"}
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary tracking-wide">
                INLINE EDIT
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setModalOpen(false); setEditingBlock(null) }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Modal body — widget */}
          <div className="p-5">
            {editingBlock.type === "match" ? (
              <MatchCardWidget
                editData={editingBlock}
                onReset={() => { setEditingBlock(null); setModalOpen(false) }}
                onInsert={(html, blockId) => {
                  if (!editor) return
                  cardMapRef.current.set(blockId, html)
                  sessionStorage.setItem(`card-html-${blockId}`, html)
                  if (editingBlock?.blockId === blockId) {
                    replaceCardPlaceholderInEditor(blockId, "match", html)
                  } else {
                    const placeholder = buildCardPlaceholderHtml(blockId, "match", html)
                    editor.chain().focus().insertContent(placeholder).run()
                  }
                  setEditingBlock(null)
                  setModalOpen(false)
                }}
              />
            ) : (
              <GroupStandingsWidget
                editData={editingBlock}
                onReset={() => { setEditingBlock(null); setModalOpen(false) }}
                onInsert={(html, blockId) => {
                  if (!editor) return
                  cardMapRef.current.set(blockId, html)
                  sessionStorage.setItem(`card-html-${blockId}`, html)
                  if (editingBlock?.blockId === blockId) {
                    replaceCardPlaceholderInEditor(blockId, "standings", html)
                  } else {
                    const placeholder = buildCardPlaceholderHtml(blockId, "standings", html)
                    editor.chain().focus().insertContent(placeholder).run()
                  }
                  setEditingBlock(null)
                  setModalOpen(false)
                }}
              />
            )}
          </div>

          {/* Modal footer */}
          <div className="border-t border-border bg-secondary/10 px-5 py-3 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              💡 Edit data di atas lalu klik{" "}
              <strong className="text-foreground">Update Card</strong>
              {" "}— preview & halaman artikel akan terupdate saat dipublish ulang.
            </span>
          </div>
        </div>
      </div>
    )}

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
