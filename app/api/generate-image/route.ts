// app/api/generate-image/route.ts
//
// Proxy server-side ke Pollinations.ai.
// Alasan dibuat:
// - Prompt panjang (judul artikel) saat di-encode bisa membuat URL terlalu
//   panjang / request gagal jika langsung dipanggil dari browser (<img src=...>).
// - Pollinations kadang lambat / butuh retry — sebelumnya tidak ada timeout
//   atau retry, jadi langsung "Gambar gagal dimuat" di frontend.
// - Dengan proxy di server, kita juga bisa terapkan auth + rate limit.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { imageRateLimit } from "@/lib/rate-limit"

const MAX_PROMPT_LENGTH = 300
const FETCH_TIMEOUT_MS = 25_000
const MAX_RETRIES = 2

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Rate limit ──────────────────────────────────────────────────────────
  const { success } = await imageRateLimit.limit(user.id)
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak request generate gambar. Tunggu sebentar lalu coba lagi." },
      { status: 429 }
    )
  }

  let body: { prompt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return NextResponse.json({ error: "Prompt wajib diisi." }, { status: 400 })
  }

  // Potong prompt agar URL ke Pollinations tidak terlalu panjang
  const safePrompt = prompt.slice(0, MAX_PROMPT_LENGTH)
  const finalPrompt = `${safePrompt}, infografis, desain modern, warna kontras, tipografi jelas, gaya editorial olahraga`
  const encoded = encodeURIComponent(finalPrompt)
  const seed = Date.now()
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&seed=${seed}&nologo=true`

  let lastError: string = "Pollinations gagal merespons."

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (!res.ok) {
        lastError = `Pollinations error ${res.status}`
        continue
      }

      const contentType = res.headers.get("content-type") ?? "image/jpeg"
      const buf = Buffer.from(await res.arrayBuffer())

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        },
      })
    } catch (err) {
      lastError =
        err instanceof Error && err.name === "TimeoutError"
          ? "Pollinations timeout — server terlalu lama merespons."
          : "Gagal menghubungi Pollinations."
    }
  }

  return NextResponse.json({ error: lastError }, { status: 502 })
}
