// app/api/generate-social-captions/route.ts
//
// Generate caption media sosial — pipeline DUA TAHAP:
//
//   Tahap 1 (Penulis) : Groq (GPT-OSS-20B)
//                        menulis draft caption untuk SEMUA platform sekaligus
//                        (Instagram, TikTok, X, Facebook, Threads) dalam satu
//                        panggilan, dengan aturan per-platform yang sudah
//                        di-embed di prompt di bawah.
//   Tahap 2 (Editor)   : Gemini 3.5 Flash membaca draft caption dari Groq, lalu
//                        MEREVISI sebagai social media editor — memperkuat hook/
//                        baris pembuka, mempertajam CTA, dan memastikan setiap
//                        caption tetap mengikuti aturan per-platform yang sama.
//
// Kedua tahap ini berjalan otomatis dalam satu request — klien hanya menerima
// HASIL AKHIR yang sudah direvisi. Kontrak response tidak berubah:
// tetap objek datar { instagram, tiktok, x, facebook, threads }.
//
// Batas kata semua platform: MAKSIMAL 150 kata per caption.
//
// Input : title (wajib), excerpt, firstSentence (kalimat pertama artikel,
//         dipakai sebagai hook literal untuk caption X), slug (untuk
//         membangun link artikel)
// Output: { instagram, tiktok, x, facebook, threads }
//
// Catatan API key:
// - GROQ_API_KEY   → tahap penulisan draft caption awal (GPT-OSS-20B).
// - GEMINI_API_KEY → tahap revisi/editor caption. SDK: @google/genai (GoogleGenAI).
//                    Model: gemini-3.5-flash

import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
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

// System prompt untuk tahap editor caption — Gemini diposisikan sebagai social
// media editor yang menyunting draft caption dari Groq, BUKAN menulis ulang dari
// nol. Aturan per-platform sengaja diulang di sini agar revisi tidak melenceng
// dari batasan format yang sama.
const EDITOR_SYSTEM = `Kamu adalah editor caption olahraga Indonesia yang spesialis konten viral untuk media sepak bola HalfSpace Sport.
Tugasmu BUKAN merapikan — tapi MEMPERKUAT dan MENGEMBANGKAN draft caption yang sudah ditulis penulis lain.
JANGAN ubah fakta dari artikel asli. JANGAN buat caption baru dari nol — kembangkan draft yang ada.
Jika draft sudah bagus, cukup perkuat hook dan CTA-nya saja.

BATAS KERAS: Setiap caption MAKSIMAL 150 kata. Jika draft melebihi 150 kata, potong bagian yang tidak esensial tanpa mengorbankan hook dan CTA.

Untuk setiap platform, pastikan:

[X]
- Hook baris pertama harus bikin orang berhenti scroll
- MAKSIMAL 280 karakter total termasuk link (batas keras platform)
- Pastikan ada urgensi atau emosi kuat
- CTA harus eksplisit mengarah ke website

[THREADS]
- Nada paling santai/personal — seperti curhat ke teman, cukup 3-4 kalimat
- TIDAK ADA link atau hashtag
- Hook harus kuat meski singkat

[TIKTOK]
- Pastikan baris pertama adalah hook yang langsung "nyangkut"
- Gunakan emoji secukupnya untuk energi visual
- Bahasa harus gaul tapi tetap relevan
- Hashtag harus mix: 3 besar (#olahraga #football) + 2-3 niche, salah satunya WAJIB #halfspacesport
- CTA persis: "kunjungi www.halfspacesport.com"

[FACEBOOK]
- Pastikan ada minimal 1 pertanyaan yang memancing komentar
- Hook harus lebih kuat dari draft — ubah jika perlu
- CTA harus jelas mengarah ke link artikel, menyatu inline dalam kalimat
- Tone energik tapi sedikit lebih dewasa

[INSTAGRAM]
- Periksa baris pertama — harus bisa berdiri sendiri sebagai hook sebelum tombol "more"
- Line break konsisten setiap 2-3 kalimat untuk readability di mobile
- Emoji digunakan strategis sebagai penanda visual, bukan dekorasi
- CTA: "link di bio 🔗"
- Hashtag: 10-15 hashtag terstruktur di akhir (umum → medium → niche)

Output HANYA JSON murni dengan struktur berikut, tanpa markdown fence, tanpa komentar, tanpa teks lain apapun:
{
  "instagram": "...",
  "tiktok": "...",
  "x": "...",
  "facebook": "...",
  "threads": "..."
}`

// ─── TAHAP 1 (Penulis): Groq menulis draft caption (GPT-OSS-20B) ─────────────
async function groqChat(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       "openai/gpt-oss-20b",
      temperature: 0.85,
      max_tokens:  1500,
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

// ─── TAHAP 2 (Editor): Gemini 3.5 Flash merevisi caption dari Groq ────────────
async function geminiReviseCaptions(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const genai = new GoogleGenAI({ apiKey })

  const response = await genai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature:       0.7,
      maxOutputTokens:   1500,
      responseMimeType:  "application/json",
    },
  })

  return (response.text ?? "").trim()
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

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
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

  const articleUrl = slug?.trim() ? `${SITE_URL}/article/${slug.trim()}` : ""

  // Potong excerpt dan firstSentence sebelum dimasukkan ke prompt
  // untuk mencegah error 400 Groq akibat total token terlalu panjang.
  const safeExcerpt      = (excerpt?.trim()       ?? "").slice(0, 500)
  const safeFirstSentence = (firstSentence?.trim() ?? "").slice(0, 200)

  // ─── Prompt: aturan per platform — semua dibatasi 150 kata ──────────────────
  const prompt = `Kamu adalah copywriter olahraga Indonesia yang energik dan hype untuk media sepak bola HalfSpace Sport (${SITE_URL.replace(/^https?:\/\//, "")}).
Target audiens: penggemar dan komunitas sepak bola Indonesia.

Berdasarkan artikel berikut, buat caption untuk 5 platform sekaligus: Instagram, TikTok, X (Twitter), Facebook, dan Threads.

JUDUL ARTIKEL: ${title}
EXCERPT/RINGKASAN: ${safeExcerpt || "(tidak ada excerpt)"}
KALIMAT PERTAMA ARTIKEL (hook asli dari isi artikel): ${safeFirstSentence || "(tidak tersedia — gunakan judul sebagai dasar hook)"}
LINK ARTIKEL: ${articleUrl || "(tidak tersedia)"}

Tulis dalam Bahasa Indonesia yang natural — jangan terasa seperti terjemahan kaku, dan jangan memakai frasa generik AI seperti "tentu saja" atau "tidak dapat dipungkiri".

BATAS KATA SEMUA PLATFORM: MAKSIMAL 150 kata per caption (termasuk hashtag). Ini batas keras — jangan dilanggar.

━━━ ATURAN PER PLATFORM (WAJIB DIIKUTI PERSIS, JANGAN DICAMPUR ANTAR PLATFORM) ━━━

[INSTAGRAM]
- Maksimal 200 kata termasuk hashtag
- Baris pertama (sebelum "more"): hook yang sangat kuat, maksimal 1-2 kalimat
- Struktur: Hook → Konteks singkat → CTA
- Line break setiap 2-3 kalimat untuk readability di mobile
- Emoji digunakan strategis sebagai penanda visual, bukan dekorasi
- CTA: "Link di bio 🔗" atau "Klik link di bio untuk baca selengkapnya"
- Hashtag: 10-15 hashtag di akhir, mix besar dan niche
  Contoh mix: #sepakbola #football #bola + #ligaindonesia #halfspacesport + niche topik artikel

[X (TWITTER)]
- MAKSIMAL 200 karakter total termasuk link — batas keras platform, jangan dilanggar
- Hook kuat di kalimat pertama — HARUS memakai/mengadaptasi langsung kalimat pertama artikel
- Sisipkan link artikel (${articleUrl || "(tidak tersedia, lewati jika kosong)"}) secara natural
- Gunakan 2-3 hashtag relevan
- Tone: to the point, berani, sedikit provokatif

[FACEBOOK]
- Maksimal 200 kata
- Hook di kalimat pertama: fakta menarik atau pertanyaan yang memancing diskusi
- Sisipkan 1 pertanyaan untuk mendorong engagement
- Sisipkan link artikel (${articleUrl || "(tidak tersedia, lewati jika kosong)"}) secara inline menyatu dalam kalimat
- Tone: energik tapi sedikit lebih dewasa dari TikTok
- Hashtag: 3-5 saja, relevan dan tidak berlebihan

[TIKTOK]
- Maksimal 200 kata termasuk hashtag — harus pendek dan kasual
- Hook baris pertama pakai format: "POV:", "Fakta:", atau pertanyaan langsung
- Emoji secukupnya untuk energi visual
- CTA persis: "kunjungi www.halfspacesport.com"
- Tone: hype, singkat, energik, pakai bahasa gaul
- 4-5 hashtag campuran besar dan niche, salah satunya WAJIB #halfspacesport

[THREADS]
- Nada PALING santai dan personal — seperti curhat ke teman, bukan promosi
- Cukup 3-4 kalimat saja dengan hook yang kuat, jangan bertele-tele
- TIDAK ADA CTA, link, atau hashtag

Jawab HANYA dalam format JSON seperti ini, tanpa teks lain apapun, tanpa markdown backtick:
{
  "instagram": "...",
  "tiktok": "...",
  "x": "...",
  "facebook": "...",
  "threads": "..."
}`

  try {
    // ── TAHAP 1: Groq menulis draft caption untuk 5 platform (GPT-OSS-20B) ───
    const raw = await groqChat(apiKey, prompt)

    const draftCaptions = extractJsonObject<Captions>(raw)
    if (!draftCaptions) {
      console.error("[generate-social-captions] Gagal parse hasil Groq. Raw:", raw.slice(0, 800))
      return NextResponse.json(
        { error: "Gagal memproses hasil Groq. Coba lagi dalam beberapa detik." },
        { status: 422 }
      )
    }

    // Pastikan semua platform ada sebelum dikirim ke tahap revisi
    const requiredKeys: (keyof Captions)[] = ["instagram", "tiktok", "x", "facebook", "threads"]
    for (const key of requiredKeys) {
      if (!draftCaptions[key]) draftCaptions[key] = ""
    }

    // ── TAHAP 2: Gemini 3.5 Flash merevisi draft sebagai social media editor ─
    const editorUserPrompt = `Berikut draft caption 5 platform yang perlu kamu revisi sebagai social media editor.

JUDUL ARTIKEL: ${title}
LINK ARTIKEL: ${articleUrl || "(tidak tersedia)"}

DRAFT CAPTION (JSON):
${JSON.stringify(draftCaptions, null, 2)}

Revisi draft di atas sesuai instruksi editor yang sudah diberikan — fokus memperkuat hook dan CTA di setiap platform, tanpa melanggar aturan format per platform, dan PASTIKAN setiap caption MAKSIMAL 150 kata. Kembalikan HASIL REVISI FINAL dalam format JSON yang sama persis (instagram, tiktok, x, facebook, threads).`

    let finalCaptions = draftCaptions
    try {
      const rawRevised = await geminiReviseCaptions(geminiKey, EDITOR_SYSTEM, editorUserPrompt)
      const revised = rawRevised ? extractJsonObject<Captions>(rawRevised) : null

      if (revised) {
        for (const key of requiredKeys) {
          if (!revised[key]) revised[key] = draftCaptions[key]
        }
        finalCaptions = revised
      } else {
        console.error("[generate-social-captions] Gagal parse hasil revisi Gemini. Raw:", (rawRevised ?? "").slice(0, 800))
        // Fallback: tetap kirim draft Groq apa adanya supaya proses tidak gagal total
      }
    } catch (editorErr) {
      console.error("[generate-social-captions] Gemini editor error, fallback ke draft Groq:", editorErr)
      // Fallback: tetap kirim draft Groq apa adanya supaya proses tidak gagal total
    }

    return NextResponse.json(finalCaptions)
  } catch (error) {
    console.error("[generate-social-captions]", error)
    const message = error instanceof Error ? error.message : "Gagal generate caption. Coba lagi."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
