// app/api/generate-social-captions/route.ts
//
// Generate caption media sosial menggunakan Groq Qwen QwQ-32B.
// Satu langkah langsung — tidak ada tahap revisi editor.
//
// Input : title, excerpt, firstSentence, slug
// Output: { instagram, tiktok, x, facebook, threads }
//
// Catatan API key:
// - GROQ_API_KEY → model: qwen-qwq-32b

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

// ─── Groq Qwen QwQ-32B ───────────────────────────────────────────────────────
async function groqGenerateCaptions(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:             "qwen-qwq-32b",
      temperature:       0.75,
      max_tokens:        1500,
      messages: [{ role: "user", content: prompt }],
      response_format:   { type: "json_object" },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new Error("Groq API rate limit tercapai. Tunggu beberapa detik lalu coba lagi.")
    if (res.status === 401) throw new Error("GROQ_API_KEY tidak valid. Hubungi administrator.")
    if (res.status === 400) throw new Error("Request ke Groq gagal (400). Coba kurangi panjang excerpt/konteks.")
    throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY belum dikonfigurasi di environment variables." },
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

  const prompt = `Kamu adalah copywriter olahraga Indonesia yang energik untuk media sepak bola HalfSpace Sport (${SITE_URL.replace(/^https?:\/\//, "")}).
Buat caption untuk 5 platform sekaligus berdasarkan artikel berikut.

JUDUL: ${title.trim()}
RINGKASAN: ${safeExcerpt || "(tidak ada)"}
KALIMAT PERTAMA ARTIKEL: ${safeFirst || "(tidak tersedia)"}
LINK ARTIKEL: ${articleUrl || "(tidak tersedia)"}

BATAS KERAS: Setiap caption MAKSIMAL 150 kata termasuk hashtag. Jangan dilanggar.
Tulis Bahasa Indonesia yang natural dan idiomatik — bukan terjemahan kaku.
Jangan pakai frasa generik AI seperti "tentu saja" atau "tidak dapat dipungkiri".

━━━ ATURAN PER PLATFORM ━━━

[INSTAGRAM]
- Hook kuat di baris pertama (sebelum tombol "more") — max 1-2 kalimat
- Line break setiap 2-3 kalimat
- Emoji strategis, bukan dekorasi
- CTA: "Link di bio 🔗"
- Akhiri dengan 10-15 hashtag campuran (umum → niche), wajib ada #halfspacesport

[TIKTOK]
- Hook baris pertama: "POV:", "Fakta:", atau pertanyaan langsung
- Bahasa gaul, hype, singkat
- Emoji secukupnya
- CTA persis: "kunjungi www.halfspacesport.com"
- 5-8 hashtag campuran, wajib ada #halfspacesport

[X]
- MAKSIMAL 280 karakter total termasuk link — batas keras platform
- Hook kuat, to the point, sedikit provokatif
- Gunakan/adaptasi kalimat pertama artikel sebagai hook
- Sisipkan link artikel secara natural
- 2-3 hashtag relevan

[FACEBOOK]
- Hook di kalimat pertama — fakta menarik atau pertanyaan yang memancing komentar
- Sisipkan 1 pertanyaan untuk mendorong engagement
- Sisipkan link artikel secara inline dalam kalimat
- 3-5 hashtag relevan

[THREADS]
- Nada paling santai — seperti curhat ke teman
- Cukup 2-3 kalimat dengan hook yang kuat
- TIDAK ADA link, CTA, atau hashtag

Jawab HANYA dalam format JSON berikut, tanpa teks lain, tanpa markdown backtick:
{
  "instagram": "...",
  "tiktok": "...",
  "x": "...",
  "facebook": "...",
  "threads": "..."
}`

  try {
    const raw = await groqGenerateCaptions(apiKey, prompt)

    const captions = extractJsonObject<Captions>(raw)
    if (!captions) {
      console.error("[generate-social-captions] Gagal parse hasil Groq. Raw:", raw.slice(0, 800))
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
