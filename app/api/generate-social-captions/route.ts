// app/api/generate-social-captions/route.ts
//
// Generate caption media sosial — pipeline DUA TAHAP:
//
//   Tahap 1 (Penulis) : Groq (llama-3.3-70b-versatile) menulis draft caption
//                        untuk SEMUA platform sekaligus (Instagram, TikTok, X,
//                        Facebook, Threads) dalam satu panggilan, dengan aturan
//                        per-platform yang sudah di-embed di prompt di bawah.
//   Tahap 2 (Editor)   : Gemini membaca draft caption dari Groq, lalu MEREVISI
//                        sebagai social media editor — memperkuat hook/baris
//                        pembuka, mempertajam CTA, dan memastikan setiap caption
//                        tetap mengikuti aturan per-platform yang sama persis.
//
// Kedua tahap ini berjalan otomatis di background dalam satu request — klien
// hanya menerima HASIL AKHIR yang sudah melalui kedua proses tersebut (sudah
// final, sudah direvisi). Kontrak response TIDAK berubah dari sebelumnya:
// tetap objek datar { instagram, tiktok, x, facebook, threads }, supaya
// frontend (social-media-view.tsx) tidak perlu diubah sama sekali.
//
// Input : title (wajib), excerpt, firstSentence (kalimat pertama artikel,
//         dipakai sebagai hook literal untuk caption X), slug (untuk
//         membangun link artikel)
// Output: { instagram, tiktok, x, facebook, threads }
//
// Catatan API key:
// - GROQ_API_KEY   → tahap penulisan draft caption awal (semua platform sekaligus)
// - GEMINI_API_KEY → tahap revisi/editor caption (format Google AI Studio terbaru:
//   "AQ.xxx"). SDK: @google/genai (class GoogleGenAI) — jangan fetch manual ke
//   endpoint v1beta lama. Model: gemini-3.5-flash

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
// dari batasan format yang sama (mis. limit karakter X, jumlah hashtag, dll).
const EDITOR_SYSTEM = `Kamu adalah social media editor senior untuk media sepak bola HalfSpace Sport.
Kamu menerima draft caption untuk 5 platform (Instagram, TikTok, X, Facebook, Threads) yang SUDAH DITULIS oleh penulis lain.
Tugasmu BUKAN menulis ulang dari nol, tapi MENYUNTING draft tersebut menjadi versi final yang lebih kuat — terutama di hook/baris pembuka dan CTA — sambil tetap menjaga substansi dan informasi yang sudah ada.

Fokus revisi:
- Perkuat hook/baris pertama setiap caption agar lebih menarik dan langsung menggigit perhatian, jangan generik
- Pertajam CTA supaya terasa lebih hidup, bukan template kaku
- Hapus/ganti frasa generik AI seperti "tentu saja", "tidak dapat dipungkiri", atau kalimat pembuka yang terasa template
- Pastikan bahasa tetap natural, mengalir seperti penulis Indonesia asli — bukan terjemahan kaku
- JANGAN mengubah fakta, judul artikel, atau link yang sudah ada di draft

Aturan per platform TETAP WAJIB DIPATUHI saat merevisi (jangan dilanggar oleh hasil revisimu):
- INSTAGRAM: baris pertama = hook 1 baris, body boleh panjang dengan paragraf dipisah baris kosong, emoji secukupnya, tutup CTA "link di bio", akhiri TEPAT 5 hashtag relevan
- X (TWITTER): MAKSIMAL 250 karakter total termasuk link — batas keras, hook harus tetap kuat dan langsung ke inti, link disisipkan natural, hashtag minim
- FACEBOOK: nada santai mengobrol, boleh beberapa paragraf singkat, link inline menyatu dalam kalimat, tutup dengan SATU pertanyaan terbuka ke audiens
- TIKTOK: caption pendamping video, pendek & kasual, hook menyapa santai, tutup CTA persis "kunjungi www.halfspacesport.com", akhiri TEPAT 5 hashtag dengan salah satunya WAJIB #halfspacesport
- THREADS: nada paling santai/personal seperti curhat, cukup 1-2 kalimat dengan hook kuat, TIDAK ADA CTA/link/hashtag

Output HANYA JSON murni dengan struktur berikut, tanpa markdown fence, tanpa komentar, tanpa teks lain apapun:
{
  "instagram": "...",
  "tiktok": "...",
  "x": "...",
  "facebook": "...",
  "threads": "..."
}`

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

// ─── TAHAP 2 (Editor): Gemini merevisi caption dari Groq ─────────────────────
// Gemini berperan sebagai social media editor — membaca draft caption yang
// sudah ditulis Groq untuk 5 platform, lalu mengembalikan versi revisi final
// dalam JSON dengan struktur yang sama, dengan hook & CTA yang lebih kuat.
async function geminiReviseCaptions(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const genai = new GoogleGenAI({ apiKey })

  const response = await genai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature:       0.7,
      maxOutputTokens:   2200,
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
    // ── TAHAP 1: Groq menulis draft caption untuk 5 platform ────────────────
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

    // ── TAHAP 2: Gemini merevisi draft sebagai social media editor ──────────
    const editorUserPrompt = `Berikut draft caption 5 platform yang perlu kamu revisi sebagai social media editor.

JUDUL ARTIKEL: ${title}
LINK ARTIKEL: ${articleUrl || "(tidak tersedia)"}

DRAFT CAPTION (JSON):
${JSON.stringify(draftCaptions, null, 2)}

Revisi draft di atas sesuai instruksi editor yang sudah diberikan — fokus memperkuat hook dan CTA di setiap platform, tanpa melanggar aturan format per platform. Kembalikan HASIL REVISI FINAL dalam format JSON yang sama persis (instagram, tiktok, x, facebook, threads).`

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
