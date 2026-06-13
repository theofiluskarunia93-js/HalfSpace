// app/api/generate-image/route.ts
//
// Flow:
//   1. Cloudflare Workers AI (FLUX.1-schnell) → pure background image, no text
//   2. Satori → render overlay teks sebagai SVG sesuai tipe konten
//   3. @resvg/resvg-js → convert SVG ke PNG buffer
//   4. Sharp → composite background + overlay → JPEG final
//
// Env vars yang dibutuhkan:
//   CF_ACCOUNT_ID
//   CF_API_TOKEN  (permission: Workers AI - Read)
//
// Install dependencies dulu:
//   npm install satori @resvg/resvg-js sharp

import type React from "react"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { imageRateLimit } from "@/lib/rate-limit"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import sharp from "sharp"
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
  playerStatus?: string
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

  return "general"
}

// ─── Build Cloudflare prompt per content type ─────────────────────────────────

function buildCFPrompt(contentType: ContentType, userPrompt: string): string {
  const base = userPrompt.slice(0, MAX_PROMPT_LENGTH)

  const styleMap: Record<ContentType, string> = {
    match_preview:    "stadium aerial view at night, floodlights, dramatic atmosphere, football pitch",
    match_result:     "football stadium celebration, confetti, crowd, dramatic lighting",
    schedule:         "calendar planning abstract, sports schedule, clean geometric shapes",
    squad:            "football team formation diagram, tactical board, green pitch top view",
    prediction:       "trophy spotlight, golden light, dramatic podium, champions atmosphere",
    transfer:         "contract signing abstract, financial district blur, movement blur",
    press_conference: "press conference room blur, microphones, podium lights, bokeh",
    injury:           "medical room abstract, clinical blue tones, recovery atmosphere",
    general:          "sports infographic background, modern editorial design, bold contrast",
  }

  const style = styleMap[contentType]
  return `${base}, ${style}, absolutely no text, no letters, no numbers, no watermark, no typography, pure visual background only, high quality, editorial photography style`
}

// ─── Load font ────────────────────────────────────────────────────────────────

function loadFont(name: string): Buffer {
  const fontPath = path.join(process.cwd(), "public", "fonts", name)
  return fs.readFileSync(fontPath)
}

// ─── Color themes per content type ────────────────────────────────────────────

const THEMES: Record<ContentType, { accent: string; bg: string; text: string }> = {
  match_preview:    { accent: "#00D4FF", bg: "rgba(0,0,0,0.72)", text: "#FFFFFF" },
  match_result:     { accent: "#00FF87", bg: "rgba(0,0,0,0.75)", text: "#FFFFFF" },
  schedule:         { accent: "#FF6B35", bg: "rgba(0,0,0,0.70)", text: "#FFFFFF" },
  squad:            { accent: "#A78BFA", bg: "rgba(0,0,0,0.72)", text: "#FFFFFF" },
  prediction:       { accent: "#FFD700", bg: "rgba(0,0,0,0.75)", text: "#FFFFFF" },
  transfer:         { accent: "#34D399", bg: "rgba(0,0,0,0.72)", text: "#FFFFFF" },
  press_conference: { accent: "#60A5FA", bg: "rgba(0,0,0,0.70)", text: "#FFFFFF" },
  injury:           { accent: "#F87171", bg: "rgba(0,0,0,0.72)", text: "#FFFFFF" },
  general:          { accent: "#E879F9", bg: "rgba(0,0,0,0.70)", text: "#FFFFFF" },
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
  general:          "BERITA",
}

// ─── Satori node helper ───────────────────────────────────────────────────────
// Satori accepts a React-element-shaped object. We define our own loose type
// so plain-object trees pass TS without JSX or `as any`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SNode = Record<string, any>

/** Type-safe .filter(Boolean) for SNode arrays — removes falsy entries */
function compact(arr: (SNode | string | number | null | undefined | false | 0 | "")[]): SNode[] {
  return arr.filter((x): x is SNode => Boolean(x))
}

// ─── Satori overlay builder ───────────────────────────────────────────────────

async function buildOverlaySVG(overlay: OverlayData): Promise<string> {
  const fontBold   = loadFont("Inter-Bold.ttf")
  const fontMedium = loadFont("Inter-Medium.ttf")
  const { accent, bg, text } = THEMES[overlay.contentType]
  const label = TYPE_LABELS[overlay.contentType]

  // ── Build inner content per type ──
  const renderContent = () => {
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
          children: [
            // Competition / venue
            overlay.competition && {
              type: "div",
              props: {
                style: { fontSize: 13, color: accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
                children: overlay.competition,
              },
            },
            // Teams row
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
                  // Home
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 },
                      children: [
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
                      ] as SNode[],
                    },
                  },
                  // VS / separator
                  {
                    type: "div",
                    props: {
                      style: {
                        fontSize: isResult ? 14 : 20,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.5)",
                        paddingLeft: 8,
                        paddingRight: 8,
                      },
                      children: isResult ? "—" : "VS",
                    },
                  },
                  // Away
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 },
                      children: [
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
                      ] as SNode[],
                    },
                  },
                ],
              },
            },
            // Date / Venue
            (overlay.matchDate || overlay.venue) && {
              type: "div",
              props: {
                style: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4, textAlign: "center" },
                children: [overlay.matchDate, overlay.venue].filter(Boolean).join(" · "),
              },
            },
          ] as SNode[],
        },
      }
    }

    if (ct === "schedule") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: [
            overlay.competition && {
              type: "div",
              props: {
                style: { fontSize: 13, color: accent, fontWeight: 700, letterSpacing: 2 },
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
                style: { fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center" },
                children: overlay.dateRange,
              },
            },
          ] as SNode[],
        },
      }
    }

    if (ct === "squad") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: [
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
                style: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
                children: `${overlay.playerCount} Pemain`,
              },
            },
          ] as SNode[],
        },
      }
    }

    if (ct === "prediction") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: [
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
                style: { fontSize: 15, color: "rgba(255,255,255,0.6)", marginTop: 2 },
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
          ] as SNode[],
        },
      }
    }

    if (ct === "transfer") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
          children: [
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
                      style: { fontSize: 16, color: "rgba(255,255,255,0.7)" },
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
          ] as SNode[],
        },
      }
    }

    if (ct === "press_conference") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: [
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
          ] as SNode[],
        },
      }
    }

    if (ct === "injury") {
      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
          children: [
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
                  backgroundColor: "rgba(248,113,113,0.25)",
                  border: "1px solid rgba(248,113,113,0.5)",
                  color: "#F87171",
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
          ] as SNode[],
        },
      }
    }

    // general fallback
    return {
      type: "div",
      props: {
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
        children: [
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
              style: { fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center", maxWidth: 340 },
              children: overlay.subheadline,
            },
          },
        ] as SNode[],
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
        },
        children: [
          // Semi-transparent overlay layer
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                inset: 0,
                background: `linear-gradient(to top, ${bg} 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.15) 100%)`,
              },
            },
          },
          // Content wrapper (centered vertically at bottom ~40%)
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingBottom: 32,
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
                // Branding
                {
                  type: "div",
                  props: {
                    style: {
                      marginTop: 8,
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      letterSpacing: 3,
                      textTransform: "uppercase",
                    },
                    children: "HALFSPACE.ID",
                  },
                },
              ],
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

// ─── Composite background + overlay ──────────────────────────────────────────

async function compositeImage(backgroundBuf: Buffer, overlay: OverlayData): Promise<Buffer> {
  const svgString = await buildOverlaySVG(overlay)
  const resvg = new Resvg(svgString, { fitTo: { mode: "width", value: IMG_SIZE } })
  const overlayBuf = Buffer.from(resvg.render().asPng())

  return sharp(backgroundBuf)
    .resize(IMG_SIZE, IMG_SIZE, { fit: "cover" })
    .composite([{ input: overlayBuf, blend: "over" }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Rate limit
  const { success } = await imageRateLimit.limit(user.id)
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak request generate gambar. Tunggu sebentar lalu coba lagi." },
      { status: 429 }
    )
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

      const backgroundBuf = Buffer.from(base64, "base64")

      let finalBuf: Buffer
      try {
        finalBuf = await compositeImage(backgroundBuf, overlay)
      } catch (compErr) {
        console.error("[generate-image] compositeImage error:", compErr)
        return NextResponse.json(
          { error: "Gagal memproses gambar: " + (compErr instanceof Error ? compErr.message : String(compErr)) },
          { status: 500 }
        )
      }

      return new NextResponse(new Uint8Array(finalBuf), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
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
