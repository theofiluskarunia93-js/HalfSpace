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

  // Semua style: gelap dramatis, fokus stadion / siluet / penonton — TANPA pemain AI
  const styleMap: Record<ContentType, string> = {
    match_preview:    "dark dramatic football stadium at night, floodlights blazing, packed crowd silhouettes, atmospheric fog, deep shadows, cinematic wide angle, no people faces",
    match_result:     "football stadium celebration night, confetti falling, crowd silhouettes cheering, dramatic dark atmosphere, spotlights, no faces visible",
    schedule:         "empty football stadium aerial view dusk, floodlights on, green pitch glowing, dark dramatic sky, no people",
    squad:            "dark football locker room atmosphere, silhouettes of players standing, dramatic backlight, cinematic moody, no faces",
    prediction:       "world cup trophy dramatic dark spotlight, gold glowing on black background, stadium blurred dark background, cinematic dramatic",
    transfer:         "dark abstract football training ground night, stadium lights distant blur, dramatic moody atmosphere, no people",
    press_conference: "dark press conference room, microphones podium, dramatic spotlight, bokeh background, moody atmosphere, no faces",
    injury:           "dark medical room abstract, blue clinical tones, dramatic shadows, recovery atmosphere, no people",
    trivia:           "dark abstract football archive aesthetic, vintage stadium silhouette, dramatic spotlight, moody editorial tones, no faces",
    general:          "dark dramatic football stadium panoramic, crowd silhouettes, floodlights, atmospheric fog, cinematic editorial, no faces",
  }

  const style = styleMap[contentType]
  return `${base}, ${style}, absolutely no text, no letters, no numbers, no watermark, no typography, no identifiable faces, pure dark cinematic background, high quality, editorial photography style`
}

// ─── Load font ────────────────────────────────────────────────────────────────
// Font harus ada di public/fonts/Inter-Bold.ttf dan public/fonts/Inter-Medium.ttf
// Download: https://fonts.google.com/specimen/Inter → klik "Download family"
// Ekstrak lalu ambil file dari folder "static/"

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
  // Cache font agar tidak re-read setiap request
  if (!_fontBoldCache)   _fontBoldCache   = loadFont("Inter-Bold.ttf")
  if (!_fontMediumCache) _fontMediumCache = loadFont("Inter-Medium.ttf")
  return { bold: _fontBoldCache, medium: _fontMediumCache }
}

// ─── Color themes per content type ────────────────────────────────────────────

// Semua tipe pakai neon green sebagai accent warna utama
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
  match_preview:    "PREVIEW PERTANDINGAN",
  match_result:     "HASIL PERTANDINGAN",
  schedule:         "JADWAL LENGKAP",
  squad:            "DAFTAR SKUAD",
  prediction:       "PREDIKSI JUARA",
  transfer:         "TRANSFER RUMOR",
  press_conference: "KONFERENSI PERS",
  injury:           "UPDATE CEDERA",
  trivia:           "TRIVIA & FEATURE",
  general:          "BERITA",
}

// ─── Satori node helper ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SNode = Record<string, any>

/** Type-safe .filter(Boolean) untuk SNode arrays */
function compact(arr: (SNode | string | number | null | undefined | false | 0 | "")[]): SNode[] {
  return arr.filter((x): x is SNode => Boolean(x))
}

// ─── Konversi base64 CF response → data URI untuk <image> di SVG ──────────────
// Cloudflare FLUX mengembalikan base64 PNG.
// Kita embed langsung sebagai data URI — tidak perlu sharp atau canvas.

function cfBase64ToDataURI(base64: string): string {
  // Deteksi format dari magic bytes (PNG: iVBOR, JPEG: /9j/, WebP: UklGR)
  const header = base64.slice(0, 12)
  let mimeType = "image/png" // default
  if (header.startsWith("/9j/"))   mimeType = "image/jpeg"
  if (header.startsWith("UklGR")) mimeType = "image/webp"

  return `data:${mimeType};base64,${base64}`
}

// ─── Satori overlay builder ───────────────────────────────────────────────────
// Background di-embed sebagai <image> di root SVG agar tidak perlu sharp composite.

async function buildCompositeSVG(backgroundDataURI: string, overlay: OverlayData): Promise<string> {
  const { bold: fontBold, medium: fontMedium } = getFonts()
  const { accent, bg, text } = THEMES[overlay.contentType]
  const label = TYPE_LABELS[overlay.contentType]

  // ── Build inner content per type ──
  const renderContent = (): SNode => {
    const ct = overlay.contentType

    if (ct === "match_preview" || ct === "match_result") {
      const isResult = ct === "match_result"
      return {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            width: "100%",
          },
          children: compact([
            overlay.competition && {
              type: "div",
              props: {
                style: { fontSize: 13, color: "#FFFFFF", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
                children: overlay.competition,
              },
            },
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  width: "100%",
                  marginTop: 4,
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 },
                      children: compact([
                        {
                          type: "div",
                          props: {
                            style: { fontSize: isResult ? 22 : 26, fontWeight: 700, color: text, textAlign: "center", lineHeight: 1.1 },
                            children: overlay.teamHome || "Home",
                          },
                        },
                        isResult && overlay.scoreHome !== undefined && {
                          type: "div",
                          props: {
                            style: { fontSize: 48, fontWeight: 700, color: accent, lineHeight: 1 },
                            children: overlay.scoreHome,
                          },
                        },
                      ]),
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: {
                        fontSize: isResult ? 14 : 20,
                        fontWeight: 700,
                        color: "rgba(57,255,20,0.45)",
                        paddingLeft: 8,
                        paddingRight: 8,
                      },
                      children: isResult ? "—" : "VS",
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 },
                      children: compact([
                        {
                          type: "div",
                          props: {
                            style: { fontSize: isResult ? 22 : 26, fontWeight: 700, color: text, textAlign: "center", lineHeight: 1.1 },
                            children: overlay.teamAway || "Away",
                          },
                        },
                        isResult && overlay.scoreAway !== undefined && {
                          type: "div",
                          props: {
                            style: { fontSize: 48, fontWeight: 700, color: accent, lineHeight: 1 },
                            children: overlay.scoreAway,
                          },
                        },
                      ]),
                    },
                  },
                ],
              },
            },
            (overlay.matchDate || overlay.venue) && {
              type: "div",
              props: {
                style: { fontSize: 12, color: "#FFFFFF", marginTop: 4, textAlign: "center" },
                children: [overlay.matchDate, overlay.venue].filter(Boolean).join(" · "),
              },
            },
          ]),
        },
      }
    }

    if (ct === "schedule") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: compact([
            overlay.competition && {
              type: "div",
              props: {
                style: { fontSize: 13, color: "#FFFFFF", fontWeight: 700, letterSpacing: 2 },
                children: overlay.competition,
              },
            },
            {
              type: "div",
              props: {
                style: { fontSize: 28, fontWeight: 700, color: text, textAlign: "center", lineHeight: 1.2 },
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

    if (ct === "squad") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: compact([
            {
              type: "div",
              props: {
                style: { fontSize: 30, fontWeight: 700, color: text, textAlign: "center" },
                children: overlay.teamName || "Skuad",
              },
            },
            overlay.season && {
              type: "div",
              props: {
                style: { fontSize: 14, color: accent, fontWeight: 700, letterSpacing: 1 },
                children: `Musim ${overlay.season}`,
              },
            },
            overlay.playerCount && {
              type: "div",
              props: {
                style: { fontSize: 13, color: "rgba(57,255,20,0.50)" },
                children: `${overlay.playerCount} Pemain`,
              },
            },
          ]),
        },
      }
    }

    if (ct === "prediction") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: compact([
            overlay.tournament && {
              type: "div",
              props: {
                style: { fontSize: 13, color: accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
                children: overlay.tournament,
              },
            },
            {
              type: "div",
              props: {
                style: { fontSize: 15, color: "rgba(57,255,20,0.50)", marginTop: 2 },
                children: "Favorit Juara",
              },
            },
            overlay.favorite && {
              type: "div",
              props: {
                style: { fontSize: 34, fontWeight: 700, color: accent, textAlign: "center", lineHeight: 1.1 },
                children: overlay.favorite,
              },
            },
          ]),
        },
      }
    }

    if (ct === "transfer") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
          children: compact([
            overlay.playerName && {
              type: "div",
              props: {
                style: { fontSize: 30, fontWeight: 700, color: text, textAlign: "center" },
                children: overlay.playerName,
              },
            },
            (overlay.fromClub && overlay.toClub) && {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 4,
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { fontSize: 16, color: "rgba(57,255,20,0.60)" },
                      children: overlay.fromClub,
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { fontSize: 18, color: accent, fontWeight: 700 },
                      children: "→",
                    },
                  },
                  {
                    type: "div",
                    props: {
                      style: { fontSize: 16, color: text, fontWeight: 700 },
                      children: overlay.toClub,
                    },
                  },
                ],
              },
            },
            overlay.transferFee && {
              type: "div",
              props: {
                style: {
                  marginTop: 6,
                  backgroundColor: accent,
                  color: "#000",
                  fontWeight: 700,
                  fontSize: 14,
                  paddingLeft: 14,
                  paddingRight: 14,
                  paddingTop: 5,
                  paddingBottom: 5,
                  borderRadius: 20,
                },
                children: overlay.transferFee,
              },
            },
          ]),
        },
      }
    }

    if (ct === "press_conference") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: compact([
            overlay.clubName && {
              type: "div",
              props: {
                style: { fontSize: 13, color: accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
                children: overlay.clubName,
              },
            },
            overlay.managerName && {
              type: "div",
              props: {
                style: { fontSize: 28, fontWeight: 700, color: text, textAlign: "center" },
                children: overlay.managerName,
              },
            },
            overlay.managerRole && {
              type: "div",
              props: {
                style: { fontSize: 13, color: "rgba(57,255,20,0.55)", textAlign: "center" },
                children: overlay.managerRole,
              },
            },
            overlay.quote && {
              type: "div",
              props: {
                style: { fontSize: 15, color: text, textAlign: "center", lineHeight: 1.3, maxWidth: 380, marginTop: 6, fontStyle: "italic" },
                children: `"${overlay.quote}"`,
              },
            },
          ]),
        },
      }
    }

    if (ct === "injury") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: compact([
            overlay.clubName && {
              type: "div",
              props: {
                style: { fontSize: 13, color: accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
                children: overlay.clubName,
              },
            },
            overlay.playerName && {
              type: "div",
              props: {
                style: { fontSize: 28, fontWeight: 700, color: text, textAlign: "center" },
                children: overlay.playerName,
              },
            },
            overlay.playerStatus && {
              type: "div",
              props: {
                style: {
                  marginTop: 4,
                  backgroundColor: "rgba(57,255,20,0.15)",
                  border: "1px solid rgba(57,255,20,0.5)",
                  color: "#39FF14",
                  fontWeight: 600,
                  fontSize: 13,
                  paddingLeft: 14,
                  paddingRight: 14,
                  paddingTop: 5,
                  paddingBottom: 5,
                  borderRadius: 20,
                },
                children: overlay.playerStatus,
              },
            },
            overlay.injuryType && {
              type: "div",
              props: {
                style: { fontSize: 15, color: text, textAlign: "center", marginTop: 4 },
                children: overlay.injuryType,
              },
            },
            overlay.injuryDuration && {
              type: "div",
              props: {
                style: { fontSize: 13, color: "rgba(57,255,20,0.55)", textAlign: "center" },
                children: `Absen ${overlay.injuryDuration}`,
              },
            },
          ]),
        },
      }
    }

    if (ct === "trivia") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
          children: compact([
            overlay.triviaNumber && {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                },
                children: compact([
                  {
                    type: "div",
                    props: {
                      style: { fontSize: 56, fontWeight: 700, color: accent, lineHeight: 1 },
                      children: overlay.triviaNumber,
                    },
                  },
                  overlay.triviaUnit && {
                    type: "div",
                    props: {
                      style: { fontSize: 18, fontWeight: 700, color: text, textTransform: "uppercase" },
                      children: overlay.triviaUnit,
                    },
                  },
                ]),
              },
            },
            overlay.triviaFact && {
              type: "div",
              props: {
                style: { fontSize: 16, color: text, textAlign: "center", lineHeight: 1.3, maxWidth: 380, marginTop: 4 },
                children: overlay.triviaFact,
              },
            },
          ]),
        },
      }
    }

    // general fallback
    return {
      type: "div",
      props: {
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
        children: compact([
          {
            type: "div",
            props: {
              style: { fontSize: 26, fontWeight: 700, color: text, textAlign: "center", lineHeight: 1.3, maxWidth: 380 },
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
          // Background image di-embed langsung di sini — tidak perlu sharp composite
          backgroundImage: `url("${backgroundDataURI}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        },
        children: [
          // Semi-transparent gradient overlay — sangat gelap seperti referensi
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
          // Content wrapper (bottom) — dinaikkan agar ada ruang untuk branding di bawah
          {
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
                paddingBottom: 0,
                paddingLeft: 24,
                paddingRight: 24,
                gap: 12,
              },
              children: [
                // Type label badge
                {
                  type: "div",
                  props: {
                    style: {
                      backgroundColor: accent,
                      color: "#000000",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 2,
                      paddingLeft: 12,
                      paddingRight: 12,
                      paddingTop: 4,
                      paddingBottom: 4,
                      borderRadius: 4,
                      textTransform: "uppercase",
                    },
                    children: label,
                  },
                },
                // Dynamic content
                renderContent(),
              ],
            },
          },
          // Branding — tetap di posisi paling bawah
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: 16,
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
                    fontSize: 11,
                    color: "rgba(255,255,255,0.75)",
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    fontWeight: 700,
                  },
                  children: "HALFSPACESPORT.COM",
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
                width: 36,
                height: 4,
                backgroundColor: accent,
                borderRadius: 2,
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

// ─── Render SVG → PNG (tanpa sharp) ──────────────────────────────────────────

function renderSVGtoPNG(svgString: string): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: IMG_SIZE },
    // Aktifkan image loading agar <image> data URI di SVG terbaca
    imageRendering: 1, // 0 = optimizeQuality, 1 = optimizeSpeed
  })
  return Buffer.from(resvg.render().asPng())
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
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

      // 1. Konversi base64 CF → data URI (deteksi format otomatis, no sharp)
      const backgroundDataURI = cfBase64ToDataURI(base64)

      let finalBuf: Buffer
      try {
        // 2. Satori render SVG dengan background ter-embed + overlay teks
        const svgString = await buildCompositeSVG(backgroundDataURI, overlay)

        // 3. Resvg render SVG → PNG final (background + teks, sekaligus)
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
