// app/api/generate-image/route.ts

import type React from "react"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import fs from "fs"
import path from "path"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 300
const FETCH_TIMEOUT_MS  = 30_000
const MAX_RETRIES       = 2
const IMG_SIZE          = 512

// ─── Content Types ────────────────────────────────────────────────────────────

export type ContentType =
  | "match_preview"
  | "match_result"
  | "schedule"
  | "squad"
  | "prediction"
  | "transfer"
  | "press_conference"
  | "injury"
  | "trivia"
  | "general"

export interface OverlayData {
  contentType: ContentType
  teamHome?: string
  teamAway?: string
  scoreHome?: string
  scoreAway?: string
  matchDate?: string
  venue?: string
  competition?: string
  matchCount?: string
  dateRange?: string
  teamName?: string
  playerCount?: string
  season?: string
  tournament?: string
  favorite?: string
  playerName?: string
  fromClub?: string
  toClub?: string
  transferFee?: string
  transferStatus?: string
  clubName?: string
  managerName?: string
  managerRole?: string
  quote?: string
  playerStatus?: string
  injuryType?: string
  injuryDuration?: string
  triviaNumber?: string
  triviaUnit?: string
  triviaFact?: string
  headline?: string
  subheadline?: string
}

// ─── Detect content type ──────────────────────────────────────────────────────

export function detectContentType(title: string): ContentType {
  const t = title.toLowerCase()
  if (/hasil|skor|menang|kalah|imbang|gol|FT|HT/.test(t))                      return "match_result"
  if (/preview|prediksi laga|head.to.head|pertemuan|lawan/.test(t))             return "match_preview"
  if (/jadwal|fixture|schedule/.test(t))                                         return "schedule"
  if (/skuad|squad|daftar pemain|lineup/.test(t))                               return "squad"
  if (/prediksi juara|favorit juara|peluang juara|odds/.test(t))                return "prediction"
  if (/transfer|rumor|kabar|pindah|rekrut|kontrak|bursa/.test(t))               return "transfer"
  if (/konferensi pers|press conference|manajer bicara|pelatih bicara/.test(t)) return "press_conference"
  if (/cedera|injury|absen|pulih|kondisi/.test(t))                              return "injury"
  if (/trivia|fakta|sejarah|rekor|statistik|tahukah/.test(t))                  return "trivia"
  return "general"
}

// ─── CF prompt builder ────────────────────────────────────────────────────────

function buildCFPrompt(contentType: ContentType, userPrompt: string): string {
  const base = userPrompt.slice(0, MAX_PROMPT_LENGTH)
  const styleMap: Record<ContentType, string> = {
    match_result:     "football stadium at night with dramatic floodlights blazing overhead, confetti raining down, packed crowd silhouettes celebrating, golden spotlights cutting through atmospheric fog, cinematic wide angle, deep dark sky, no people faces visible",
    transfer:         "elegant conference room interior, long dark table with dramatic spotlight, contract papers and pen visible, luxury executive atmosphere, bokeh window background with city lights, dark moody tones, no people",
    injury:           "modern sports medical room, clinical blue-tinted lighting, treatment table with professional equipment, dark walls with dramatic accent lighting, recovery atmosphere, blurred training pitch visible through window, no people",
    match_preview:    "two football teams dramatically facing each other on a rain-soaked pitch at night, floodlights creating god rays through stadium fog, intense atmosphere, cinematic split composition, no faces visible, dark dramatic sky",
    trivia:           "vintage retro football scene, old-style stadium with classic terraces, sepia and amber tones, nostalgic grainy film texture, historic atmosphere, crowd silhouettes in vintage style, dramatic editorial mood",
    schedule:         "empty football stadium aerial view at dusk, floodlights glowing on pristine green pitch, dramatic dark sky with clouds, cinematic wide angle, no people",
    squad:            "dark football locker room with individual player pegs and jerseys hanging, dramatic backlight through door, cinematic moody atmosphere, no faces",
    prediction:       "world cup trophy on a dark pedestal with dramatic golden spotlight, stadium blurred in background, deep shadows, cinematic dramatic editorial",
    press_conference: "dark press conference room with podium, cluster of microphones in spotlight, bokeh media background, moody professional atmosphere, no faces",
    general:          "dark dramatic football stadium panoramic, crowd silhouettes, floodlights blazing through atmospheric fog, cinematic editorial style, no faces",
  }
  return `${base}, ${styleMap[contentType]}, absolutely no text, no letters, no numbers, no watermark, no typography, no identifiable faces, pure dark cinematic background, high quality, editorial photography style`
}

// ─── Font loader ──────────────────────────────────────────────────────────────

let _fontBold:   Buffer | null = null
let _fontMedium: Buffer | null = null

function getFonts(): { bold: Buffer; medium: Buffer } {
  if (!_fontBold)   _fontBold   = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf"))
  if (!_fontMedium) _fontMedium = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Inter-Medium.ttf"))
  return { bold: _fontBold, medium: _fontMedium }
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const NEON = "#39FF14"

const TYPE_LABELS: Record<ContentType, string> = {
  match_preview:    "PREVIEW",
  match_result:     "FULL TIME",
  schedule:         "JADWAL LENGKAP",
  squad:            "DAFTAR SKUAD",
  prediction:       "PREDIKSI JUARA",
  transfer:         "BREAKING TRANSFER",
  press_conference: "PRESS CONFERENCE",
  injury:           "INJURY REPORT",
  trivia:           "TRIVIA",
  general:          "BERITA",
}

// ─── Satori node type ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SN = Record<string, any>

// div helper — ALWAYS sets display:flex so Satori never complains about multi-child nodes
function div(style: Record<string, unknown>, children: SN | SN[] | string): SN {
  const base: Record<string, unknown> = { display: "flex" }
  return {
    type: "div",
    props: { style: { ...base, ...style }, children },
  }
}

function txt(style: Record<string, unknown>, children: string): SN {
  return { type: "div", props: { style: { display: "flex", ...style }, children } }
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function topBar(left: string, accent: string): SN {
  return div(
    { justifyContent: "space-between", alignItems: "center", width: "100%" },
    [
      txt({ fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2 }, left),
      txt({ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }, "halfspace.id"),
    ]
  )
}

function dividerLine(): SN {
  return div({ borderTop: "1px solid rgba(255,255,255,0.08)", width: "100%", marginTop: 0 }, " ")
}

function clubBadge(initial: string): SN {
  return div(
    { width: 44, height: 44, borderRadius: 8, background: "#1e293b", border: "1.5px solid rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
    txt({ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }, initial.slice(0, 3).toUpperCase())
  )
}

// ─── Layout: match_result ─────────────────────────────────────────────────────

function renderMatchResult(o: OverlayData, accent: string): SN {
  const accentDim = "rgba(57,255,20,0.15)"
  const home = (o.teamHome || "HOME").slice(0, 3).toUpperCase()
  const away = (o.teamAway || "AWAY").slice(0, 3).toUpperCase()

  return div(
    { flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
    [
      // top
      topBar(o.competition || "PERTANDINGAN", accent),
      // score row
      div({ alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }, [
        // home
        div({ flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }, [
          clubBadge(home),
          txt({ fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center" }, o.teamHome || "Home"),
        ]),
        // center score
        div({ flexDirection: "column", alignItems: "center", gap: 4 }, [
          div({ background: accentDim, border: "1px solid rgba(57,255,20,0.3)", borderRadius: 10, paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, alignItems: "center", justifyContent: "center" },
            txt({ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1 }, "FT")
          ),
          div({ alignItems: "center", gap: 6 }, [
            txt({ fontSize: 32, fontWeight: 900, color: "#fff" }, String(o.scoreHome ?? "0")),
            txt({ fontSize: 18, fontWeight: 300, color: "rgba(255,255,255,0.3)" }, "—"),
            txt({ fontSize: 32, fontWeight: 900, color: "rgba(255,255,255,0.5)" }, String(o.scoreAway ?? "0")),
          ]),
        ]),
        // away
        div({ flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }, [
          clubBadge(away),
          txt({ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textAlign: "center" }, o.teamAway || "Away"),
        ]),
      ]),
      // bottom
      div({ flexDirection: "column", gap: 4, width: "100%", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }, [
        txt({ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.3 }, o.headline || " "),
        txt({ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, o.subheadline || " "),
      ]),
    ]
  )
}

// ─── Layout: transfer ─────────────────────────────────────────────────────────

function renderTransfer(o: OverlayData, accent: string): SN {
  const statusColor = "#FBBF24"
  return div(
    { flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
    [
      topBar("TRANSFER NEWS", accent),
      div({ flexDirection: "column", gap: 8 }, [
        // status badge
        div(
          { background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.45)", borderRadius: 6, paddingLeft: 10, paddingRight: 10, paddingTop: 3, paddingBottom: 3, alignSelf: "flex-start" },
          txt({ fontSize: 9, fontWeight: 800, color: statusColor, letterSpacing: 2 }, o.transferStatus || "RUMOR")
        ),
        txt({ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1.2 }, o.playerName || "Nama Pemain"),
        div({ alignItems: "center", gap: 8 }, [
          txt({ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600 }, o.fromClub || "—"),
          txt({ fontSize: 14, color: accent }, "→"),
          txt({ fontSize: 10, color: "#fff", fontWeight: 700 }, o.toClub || "—"),
        ]),
        div({ alignItems: "center", gap: 6 }, [
          txt({ fontSize: 9, color: "rgba(255,255,255,0.4)" }, "Estimasi Fee:"),
          txt({ fontSize: 14, fontWeight: 900, color: accent }, o.transferFee || "—"),
        ]),
      ]),
      div({ flexDirection: "column", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, width: "100%" }, [
        txt({ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, o.subheadline || " "),
      ]),
    ]
  )
}

// ─── Layout: match_preview ────────────────────────────────────────────────────

function renderMatchPreview(o: OverlayData, accent: string): SN {
  const accentDim = "rgba(57,255,20,0.08)"
  const home = (o.teamHome || "HOME").slice(0, 3).toUpperCase()
  const away = (o.teamAway || "AWAY").slice(0, 3).toUpperCase()
  const meta = [o.matchDate, o.venue].filter(Boolean).join(" · ")

  return div(
    { flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
    [
      topBar(o.competition || "PERTANDINGAN", accent),
      // teams
      div({ alignItems: "center", justifyContent: "space-between", width: "100%" }, [
        div({ flexDirection: "column", alignItems: "center", gap: 5 }, [
          clubBadge(home),
          txt({ fontSize: 10, fontWeight: 700, color: "#fff" }, o.teamHome || "Home"),
        ]),
        div({ flexDirection: "column", alignItems: "center", gap: 3 }, [
          txt({ fontSize: 11, fontWeight: 300, color: "rgba(255,255,255,0.3)", letterSpacing: 3 }, "VS"),
          div({ width: 1, height: 20, background: `linear-gradient(to bottom, ${accent}, transparent)` }, " "),
        ]),
        div({ flexDirection: "column", alignItems: "center", gap: 5 }, [
          clubBadge(away),
          txt({ fontSize: 10, fontWeight: 700, color: "#fff" }, o.teamAway || "Away"),
        ]),
      ]),
      // info box
      div(
        { background: accentDim, border: "1px solid rgba(57,255,20,0.2)", borderRadius: 8, paddingLeft: 10, paddingRight: 10, paddingTop: 8, paddingBottom: 8, flexDirection: "column", gap: 3, width: "100%" },
        [
          txt({ fontSize: 9, color: accent, fontWeight: 700, letterSpacing: 1 }, meta || " "),
          txt({ fontSize: 11, fontWeight: 800, color: "#fff", lineHeight: 1.3 }, o.headline || " "),
        ]
      ),
    ]
  )
}

// ─── Layout: injury ───────────────────────────────────────────────────────────

function renderInjury(o: OverlayData, accent: string): SN {
  return div(
    { flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
    [
      topBar("INJURY REPORT", accent),
      div({ flexDirection: "column", gap: 6 }, [
        div(
          { background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 6, paddingLeft: 10, paddingRight: 10, paddingTop: 3, paddingBottom: 3, alignSelf: "flex-start" },
          txt({ fontSize: 9, fontWeight: 800, color: "#F87171", letterSpacing: 2 }, o.playerStatus || "OUT")
        ),
        txt({ fontSize: 20, fontWeight: 900, color: "#fff" }, o.playerName || "Nama Pemain"),
        txt({ fontSize: 10, color: "rgba(255,255,255,0.5)" }, o.clubName || " "),
        div({ gap: 12, marginTop: 4 }, [
          div({ flexDirection: "column", gap: 2 }, [
            txt({ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }, "CEDERA"),
            txt({ fontSize: 11, fontWeight: 700, color: accent }, o.injuryType || "—"),
          ]),
          div({ width: 1, background: "rgba(255,255,255,0.1)", alignSelf: "stretch" }, " "),
          div({ flexDirection: "column", gap: 2 }, [
            txt({ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }, "ABSEN"),
            txt({ fontSize: 11, fontWeight: 700, color: "#FCD34D" }, o.injuryDuration || "—"),
          ]),
        ]),
      ]),
      div({ flexDirection: "column", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, width: "100%" }, [
        txt({ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, o.subheadline || " "),
      ]),
    ]
  )
}

// ─── Layout: press_conference ─────────────────────────────────────────────────

function renderPressConference(o: OverlayData, accent: string): SN {
  const accentDim = "rgba(57,255,20,0.1)"
  return div(
    { flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
    [
      topBar("PRESS CONFERENCE", accent),
      div({ flexDirection: "column", gap: 6 }, [
        txt({ fontSize: 28, color: accent, fontWeight: 900, lineHeight: 0.8 }, "\u201C"),
        txt({ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.4, fontStyle: "italic" }, o.quote || o.headline || "Kutipan konferensi pers"),
        div({ justifyContent: "flex-end" },
          txt({ fontSize: 28, color: accent, fontWeight: 900, lineHeight: 0.8 }, "\u201D")
        ),
        div({ alignItems: "center", gap: 8, marginTop: 4 }, [
          div(
            { width: 24, height: 24, borderRadius: 12, background: accentDim, border: "1px solid rgba(57,255,20,0.35)", alignItems: "center", justifyContent: "center" },
            txt({ fontSize: 10 }, "\uD83D\uDC64")
          ),
          div({ flexDirection: "column", gap: 1 }, [
            txt({ fontSize: 10, fontWeight: 800, color: "#fff" }, o.managerName || "Narasumber"),
            txt({ fontSize: 8, color: "rgba(255,255,255,0.4)" }, o.managerRole || o.clubName || " "),
          ]),
        ]),
      ]),
      div({ flexDirection: "column", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, width: "100%" }, [
        txt({ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, o.subheadline || " "),
      ]),
    ]
  )
}

// ─── Layout: trivia ───────────────────────────────────────────────────────────

function renderTrivia(o: OverlayData, accent: string): SN {
  return div(
    { flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
    [
      topBar("TRIVIA", accent),
      div({ flexDirection: "column", gap: 4 }, [
        div({ alignItems: "baseline", gap: 4 }, [
          txt({ fontSize: 52, fontWeight: 900, color: accent, lineHeight: 1 }, o.triviaNumber || "?"),
          txt({ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)" }, o.triviaUnit || ""),
        ]),
        txt(
          { fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.4, borderLeft: `2px solid ${accent}`, paddingLeft: 8 },
          o.triviaFact || " "
        ),
      ]),
      div({ flexDirection: "column", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, gap: 3, width: "100%" }, [
        txt({ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.3 }, o.headline || " "),
        txt({ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, o.subheadline || " "),
      ]),
    ]
  )
}

// ─── Layout: schedule ─────────────────────────────────────────────────────────

function renderSchedule(o: OverlayData, accent: string): SN {
  return div({ flexDirection: "column", alignItems: "center", gap: 8 }, [
    txt({ fontSize: 13, color: "#fff", fontWeight: 700, letterSpacing: 2 }, o.competition || "JADWAL"),
    txt({ fontSize: 28, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.2 }, o.matchCount ? `${o.matchCount} Pertandingan` : "Jadwal Lengkap"),
    txt({ fontSize: 14, color: "rgba(57,255,20,0.55)", textAlign: "center" }, o.dateRange || " "),
  ])
}

// ─── Layout: squad ────────────────────────────────────────────────────────────

function renderSquad(o: OverlayData, accent: string): SN {
  return div({ flexDirection: "column", alignItems: "center", gap: 8 }, [
    txt({ fontSize: 30, fontWeight: 700, color: "#fff", textAlign: "center" }, o.teamName || "Skuad"),
    txt({ fontSize: 14, color: accent, fontWeight: 700, letterSpacing: 1 }, o.season ? `Musim ${o.season}` : " "),
    txt({ fontSize: 13, color: "rgba(57,255,20,0.50)" }, o.playerCount ? `${o.playerCount} Pemain` : " "),
  ])
}

// ─── Layout: prediction ───────────────────────────────────────────────────────

function renderPrediction(o: OverlayData, accent: string): SN {
  return div({ flexDirection: "column", alignItems: "center", gap: 8 }, [
    txt({ fontSize: 13, color: accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }, o.tournament || "TURNAMEN"),
    txt({ fontSize: 15, color: "rgba(57,255,20,0.50)", marginTop: 2 }, "Favorit Juara"),
    txt({ fontSize: 34, fontWeight: 700, color: accent, textAlign: "center", lineHeight: 1.1 }, o.favorite || "—"),
  ])
}

// ─── Layout: general ─────────────────────────────────────────────────────────

function renderGeneral(o: OverlayData, accent: string): SN {
  return div({ flexDirection: "column", alignItems: "center", gap: 8 }, [
    txt({ fontSize: 26, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.3, maxWidth: 380 }, o.headline || "Halfspace"),
    txt({ fontSize: 14, color: "rgba(57,255,20,0.55)", textAlign: "center", maxWidth: 340 }, o.subheadline || " "),
  ])
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const FULLBLEED: ContentType[] = ["match_result", "transfer", "match_preview", "injury", "press_conference", "trivia"]

function renderContent(overlay: OverlayData, accent: string): SN {
  switch (overlay.contentType) {
    case "match_result":     return renderMatchResult(overlay, accent)
    case "transfer":         return renderTransfer(overlay, accent)
    case "match_preview":    return renderMatchPreview(overlay, accent)
    case "injury":           return renderInjury(overlay, accent)
    case "press_conference": return renderPressConference(overlay, accent)
    case "trivia":           return renderTrivia(overlay, accent)
    case "schedule":         return renderSchedule(overlay, accent)
    case "squad":            return renderSquad(overlay, accent)
    case "prediction":       return renderPrediction(overlay, accent)
    default:                 return renderGeneral(overlay, accent)
  }
}

// ─── Base64 → data URI ────────────────────────────────────────────────────────

function cfBase64ToDataURI(base64: string): string {
  const header = base64.slice(0, 12)
  let mime = "image/png"
  if (header.startsWith("/9j/"))   mime = "image/jpeg"
  if (header.startsWith("UklGR")) mime = "image/webp"
  return `data:${mime};base64,${base64}`
}

// ─── Satori composite ─────────────────────────────────────────────────────────

async function buildCompositeSVG(bgDataURI: string, overlay: OverlayData): Promise<string> {
  const { bold, medium } = getFonts()
  const accent    = NEON
  const label     = TYPE_LABELS[overlay.contentType]
  const isFullbleed = FULLBLEED.includes(overlay.contentType)
  const content   = renderContent(overlay, accent)

  const root = div(
    {
      flexDirection: "column",
      width: IMG_SIZE,
      height: IMG_SIZE,
      position: "relative",
      fontFamily: "Inter",
      backgroundImage: `url("${bgDataURI}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    },
    [
      // dark gradient
      div({
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.80) 50%, rgba(0,0,0,0.60) 100%)",
      }, " "),
      // vignette
      div({
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
      }, " "),
      // tag pill — top right
      div({
        position: "absolute", top: 14, right: 16,
        backgroundColor: accent, borderRadius: 4,
        paddingLeft: 9, paddingRight: 9, paddingTop: 3, paddingBottom: 3,
        alignItems: "center",
      },
        txt({ fontSize: 8, fontWeight: 800, color: "#000", letterSpacing: 1.5 }, label)
      ),
      // accent bar — top left
      div({
        position: "absolute", top: 20, left: 20,
        width: 32, height: 3, backgroundColor: accent, borderRadius: 2,
      }, " "),
      // content
      isFullbleed
        ? div({ position: "absolute", inset: 0 }, content)
        : div({
            position: "absolute", bottom: 75, left: 0, right: 0,
            flexDirection: "column", alignItems: "center",
            paddingLeft: 24, paddingRight: 24, gap: 12,
          }, content),
      // branding footer
      div({
        position: "absolute", bottom: 14, left: 0, right: 0,
        justifyContent: "center", alignItems: "center",
      },
        txt({ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }, "HALFSPACESPORT.COM")
      ),
    ]
  )

  return await satori(root as unknown as React.ReactNode, {
    width: IMG_SIZE,
    height: IMG_SIZE,
    fonts: [
      { name: "Inter", data: bold,   weight: 700, style: "normal" },
      { name: "Inter", data: medium, weight: 500, style: "normal" },
    ],
  })
}

// ─── SVG → PNG ────────────────────────────────────────────────────────────────

function renderSVGtoPNG(svg: string): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: IMG_SIZE }, imageRendering: 1 })
  return Buffer.from(resvg.render().asPng())
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken  = process.env.CF_API_TOKEN
  if (!accountId || !apiToken)
    return NextResponse.json({ error: "CF_ACCOUNT_ID / CF_API_TOKEN belum dikonfigurasi." }, { status: 500 })

  let body: { prompt?: string; overlay?: OverlayData }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 }) }

  const prompt = body.prompt?.trim()
  if (!prompt) return NextResponse.json({ error: "Prompt wajib diisi." }, { status: 400 })

  const overlay: OverlayData = body.overlay ?? { contentType: "general" }
  const cfPrompt = buildCFPrompt(overlay.contentType, prompt)
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`

  let lastError = "Cloudflare Workers AI gagal merespons."

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cfPrompt }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (!res.ok) {
        lastError = `Cloudflare error ${res.status}`
        console.error("[generate-image] non-ok:", res.status, await res.text().catch(() => ""))
        continue
      }

      const data   = await res.json()
      const base64 = data?.result?.image
      if (!base64) {
        lastError = "Cloudflare tidak mengembalikan gambar."
        console.error("[generate-image] unexpected shape:", JSON.stringify(data).slice(0, 500))
        continue
      }

      try {
        const svg = await buildCompositeSVG(cfBase64ToDataURI(base64), overlay)
        const png = renderSVGtoPNG(svg)
        return new NextResponse(new Uint8Array(png), {
          status: 200,
          headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
        })
      } catch (compErr) {
        console.error("[generate-image] composite error:", compErr)
        return NextResponse.json(
          { error: "Gagal memproses gambar: " + (compErr instanceof Error ? compErr.message : String(compErr)) },
          { status: 500 }
        )
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError"
      lastError = isTimeout ? "Cloudflare timeout." : "Gagal menghubungi Cloudflare Workers AI."
      console.error("[generate-image] fetch error:", err)
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 })
}
