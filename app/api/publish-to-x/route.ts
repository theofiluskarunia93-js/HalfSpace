import { NextRequest, NextResponse } from "next/server"
import { TwitterApi } from "twitter-api-v2"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { publishXRateLimit } from "@/lib/rate-limit"

// Pastikan env vars ini sudah di .env.local:
// X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Rate limit (lebih ketat — ini posting publik & kena limit API X juga) ─
  const { success } = await publishXRateLimit.limit(user.id)
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak request publish ke X. Tunggu sebentar lalu coba lagi." },
      { status: 429 }
    )
  }

  try {
    const { text, articleSlug } = await request.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: "Caption tidak boleh kosong" }, { status: 400 })
    }

    if (text.length > 280) {
      return NextResponse.json(
        { error: `Caption terlalu panjang (${text.length}/280 karakter)` },
        { status: 400 }
      )
    }

    // Check env vars
    const requiredEnvs = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]
    for (const env of requiredEnvs) {
      if (!process.env[env]) {
        return NextResponse.json(
          { error: `Env var ${env} belum dikonfigurasi` },
          { status: 500 }
        )
      }
    }

    const client = new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: process.env.X_ACCESS_TOKEN!,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
    })

    // Tambahkan URL artikel jika ada slug
    let tweetText = text
    if (articleSlug) {
      const articleUrl = `\nhttps://halfspace.id/article/${articleSlug}`
      // Pastikan masih dalam batas 280 karakter
      if ((tweetText + articleUrl).length <= 280) {
        tweetText += articleUrl
      }
    }

    const tweet = await client.v2.tweet(tweetText)

    return NextResponse.json({
      success: true,
      tweetId: tweet.data.id,
      tweetUrl: `https://x.com/i/web/status/${tweet.data.id}`,
    })
  } catch (error: any) {
    console.error("[publish-to-x]", error)

    // Twitter API specific errors
    if (error.code === 403) {
      return NextResponse.json(
        { error: "Tidak ada izin posting. Pastikan Twitter App memiliki Read+Write permission." },
        { status: 403 }
      )
    }

    if (error.code === 401) {
      return NextResponse.json(
        { error: "API key X tidak valid. Cek konfigurasi di .env.local." },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Gagal posting ke X. Coba lagi." },
      { status: 500 }
    )
  }
}
