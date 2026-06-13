// app/api/humanize-article/route.ts
//
// Humanizer artikel sepak bola — powered by Google Gemini (gemini-3.5-flash).
//
// Alur:
// 1. Terima { html, newsType } dari create-article-view
// 2. Strip HTML → teks bersih untuk dikirim ke Gemini
// 3. Gemini menulis ulang konten agar lebih natural/manusiawi
// 4. Return { content } berupa HTML siap pakai TipTap (hanya <p> dan <blockquote>)
//
// Catatan API key:
// - Google AI Studio kini menggunakan format "AQ.xxx" (bukan "AIza...")
// - Key ini kompatibel HANYA dengan SDK @google/genai v1+
// - Pastikan env var: GEMINI_API_KEY=AQ.Ab8RN6KIr0...
// - Model yang digunakan: gemini-3.5-flash (tersedia di free tier)
//
// Error 400 sebelumnya terjadi karena:
// a) Menggunakan endpoint lama (v1beta) dengan key format baru, atau
// b) Field "parts" tidak sesuai format SDK baru
// Fix: gunakan @google/genai SDK dengan GoogleGenAI class, bukan fetch manual.

import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"

export type NewsType =
  | "transfer"
  | "konpers"
  | "cedera"
  | "preview"
  | "hasil"
  | "trivia"

interface RequestBody {
  html:      string
  newsType?: NewsType
}

// ─── Strip HTML ke teks bersih ────────────────────────────────────────────────
// Pertahankan struktur paragraf & blockquote sebagai tanda bagi Gemini

function stripHtmlToStructured(html: string): string {
  return html
    // Ganti blockquote jadi marker khusus
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
      const text = inner.replace(/<[^>]+>/g, "").trim()
      return `[KUTIPAN]: ${text}`
    })
    // Setiap <p> jadi baris baru
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    // Hapus tag HTML sisanya
    .replace(/<[^>]+>/g, "")
    // Bersihkan whitespace berlebih
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// ─── Sistem prompt humanizer ──────────────────────────────────────────────────

const HUMANIZER_SYSTEM = `Kamu adalah editor senior di HalfSpace.id, media sepak bola premium Indonesia bergaya The Athletic.

Tugasmu adalah MENULIS ULANG artikel yang diberikan agar terasa lebih manusiawi, natural, dan hidup — bukan sekadar memperbaiki kata-kata. Kamu boleh mengubah struktur kalimat, memilih angle yang lebih menarik, dan menyisipkan observasi tajam khas jurnalis berpengalaman.

━━━ ATURAN PENULISAN ULANG ━━━
- Pertahankan SEMUA fakta, data, dan informasi dari artikel asli — jangan tambah atau kurangi fakta
- Buka dengan hook yang berbeda dari versi asli — cari angle yang lebih kuat dan tidak terduga
- Variasikan ritme kalimat: gabungkan kalimat pendek yang menghentak dengan paragraf yang mengalir panjang
- Ganti frasa generik dengan ekspresi yang lebih spesifik dan bernyawa
- Sesekali tambahkan observasi singkat khas jurnalis — satu kalimat yang menunjukkan kamu memahami konteks lebih dalam
- Variasikan penyebutan subjek: jangan ulang nama lebih dari 2x per paragraf

━━━ FRASA YANG DILARANG KERAS ━━━
Hapus atau ganti semua frasa berikut dalam bentuk apapun:
- "Hal ini tentu saja" / "Sudah tentu" / "Tentu saja"
- "Tidak dapat dipungkiri" / "Tak dapat dipungkiri"
- "Menarik untuk dinantikan" / "Menarik untuk disimak"
- "Sebuah langkah yang" / "Sebuah keputusan yang"
- "Perlu dicatat bahwa" / "Patut dicatat"
- "Dalam konteks ini" / "Dalam hal ini"
- "Pada akhirnya" sebagai pembuka kalimat
- "Tak pelak" / "Tak ayal"
- "Hanya waktu yang akan menjawab..." (DILARANG MUTLAK sebagai penutup)
- "Yang jelas," sebagai pembuka kalimat
- "Satu hal yang pasti..." sebagai pembuka penutup

━━━ FORMAT OUTPUT ━━━
- Kembalikan HANYA JSON murni tanpa markdown fence, tanpa komentar
- Format: { "content": "<html>" }
- HTML hanya boleh menggunakan tag <p> untuk paragraf dan <blockquote> untuk kutipan langsung
- JANGAN gunakan tag HTML lain (tidak ada <h1>, <h2>, <ul>, <strong>, dsb.)
- Setiap paragraf dibungkus <p>...</p>
- Baris [KUTIPAN]: ... dari input harus diubah kembali menjadi <blockquote>...</blockquote>`

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY belum dikonfigurasi di environment variables." },
      { status: 500 }
    )
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const { html, newsType = "transfer" } = body

  if (!html?.trim()) {
    return NextResponse.json(
      { error: "Field 'html' wajib diisi dan tidak boleh kosong." },
      { status: 400 }
    )
  }

  // Cek panjang minimum
  const plainText = html.replace(/<[^>]+>/g, "").trim()
  if (plainText.length < 50) {
    return NextResponse.json(
      { error: "Konten terlalu pendek untuk di-humanize. Generate artikel terlebih dahulu." },
      { status: 400 }
    )
  }

  // Konversi HTML ke teks terstruktur untuk prompt
  const structuredText = stripHtmlToStructured(html)

  const userPrompt = `Tipe artikel: ${newsType.toUpperCase()}

ARTIKEL ASLI (untuk ditulis ulang):
${structuredText}

Tulis ulang artikel ini agar jauh lebih manusiawi, natural, dan kuat secara naratif.
Pertahankan semua fakta. Buat versi yang lebih baik dari yang asli.

Kembalikan HANYA JSON dengan format:
{ "content": "<html artikel yang sudah ditulis ulang>" }`

  try {
    // Gunakan @google/genai SDK dengan GoogleGenAI class
    // Compatible dengan API key format AQ.xxx (Google AI Studio format baru)
    const genai = new GoogleGenAI({ apiKey })

    const response = await genai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: HUMANIZER_SYSTEM,
        temperature:       0.8,
        maxOutputTokens:   3000,
      },
    })

    // Ambil teks dari response
    const raw = response.text?.trim() ?? ""

    if (!raw) {
      return NextResponse.json(
        { error: "Gemini tidak menghasilkan output. Coba lagi." },
        { status: 422 }
      )
    }

    // Bersihkan markdown fence jika ada
    let cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()

    // Fallback: ekstrak blok JSON pertama jika ada teks di luar JSON
    if (!cleaned.startsWith("{")) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) cleaned = jsonMatch[0]
    }

    let parsed: { content: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error("[humanize-article] Raw output tidak bisa di-parse:", raw.slice(0, 500))
      return NextResponse.json(
        { error: "Gagal parse hasil Gemini. Coba lagi." },
        { status: 422 }
      )
    }

    if (!parsed.content?.trim()) {
      return NextResponse.json(
        { error: "Hasil humanize kosong. Coba lagi." },
        { status: 422 }
      )
    }

    console.log(`[humanize-article] Berhasil humanize artikel tipe "${newsType}" (${plainText.length} karakter input)`)

    return NextResponse.json({ content: parsed.content.trim() })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi error tidak terduga."
    console.error("[humanize-article] Error:", err)

    // Deteksi error spesifik Gemini
    if (message.includes("400") || message.includes("INVALID_ARGUMENT")) {
      return NextResponse.json(
        { error: "Gemini: request tidak valid. Pastikan GEMINI_API_KEY benar dan model tersedia." },
        { status: 400 }
      )
    }
    if (message.includes("403") || message.includes("PERMISSION_DENIED")) {
      return NextResponse.json(
        { error: "Gemini: API key tidak memiliki akses. Cek quota atau billing di Google AI Studio." },
        { status: 403 }
      )
    }
    if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
      return NextResponse.json(
        { error: "Gemini: quota free tier habis. Tunggu beberapa saat atau upgrade plan." },
        { status: 429 }
      )
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
