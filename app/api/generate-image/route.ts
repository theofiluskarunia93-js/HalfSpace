// app/api/generate-image/route.ts
//
// Generate image via Cloudflare Workers AI (FLUX.1-schnell).
// Replaces Pollinations.ai (yang sekarang mewajibkan payment / 402).
//
// Perlu env vars:
//   CF_ACCOUNT_ID
//   CF_API_TOKEN  (permission: Workers AI - Read)

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { imageRateLimit } from "@/lib/rate-limit"

const MAX_PROMPT_LENGTH = 300
const FETCH_TIMEOUT_MS = 30_000
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

  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken = process.env.CF_API_TOKEN
  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: "CF_ACCOUNT_ID / CF_API_TOKEN belum dikonfigurasi di server." },
      { status: 500 }
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

  const safePrompt = prompt.slice(0, MAX_PROMPT_LENGTH)
  const finalPrompt = `${safePrompt}, sports infographic background, modern editorial design, bold contrast colors, clean composition, no text, no watermark`

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
        body: JSON.stringify({ prompt: finalPrompt }),
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
        console.error("[generate-image] unexpected response shape:", JSON.stringify(data).slice(0, 500))
        continue
      }

      const buf = Buffer.from(base64, "base64")

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
        },
      })
    } catch (err) {
      lastError =
        err instanceof Error && err.name === "TimeoutError"
          ? "Cloudflare timeout — server terlalu lama merespons."
          : "Gagal menghubungi Cloudflare Workers AI."
      console.error("[generate-image] fetch error:", err)
    }
  }

  console.error("[generate-image] failed after retries:", lastError)
  return NextResponse.json({ error: lastError }, { status: 502 })
}
