// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic — powered by Gemini 3.5 Flash.
// Mendukung 6 tipe berita + URL sumber opsional + implicit context caching otomatis.
//
// Context Caching di Gemini 3.5 Flash:
// - IMPLICIT caching aktif otomatis — tidak perlu setup manual.
// - Google otomatis cache prefix prompt yang identik lintas request.
// - Setiap kali BASE_SYSTEM dikirim berulang (yang terjadi di setiap generate),
//   Google mendeteksi prefix yang sama dan mengenakan biaya cached rate ($0.15/1M)
//   bukan standard rate ($1.50/1M) → hemat 90% untuk token system prompt.
// - Cache tersimpan selama ada traffic; tidak ada konfigurasi TTL yang diperlukan.
//
// Input : newsType + topic + context + sourceUrl (opsional)
// Output: { title, content } — content HTML siap pakai TipTap

import { NextRequest, NextResponse } from "next/server"

export type NewsType =
  | "transfer"
  | "konpers"
  | "cedera"
  | "preview"
  | "hasil"
  | "trivia"

interface RequestBody {
  newsType: NewsType
  topic:    string
  context:  string
  sourceUrl?: string   // opsional — jika diisi, Gemini fetch & baca URL
}

// ─── Validasi URL sederhana ───────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

// ─── BASE SYSTEM PROMPT ───────────────────────────────────────────────────────
// Ini adalah prefix yang di-cache secara implisit oleh Gemini.
// Selalu letakkan instruksi panjang & stabil di sini — jangan di userPrompt.
// Semakin konsisten teks ini antar request, semakin tinggi cache-hit rate-nya.

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
- Jika ada URL sumber yang diberikan: gunakan fakta dari sumber tersebut, tapi TULIS ULANG sepenuhnya dengan sudut pandang dan gaya naratif sendiri. JANGAN terjemahkan langsung. Tambahkan konteks lokal yang relevan untuk pembaca Indonesia.
- Output HANYA JSON murni, tanpa markdown fence, tanpa komentar`

// ─── System prompt per tipe berita ───────────────────────────────────────────

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

  preview: `Tipe: PREVIEW PERTANDINGAN
Struktur artikel:
1. Lead: konteks dan taruhan dari pertandingan ini (1 paragraf)
2. Analisis kekuatan & kelemahan tim tuan rumah (1-2 paragraf)
3. Analisis kekuatan & kelemahan tim tamu (1-2 paragraf)
4. Head-to-head dan tren performa terkini kedua tim (1 paragraf)
5. Prediksi taktis dan pemain kunci yang patut diperhatikan (1 paragraf)
6. Penutup: prediksi dan skor yang mungkin terjadi (1 paragraf)
Panjang: 600-800 kata`,

  hasil: `Tipe: LAPORAN HASIL PERTANDINGAN
Struktur artikel:
1. Lead: hasil akhir, siapa mencetak gol, momen penting (1 paragraf)
2. Jalannya pertandingan babak pertama — poin-poin kunci (1-2 paragraf)
3. Jalannya pertandingan babak kedua — poin-poin kunci (1-2 paragraf)
4. Analisis taktis: apa yang membuat pemenang tampil dominan atau kenapa yang kalah gagal (1-2 paragraf)
5. Pemain terbaik dan momen penting yang patut disorot (1 paragraf)
6. Implikasi hasil ini ke klasemen atau perjalanan kompetisi (1 paragraf)
Panjang: 700-900 kata`,

  trivia: `Tipe: ARTIKEL TRIVIA SEPAK BOLA
Struktur artikel:
1. Lead: fakta mengejutkan atau hook yang membuat pembaca penasaran (1 paragraf)
2. Pendalaman fakta utama dengan konteks sejarah (2-3 paragraf)
3. Fakta-fakta pendukung yang memperkaya narasi (2-3 paragraf)
4. Koneksi ke era modern atau relevansi saat ini (1-2 paragraf)
5. Penutup: perspektif yang membekas di benak pembaca (1 paragraf)
Gaya: ringan tapi berisi, boleh sedikit humor, gunakan angka & statistik untuk memperkuat
Panjang: 400-600 kata`,
}

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

  const { newsType, topic, context, sourceUrl } = body

  if (!newsType || !topic?.trim() || !context?.trim()) {
    return NextResponse.json(
      { error: "newsType, topic, dan context wajib diisi." },
      { status: 400 }
    )
  }

  const validTypes: NewsType[] = ["transfer", "konpers", "cedera", "preview", "hasil", "trivia"]
  if (!validTypes.includes(newsType)) {
    return NextResponse.json({ error: "newsType tidak valid." }, { status: 400 })
  }

  // Validasi URL jika diisi
  if (sourceUrl && !isValidUrl(sourceUrl)) {
    return NextResponse.json(
      { error: "URL sumber tidak valid. Pastikan format https://..." },
      { status: 400 }
    )
  }

  // ── Susun user prompt ──────────────────────────────────────────────────────
  // BASE_SYSTEM dipisah ke systemInstruction agar Gemini bisa cache prefix-nya.
  // userPrompt hanya berisi instruksi yang unik per request.

  const urlSection = sourceUrl?.trim()
    ? `\nURL SUMBER (baca dan gunakan faktanya, jangan copy-paste):\n${sourceUrl.trim()}\n`
    : ""

  const userPrompt = `${TYPE_INSTRUCTION[newsType]}
${urlSection}
TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${context.trim()}

Tulis artikel berdasarkan topik dan konteks di atas.

Kembalikan HANYA JSON dengan format:
{
  "title": "<judul artikel yang menarik, informatif, max 80 karakter, tanpa tanda tanya>",
  "content": "<konten artikel dalam HTML — gunakan tag <p> untuk paragraf biasa dan <blockquote> untuk kutipan langsung. JANGAN gunakan tag lain.>"
}`

  // ── Build request body ─────────────────────────────────────────────────────
  // Implicit caching bekerja otomatis karena systemInstruction (BASE_SYSTEM)
  // identik di setiap request. Gemini mendeteksi prefix yang sama dan
  // menerapkan cached rate tanpa perlu konfigurasi tambahan.
  //
  // url_context tool diaktifkan hanya jika ada sourceUrl.

  const tools = sourceUrl?.trim()
    ? [{ url_context: {} }]  // aktifkan URL reading jika ada sumber
    : []

  const requestBody: Record<string, unknown> = {
    system_instruction: {
      parts: [{ text: BASE_SYSTEM }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature:      0.7,
      maxOutputTokens:  2048,
      // responseMimeType tidak kompatibel saat url_context tool aktif
      ...(tools.length === 0 ? { responseMimeType: "application/json" } : {}),
    },
  }

  if (tools.length > 0) {
    requestBody.tools = tools
  }

  // ── Kirim ke Gemini 3.5 Flash ──────────────────────────────────────────────
  // Menggunakan header x-goog-api-key (bukan ?key= di URL) agar kompatibel
  // dengan Auth Key format baru Google AI Studio (AQ.Ab8... maupun AIzaSy...).

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

    const res = await fetch(endpoint, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-goog-api-key": apiKey,
      },
      body:    JSON.stringify(requestBody),
    })

    // Baca response sebagai text dulu — kalau Gemini return HTML (error page),
    // langsung res.json() akan throw "Unexpected token '<'" yang membingungkan.
    const resText = await res.text()

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json(
          { error: "Gemini API rate limit tercapai. Tunggu beberapa detik lalu coba lagi." },
          { status: 429 }
        )
      }
      if (res.status === 404) {
        return NextResponse.json(
          { error: "Model Gemini tidak ditemukan. Hubungi administrator." },
          { status: 500 }
        )
      }
      if (res.status === 400) {
        // Biasanya URL tidak bisa diakses atau konten diblokir
        return NextResponse.json(
          { error: "Gagal memproses request. Jika pakai URL, pastikan URL bisa diakses publik." },
          { status: 400 }
        )
      }
      // Kalau response adalah HTML (bukan JSON error dari Gemini), beri pesan yang jelas
      if (resText.trimStart().startsWith("<")) {
        throw new Error(`Gemini API error ${res.status}: server mengembalikan HTML, bukan JSON. Periksa API key.`)
      }
      throw new Error(`Gemini API error ${res.status}: ${resText.slice(0, 200)}`)
    }

    // Kalau res.ok tapi isinya HTML (edge case: proxy/CDN error)
    if (resText.trimStart().startsWith("<")) {
      throw new Error("Response dari Gemini bukan JSON (HTML diterima). Periksa API key dan koneksi.")
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(resText)
    } catch {
      throw new Error(`Gagal parse response Gemini: ${resText.slice(0, 200)}`)
    }

    // Gemini response structure: candidates[0].content.parts[N].text
    // Saat url_context tool aktif, parts bisa berisi mixed types (tool_result + text).
    // Cari part yang punya field "text", bukan langsung ambil index [0].
    type GeminiPart = { text?: string; [key: string]: unknown }
    const parts: GeminiPart[] = (data.candidates as { content?: { parts?: GeminiPart[] } }[])?.[0]?.content?.parts ?? []
    const raw = parts.find(p => typeof p.text === "string")?.text ?? ""

    if (!raw.trim()) {
      return NextResponse.json(
        { error: "Gemini tidak menghasilkan output. Coba lagi." },
        { status: 422 }
      )
    }

    // Bersihkan markdown fence jika ada (terjadi saat url_context aktif)
    let cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim()

    // Fallback: ekstrak blok JSON pertama dari teks jika masih ada teks di luar JSON
    if (!cleaned.startsWith("{")) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) cleaned = jsonMatch[0]
    }

    let parsed: { title: string; content: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Log raw output untuk debugging
      console.error("[generate-article] Raw output tidak bisa di-parse:", raw.slice(0, 500))
      return NextResponse.json(
        { error: "Gagal parse hasil Gemini. Coba lagi." },
        { status: 422 }
      )
    }

    if (!parsed.title?.trim() || !parsed.content?.trim()) {
      return NextResponse.json(
        { error: "Hasil generate tidak lengkap. Coba tambahkan konteks lebih detail." },
        { status: 422 }
      )
    }

    // Log cache usage ke console (opsional, untuk monitoring)
    type UsageMeta = { cachedContentTokenCount?: number; promptTokenCount?: number }
    const usage = data.usageMetadata as UsageMeta | undefined
    if (usage) {
      const cached = usage.cachedContentTokenCount ?? 0
      const total  = usage.promptTokenCount ?? 0
      if (cached > 0) {
        console.log(`[generate-article] Cache hit: ${cached}/${total} tokens cached (hemat ~${Math.round(cached/total*100)}%)`)
      }
    }

    return NextResponse.json({
      title:   parsed.title.trim(),
      content: parsed.content.trim(),
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi error. Coba lagi."
    console.error("[generate-article] Error:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
