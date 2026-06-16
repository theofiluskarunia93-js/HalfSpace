// app/api/generate-social-captions/route.ts
//
// Generate caption media sosial — powered by Groq (llama-3.3-70b-versatile).
//
// Sebelumnya endpoint ini memakai OpenRouter dengan model yang bisa dipilih
// manual dari frontend. Sekarang OpenRouter dihilangkan total — Groq menjadi
// satu-satunya "otak" dan langsung generate caption untuk SEMUA platform
// sekaligus (Instagram, TikTok, X, Facebook, Threads) dalam satu panggilan,
// dengan aturan per-platform yang sudah di-embed langsung di prompt di bawah.
//
// Input : title (wajib), excerpt, firstSentence (kalimat pertama artikel,
//         dipakai sebagai hook literal untuk caption X), slug (untuk
//         membangun link artikel)
// Output: { instagram, tiktok, x, facebook, threads }

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"

// Domain publik HalfSpace Sport — dipakai untuk menyusun link artikel yang
// disisipkan ke caption X & Facebook, dan disebut di CTA TikTok.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://halfspacesport.com").replace(/\/$/, "")

interface GenerateCaptionsRequest {
  title:         string
  excerpt?:      string
  firstSentence?: string
  slug?:         string
}

interface Captions {
  instagram: string
  tiktok:    string
  x:         string
  facebook:  string
  threads:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function groqChat(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      temperature: 0.85,
      max_tokens:  2200,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new Error("Groq API rate limit tercapai. Tunggu beberapa detik lalu coba lagi.")
    if (res.status === 401) throw new Error("GROQ_API_KEY tidak valid. Hubungi administrator.")
    if (res.status === 400) throw new Error("Request ke Groq gagal. Coba kurangi panjang excerpt/konteks.")
    throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// Parsing JSON dengan fallback, untuk jaga-jaga kalau model menyisipkan
// markdown fence walau sudah diminta response_format json_object.
function extractJsonObject<T>(raw: string): T | null {
  let cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  if (cleaned.startsWith("{")) {
    try { return JSON.parse(cleaned) as T } catch { /* lanjut */ }
  }

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) as T } catch { /* gagal juga */ }
  }

  return null
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────
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

  const articleUrl = slug?.trim() ? `${SITE_URL}/article/${slug.trim()}` : ""

  // ─── Prompt: aturan per platform di-embed langsung di sini ──────────────────
  const prompt = `Kamu adalah copywriter media sosial profesional untuk media sepak bola HalfSpace Sport (${SITE_URL.replace(/^https?:\/\//, "")}).

Berdasarkan artikel berikut, buat caption untuk 5 platform sekaligus: Instagram, TikTok, X (Twitter), Facebook, dan Threads.

JUDUL ARTIKEL: ${title}
EXCERPT/RINGKASAN: ${excerpt?.trim() || "(tidak ada excerpt)"}
KALIMAT PERTAMA ARTIKEL (hook asli dari isi artikel): ${firstSentence?.trim() || "(tidak tersedia — gunakan judul sebagai dasar hook)"}
LINK ARTIKEL: ${articleUrl || "(tidak tersedia)"}

Tulis dalam Bahasa Indonesia yang natural dan sesuai karakter media sosial sepak bola — jangan terasa seperti terjemahan kaku, dan jangan memakai frasa generik AI seperti "tentu saja" atau "tidak dapat dipungkiri".

━━━ ATURAN PER PLATFORM (WAJIB DIIKUTI PERSIS, JANGAN DICAMPUR ANTAR PLATFORM) ━━━

INSTAGRAM:
- Baris PERTAMA harus berupa hook 1 baris yang menarik perhatian
- Body boleh lebih panjang dari hook — pisahkan setiap paragraf dengan baris kosong agar enak dibaca
- Gunakan emoji secukupnya, jangan berlebihan
- Tutup dengan CTA: "link di bio"
- Akhiri dengan TEPAT 5 hashtag yang relevan dengan topik artikel

X (TWITTER):
- MAKSIMAL 250 karakter total termasuk link — ini batas keras, jangan dilanggar
- Hook pembuka HARUS memakai/mengadaptasi langsung kalimat pertama artikel di atas, tanpa basa-basi sebelum masuk ke intinya
- Sisipkan link artikel (${articleUrl || "(tidak tersedia, lewati bagian ini jika kosong)"}) secara natural karena X mendukung link yang bisa diklik
- Tidak perlu banyak hashtag, fokus ke hook dan link

FACEBOOK:
- Nada mengobrol dan santai, seperti teman membahas bola — bukan siaran pers
- Boleh agak panjang, beberapa paragraf singkat
- Sisipkan link artikel (${articleUrl || "(tidak tersedia, lewati bagian ini jika kosong)"}) secara inline/menyatu dalam kalimat, bukan ditempel begitu saja di akhir
- Tutup dengan SATU pertanyaan terbuka ke audiens untuk memancing komentar dan menaikkan engagement

TIKTOK:
- Ini caption PENDAMPING untuk video/slide artikel, bukan artikel itu sendiri — harus pendek dan kasual
- Hook di awal seperti sedang mengobrol langsung dengan audiens (sapaan santai)
- Tutup dengan CTA persis: "kunjungi www.halfspacesport.com"
- Akhiri dengan TEPAT 5 hashtag relevan, dan salah satunya WAJIB #halfspacesport

THREADS:
- Nada PALING santai dan personal di antara semua platform — seperti curhat ke teman, bukan promosi
- Mirip gaya X tapi lebih ke arah personal/curhat
- Cukup 1-2 kalimat saja dengan hook yang kuat, jangan bertele-tele
- Tidak perlu CTA, link, atau hashtag

Jawab HANYA dalam format JSON seperti ini, tanpa teks lain apapun, tanpa markdown backtick:
{
  "instagram": "...",
  "tiktok": "...",
  "x": "...",
  "facebook": "...",
  "threads": "..."
}`

  try {
    const raw = await groqChat(apiKey, prompt)

    const captions = extractJsonObject<Captions>(raw)
    if (!captions) {
      console.error("[generate-social-captions] Gagal parse hasil Groq. Raw:", raw.slice(0, 800))
      return NextResponse.json(
        { error: "Gagal memproses hasil Groq. Coba lagi dalam beberapa detik." },
        { status: 422 }
      )
    }

    // Pastikan semua platform ada
    const requiredKeys: (keyof Captions)[] = ["instagram", "tiktok", "x", "facebook", "threads"]
    for (const key of requiredKeys) {
      if (!captions[key]) captions[key] = ""
    }

    return NextResponse.json(captions)
  } catch (error) {
    console.error("[generate-social-captions]", error)
    const message = error instanceof Error ? error.message : "Gagal generate caption. Coba lagi."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
