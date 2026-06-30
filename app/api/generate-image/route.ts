// app/api/generate-image/route.ts
//
// Flow (3 layer):
//   1. Cloudflare Workers AI (FLUX.1-schnell)  → background dramatis (base64 PNG/JPEG)
//   2. Bzzoiro Sports Data — image proxy        → foto pemain / logo tim (PNG transparan)
//   3. Satori                                   → render teks overlay sebagai SVG,
//                                                  dengan layer 1 & 2 ter-embed sebagai <image>
//   4. @resvg/resvg-js                          → render SVG final → PNG buffer
//
// Tidak ada sharp, tidak ada canvas — aman di Vercel & Edge.
//
// HANYA 5 jenis konten yang didukung (sesuai kebutuhan editorial HalfSpace):
//   - tournament_table    Tabel Turnamen
//   - match_preview       Preview Pertandingan
//   - match_result        Hasil Pertandingan
//   - transfer_rumor      Transfer Rumor
//   - transfer_done_deal  Transfer Done Deal
//
// LAYER 2 (Bzzoiro) — TIDAK PERNAH bikin request gagal. Kalau Bzzoiro down, pemain/tim
// tidak ketemu, atau foto tidak tersedia, layer ini di-skip dan gambar tetap jadi
// (cuma tanpa foto/logo). Lihat lib/bzzoiro-image.ts untuk detail graceful fallback-nya.
//
// Env vars yang dibutuhkan:
//   CF_ACCOUNT_ID, CF_API_TOKEN   (wajib — kalau kosong, route langsung 500)
//   BZZOIRO_API_KEY               (opsional di route ini — kalau kosong, layer foto
//                                  cuma di-skip diam-diam, sisanya tetap jalan normal.
//                                  Var ini seharusnya sudah ada di Vercel karena dipakai
//                                  juga oleh pipeline artikel di lib/news-context/bzzoiro.ts)
//
// Install dependencies (kalau belum):
//   npm install satori @resvg/resvg-js
//
// Font yang dibutuhkan (taruh di public/fonts/):
//   Inter-Bold.ttf, Inter-Medium.ttf
//   Download dari: https://fonts.google.com/specimen/Inter

import type React from "react"
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { searchPlayerId, searchTeamId, fetchBzzImageAsDataURI } from "@/lib/bzzoiro-image"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import fs from "fs"
import path from "path"

// Pipeline ini sekarang melakukan beberapa fetch tambahan (search + image Bzzoiro)
// di samping Cloudflare Flux. Diset eksplisit agar tidak kena default timeout Vercel
// yang lebih pendek — pola yang sama dipakai di app/api/generate-brief/route.ts.
export const maxDuration = 60

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 300
const FETCH_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2

// Ukuran kanvas — portrait 4:5 (cocok utk feed/story IG, dan referensi template Anda),
// naik dari versi lama yg persegi 512x512.
const IMG_WIDTH = 1080
const IMG_HEIGHT = 1350

// Semua angka pixel pada layout di bawah ini awalnya didesain utk kanvas 512x512.
// S() men-skalakan angka2 itu secara proporsional ke lebar kanvas baru, jadi rasio
// visualnya (besar teks vs besar kanvas) tetap konsisten dengan versi sebelumnya.
const BASE_SIZE = 512
const SCALE = IMG_WIDTH / BASE_SIZE
const S = (n: number) => Math.round(n * SCALE)

// ─── Warna brand HalfSpace ────────────────────────────────────────────────────
// Diambil langsung dari app/globals.css (variabel CSS yang dipakai situs):
//   --primary / --accent : oklch(0.87 0.29 142)  → Hijau Neon  → #29FF0E
//   --foreground          : oklch(0.98 0 0)        → Putih       → #F8F8F8
//   --background          : oklch(0.08 0 0)        → Hitam       → #020202
//   --chart-3              : oklch(0.769 0.188 70.08) → Amber     → #FE9A00
//     (dipakai khusus utk badge "RUMOR" — konvensi umum di industri transfer:
//      hijau = sudah resmi, kuning/amber = masih spekulasi)
const BRAND_PRIMARY = "#29FF0E"
const BRAND_AMBER = "#FE9A00"
const BRAND_FOREGROUND = "#F8F8F8"
const BRAND_BACKGROUND = "#020202"

// Versi RGB (tanpa #) dari warna di atas — dipakai untuk rgba(...) saat butuh
// transparansi. Sengaja TIDAK pakai notasi hex 8-digit (#RRGGBBAA) karena pola
// itu tidak dipakai di kode lama; rgba() adalah pola yang sudah terbukti jalan
// di Satori versi yang dipakai project ini (lihat kode lama: rgba(57,255,20,...)).
const BRAND_PRIMARY_RGB = "41,255,14"
const BRAND_AMBER_RGB = "254,154,0"

// ─── Content Types ────────────────────────────────────────────────────────────

export type ContentType =
  | "tournament_table" // Tabel Turnamen
  | "match_preview" // Preview Pertandingan
  | "match_result" // Hasil Pertandingan
  | "transfer_rumor" // Transfer Rumor
  | "transfer_done_deal" // Transfer Done Deal

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
  // transfer_rumor / transfer_done_deal
  playerName?: string
  fromClub?: string
  toClub?: string
  transferFee?: string
  marketValue?: string
  position?: string
  rumorProbability?: string
  // tournament_table
  tournamentName?: string
  tournamentStage?: string
  /** 1 baris = 1 laga, format bebas "Tim A vs Tim B" — di-parse saat render. */
  matchupsText?: string
}

// ─── Layer 2 — aset visual Bzzoiro (foto pemain / logo tim) ──────────────────

type PhotoLayer =
  | { kind: "player"; image: string }
  | { kind: "teams"; home: string | null; away: string | null }

/**
 * Resolve layer foto Bzzoiro sesuai tipe konten. TIDAK PERNAH throw — kegagalan
 * apapun (pemain/tim tidak ketemu, API down, dsb) balik jadi `null` dan pipeline
 * generate-image tetap lanjut tanpa layer ini.
 */
async function resolvePhotoLayer(overlay: OverlayData): Promise<PhotoLayer | null> {
  try {
    if (overlay.contentType === "transfer_rumor" || overlay.contentType === "transfer_done_deal") {
      if (!overlay.playerName) return null
      const playerId = await searchPlayerId(overlay.playerName)
      if (!playerId) return null
      const image = await fetchBzzImageAsDataURI("player", playerId, { cutout: true, transparent: true })
      return image ? { kind: "player", image } : null
    }

    if (overlay.contentType === "match_preview" || overlay.contentType === "match_result") {
      const [homeId, awayId] = await Promise.all([
        overlay.teamHome ? searchTeamId(overlay.teamHome) : Promise.resolve(null),
        overlay.teamAway ? searchTeamId(overlay.teamAway) : Promise.resolve(null),
      ])
      const [home, away] = await Promise.all([
        homeId ? fetchBzzImageAsDataURI("team", homeId, { transparent: true }) : Promise.resolve(null),
        awayId ? fetchBzzImageAsDataURI("team", awayId, { transparent: true }) : Promise.resolve(null),
      ])
      if (!home && !away) return null
      return { kind: "teams", home, away }
    }

    // tournament_table → tanpa layer foto (cuma background + teks)
    return null
  } catch (err) {
    console.warn(
      "[generate-image] resolvePhotoLayer gagal, lanjut tanpa foto:",
      err instanceof Error ? err.message : err
    )
    return null
  }
}

// ─── Detect content type from title ──────────────────────────────────────────

export function detectContentType(title: string): ContentType {
  const t = title.toLowerCase()

  if (/hasil|skor|menang|kalah|imbang|gol|FT|HT/.test(t)) return "match_result"
  if (/preview|prediksi laga|head.to.head|pertemuan|lawan/.test(t)) return "match_preview"
  if (/bracket|tabel turnamen|jadwal turnamen|semifinal|perempat final|babak 8|klasemen grup/.test(t))
    return "tournament_table"
  if (/resmi|done deal|sah|teken kontrak|diumumkan|tanda tangan/.test(t)) return "transfer_done_deal"
  if (/transfer|rumor|kabar|pindah|rekrut|kontrak|bursa|diminati|incar/.test(t)) return "transfer_rumor"

  return "match_preview"
}

// ─── Build Cloudflare prompt per content type ─────────────────────────────────

function buildCFPrompt(contentType: ContentType, userPrompt: string): string {
  const base = userPrompt.slice(0, MAX_PROMPT_LENGTH)

  // Semua style: gelap dramatis, fokus stadion / siluet / penonton — TANPA pemain AI
  // (pemain asli datang dari layer foto Bzzoiro, bukan dari Flux).
  const styleMap: Record<ContentType, string> = {
    tournament_table:
      "dark dramatic football stadium aerial silhouette at night, floodlights blazing, deep shadows, editorial cinematic wide angle, no people, no faces",
    match_preview:
      "dark dramatic football stadium at night, floodlights blazing, packed crowd silhouettes, atmospheric fog, deep shadows, cinematic wide angle, no people faces",
    match_result:
      "football stadium celebration night, confetti falling, crowd silhouettes cheering, dramatic dark atmosphere, spotlights, no faces visible",
    // Rumor = lapangan latihan (suasana belum pasti) — Done Deal = meja negosiasi
    // klub (suasana kontrak sudah diteken) — sesuai permintaan eksplisit.
    transfer_rumor:
      "dark moody empty football training ground at dusk, training cones and footballs scattered on the grass, floodlight pole silhouette, soft amber rim light, mysterious uncertain atmosphere, blurred player silhouettes training in the distance, no faces, cinematic",
    transfer_done_deal:
      "dark moody executive negotiation table close-up, contract document and pen on the table, two blurred silhouettes shaking hands softly out of focus in the background, dramatic side lighting, neon green rim light accent, confident atmosphere, cinematic",
  }

  const style = styleMap[contentType]
  return `${base}, ${style}, absolutely no text, no letters, no numbers, no watermark, no typography, no identifiable faces, pure dark cinematic background, high quality, editorial photography style`
}

// ─── Load font ────────────────────────────────────────────────────────────────
// Font harus ada di public/fonts/Inter-Bold.ttf dan public/fonts/Inter-Medium.ttf

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
  if (!_fontBoldCache) _fontBoldCache = loadFont("Inter-Bold.ttf")
  if (!_fontMediumCache) _fontMediumCache = loadFont("Inter-Medium.ttf")
  return { bold: _fontBoldCache, medium: _fontMediumCache }
}

// ─── Color themes per content type (warna brand HalfSpace) ──────────────────

const THEMES: Record<ContentType, { accent: string; accentRgb: string; bg: string; text: string }> = {
  tournament_table: { accent: BRAND_PRIMARY, accentRgb: BRAND_PRIMARY_RGB, bg: "rgba(2,2,2,0.82)", text: BRAND_FOREGROUND },
  match_preview: { accent: BRAND_PRIMARY, accentRgb: BRAND_PRIMARY_RGB, bg: "rgba(2,2,2,0.82)", text: BRAND_FOREGROUND },
  match_result: { accent: BRAND_PRIMARY, accentRgb: BRAND_PRIMARY_RGB, bg: "rgba(2,2,2,0.85)", text: BRAND_FOREGROUND },
  // Rumor sengaja pakai Amber (--chart-3 di globals.css) supaya beda dari Done Deal —
  // konvensi umum: hijau = resmi, kuning/amber = masih spekulasi.
  transfer_rumor: { accent: BRAND_AMBER, accentRgb: BRAND_AMBER_RGB, bg: "rgba(2,2,2,0.82)", text: BRAND_FOREGROUND },
  transfer_done_deal: { accent: BRAND_PRIMARY, accentRgb: BRAND_PRIMARY_RGB, bg: "rgba(2,2,2,0.85)", text: BRAND_FOREGROUND },
}

const TYPE_LABELS: Record<ContentType, string> = {
  tournament_table: "TABEL TURNAMEN",
  match_preview: "PREVIEW PERTANDINGAN",
  match_result: "HASIL PERTANDINGAN",
  transfer_rumor: "TRANSFER RUMOR",
  transfer_done_deal: "DONE DEAL",
}

// ─── Satori node helper ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SNode = Record<string, any>

/** Type-safe .filter(Boolean) untuk SNode arrays — penting agar tidak ada `false`/`undefined`
 * yang ikut terkirim ke Satori sebagai children (Satori bukan React, tidak auto-skip falsy). */
function compact(arr: (SNode | string | number | null | undefined | false | 0 | "")[]): SNode[] {
  return arr.filter((x): x is SNode => Boolean(x))
}

/** Kotak statistik kecil ala kartu "Done Deal" Transfermarkt (MARKET VALUE / FEE / POSITION). */
function statBlock(label: string, value: string, textColor: string, accentColor: string): SNode {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: S(2),
        paddingLeft: S(12),
        paddingRight: S(12),
        paddingTop: S(8),
        paddingBottom: S(8),
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              fontSize: S(9),
              color: textColor,
              opacity: 0.6,
              letterSpacing: 1,
              textTransform: "uppercase",
              fontWeight: 600,
            },
            children: label,
          },
        },
        {
          type: "div",
          props: { style: { fontSize: S(14), color: textColor, fontWeight: 700 }, children: value },
        },
      ],
    },
  }
}

// ─── Konversi base64 CF response → data URI untuk <image> di SVG ──────────────

function cfBase64ToDataURI(base64: string): string {
  const header = base64.slice(0, 12)
  let mimeType = "image/png"
  if (header.startsWith("/9j/")) mimeType = "image/jpeg"
  if (header.startsWith("UklGR")) mimeType = "image/webp"

  return `data:${mimeType};base64,${base64}`
}

// ─── Background khusus Tabel Turnamen (gradien + motif lapangan) ────────────
// TIDAK memanggil Cloudflare Flux sama sekali — murni gradient CSS + 1 buah
// motif garis lapangan (lingkaran tengah + garis tengah + kotak penalti),
// digambar SEKALI sebagai SVG data-URI dengan opacity rendah. Tujuannya: latar
// belakang tidak polos, tapi tetap memberi kontras maksimal untuk teks putih
// & hijau neon yang harus memuat sampai 16 baris pertandingan.
function buildTournamentMotifDataURI(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_WIDTH}" height="${IMG_HEIGHT}" viewBox="0 0 ${IMG_WIDTH} ${IMG_HEIGHT}">
    <g fill="none" stroke="#FFFFFF" stroke-width="2.5">
      <circle cx="${IMG_WIDTH / 2}" cy="430" r="230"/>
      <circle cx="${IMG_WIDTH / 2}" cy="430" r="6" fill="#FFFFFF" stroke="none"/>
      <line x1="0" y1="430" x2="${IMG_WIDTH}" y2="430"/>
      <rect x="${IMG_WIDTH / 2}" y="-120" width="520" height="320"/>
      <rect x="${IMG_WIDTH / 2}" y="660" width="520" height="320"/>
    </g>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ─── Satori overlay builder ───────────────────────────────────────────────────
// Layer 1 (background) di-embed sebagai backgroundImage di root SVG — KECUALI
// untuk tournament_table, yang root background-nya gradient CSS murni (lihat
// isTournament di bawah), karena jenis ini tidak memanggil Cloudflare Flux.
// Layer 2 (foto/logo Bzzoiro) — kalau kind="player", jadi 1 gambar besar di area
// tengah-atas kanvas; kalau kind="teams", logo kecil ditempel langsung di atas
// nama masing-masing tim (lebih natural untuk layout preview/hasil pertandingan).
// Layer 3 (teks) selalu di atas, sama seperti sebelumnya.

async function buildCompositeSVG(
  backgroundDataURI: string | null,
  photoLayer: PhotoLayer | null,
  overlay: OverlayData
): Promise<string> {
  const { bold: fontBold, medium: fontMedium } = getFonts()
  const { accent, accentRgb, bg, text } = THEMES[overlay.contentType]
  const label = TYPE_LABELS[overlay.contentType]

  const teamLogo = photoLayer?.kind === "teams" ? photoLayer : null
  const playerPhoto = photoLayer?.kind === "player" ? photoLayer.image : null
  const isTournament = overlay.contentType === "tournament_table"
  // match_preview/match_result tidak punya foto besar di atasnya — jadi blok teks
  // di-tengah-kan vertikal. Transfer (ada foto) & tournament_table (ditangani sendiri)
  // tidak pakai flag ini.
  const isCenteredType = overlay.contentType === "match_preview" || overlay.contentType === "match_result"

  // ── Build inner content per type ──
  const renderContent = (): SNode => {
    const ct = overlay.contentType

    if (ct === "match_preview" || ct === "match_result") {
      const isResult = ct === "match_result"

      const teamColumn = (logo: string | null | undefined, name: string, score?: string): SNode => ({
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: S(4), flex: 1 },
          children: compact([
            logo && {
              type: "img",
              props: {
                src: logo,
                style: { width: S(48), height: S(48), objectFit: "contain", marginBottom: S(2) },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  fontSize: isResult ? S(22) : S(26),
                  fontWeight: 700,
                  color: text,
                  textAlign: "center",
                  lineHeight: 1.1,
                },
                children: name,
              },
            },
            isResult && score !== undefined && {
              type: "div",
              props: { style: { fontSize: S(48), fontWeight: 700, color: accent, lineHeight: 1 }, children: score },
            },
          ]),
        },
      })

      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: S(8), width: "100%" },
          children: compact([
            overlay.competition && {
              type: "div",
              props: {
                style: { fontSize: S(13), color: text, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
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
                  gap: S(16),
                  width: "100%",
                  marginTop: S(4),
                },
                children: [
                  teamColumn(teamLogo?.home, overlay.teamHome || "Home", overlay.scoreHome),
                  {
                    type: "div",
                    props: {
                      style: {
                        fontSize: isResult ? S(14) : S(20),
                        fontWeight: 700,
                        color: accent,
                        opacity: 0.45,
                        paddingLeft: S(8),
                        paddingRight: S(8),
                      },
                      children: isResult ? "—" : "VS",
                    },
                  },
                  teamColumn(teamLogo?.away, overlay.teamAway || "Away", overlay.scoreAway),
                ],
              },
            },
            (overlay.matchDate || overlay.venue) && {
              type: "div",
              props: {
                style: { fontSize: S(12), color: text, marginTop: S(4), textAlign: "center" },
                children: [overlay.matchDate, overlay.venue].filter(Boolean).join(" · "),
              },
            },
          ]),
        },
      }
    }

    if (ct === "transfer_rumor" || ct === "transfer_done_deal") {
      const isDone = ct === "transfer_done_deal"

      return {
        type: "div",
        props: {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: S(6), width: "100%" },
          children: compact([
            // Foto pemain — dibingkai BULAT (bukan kotak). Ini sengaja, bukan cuma estetika:
            // foto dari Bzzoiro kadang bentuknya headshot biasa (bukan cutout full-body
            // transparan), jadi kalau ditaruh kotak, pinggiran kotak aslinya kelihatan
            // (efek "tidak rapi" yang dikomplain). Dibingkai bulat + overflow:hidden,
            // pinggiran apapun bentuk aslinya otomatis ter-crop rapi jadi lingkaran —
            // tidak ada lagi sisi kotak yang nongol. Ukurannya juga jauh lebih kecil dari
            // sebelumnya (280px ≈ 26% lebar kanvas) jadi terlihat "sedang", bukan raksasa,
            // dan karena tidak terlalu di-upscale, hasilnya lebih halus (tidak pecah-pecah).
            playerPhoto && {
              type: "div",
              props: {
                style: {
                  width: 280,
                  height: 280,
                  borderRadius: 140,
                  overflow: "hidden",
                  display: "flex",
                  border: `5px solid ${accent}`,
                  boxShadow: `0 0 36px rgba(${accentRgb},0.35)`,
                  marginBottom: S(8),
                },
                children: {
                  type: "img",
                  props: {
                    src: playerPhoto,
                    style: { width: "100%", height: "100%", objectFit: "cover" },
                  },
                },
              },
            },
            overlay.playerName && {
              type: "div",
              props: {
                style: { fontSize: S(30), fontWeight: 700, color: text, textAlign: "center" },
                children: overlay.playerName,
              },
            },
            (overlay.fromClub || overlay.toClub) && {
              type: "div",
              props: {
                style: { display: "flex", alignItems: "center", gap: S(10), marginTop: S(4) },
                children: compact([
                  overlay.fromClub && {
                    type: "div",
                    props: { style: { fontSize: S(16), color: text, opacity: 0.6 }, children: overlay.fromClub },
                  },
                  {
                    type: "div",
                    props: { style: { fontSize: S(18), color: accent, fontWeight: 700 }, children: "→" },
                  },
                  overlay.toClub && {
                    type: "div",
                    props: { style: { fontSize: S(16), color: text, fontWeight: 700 }, children: overlay.toClub },
                  },
                ]),
              },
            },
            // Kotak statistik — field beda per tipe. Untuk Rumor sebelumnya KOSONG
            // (tidak ada nilai transfer sama sekali) — sekarang ditambahkan.
            isDone
              ? (overlay.marketValue || overlay.transferFee || overlay.position) && {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      marginTop: S(10),
                      borderRadius: S(8),
                      border: `1px solid rgba(${accentRgb},0.4)`,
                    },
                    children: compact([
                      overlay.marketValue && statBlock("MARKET VALUE", overlay.marketValue, text, accent),
                      overlay.transferFee && statBlock("RUMOURED FEE", overlay.transferFee, text, accent),
                      overlay.position && statBlock("POSITION", overlay.position, text, accent),
                    ]),
                  },
                }
              : overlay.transferFee && {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      marginTop: S(10),
                      borderRadius: S(8),
                      border: `1px solid rgba(${accentRgb},0.4)`,
                    },
                    children: [statBlock("NILAI TRANSFER", overlay.transferFee, text, accent)],
                  },
                },
            // Badge peluang transfer — HANYA untuk Rumor, tampil berdampingan dgn kotak di atas
            !isDone &&
              overlay.rumorProbability && {
                type: "div",
                props: {
                  style: {
                    marginTop: S(8),
                    color: accent,
                    fontWeight: 700,
                    fontSize: S(13),
                    paddingLeft: S(14),
                    paddingRight: S(14),
                    paddingTop: S(5),
                    paddingBottom: S(5),
                    borderRadius: S(20),
                    border: `1px solid ${accent}`,
                  },
                  children: `Peluang Transfer: ${overlay.rumorProbability}`,
                },
              },
          ]),
        },
      }
    }

    // Fallback — tidak akan pernah benar2 terpanggil untuk tournament_table karena
    // tipe itu di-render lewat buildTournamentNode() (lihat di bawah), bukan lewat
    // renderContent(). Tetap disediakan supaya TypeScript happy & aman kalau suatu
    // saat ada pemanggilan tak terduga.
    return { type: "div", props: { children: "" } }
  }

  // ── Tabel Turnamen — node terpisah (BUKAN lewat renderContent + wrapper generik) ──
  // Kotak ini punya top & bottom EKSPLISIT (tinggi tetap), bukan tumbuh dari bawah
  // ke atas seperti sebelumnya — jadi berapa pun jumlah laga, tidak akan pernah
  // "terpotong" keluar kanvas. Ukuran font & padding per baris dipilih dari tier
  // di bawah berdasarkan jumlah laga, supaya 16 laga (32 besar) atau bahkan lebih
  // tetap muat dengan baik tanpa ada data yang hilang/disembunyikan.
  function buildTournamentNode(): SNode {
    const matchups = (overlay.matchupsText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 24) // batas aman jauh di atas kebutuhan riil (32 besar = maks 16 laga)

    const n = Math.max(1, matchups.length)

    const containerTop = 110
    const containerBottom = 130
    const headerReserve = 240 // ruang utk badge + babak + nama turnamen (ukuran tetap)
    const availableForList = IMG_HEIGHT - containerTop - containerBottom - headerReserve

    const tiers = [
      { fontSize: 17, padY: 12, gap: 8 },
      { fontSize: 15, padY: 10, gap: 6 },
      { fontSize: 14, padY: 8, gap: 5 },
      { fontSize: 13, padY: 6, gap: 4 },
      { fontSize: 12, padY: 4, gap: 3 },
      { fontSize: 11, padY: 3, gap: 2 },
      { fontSize: 10, padY: 2, gap: 2 },
    ]
    const fits = (t: { fontSize: number; padY: number; gap: number }) => {
      const rowHeight = t.fontSize * 1.3 + t.padY * 2
      return n * rowHeight + (n - 1) * t.gap <= availableForList
    }
    const tier = tiers.find(fits) ?? tiers[tiers.length - 1]

    return {
      type: "div",
      props: {
        style: {
          position: "absolute",
          top: containerTop,
          bottom: containerBottom,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: S(24),
          paddingRight: S(24),
          gap: S(8),
        },
        children: compact([
          {
            type: "div",
            props: {
              style: {
                backgroundColor: accent,
                color: BRAND_BACKGROUND,
                fontSize: S(10),
                fontWeight: 700,
                letterSpacing: 2,
                paddingLeft: S(12),
                paddingRight: S(12),
                paddingTop: S(4),
                paddingBottom: S(4),
                borderRadius: S(4),
                textTransform: "uppercase",
              },
              children: label,
            },
          },
          overlay.tournamentStage && {
            type: "div",
            props: {
              style: { fontSize: S(13), color: accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" },
              children: overlay.tournamentStage,
            },
          },
          overlay.tournamentName && {
            type: "div",
            props: {
              style: { fontSize: S(24), fontWeight: 700, color: text, textAlign: "center", lineHeight: 1.15 },
              children: overlay.tournamentName,
            },
          },
          matchups.length > 0 && {
            type: "div",
            props: {
              style: { display: "flex", flexDirection: "column", gap: tier.gap, width: "100%", marginTop: S(6) },
              children: matchups.map((line, i) => {
                const parts = line.split(/\s+vs\.?\s+/i)
                const a = (parts[0] || line).trim()
                const b = (parts[1] || "").trim()
                return {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: S(10),
                      paddingTop: tier.padY,
                      paddingBottom: tier.padY,
                      borderTop: i > 0 ? `1px solid rgba(${accentRgb},0.25)` : "none",
                      width: "100%",
                    },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: { fontSize: tier.fontSize, fontWeight: 700, color: text, flex: 1, textAlign: "right" },
                          children: a,
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: {
                            fontSize: Math.max(9, tier.fontSize - 3),
                            fontWeight: 700,
                            color: accent,
                            paddingLeft: S(6),
                            paddingRight: S(6),
                          },
                          children: "VS",
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { fontSize: tier.fontSize, fontWeight: 700, color: text, flex: 1, textAlign: "left" },
                          children: b,
                        },
                      },
                    ],
                  },
                }
              }),
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
        style: isTournament
          ? {
              // Tournament_table TIDAK pakai backgroundImage sama sekali (tidak ada
              // hasil Cloudflare Flux untuk jenis ini) — gradient CSS langsung di root,
              // dengan tone hijau gelap selaras brand, bukan hitam polos.
              display: "flex",
              flexDirection: "column",
              width: IMG_WIDTH,
              height: IMG_HEIGHT,
              position: "relative",
              fontFamily: "Inter",
              background: "linear-gradient(155deg, #08260F 0%, #020803 45%, #020202 75%, #06170D 100%)",
            }
          : {
              display: "flex",
              flexDirection: "column",
              width: IMG_WIDTH,
              height: IMG_HEIGHT,
              position: "relative",
              fontFamily: "Inter",
              backgroundImage: `url("${backgroundDataURI}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            },
        // compact() di sini WAJIB — kalau tidak, node `false` dari kondisi
        // "hanya tampil kalau ada foto pemain" akan ikut terkirim ke Satori
        // sebagai children yang tidak valid dan bikin render gagal.
        children: compact([
          // Motif lapangan — KHUSUS tournament_table, menggantikan posisi "Gradient
          // overlay" di bawah (yang untuk jenis lain meneduhkan foto Flux). Opacity
          // rendah, dirender SEKALI (bukan tile berulang) agar elegan, bukan ramai.
          isTournament && {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: IMG_WIDTH,
                height: IMG_HEIGHT,
                backgroundImage: `url("${buildTournamentMotifDataURI()}")`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: 0.05,
              },
            },
          },
          // Gradient overlay — gelap seperti referensi. HANYA untuk 4 jenis dengan
          // foto Flux (tournament_table sudah punya treatment sendiri di atas, dan
          // tidak butuh diteduhkan lagi karena bukan foto, cuma gradient+motif).
          // PENTING: "inset: 0" SENGAJA TIDAK dipakai di sini. Satori tidak menghitung
          // dimensi pattern gradient dengan benar untuk shorthand "inset" (hasilnya
          // pattern x/y/width/height jadi NaN, dan gradient efektif tidak ter-render
          // sama sekali — gambar latar jadi tampil nyaris tanpa peneduh). Sudah
          // dibuktikan lewat reproduksi manual struktur ini persis di sandbox.
          // top/left/width/height eksplisit terbukti aman dan inilah yang dipakai.
          !isTournament && {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: IMG_WIDTH,
                height: IMG_HEIGHT,
                background: `linear-gradient(to top, ${bg} 0%, rgba(2,2,2,0.80) 50%, rgba(2,2,2,0.60) 100%)`,
              },
            },
          },
          // (Layer foto pemain sekarang dirender SEBAGAI BAGIAN dari renderContent()
          // di bawah — bentuk badge bulat, bukan lagi kotak besar terpisah. Lihat
          // alasan di komentar renderContent() untuk transfer_rumor/transfer_done_deal.)
          // Content wrapper — posisi BEDA per tipe:
          //  - transfer_rumor/transfer_done_deal: tetap nempel ke bawah (pas, karena
          //    ada foto pemain di atasnya yang sudah mengisi area tengah-atas).
          //  - match_preview/match_result: di-tengah-kan vertikal (BUKAN nempel bawah)
          //    karena tanpa foto besar, nempel-bawah bikin area atas kosong banget
          //    dan teks kebanyakan "kebawah" — ini yang dikomplain.
          //  - tournament_table: ditangani node terpisah di bawah (lihat tournamentNode),
          //    bukan lewat wrapper ini, karena perlu kotak tinggi sendiri agar muat
          //    sampai 16+ baris tanpa data terpotong.
          overlay.contentType !== "tournament_table" && {
            type: "div",
            props: {
              style: isCenteredType
                ? {
                    position: "absolute",
                    top: 0,
                    bottom: S(140),
                    left: 0,
                    right: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingLeft: S(24),
                    paddingRight: S(24),
                    gap: S(12),
                  }
                : {
                    position: "absolute",
                    bottom: S(75),
                    left: 0,
                    right: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingLeft: S(24),
                    paddingRight: S(24),
                    gap: S(12),
                  },
              children: [
                // Type label badge
                {
                  type: "div",
                  props: {
                    style: {
                      backgroundColor: accent,
                      color: BRAND_BACKGROUND,
                      fontSize: S(10),
                      fontWeight: 700,
                      letterSpacing: 2,
                      paddingLeft: S(12),
                      paddingRight: S(12),
                      paddingTop: S(4),
                      paddingBottom: S(4),
                      borderRadius: S(4),
                      textTransform: "uppercase",
                    },
                    children: label,
                  },
                },
                renderContent(),
              ],
            },
          },
          // Tournament table — node terpisah, kotak tinggi sendiri (lihat di bawah)
          overlay.contentType === "tournament_table" && buildTournamentNode(),
          // Branding — SELALU di bawah sendirian, warna NEON GREEN brand (bukan warna
          // aksen per-tipe) di SEMUA jenis generate, termasuk Transfer Rumor yg aksennya amber.
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: S(16),
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
                    fontSize: S(11),
                    color: BRAND_PRIMARY,
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
                top: S(20),
                left: S(20),
                width: S(36),
                height: S(4),
                backgroundColor: accent,
                borderRadius: S(2),
              },
            },
          },
        ]),
      },
    } as unknown as React.ReactNode,
    {
      width: IMG_WIDTH,
      height: IMG_HEIGHT,
      fonts: [
        { name: "Inter", data: fontBold, weight: 700, style: "normal" },
        { name: "Inter", data: fontMedium, weight: 500, style: "normal" },
      ],
    }
  )

  return svgString
}

// ─── Render SVG → PNG (tanpa sharp) ──────────────────────────────────────────

function renderSVGtoPNG(svgString: string): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: IMG_WIDTH },
    // optimizeQuality (0), BUKAN optimizeSpeed (1) — sejak ada layer foto Bzzoiro
    // yang di-scale up dari resolusi aslinya (kadang kecil), optimizeSpeed bikin
    // hasilnya pecah/blocky karena interpolasi nearest-neighbor. optimizeQuality
    // pakai interpolasi halus jadi foto tetap tajam meski di-resize.
    imageRendering: 0,
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

  let body: { prompt?: string; overlay?: OverlayData }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const overlay: OverlayData = body.overlay ?? { contentType: "match_preview" }

  // ── Fast path: Tabel Turnamen ───────────────────────────────────────────
  // Jenis ini TIDAK memanggil Cloudflare Flux sama sekali (background gradien +
  // motif lapangan murni CSS/SVG, lihat buildTournamentMotifDataURI()), jadi:
  //   - tidak butuh CF_ACCOUNT_ID/CF_API_TOKEN sama sekali,
  //   - tidak butuh field "prompt" dari admin,
  //   - generate jauh lebih cepat (tidak ada network round-trip ke Cloudflare),
  //   - tidak makan kuota Cloudflare AI sama sekali untuk jenis konten ini.
  if (overlay.contentType === "tournament_table") {
    try {
      const svgString = await buildCompositeSVG(null, null, overlay)
      const finalBuf = renderSVGtoPNG(svgString)
      return new NextResponse(new Uint8Array(finalBuf), {
        status: 200,
        headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
      })
    } catch (compErr) {
      console.error("[generate-image] tournament_table composite error:", compErr)
      return NextResponse.json(
        { error: "Gagal memproses gambar: " + (compErr instanceof Error ? compErr.message : String(compErr)) },
        { status: 500 }
      )
    }
  }

  // ── 4 jenis lainnya: tetap lewat Cloudflare Flux seperti sebelumnya ────────
  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken = process.env.CF_API_TOKEN
  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: "CF_ACCOUNT_ID / CF_API_TOKEN belum dikonfigurasi di server." },
      { status: 500 }
    )
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return NextResponse.json({ error: "Prompt wajib diisi." }, { status: 400 })
  }

  const cfPrompt = buildCFPrompt(overlay.contentType, prompt)

  // Layer 2 (Bzzoiro) di-resolve PARALEL dengan layer 1 (Cloudflare Flux) di bawah —
  // bukan berurutan — supaya total waktu request ≈ max(waktu CF, waktu Bzzoiro),
  // bukan penjumlahan keduanya. .catch() di sini cuma jaring pengaman tambahan;
  // resolvePhotoLayer() sendiri sudah tidak pernah throw.
  const photoLayerPromise = resolvePhotoLayer(overlay).catch(() => null)

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

      // 2. Layer foto Bzzoiro — sudah berjalan paralel sejak sebelum retry loop ini
      const photoLayer = await photoLayerPromise

      let finalBuf: Buffer
      try {
        // 3. Satori render SVG: background + foto Bzzoiro (kalau ada) + teks overlay
        const svgString = await buildCompositeSVG(backgroundDataURI, photoLayer, overlay)

        // 4. Resvg render SVG → PNG final
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
