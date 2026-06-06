// app/api/extract-players/route.ts
//
// Proxy API route — menerima gambar (base64) dari WidgetInserter,
// mengirimnya ke Google Gemini Vision, dan mengembalikan array pemain
// yang sudah diformat sesuai skema widget_daftar_pemain.
//
// Hanya digunakan oleh form DaftarPemain di WidgetInserter.
// API key GEMINI_API_KEY disimpan di .env.local — tidak pernah expose ke browser.

import { NextRequest, NextResponse } from "next/server"

// ─── Tipe hasil ekstraksi ─────────────────────────────────────────────────────
interface ExtractedPlayer {
  nomor_punggung: number
  nama_pemain: string
  usia: number
  posisi: string        // GK | CB | LB | RB | LWB | RWB | DM | CM | AM | LW | RW | SS | ST | CF | ""
  asal_klub: string
  nilai_pasar: string   // format bebas, misal "€205M" atau "205.00 M €"
}

// ─── Validasi posisi — hanya nilai yang dikenal form DaftarPemain ─────────────
const VALID_POSISI = new Set([
  "GK","CB","LB","RB","LWB","RWB","DM","CM","AM","LW","RW","SS","ST","CF",
])

function sanitizePosisi(raw: string | null | undefined): string {
  if (!raw) return ""
  const upper = raw.trim().toUpperCase()
  return VALID_POSISI.has(upper) ? upper : ""
}

// ─── Normalisasi nilai pasar ──────────────────────────────────────────────────
// Transfermarkt: "205.00 M €" → "€205M"
// Sofascore/lain: bisa "€205M" langsung → tetap
function normalizeNilaiPasar(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "-") return "-"
  const s = raw.trim()

  // Format Transfermarkt: "205.00 M €" atau "1.00 B €"
  const tmMatch = s.match(/^([\d.,]+)\s*(M|B|K)\s*€$/i)
  if (tmMatch) {
    const num  = tmMatch[1].replace(",", ".")
    const unit = tmMatch[2].toUpperCase()
    const unitLabel = unit === "B" ? "M" : unit === "K" ? "rb" : "M"
    // Hilangkan desimal .00
    const parsed = parseFloat(num)
    const display = parsed % 1 === 0 ? `${parsed}` : `${parsed}`
    return `€${display}${unitLabel}`
  }

  // Sudah dalam format "€205M" atau "€30M" → kembalikan apa adanya
  if (s.startsWith("€")) return s

  return s
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY belum dikonfigurasi di .env.local" },
      { status: 500 }
    )
  }

  let body: { imageBase64: string; mimeType: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const { imageBase64, mimeType } = body
  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: "imageBase64 dan mimeType wajib diisi." }, { status: 400 })
  }

  // Batasi mime type yang diizinkan
  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: "Tipe file tidak didukung." }, { status: 400 })
  }

  // ── Prompt ke Gemini ────────────────────────────────────────────────────────
  const prompt = `Kamu adalah ekstractor data tabel pemain sepak bola.

Tugas: Baca tabel pada gambar dan ekstrak semua data pemain.

Kembalikan HANYA JSON array murni — tanpa teks lain, tanpa markdown, tanpa backtick, tanpa komentar.

Format setiap objek dalam array:
{
  "nomor_punggung": <number, isi 0 jika tidak ada kolom nomor punggung>,
  "nama_pemain": <string, nama lengkap pemain>,
  "usia": <number, isi 0 jika tidak ada>,
  "posisi": <string, HANYA salah satu dari: GK CB LB RB LWB RWB DM CM AM LW RW SS ST CF. Kosongkan ("") jika tidak ada kolom posisi atau tidak bisa ditentukan>,
  "asal_klub": <string, nama tim atau negara jika ada, kosongkan jika tidak ada>,
  "nilai_pasar": <string, pertahankan format angka dan satuan asli dari gambar, contoh: "205.00 M €" atau "€205M". Isi "-" jika tidak ada>
}

Penting:
- Ekstrak SEMUA baris pemain yang terlihat, jangan lewatkan satu pun.
- Jangan tambahkan field lain di luar yang disebutkan.
- Jika kolom tidak ada di gambar, gunakan nilai default yang sudah ditentukan di atas.`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,       // deterministic — penting untuk ekstraksi data
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error("[extract-players] Gemini error:", errText)
      return NextResponse.json(
        { error: `Gemini API error ${geminiRes.status}. Periksa API key dan quota.` },
        { status: 502 }
      )
    }

    const geminiData = await geminiRes.json()

    // Ambil teks dari response Gemini
    const rawText: string =
      geminiData?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        ?.map((p: any) => p.text)
        ?.join("") ?? ""

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Gemini tidak menghasilkan output. Coba screenshot dengan kualitas lebih baik." },
        { status: 422 }
      )
    }

    // Strip fence markdown jika Gemini menambahkannya
    const clean = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()

    let parsed: any[]
    try {
      parsed = JSON.parse(clean)
    } catch {
      console.error("[extract-players] Parse error, raw:", clean.slice(0, 300))
      return NextResponse.json(
        { error: "Gagal parse hasil Gemini. Coba screenshot dengan tabel yang lebih jelas." },
        { status: 422 }
      )
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data pemain yang berhasil diekstrak dari gambar." },
        { status: 422 }
      )
    }

    // ── Sanitasi & normalisasi setiap baris ─────────────────────────────────
    const players: ExtractedPlayer[] = parsed.map((p: any, idx: number) => ({
      nomor_punggung: Number(p.nomor_punggung) > 0 ? Number(p.nomor_punggung) : idx + 1,
      nama_pemain:    String(p.nama_pemain || "").trim(),
      usia:           Number(p.usia) || 0,
      posisi:         sanitizePosisi(p.posisi),
      asal_klub:      String(p.asal_klub || "").trim(),
      nilai_pasar:    normalizeNilaiPasar(p.nilai_pasar),
    }))

    // Buang baris kosong (nama pemain kosong)
    const valid = players.filter(p => p.nama_pemain.length > 0)

    if (valid.length === 0) {
      return NextResponse.json(
        { error: "Semua baris hasil ekstraksi kosong. Coba screenshot yang lebih jelas." },
        { status: 422 }
      )
    }

    return NextResponse.json({ players: valid })
  } catch (err: any) {
    console.error("[extract-players] Unexpected error:", err)
    return NextResponse.json(
      { error: "Terjadi error tak terduga. Coba lagi." },
      { status: 500 }
    )
  }
}
