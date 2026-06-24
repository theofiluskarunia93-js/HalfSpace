// app/api/generate-social-captions/route.ts
//
// Generate caption media sosial menggunakan Google Gemini 3.5 Flash.
// Satu langkah langsung — tidak ada tahap revisi editor.
//
// Input : title, excerpt, firstSentence, slug
// Output: { instagram, tiktok, x, facebook, threads }
//
// Catatan API key:
// - GEMINI_API_KEY → model: gemini-3.5-flash

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://halfspacesport.com").replace(/\/$/, "")

interface GenerateCaptionsRequest {
  title:          string
  excerpt?:       string
  firstSentence?: string
  slug?:          string
}

interface Captions {
  instagram: string
  tiktok:    string
  x:         string
  facebook:  string
  threads:   string
}

// Bersihkan HTML dan potong excerpt ke maks 300 karakter sebelum dimasukkan ke
// prompt untuk mencegah error 400 akibat total token terlalu panjang.
function sanitizeExcerpt(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

function sanitizeFirstSentence(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

// Parse JSON dengan fallback kalau model menyisipkan markdown fence
function extractJsonObject<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  if (cleaned.startsWith("{")) {
    try { return JSON.parse(cleaned) as T } catch { /* lanjut */ }
  }

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) as T } catch { /* gagal */ }
  }

  return null
}

// ─── Google Gemini 2.5 Flash ──────────────────────────────────────────────────
async function geminiGenerateCaptions(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     0.8,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new Error("Gemini API rate limit tercapai. Tunggu beberapa detik lalu coba lagi.")
    if (res.status === 401 || res.status === 403) throw new Error("GEMINI_API_KEY tidak valid. Hubungi administrator.")
    if (res.status === 400) throw new Error("Request ke Gemini gagal (400). Coba kurangi panjang excerpt/konteks.")
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY belum dikonfigurasi di environment variables." },
      { status: 500 }
    )
  }

  let reqBody: GenerateCaptionsRequest
  try {
    reqBody = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const { title, excerpt, firstSentence, slug } = reqBody

  if (!title?.trim()) {
    return NextResponse.json({ error: "Judul artikel wajib diisi" }, { status: 400 })
  }

  const articleUrl  = slug?.trim() ? `${SITE_URL}/article/${slug.trim()}` : ""
  const safeExcerpt = sanitizeExcerpt(excerpt ?? "")
  const safeFirst   = sanitizeFirstSentence(firstSentence ?? "")

  const prompt = `Kamu adalah copywriter olahraga Indonesia yang berpengalaman di media digital sepak bola HalfSpace Sport (${SITE_URL.replace(/^https?:\/\//, "")}).

Tugasmu: buat caption viral untuk 5 platform media sosial sekaligus berdasarkan artikel berikut.

JUDUL: ${title.trim()}
RINGKASAN: ${safeExcerpt || "(tidak ada)"}
KALIMAT PERTAMA ARTIKEL: ${safeFirst || "(tidak tersedia)"}
LINK ARTIKEL: ${articleUrl || "(tidak tersedia)"}

━━━ PRINSIP UTAMA ━━━
- Setiap caption WAJIB punya HOOK kuat di baris pertama — kalimat pembuka yang langsung memancing rasa ingin tahu, emosi, atau kontroversi.
- CTA (call-to-action) harus spesifik dan mendorong orang untuk klik, komentar, atau share.
- Gunakan bahasa Indonesia yang natural, energik, dan idiomatik — bukan terjemahan kaku.
- JANGAN pakai frasa AI generik seperti "tentu saja", "tidak dapat dipungkiri", "mari kita", "sudah tidak asing lagi".
- BATAS KERAS: Setiap caption MAKSIMAL 150 kata termasuk hashtag.

━━━ ATURAN PER PLATFORM ━━━

[INSTAGRAM]
- HOOK baris pertama: kalimat provokatif, fakta mengejutkan, atau pertanyaan yang memancing — max 1-2 kalimat sebelum tombol "more"
- Susun caption dengan ritme: Hook → Konteks singkat → Insight/angle unik → CTA
- Line break setiap 2-3 kalimat agar mudah dibaca di mobile
- Emoji strategis yang memperkuat emosi, bukan sekadar dekorasi
- CTA eksplisit: "Link di bio 🔗" atau "Baca selengkapnya di bio 🔗"
- Akhiri dengan 10-15 hashtag campuran (umum → niche), wajib ada #halfspacesport dan #bola

[TIKTOK]
- HOOK baris pertama wajib pakai salah satu formula: "POV: ...", "Fakta: ...", "Ini dia kenapa ...", atau pertanyaan langsung yang bikin penasaran
- Tone: gaul, hype, relate ke Gen Z dan Millennial
- Struktur: Hook → 2-3 fakta/info menarik → CTA
- Emoji secukupnya (tidak berlebihan)
- CTA persis: "kunjungi www.halfspacesport.com"
- 5-8 hashtag campuran, wajib ada #halfspacesport #fyp #football

[X / TWITTER]
- TOTAL MAKSIMAL 280 karakter termasuk link dan hashtag — ini batas keras platform
- HOOK: langsung ke inti, provokatif, to the point — adaptasi kalimat pertama artikel
- Sisipkan link artikel secara natural di tengah atau akhir tweet
- Boleh pakai angle kontroversial atau take yang "hot" untuk pancing retweet
- 2-3 hashtag relevan, ringkas

[FACEBOOK]
- HOOK kalimat pertama: fakta mengejutkan, statistik menarik, atau pertanyaan yang memancing diskusi
- Sisipkan 1 pertanyaan terbuka di tengah/akhir untuk mendorong komentar
- Sisipkan link artikel secara inline dalam kalimat (bukan di akhir saja)
- Tone lebih informatif tapi tetap engaging
- 3-5 hashtag relevan

[THREADS]
- Tone paling santai — seperti berbagi cerita ke teman dekat
- Struktur: Hook kuat → opini/insight personal → pancing diskusi
- TIDAK ADA link, CTA eksplisit, atau hashtag
- Cukup 2-4 kalimat tapi berkesan dan bisa memancing balasan

Jawab HANYA dalam format JSON berikut, tanpa teks lain, tanpa markdown backtick:
{
  "instagram": "...",
  "tiktok": "...",
  "x": "...",
  "facebook": "...",
  "threads": "..."
}`

  try {
    const raw = await geminiGenerateCaptions(apiKey, prompt)

    const captions = extractJsonObject<Captions>(raw)
    if (!captions) {
      console.error("[generate-social-captions] Gagal parse hasil Gemini. Raw:", raw.slice(0, 800))
      return NextResponse.json(
        { error: "Gagal memproses hasil generate caption. Coba lagi." },
        { status: 422 }
      )
    }

    // Pastikan semua key ada
    const keys: (keyof Captions)[] = ["instagram", "tiktok", "x", "facebook", "threads"]
    for (const key of keys) {
      if (!captions[key]) captions[key] = ""
    }

    return NextResponse.json(captions)
  } catch (error) {
    console.error("[generate-social-captions]", error)
    const message = error instanceof Error ? error.message : "Gagal generate caption. Coba lagi."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
