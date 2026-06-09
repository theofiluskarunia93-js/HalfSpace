// app/api/generate-article/route.ts
//
// Proxy ke Groq API — generate artikel breaking news bergaya The Athletic.
// Input: tipe berita + topik + konteks
// Output: { title, content } — content dalam HTML siap pakai TipTap

import { NextRequest, NextResponse } from "next/server"

export type NewsType = "transfer" | "konpers" | "cedera"

interface RequestBody {
  newsType: NewsType
  topic: string
  context: string
}

// ─── System prompt per tipe berita ───────────────────────────────────────────

const BASE_SYSTEM = `Kamu adalah jurnalis olahraga senior di media sepak bola premium Indonesia.
Gaya penulisanmu mengikuti The Athletic: naratif, mendalam, mengutamakan konteks dan human story, tidak sensasional.

ATURAN WAJIB:
- Tulis dalam Bahasa Indonesia yang natural dan mengalir — bukan terjemahan kaku
- DILARANG keyword stuffing — jangan ulang nama pemain/klub lebih dari 2x dalam satu paragraf
- Gunakan variasi sebutan: "pemain berusia 28 tahun itu", "sang striker", "kapten tim", dll.
- Paragraf pertama adalah hook yang kuat — langsung ke inti berita, bukan basa-basi
- Setiap paragraf maksimal 4 kalimat
- Gunakan kutipan (blockquote) jika ada pernyataan langsung dari narasumber di konteks
- Tutup dengan paragraf yang memberikan konteks lebih luas atau dampak ke depan
- JANGAN tambahkan judul/heading di dalam konten — hanya paragraf dan blockquote
- Output HANYA JSON murni, tanpa markdown fence, tanpa komentar`

const TYPE_INSTRUCTION: Record<NewsType, string> = {
  transfer: `Tipe: BERITA TRANSFER
Struktur artikel:
1. Lead: konfirmasi atau perkembangan terbaru transfer (1 paragraf)
2. Detail negosiasi / status terkini (1-2 paragraf)  
3. Konteks: performa pemain, kebutuhan klub, atau kenapa transfer ini penting (1-2 paragraf)
4. Dampak: apa artinya bagi kedua klub / liga (1 paragraf)
Panjang: 500-700 kata`,

  konpers: `Tipe: KONFERENSI PERS
Struktur artikel:
1. Lead: poin utama yang disampaikan (1 paragraf)
2. Kutipan langsung dari pernyataan paling signifikan (blockquote)
3. Elaborasi dan konteks dari pernyataan tersebut (1-2 paragraf)
4. Latar belakang mengapa pernyataan ini penting saat ini (1 paragraf)
5. Penutup: implikasi ke depan (1 paragraf)
Panjang: 600-800 kata`,

  cedera: `Tipe: BERITA CEDERA
Struktur artikel:
1. Lead: konfirmasi cedera — siapa, apa jenis cedera, berapa lama absen (1 paragraf)
2. Kronologi: kapan terjadi, dalam pertandingan/latihan mana (1 paragraf)
3. Dampak ke tim: posisi di klasemen, jadwal ke depan, siapa penggantinya (1-2 paragraf)
4. Rekam jejak cedera pemain (jika relevan) atau konteks medis singkat (1 paragraf)
5. Penutup: update terbaru / prognosis (1 paragraf)
Panjang: 400-500 kata`,
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY belum dikonfigurasi di environment variables." },
      { status: 500 }
    )
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const { newsType, topic, context } = body

  if (!newsType || !topic?.trim() || !context?.trim()) {
    return NextResponse.json(
      { error: "newsType, topic, dan context wajib diisi." },
      { status: 400 }
    )
  }

  if (!["transfer", "konpers", "cedera"].includes(newsType)) {
    return NextResponse.json({ error: "newsType tidak valid." }, { status: 400 })
  }

  const userPrompt = `${TYPE_INSTRUCTION[newsType]}

TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${context.trim()}

Tulis artikel berdasarkan topik dan konteks di atas.

Kembalikan HANYA JSON dengan format:
{
  "title": "<judul artikel yang menarik, informatif, max 80 karakter, tanpa tanda tanya>",
  "content": "<konten artikel dalam HTML — gunakan tag <p> untuk paragraf biasa dan <blockquote> untuk kutipan langsung. JANGAN gunakan tag lain.>"
}`

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 2048,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user",   content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      // Tangani rate limit secara spesifik
      if (res.status === 429) {
        return NextResponse.json(
          { error: "Groq API rate limit tercapai. Tunggu beberapa detik lalu coba lagi." },
          { status: 429 }
        )
      }
      throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = await res.json()
    const raw  = data.choices?.[0]?.message?.content ?? ""

    if (!raw.trim()) {
      return NextResponse.json(
        { error: "Groq tidak menghasilkan output. Coba lagi." },
        { status: 422 }
      )
    }

    let parsed: { title: string; content: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { error: "Gagal parse hasil Groq. Coba lagi." },
        { status: 422 }
      )
    }

    if (!parsed.title?.trim() || !parsed.content?.trim()) {
      return NextResponse.json(
        { error: "Hasil generate tidak lengkap. Coba tambahkan konteks lebih detail." },
        { status: 422 }
      )
    }

    return NextResponse.json({
      title:   parsed.title.trim(),
      content: parsed.content.trim(),
    })

  } catch (err: any) {
    console.error("[generate-article] Error:", err)
    return NextResponse.json(
      { error: err.message ?? "Terjadi error. Coba lagi." },
      { status: 500 }
    )
  }
}
