// lib/bzzoiro-image.ts
//
// Helper KHUSUS untuk fitur Image/Infografis Generator (app/api/generate-image/route.ts).
// Beda dari lib/news-context/bzzoiro.ts (dipakai pipeline artikel) — file ini fokus
// mengambil ASET VISUAL (foto pemain, logo tim/negara) dari Bzzoiro Sports Data API
// untuk dikomposit jadi layer ke-2 di atas background Flux, sebelum teks Satori.
//
// Dua jenis endpoint Bzzoiro yang dipakai di sini:
//   1. /api/players/?search=  dan  /api/teams/?search=
//      → BUTUH auth (Authorization: Token {BZZOIRO_API_KEY}), sama seperti
//        lib/news-context/bzzoiro.ts. Dipakai HANYA untuk cari {id} numerik
//        dari nama pemain/tim yang ditulis admin di form overlay.
//   2. /img/{type}/{id}/  (type: player | team)
//      → PUBLIC, TIDAK BUTUH auth, di-cache 365 hari oleh Bzzoiro sendiri.
//        Ini endpoint yang benar-benar kita render jadi gambar PNG/WebP.
//        Tipe "team" juga mengembalikan lambang/bendera tim nasional, karena
//        Bzzoiro memodelkan negara peserta turnamen sebagai entitas "team".
//
// PRINSIP UTAMA — fungsi di file ini TIDAK PERNAH throw. Kalau Bzzoiro down,
// pemain/tim tidak ketemu, foto tidak tersedia (404), atau BZZOIRO_API_KEY belum
// diset, semua fungsi balikin `null` dan pipeline generate-image tetap lanjut
// TANPA layer foto (graceful degradation). Tujuannya supaya fitur ini tidak
// pernah jadi penyebab request generate-image error/500 di Vercel.

const BZZOIRO_BASE = "https://sports.bzzoiro.com"
const SEARCH_TIMEOUT_MS = 8_000
const IMAGE_TIMEOUT_MS = 8_000

// ─── Cari ID numerik pemain/tim by nama ──────────────────────────────────────

async function searchBzzId(kind: "players" | "teams", query: string): Promise<number | null> {
  const apiKey = process.env.BZZOIRO_API_KEY
  if (!apiKey || !query?.trim()) return null

  try {
    const res = await fetch(
      `${BZZOIRO_BASE}/api/${kind}/?search=${encodeURIComponent(query.trim())}&limit=1`,
      {
        headers: { Authorization: `Token ${apiKey}` },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      }
    )
    if (!res.ok) return null

    const json = await res.json()
    const results: any[] = json?.results ?? (Array.isArray(json) ? json : [])
    const id = results[0]?.id
    return typeof id === "number" ? id : null
  } catch (err) {
    console.warn(
      `[bzzoiro-image] pencarian ${kind} untuk "${query}" gagal:`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/** Cari ID pemain Bzzoiro by nama. Return null kalau tidak ketemu / API gagal. */
export function searchPlayerId(name: string): Promise<number | null> {
  return searchBzzId("players", name)
}

/** Cari ID tim/negara Bzzoiro by nama. Return null kalau tidak ketemu / API gagal. */
export function searchTeamId(name: string): Promise<number | null> {
  return searchBzzId("teams", name)
}

// ─── Ambil gambar dari image proxy publik → base64 data URI ─────────────────

interface BzzImageOptions {
  /** Cutout pemain dari sortitoutsi Cut-Out Megapack (?sor=true) — hanya untuk type="player". */
  cutout?: boolean
  /** Hapus background flat (?bg=transparent) — penting agar bisa dikomposit di atas Flux. */
  transparent?: boolean
}

/**
 * Ambil gambar dari https://sports.bzzoiro.com/img/{type}/{id}/ (public, no-auth)
 * dan konversi jadi base64 data URI. Return null kalau 404/204 (tidak ada gambar)
 * atau request gagal/timeout — TIDAK PERNAH throw.
 */
export async function fetchBzzImageAsDataURI(
  type: "player" | "team",
  id: number,
  opts: BzzImageOptions = {}
): Promise<string | null> {
  const params = new URLSearchParams()
  if (opts.cutout) params.set("sor", "true")
  if (opts.transparent) params.set("bg", "transparent")
  const qs = params.toString()
  const url = `${BZZOIRO_BASE}/img/${type}/${id}/${qs ? `?${qs}` : ""}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) })
    // 404 = tidak ada gambar utk entitas ini, 204 = id malformed — keduanya "tidak ada", bukan error.
    if (!res.ok) return null

    const contentType = res.headers.get("content-type") || "image/png"
    const arrayBuf = await res.arrayBuffer()
    if (arrayBuf.byteLength === 0) return null

    const base64 = Buffer.from(arrayBuf).toString("base64")
    return `data:${contentType};base64,${base64}`
  } catch (err) {
    console.warn(
      `[bzzoiro-image] fetch /img/${type}/${id}/ gagal:`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}
