// app/api/generate-image/route.ts
//
// Flow:
//   1. Cloudflare Workers AI (FLUX.1-schnell) → pure background image (base64 PNG/JPEG)
//   2. Background dikonversi ke WebP data-URI (pure JS, tanpa sharp/canvas)
//   3. Satori → render overlay teks sebagai SVG dengan background ter-embed sebagai <image>
//   4. @resvg/resvg-js → render SVG final (background + teks) → PNG buffer
//
// Tidak ada sharp, tidak ada canvas — aman di Vercel & Edge.
//
// Env vars yang dibutuhkan:
//   CF_ACCOUNT_ID
//   CF_API_TOKEN  (permission: Workers AI - Read)
//
// Install dependencies:
//   npm install satori @resvg/resvg-js
//   npm uninstall sharp canvas   ← hapus ini
//
// Font yang dibutuhkan (taruh di public/fonts/):
//   Inter-Bold.ttf
//   Inter-Medium.ttf
//   Download dari: https://fonts.google.com/specimen/Inter
//   atau: https://github.com/rsms/inter/releases

import type React from "react"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import fs from "fs"
import path from "path"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 300
const FETCH_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2
const IMG_SIZE = 512

// ─── Content Types ────────────────────────────────────────────────────────────

export type ContentType =
  | "match_preview"    // Preview Pertandingan
  | "match_result"     // Hasil Pertandingan
  | "schedule"         // Jadwal Lengkap
  | "squad"            // Daftar Skuad
  | "prediction"       // Prediksi Juara
  | "transfer"         // Transfer Rumor
  | "press_conference" // Konferensi Pers
  | "injury"           // Update Cedera
  | "trivia"           // Trivia & Feature
  | "general"          // Fallback

// Data overlay per tipe konten
export interface OverlayData {
  contentType: ContentType
  // match_preview / match_result
  teamHome?: string
  teamAway?: string
  scoreHome?: string
  scoreAway?: string
  matchDate?: string
  venue?: string
  competition?: string
  // schedule
  matchCount?: string
  dateRange?: string
  // squad
  teamName?: string
  playerCount?: string
  season?: string
  // prediction
  tournament?: string
  favorite?: string
  // transfer
  playerName?: string
  fromClub?: string
  toClub?: string
  transferFee?: string
  transferStatus?: string
  // press_conference / injury
  clubName?: string
  managerName?: string
  managerRole?: string
  quote?: string
  playerStatus?: string
  injuryType?: string
  injuryDuration?: string
  // trivia
  triviaNumber?: string
  triviaUnit?: string
  triviaFact?: string
  // general fallback
  headline?: string
  subheadline?: string
}

// ─── Detect content type from title ──────────────────────────────────────────

export function detectContentType(title: string): ContentType {
  const t = title.toLowerCase()

  if (/hasil|skor|menang|kalah|imbang|gol|FT|HT/.test(t)) return "match_result"
  if (/preview|prediksi laga|head.to.head|pertemuan|lawan/.test(t)) return "match_preview"
  if (/jadwal|fixture|schedule/.test(t)) return "schedule"
  if (/skuad|squad|daftar pemain|lineup/.test(t)) return "squad"
  if (/prediksi juara|favorit juara|peluang juara|odds/.test(t)) return "prediction"
  if (/transfer|rumor|kabar|pindah|rekrut|kontrak|bursa/.test(t)) return "transfer"
  if (/konferensi pers|press conference|manajer bicara|pelatih bicara/.test(t)) return "press_conference"
  if (/cedera|injury|absen|pulih|kondisi/.test(t)) return "injury"
  if (/trivia|fakta|sejarah|rekor|statistik|tahukah/.test(t)) return "trivia"

  return "general"
}

// ─── Build Cloudflare prompt per content type ─────────────────────────────────

function buildCFPrompt(contentType: ContentType, userPrompt: string): string {
  const base = userPrompt.slice(0, MAX_PROMPT_LENGTH)

  const styleMap: Record<ContentType, string> = {
    match_result:
      "football stadium at night with dramatic floodlights blazing overhead, confetti raining down, packed crowd silhouettes celebrating, golden spotlights cutting through atmospheric fog, cinematic wide angle, deep dark sky, no people faces visible",
    transfer:
      "elegant conference room interior, long dark table with dramatic spotlight, contract papers and pen visible, luxury executive atmosphere, bokeh window background with city lights, dark moody tones, no people",
    injury:
      "modern sports medical room, clinical blue-tinted lighting, treatment table with professional equipment, dark walls with dramatic accent lighting, recovery atmosphere, blurred training pitch visible through window, no people",
    match_preview:
      "two football teams dramatically facing each other on a rain-soaked pitch at night, floodlights creating god rays through stadium fog, intense atmosphere, cinematic split composition, no faces visible, dark dramatic sky",
    trivia:
      "vintage retro football scene, old-style stadium with classic terraces, sepia and amber tones, nostalgic grainy film texture, historic atmosphere, crowd silhouettes in vintage style, dramatic editorial mood",
    schedule:
      "empty football stadium aerial view at dusk, floodlights glowing on pristine green pitch, dramatic dark sky with clouds, cinematic wide angle, no people",
    squad:
      "dark football locker room with individual player pegs and jerseys hanging, dramatic backlight through door, cinematic moody atmosphere, no faces",
    prediction:
      "world cup trophy on a dark pedestal with dramatic golden spotlight, stadium blurred in background, deep shadows, cinematic dramatic editorial",
    press_conference:
      "dark press conference room with podium, cluster of microphones in spotlight, bokeh media background, moody professional atmosphere, no faces",
    general:
      "dark dramatic football stadium panoramic, crowd silhouettes, floodlights blazing through atmospheric fog, cinematic editorial style, no faces",
  }

  const style = styleMap[contentType]
  return `${base}, ${style}, absolutely no text, no letters, no numbers, no watermark, no typography, no identifiable faces, pure dark cinematic background, high quality, editorial photography style`
}

// ─── Load font ────────────────────────────────────────────────────────────────

let _fontBoldCache: Buffer | null = null
let _fontMediumCache: Buffer | null = null

function loadFont(name: string): Buffer {
  const fontPath = path.join(process.cwd(), "public", "fonts", name)

  if (!fs.existsSync(fontPath)) {
    throw new Error(
      `Font tidak ditemukan: public/fonts/${name}\n` +
      `Download Inter dari https://fonts.google.com/specimen/Inter lalu taruh file .ttf di public/fonts/`
    )
  }

  return fs.readFileSync(fontPath)
}

function getFonts(): { bold: Buffer; medium: Buffer } {
  if (!_fontBoldCache)   _fontBoldCache   = loadFont("Inter-Bold.ttf")
  if (!_fontMediumCache) _fontMediumCache = loadFont("Inter-Medium.ttf")
  return { bold: _fontBoldCache, medium: _fontMediumCache }
}

// ─── Theme & Labels ───────────────────────────────────────────────────────────

const NEON = "#39FF14"

const THEMES: Record<ContentType, { accent: string; bg: string; text: string }> = {
  match_preview:    { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
  match_result:     { accent: NEON, bg: "rgba(0,0,0,0.85)", text: "#FFFFFF" },
  schedule:         { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
  squad:            { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
  prediction:       { accent: NEON, bg: "rgba(0,0,0,0.85)", text: "#FFFFFF" },
  transfer:         { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
  press_conference: { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
  injury:           { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
  trivia:           { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
  general:          { accent: NEON, bg: "rgba(0,0,0,0.82)", text: "#FFFFFF" },
}

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

// ─── Satori node helper ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SNode = Record<string, any>

function compact(arr: (SNode | string | number | null | undefined | false | 0 | "")[]): SNode[] {
  return arr.filter((x): x is SNode => Boolean(x))
}

// ─── Konversi base64 CF response → data URI ──────────────────────────────────

function cfBase64ToDataURI(base64: string): string {
  const header = base64.slice(0, 12)
  let mimeType = "image/png"
  if (header.startsWith("/9j/"))   mimeType = "image/jpeg"
  if (header.startsWith("UklGR")) mimeType = "image/webp"
  return `data:${mimeType};base64,${base64}`
}

// ─── Layout renderers per content type ───────────────────────────────────────

function renderMatchResult(overlay: OverlayData, accent: string): SNode {
  const accentDim = "rgba(57,255,20,0.15)"
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
      children: [
        // Top bar
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
            children: [
              {
                type: "div",
                props: {
                  style: { fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2, textTransform: "uppercase" },
                  children: overlay.competition || "PERTANDINGAN",
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1 },
                  children: "halfspace.id",
                },
              },
            ],
          },
        },
        // Score row
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
            children: [
              // Home team
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { width: 44, height: 44, borderRadius: 8, background: "#1e293b", border: "1.5px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" },
                        children: {
                          type: "div",
                          props: {
                            style: { fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: 0.5 },
                            children: (overlay.teamHome || "HOM").slice(0, 3).toUpperCase(),
                          },
                        },
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center" },
                        children: overlay.teamHome || "Home",
                      },
                    },
                  ],
                },
              },
              // Score center
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { background: accentDim, border: `1px solid rgba(57,255,20,0.3)`, borderRadius: 10, padding: "4px 12px" },
                        children: {
                          type: "div",
                          props: {
                            style: { fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1 },
                            children: "FT",
                          },
                        },
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", alignItems: "center", gap: 6 },
                        children: [
                          {
                            type: "div",
                            props: { style: { fontSize: 32, fontWeight: 900, color: "#fff" }, children: overlay.scoreHome ?? "0" },
                          },
                          {
                            type: "div",
                            props: { style: { fontSize: 18, fontWeight: 300, color: "rgba(255,255,255,0.3)" }, children: "—" },
                          },
                          {
                            type: "div",
                            props: { style: { fontSize: 32, fontWeight: 900, color: "rgba(255,255,255,0.5)" }, children: overlay.scoreAway ?? "0" },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              // Away team
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { width: 44, height: 44, borderRadius: 8, background: "#1e293b", border: "1.5px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" },
                        children: {
                          type: "div",
                          props: {
                            style: { fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 },
                            children: (overlay.teamAway || "AWY").slice(0, 3).toUpperCase(),
                          },
                        },
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textAlign: "center" },
                        children: overlay.teamAway || "Away",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Bottom headline
        {
          type: "div",
          props: {
            style: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 },
            children: compact([
              overlay.headline && {
                type: "div",
                props: {
                  style: { fontSize: 12, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.3 },
                  children: overlay.headline,
                },
              },
              overlay.subheadline && {
                type: "div",
                props: {
                  style: { fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 4, lineHeight: 1.4 },
                  children: overlay.subheadline,
                },
              },
            ]),
          },
        },
      ],
    },
  }
}

function renderTransfer(overlay: OverlayData, accent: string): SNode {
  const statusColor = "#FBBF24"
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
      children: [
        // Top bar
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
            children: [
              {
                type: "div",
                props: { style: { fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2 }, children: "TRANSFER NEWS" },
              },
              {
                type: "div",
                props: { style: { fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }, children: "halfspace.id" },
              },
            ],
          },
        },
        // Transfer content
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 8 },
            children: compact([
              // Status badge
              {
                type: "div",
                props: {
                  style: { background: `rgba(251,191,36,0.15)`, border: `1px solid rgba(251,191,36,0.45)`, borderRadius: 6, padding: "3px 10px", alignSelf: "flex-start" },
                  children: {
                    type: "div",
                    props: { style: { fontSize: 9, fontWeight: 800, color: statusColor, letterSpacing: 2 }, children: overlay.transferStatus || "RUMOR" },
                  },
                },
              },
              // Player name
              {
                type: "div",
                props: {
                  style: { fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1.2 },
                  children: overlay.playerName || "Nama Pemain",
                },
              },
              // Club arrow
              (overlay.fromClub || overlay.toClub) && {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", gap: 8 },
                  children: compact([
                    overlay.fromClub && {
                      type: "div",
                      props: { style: { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600 }, children: overlay.fromClub },
                    },
                    {
                      type: "div",
                      props: { style: { fontSize: 14, color: accent }, children: "→" },
                    },
                    overlay.toClub && {
                      type: "div",
                      props: { style: { fontSize: 10, color: "#fff", fontWeight: 700 }, children: overlay.toClub },
                    },
                  ]),
                },
              },
              // Fee
              overlay.transferFee && {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", gap: 6 },
                  children: [
                    {
                      type: "div",
                      props: { style: { fontSize: 9, color: "rgba(255,255,255,0.4)" }, children: "Estimasi Fee:" },
                    },
                    {
                      type: "div",
                      props: { style: { fontSize: 14, fontWeight: 900, color: accent }, children: overlay.transferFee },
                    },
                  ],
                },
              },
            ]),
          },
        },
        // Bottom
        overlay.subheadline && {
          type: "div",
          props: {
            style: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 },
            children: {
              type: "div",
              props: { style: { fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, children: overlay.subheadline },
            },
          },
        },
      ],
    },
  }
}

function renderMatchPreview(overlay: OverlayData, accent: string): SNode {
  const accentDim = "rgba(57,255,20,0.08)"
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
      children: [
        // Top bar
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
            children: [
              {
                type: "div",
                props: { style: { fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2 }, children: overlay.competition || "PERTANDINGAN" },
              },
              {
                type: "div",
                props: { style: { fontSize: 9, color: "rgba(255,255,255,0.35)" }, children: "halfspace.id" },
              },
            ],
          },
        },
        // Teams VS
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
            children: [
              // Home
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { width: 42, height: 42, borderRadius: 8, background: "#1e293b", border: "1.5px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" },
                        children: {
                          type: "div",
                          props: { style: { fontSize: 11, fontWeight: 800, color: "#fff" }, children: (overlay.teamHome || "HOM").slice(0, 3).toUpperCase() },
                        },
                      },
                    },
                    {
                      type: "div",
                      props: { style: { fontSize: 10, fontWeight: 700, color: "#fff" }, children: overlay.teamHome || "Home" },
                    },
                  ],
                },
              },
              // VS divider
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
                  children: [
                    {
                      type: "div",
                      props: { style: { fontSize: 11, fontWeight: 300, color: "rgba(255,255,255,0.3)", letterSpacing: 3 }, children: "VS" },
                    },
                    {
                      type: "div",
                      props: { style: { width: 1, height: 20, background: `linear-gradient(to bottom, ${accent}, transparent)` }, children: "" },
                    },
                  ],
                },
              },
              // Away
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { width: 42, height: 42, borderRadius: 8, background: "#1e293b", border: "1.5px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" },
                        children: {
                          type: "div",
                          props: { style: { fontSize: 11, fontWeight: 800, color: "#fff" }, children: (overlay.teamAway || "AWY").slice(0, 3).toUpperCase() },
                        },
                      },
                    },
                    {
                      type: "div",
                      props: { style: { fontSize: 10, fontWeight: 700, color: "#fff" }, children: overlay.teamAway || "Away" },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Bottom info box
        {
          type: "div",
          props: {
            style: { background: accentDim, border: `1px solid rgba(57,255,20,0.2)`, borderRadius: 8, padding: "8px 10px" },
            children: compact([
              (overlay.matchDate || overlay.venue) && {
                type: "div",
                props: {
                  style: { fontSize: 9, color: accent, fontWeight: 700, marginBottom: 2, letterSpacing: 1 },
                  children: [overlay.matchDate, overlay.venue].filter(Boolean).join(" · "),
                },
              },
              overlay.headline && {
                type: "div",
                props: {
                  style: { fontSize: 11, fontWeight: 800, color: "#fff", lineHeight: 1.3 },
                  children: overlay.headline,
                },
              },
            ]),
          },
        },
      ],
    },
  }
}

function renderInjury(overlay: OverlayData, accent: string): SNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
      children: [
        // Top bar
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
            children: [
              {
                type: "div",
                props: { style: { fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2 }, children: "INJURY REPORT" },
              },
              {
                type: "div",
                props: { style: { fontSize: 9, color: "rgba(255,255,255,0.35)" }, children: "halfspace.id" },
              },
            ],
          },
        },
        // Injury content
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 6 },
            children: compact([
              // OUT badge
              {
                type: "div",
                props: {
                  style: { background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 6, padding: "3px 10px", alignSelf: "flex-start" },
                  children: {
                    type: "div",
                    props: { style: { fontSize: 9, fontWeight: 800, color: "#F87171", letterSpacing: 2 }, children: overlay.playerStatus || "OUT" },
                  },
                },
              },
              // Player name
              {
                type: "div",
                props: { style: { fontSize: 20, fontWeight: 900, color: "#fff" }, children: overlay.playerName || "Nama Pemain" },
              },
              // Club
              overlay.clubName && {
                type: "div",
                props: { style: { fontSize: 10, color: "rgba(255,255,255,0.5)" }, children: overlay.clubName },
              },
              // Injury & duration details
              (overlay.injuryType || overlay.injuryDuration) && {
                type: "div",
                props: {
                  style: { display: "flex", gap: 12, marginTop: 4 },
                  children: compact([
                    overlay.injuryType && {
                      type: "div",
                      props: {
                        style: { display: "flex", flexDirection: "column", gap: 2 },
                        children: [
                          {
                            type: "div",
                            props: { style: { fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }, children: "CEDERA" },
                          },
                          {
                            type: "div",
                            props: { style: { fontSize: 11, fontWeight: 700, color: accent }, children: overlay.injuryType },
                          },
                        ],
                      },
                    },
                    overlay.injuryType && overlay.injuryDuration && {
                      type: "div",
                      props: { style: { width: 1, background: "rgba(255,255,255,0.1)", alignSelf: "stretch" }, children: "" },
                    },
                    overlay.injuryDuration && {
                      type: "div",
                      props: {
                        style: { display: "flex", flexDirection: "column", gap: 2 },
                        children: [
                          {
                            type: "div",
                            props: { style: { fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }, children: "ABSEN" },
                          },
                          {
                            type: "div",
                            props: { style: { fontSize: 11, fontWeight: 700, color: "#FCD34D" }, children: overlay.injuryDuration },
                          },
                        ],
                      },
                    },
                  ]),
                },
              },
            ]),
          },
        },
        // Bottom
        overlay.subheadline && {
          type: "div",
          props: {
            style: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 },
            children: {
              type: "div",
              props: { style: { fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, children: overlay.subheadline },
            },
          },
        },
      ],
    },
  }
}

function renderPressConference(overlay: OverlayData, accent: string): SNode {
  const accentDim = "rgba(57,255,20,0.1)"
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
      children: [
        // Top bar
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
            children: [
              {
                type: "div",
                props: { style: { fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2 }, children: "PRESS CONFERENCE" },
              },
              {
                type: "div",
                props: { style: { fontSize: 9, color: "rgba(255,255,255,0.35)" }, children: "halfspace.id" },
              },
            ],
          },
        },
        // Quote block
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 6 },
            children: compact([
              // Opening quote mark
              {
                type: "div",
                props: { style: { fontSize: 28, color: accent, fontWeight: 900, lineHeight: 0.8 }, children: "\u201C" },
              },
              // Quote text
              overlay.quote && {
                type: "div",
                props: {
                  style: { fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.4, fontStyle: "italic" },
                  children: overlay.quote,
                },
              },
              // Closing quote
              {
                type: "div",
                props: { style: { fontSize: 28, color: accent, fontWeight: 900, lineHeight: 0.8, alignSelf: "flex-end" }, children: "\u201D" },
              },
              // Speaker info
              (overlay.managerName || overlay.managerRole) && {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { width: 24, height: 24, borderRadius: "50%", background: accentDim, border: `1px solid rgba(57,255,20,0.35)`, display: "flex", alignItems: "center", justifyContent: "center" },
                        children: {
                          type: "div",
                          props: { style: { fontSize: 10 }, children: "\uD83D\uDC64" },
                        },
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", flexDirection: "column" },
                        children: compact([
                          overlay.managerName && {
                            type: "div",
                            props: { style: { fontSize: 10, fontWeight: 800, color: "#fff" }, children: overlay.managerName },
                          },
                          overlay.managerRole && {
                            type: "div",
                            props: { style: { fontSize: 8, color: "rgba(255,255,255,0.4)" }, children: overlay.managerRole },
                          },
                        ]),
                      },
                    },
                  ],
                },
              },
            ]),
          },
        },
        // Bottom
        overlay.subheadline && {
          type: "div",
          props: {
            style: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 },
            children: {
              type: "div",
              props: { style: { fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, children: overlay.subheadline },
            },
          },
        },
      ],
    },
  }
}

function renderTrivia(overlay: OverlayData, accent: string): SNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", justifyContent: "space-between", padding: "18px 20px" },
      children: [
        // Top bar
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
            children: [
              {
                type: "div",
                props: { style: { fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 2 }, children: "TRIVIA" },
              },
              {
                type: "div",
                props: { style: { fontSize: 9, color: "rgba(255,255,255,0.35)" }, children: "halfspace.id" },
              },
            ],
          },
        },
        // Big number + fact
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 4 },
            children: compact([
              // Number + unit
              (overlay.triviaNumber || overlay.triviaUnit) && {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "baseline", gap: 4 },
                  children: compact([
                    overlay.triviaNumber && {
                      type: "div",
                      props: { style: { fontSize: 52, fontWeight: 900, color: accent, lineHeight: 1 }, children: overlay.triviaNumber },
                    },
                    overlay.triviaUnit && {
                      type: "div",
                      props: { style: { fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)" }, children: overlay.triviaUnit },
                    },
                  ]),
                },
              },
              // Fact text with left accent bar
              overlay.triviaFact && {
                type: "div",
                props: {
                  style: { fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.4, borderLeft: `2px solid ${accent}`, paddingLeft: 8 },
                  children: overlay.triviaFact,
                },
              },
            ]),
          },
        },
        // Bottom headline
        {
          type: "div",
          props: {
            style: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 },
            children: compact([
              overlay.headline && {
                type: "div",
                props: { style: { fontSize: 12, fontWeight: 800, color: "#fff", marginBottom: 3, lineHeight: 1.3 }, children: overlay.headline },
              },
              overlay.subheadline && {
                type: "div",
                props: { style: { fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }, children: overlay.subheadline },
              },
            ]),
          },
        },
      ],
    },
  }
}

function renderSchedule(overlay: OverlayData, accent: string): SNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
      children: compact([
        overlay.competition && {
          type: "div",
          props: { style: { fontSize: 13, color: "#FFFFFF", fontWeight: 700, letterSpacing: 2 }, children: overlay.competition },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 28, fontWeight: 700, color: "#FFFFFF", textAlign: "center", lineHeight: 1.2 },
            children: overlay.matchCount ? `${overlay.matchCount} Pertandingan` : "Jadwal Lengkap",
          },
        },
        overlay.dateRange && {
          type: "div",
          props: {
            style: { fontSize: 14, color: "rgba(57,255,20,0.55)", textAlign: "center" },
            children: overlay.dateRange,
          },
        },
      ]),
    },
  }
}

function renderSquad(overlay: OverlayData, accent: string): SNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
      children: compact([
        {
          type: "div",
          props: { style: { fontSize: 30, fontWeight: 700, color: "#FFFFFF", textAlign: "center" }, children: overlay.teamName || "Skuad" },
        },
        overlay.season && {
          type: "div",
          props: { style: { fontSize: 14, color: accent, fontWeight: 700, letterSpacing: 1 }, children: `Musim ${overlay.season}` },
        },
        overlay.playerCount && {
          type: "div",
          props: { style: { fontSize: 13, color: "rgba(57,255,20,0.50)" }, children: `${overlay.playerCount} Pemain` },
        },
      ]),
    },
  }
}

function renderPrediction(overlay: OverlayData, accent: string): SNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
      children: compact([
        overlay.tournament && {
          type: "div",
          props: { style: { fontSize: 13, color: accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }, children: overlay.tournament },
        },
        {
          type: "div",
          props: { style: { fontSize: 15, color: "rgba(57,255,20,0.50)", marginTop: 2 }, children: "Favorit Juara" },
        },
        overlay.favorite && {
          type: "div",
          props: { style: { fontSize: 34, fontWeight: 700, color: accent, textAlign: "center", lineHeight: 1.1 }, children: overlay.favorite },
        },
      ]),
    },
  }
}

function renderGeneral(overlay: OverlayData, accent: string): SNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
      children: compact([
        {
          type: "div",
          props: {
            style: { fontSize: 26, fontWeight: 700, color: "#FFFFFF", textAlign: "center", lineHeight: 1.3, maxWidth: 380 },
            children: overlay.headline || "Halfspace",
          },
        },
        overlay.subheadline && {
          type: "div",
          props: {
            style: { fontSize: 14, color: "rgba(57,255,20,0.55)", textAlign: "center", maxWidth: 340 },
            children: overlay.subheadline,
          },
        },
      ]),
    },
  }
}

// ─── Dispatch content renderer ────────────────────────────────────────────────

function renderContent(overlay: OverlayData, accent: string): SNode {
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

// ─── Satori composite builder ─────────────────────────────────────────────────
// Layouts yang punya full-bleed internal layout (match_result, transfer, match_preview,
// injury, press_conference, trivia) mengelola padding & struktur sendiri.
// Sisanya (schedule, squad, prediction, general) memakai wrapper center default.

const FULLBLEED_TYPES: ContentType[] = [
  "match_result", "transfer", "match_preview", "injury", "press_conference", "trivia",
]

async function buildCompositeSVG(backgroundDataURI: string, overlay: OverlayData): Promise<string> {
  const { bold: fontBold, medium: fontMedium } = getFonts()
  const { accent, bg } = THEMES[overlay.contentType]
  const label = TYPE_LABELS[overlay.contentType]
  const isFullBleed = FULLBLEED_TYPES.includes(overlay.contentType)

  const contentNode = renderContent(overlay, accent)

  const svgString = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          width: IMG_SIZE,
          height: IMG_SIZE,
          position: "relative",
          fontFamily: "Inter",
          backgroundImage: `url("${backgroundDataURI}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        },
        children: [
          // Dark gradient overlay
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                inset: 0,
                background: `linear-gradient(to top, ${bg} 0%, rgba(0,0,0,0.80) 50%, rgba(0,0,0,0.60) 100%)`,
              },
            },
          },
          // Noise/vignette overlay
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                inset: 0,
                background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
              },
            },
          },
          // Tag pill — top right
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: 14,
                right: 16,
                backgroundColor: accent,
                borderRadius: 4,
                paddingLeft: 9,
                paddingRight: 9,
                paddingTop: 3,
                paddingBottom: 3,
              },
              children: {
                type: "div",
                props: {
                  style: { fontSize: 8, fontWeight: 800, color: "#000", letterSpacing: 1.5 },
                  children: label,
                },
              },
            },
          },
          // Top-left accent bar
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: 20,
                left: 20,
                width: 32,
                height: 3,
                backgroundColor: accent,
                borderRadius: 2,
              },
            },
          },
          // Main content — full-bleed layouts fill absolute inset,
          // others are centered in the lower portion
          isFullBleed
            ? {
                type: "div",
                props: {
                  style: { position: "absolute", inset: 0 },
                  children: contentNode,
                },
              }
            : {
                type: "div",
                props: {
                  style: {
                    position: "absolute",
                    bottom: 75,
                    left: 0,
                    right: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingLeft: 24,
                    paddingRight: 24,
                    gap: 12,
                  },
                  children: contentNode,
                },
              },
          // Branding footer
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: 14,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              },
              children: {
                type: "div",
                props: {
                  style: {
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    fontWeight: 700,
                  },
                  children: "HALFSPACESPORT.COM",
                },
              },
            },
          },
        ],
      },
    } as unknown as React.ReactNode,
    {
      width: IMG_SIZE,
      height: IMG_SIZE,
      fonts: [
        { name: "Inter", data: fontBold,   weight: 700, style: "normal" },
        { name: "Inter", data: fontMedium, weight: 500, style: "normal" },
      ],
    }
  )

  return svgString
}

// ─── Render SVG → PNG ─────────────────────────────────────────────────────────

function renderSVGtoPNG(svgString: string): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: IMG_SIZE },
    imageRendering: 1,
  })
  return Buffer.from(resvg.render().asPng())
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken  = process.env.CF_API_TOKEN
  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: "CF_ACCOUNT_ID / CF_API_TOKEN belum dikonfigurasi di server." },
      { status: 500 }
    )
  }

  let body: { prompt?: string; overlay?: OverlayData }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return NextResponse.json({ error: "Prompt wajib diisi." }, { status: 400 })
  }

  const overlay: OverlayData = body.overlay ?? { contentType: "general" }
  const cfPrompt = buildCFPrompt(overlay.contentType, prompt)

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`

  let lastError = "Cloudflare Workers AI gagal merespons."

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: cfPrompt }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        lastError = `Cloudflare error ${res.status}`
        console.error("[generate-image] non-ok response:", res.status, text)
        continue
      }

      const data = await res.json()
      const base64 = data?.result?.image

      if (!base64) {
        lastError = "Cloudflare tidak mengembalikan gambar."
        console.error("[generate-image] unexpected shape:", JSON.stringify(data).slice(0, 500))
        continue
      }

      const backgroundDataURI = cfBase64ToDataURI(base64)

      let finalBuf: Buffer
      try {
        const svgString = await buildCompositeSVG(backgroundDataURI, overlay)
        finalBuf = renderSVGtoPNG(svgString)
      } catch (compErr) {
        console.error("[generate-image] composite error:", compErr)
        return NextResponse.json(
          { error: "Gagal memproses gambar: " + (compErr instanceof Error ? compErr.message : String(compErr)) },
          { status: 500 }
        )
      }

      return new NextResponse(new Uint8Array(finalBuf), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      })
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError"
      lastError = isTimeout
        ? "Cloudflare timeout — server terlalu lama merespons."
        : "Gagal menghubungi Cloudflare Workers AI."
      console.error("[generate-image] CF fetch error:", err)
    }
  }

  console.error("[generate-image] failed after retries:", lastError)
  return NextResponse.json({ error: lastError }, { status: 502 })
}
