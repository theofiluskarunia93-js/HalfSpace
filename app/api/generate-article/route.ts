// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic — powered by Groq (llama-3.3-70b-versatile).
//
// Catatan migrasi dari Gemini ke Groq:
// - Groq tidak mendukung URL reading/context tool, field sourceUrl dihapus.
// - Response JSON langsung dari Groq tanpa perlu handle mixed parts (tool_result + text).
// - Groq menggunakan OpenAI-compatible API format (messages array dengan role system/user).
// - Caching: artikel hasil generate di-cache di server (Map) per kombinasi newsType+topic+context
//   selama 5 menit untuk menghindari request duplikat.
//
// Changelog v2 — Human-first prompt rewrite:
// - BASE_SYSTEM diperluas: blacklist frasa klise AI, instruksi hook naratif + contoh konkret,
//   aturan suara jurnalis, larangan kalimat pembuka dengan nama subjek.
// - TYPE_INSTRUCTION diperbarui: struktur diubah dari checklist kaku ke panduan naratif
//   yang memberi ruang artikel "bernafas" alami.
// - temperature dinaikkan dari 0.7 → 0.85 untuk output yang lebih variatif dan tidak template.
// - max_tokens dinaikkan dari 2048 → 2800 untuk memberikan ruang artikel panjang yang utuh.
//
// Input : newsType + topic + context
// Output: { title, content } — content HTML siap pakai TipTap

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { articleRateLimit } from "@/lib/rate-limit"

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
}

// ─── Simple in-memory cache ───────────────────────────────────────────────────
// Cache artikel yang sudah di-generate untuk menghindari request duplikat.
// Key: hash dari newsType+topic+context. TTL: 5 menit.

interface CacheEntry {
  title:   string
  content: string
  expiry:  number
}

const articleCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 menit

function makeCacheKey(newsType: string, topic: string, context: string): string {
  return `${newsType}::${topic.trim().toLowerCase()}::${context.trim().toLowerCase()}`
}

function getCached(key: string): { title: string; content: string } | null {
  const entry = articleCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    articleCache.delete(key)
    return null
  }
  return { title: entry.title, content: entry.content }
}

function setCache(key: string, title: string, content: string): void {
  for (const [k, v] of articleCache.entries()) {
    if (Date.now() > v.expiry) articleCache.delete(k)
  }
  articleCache.set(key, { title, content, expiry: Date.now() + CACHE_TTL_MS })
}

// ─── BASE SYSTEM PROMPT ───────────────────────────────────────────────────────
//
// Fix #1 — Hook naratif dengan contoh konkret (bukan instruksi abstrak)
// Fix #2 — Blacklist frasa klise AI yang paling sering muncul di Llama
// Fix #3 — Instruksi suara narator: jurnalis dengan sudut pandang, bukan pelapor fakta
// Fix #4 — Aturan variasi ritme kalimat agar tidak monoton
// Fix #5 — Larangan eksplisit membuka kalimat dengan nama subjek

const BASE_SYSTEM = `Kamu adalah jurnalis olahraga senior di media sepak bola premium Indonesia bernama HalfSpace.id.
Gaya penulisanmu mengikuti The Athletic: naratif, mendalam, mengutamakan konteks dan human story.
Kamu bukan robot yang melaporkan fakta — kamu punya sudut pandang, kamu mengamati, dan sesekali kamu menyisipkan observasi yang tajam.

━━━ ATURAN BAHASA ━━━
- Tulis dalam Bahasa Indonesia yang benar-benar natural — seperti penulis Indonesia terbaik, bukan terjemahan dari bahasa Inggris
- Variasikan penyebutan: "pemain berusia 28 tahun itu", "sang kapten", "gelandang asal Prancis itu", "dia", "sosok itu" — jangan ulang nama lebih dari 2x per paragraf
- Ritme kalimat harus bervariasi. Sesekali satu kalimat pendek yang menghentak. Kemudian paragraf yang mengalir panjang dan hangat. Jangan monoton.
- Gunakan angka dengan konteks emosional, bukan sekadar statistik telanjang.
  BURUK: "Ia mencetak 18 gol musim ini."
  BAIK:  "Delapan belas gol. Di musim lain, angka itu lebih dari cukup. Musim ini terasa seperti bayangan dari versi terbaiknya."

━━━ ATURAN HOOK PEMBUKA ━━━
- Paragraf pertama adalah nyawa artikel. Buat pembaca tidak bisa berhenti.
- DILARANG KERAS membuka kalimat pertama dengan nama pemain, nama klub, atau tanggal.
- Hook terbaik: mulai dengan situasi, tegangan, angka yang mengejutkan, atau pertanyaan yang menggantung.
  BURUK: "Marcus Rashford resmi bergabung dengan Barcelona setelah..."
  BAIK:  "Tiga bulan tanpa menit bermain. Itulah yang akhirnya memaksa semua pihak bergerak."
  BURUK: "Pada hari Selasa, Pep Guardiola menghadiri konferensi pers..."
  BAIK:  "Ada ketenangan yang tidak biasa di ruang konferensi itu. Pep Guardiola duduk, dan sebelum satu pun pertanyaan dilontarkan, dia sudah tahu apa yang akan ditanyakan."

━━━ SUARA NARATOR ━━━
- Kamu boleh — dan harus — sesekali menyisipkan analisis atau observasi singkat sebagai jurnalis.
  Contoh: "Dan itulah yang membuat keputusan ini terasa aneh." atau "Angka-angka itu menceritakan kisah yang berbeda."
- Jangan selalu netral. Jurnalis The Athletic punya pendapat yang ditopang fakta.
- Tunjukkan bahwa kamu memahami konteks lebih dalam dari sekadar kejadian permukaannya.

━━━ FRASA YANG DILARANG KERAS ━━━
Jangan gunakan frasa-frasa berikut dalam bentuk apapun — ini adalah fingerprint tulisan AI:
- "Hal ini tentu saja" / "Sudah tentu" / "Tentu saja"
- "Tidak dapat dipungkiri" / "Tak dapat dipungkiri"
- "Menarik untuk dinantikan" / "Menarik untuk disimak"
- "Sebuah langkah yang" / "Sebuah keputusan yang"
- "Perlu dicatat bahwa" / "Patut dicatat"
- "Dalam konteks ini" / "Dalam hal ini"
- "Terlepas dari itu semua" / "Lepas dari itu"
- "Pada akhirnya" sebagai pembuka kalimat
- "Tak pelak" / "Tak ayal"
- "Patut diakui" / "Harus diakui" / "Harus dikatakan"
- "Hanya waktu yang akan menjawab..." (DILARANG MUTLAK sebagai penutup)
- "Satu hal yang pasti..." sebagai pembuka penutup
- "Yang jelas," sebagai pembuka kalimat

━━━ ATURAN STRUKTUR ━━━
- Setiap paragraf maksimal 4 kalimat
- Gunakan <blockquote> HANYA untuk kutipan langsung dari narasumber yang ada di konteks
- JANGAN tambahkan heading, subheading, atau judul di dalam konten — hanya <p> dan <blockquote>
- Tutup artikel dengan paragraf yang memperluas perspektif, bukan meringkas ulang apa yang sudah ditulis
- Output HANYA JSON murni, tanpa markdown fence, tanpa komentar`

// ─── System prompt per tipe berita ───────────────────────────────────────────
//
// Fix untuk TYPE_INSTRUCTION:
// - Struktur diubah dari checklist kaku menjadi panduan naratif dengan kebebasan
// - Tambahan contoh konkret untuk setiap tipe
// - Panjang artikel disesuaikan ulang agar realistis

const TYPE_INSTRUCTION: Record<NewsType, string> = {
  transfer: `Tipe: BERITA TRANSFER
Panduan narasi (bukan checklist kaku — biarkan cerita mengalir secara alami):
• Buka dengan tegangan atau situasi yang menggambarkan "mengapa ini terjadi sekarang" — bukan dengan mengumumkan nama dan klub tujuan
• Masuk ke detail transfer: nilai, durasi kontrak, siapa yang mengonfirmasi, bagaimana prosesnya berjalan
• Berikan konteks yang membuat pembaca benar-benar mengerti: performa pemain belakangan ini, kebutuhan klub yang merekrut, apa yang membuat transfer ini masuk akal (atau mengejutkan)
• Tutup dengan apa artinya ini ke depan — bagi pemain, bagi kedua klub, atau bagi persaingan di liga

Nada: serius tapi tidak kering. Ini bukan siaran pers — ini narasi tentang karier seorang manusia dan keputusan besar yang menyertainya.
Panjang: 500–700 kata`,

  konpers: `Tipe: KONFERENSI PERS
Panduan narasi:
• Buka dengan atmosfer atau momen paling signifikan dari konpers — bukan dengan "Pelatih X menghadiri konferensi pers"
• Hadirkan kutipan terkuat sebagai blockquote setelah konteks awal dibangun, bukan di awal artikel
• Elaborasi apa yang sesungguhnya ada di balik kata-kata tersebut — apa yang tidak dikatakan sama pentingnya dengan apa yang dikatakan
• Tunjukkan mengapa pernyataan ini penting di titik waktu ini, bukan sekadar merangkum ulang ucapannya
• Tutup dengan implikasi: apa yang berubah setelah konpers ini, apa yang masih menggantung

Nada: seperti jurnalis yang ada di ruangan itu dan membaca lebih dari sekadar transkrip.
Panjang: 600–800 kata`,

  cedera: `Tipe: BERITA CEDERA
Panduan narasi:
• Buka dengan dampak atau kehilangan yang ditimbulkan — bukan dengan nama pemain dan diagnosis medis
• Jelaskan kronologi: kapan, di pertandingan mana, bagaimana momen itu terjadi
• Bahas apa artinya ini bagi tim: jadwal ke depan, pengganti yang mungkin, posisi di klasemen
• Jika relevan, beri konteks riwayat cedera pemain — apakah ini pola yang mengkhawatirkan?
• Tutup dengan prognosis terbaru dan apa yang ditunggu semua pihak

Nada: empati terhadap pemain, tapi tetap analitis terhadap dampaknya.
Panjang: 400–550 kata`,

  preview: `Tipe: PREVIEW PERTANDINGAN
Panduan narasi:
• Buka dengan "taruhan" pertandingan ini — apa yang sesungguhnya sedang dipertaruhkan oleh masing-masing pihak
• Ulas kekuatan dan kelemahan tim tuan rumah dengan sudut pandang taktis, bukan sekadar daftar fakta
• Lakukan hal yang sama untuk tim tamu — dan tunjukkan di mana benturan taktis paling menarik akan terjadi
• Sentuh head-to-head dan tren terkini, tapi hanya yang benar-benar relevan dengan narasi pertandingan ini
• Identifikasi satu atau dua pemain kunci yang bisa menjadi pembeda — dengan alasan yang konkret
• Tutup dengan prediksi yang didukung analisis, bukan sekadar "pertandingan ini akan seru"

Nada: seperti analis taktis yang juga bisa bercerita.
Panjang: 600–800 kata`,

  hasil: `Tipe: LAPORAN HASIL PERTANDINGAN
Panduan narasi:
• Buka dengan esensi pertandingan dalam satu atau dua kalimat yang kuat — bukan dengan skor dan nama pencetak gol
• Ceritakan babak pertama: bukan play-by-play menit per menit, tapi momen-momen yang membentuk ritme pertandingan
• Lanjutkan dengan babak kedua: titik balik, keputusan yang menentukan, momen yang mengubah segalanya
• Berikan satu paragraf analisis taktis: mengapa pemenang menang dan mengapa yang kalah gagal — ini bagian yang paling membedakan tulisan The Athletic
• Sorot pemain terbaik dengan konteks, bukan sekadar daftar nama
• Tutup dengan dampak hasil ini ke gambaran besar kompetisi

Nada: ini bukan laporan pertandingan biasa — ini esai tentang apa yang terjadi dan mengapa itu penting.
Panjang: 700–900 kata`,

  trivia: `Tipe: ARTIKEL TRIVIA SEPAK BOLA
Panduan narasi:
• Buka dengan fakta yang mengejutkan atau paradoks yang membuat pembaca berpikir "tunggu, serius?"
• Bangun konteks sejarah secara bertahap — biarkan pembaca merasa seperti sedang menggali lapisan demi lapisan
• Hubungkan fakta-fakta pendukung dengan cara yang tidak terduga — kejutan kecil di setiap paragraf membuat pembaca terus lanjut
• Jembatani ke era modern: apakah ini masih relevan? Apakah ada yang mendekati rekor ini hari ini?
• Tutup dengan perspektif yang membuat pembaca melihat sesuatu yang familiar dengan cara yang berbeda

Nada: ringan, kadang sedikit jenaka, tapi selalu ada substansinya. Seperti ngobrol dengan teman yang sangat tahu sepak bola.
Boleh gunakan satu atau dua kalimat pendek yang menghentak sebagai penekanan.
Panjang: 450–600 kata`,
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Rate limit ──────────────────────────────────────────────────────────
  const { success } = await articleRateLimit.limit(user.id)
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak request generate artikel. Tunggu sebentar lalu coba lagi." },
      { status: 429 }
    )
  }

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

  const validTypes: NewsType[] = ["transfer", "konpers", "cedera", "preview", "hasil", "trivia"]
  if (!validTypes.includes(newsType)) {
    return NextResponse.json({ error: "newsType tidak valid." }, { status: 400 })
  }

  // ── Cek cache dulu ─────────────────────────────────────────────────────────
  const cacheKey = makeCacheKey(newsType, topic, context)
  const cached = getCached(cacheKey)
  if (cached) {
    console.log(`[generate-article] Cache hit untuk topik: "${topic.trim()}"`)
    return NextResponse.json({ title: cached.title, content: cached.content })
  }

  // ── Susun user prompt ──────────────────────────────────────────────────────

  const userPrompt = `${TYPE_INSTRUCTION[newsType]}

TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${context.trim()}

Tulis artikel berdasarkan topik dan konteks di atas.
Ingat: kamu jurnalis senior — bukan generator teks. Pilih angle yang paling menarik dari konteks yang diberikan, dan biarkan narasi berkembang secara organik.

Kembalikan HANYA JSON dengan format berikut (tidak ada teks di luar JSON):
{
  "title": "<judul artikel: menarik, informatif, max 80 karakter, tanpa tanda tanya, tanpa clickbait>",
  "content": "<konten artikel dalam HTML — gunakan <p> untuk paragraf dan <blockquote> untuk kutipan langsung dari narasumber. JANGAN gunakan tag HTML lain apapun.>"
}`

  // ── Kirim ke Groq API ──────────────────────────────────────────────────────
  // Fix #4: temperature dinaikkan ke 0.85 untuk output lebih variatif dan tidak template-ish
  // Fix #5: max_tokens dinaikkan ke 2800 agar artikel panjang tidak terpotong

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        temperature: 0.85,  // dinaikkan dari 0.7 → lebih variatif, lebih humanis
        max_tokens:  2800,  // dinaikkan dari 2048 → ruang lebih untuk artikel panjang
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user",   content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    })

    const resText = await res.text()

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json(
          { error: "Groq API rate limit tercapai. Tunggu beberapa detik lalu coba lagi." },
          { status: 429 }
        )
      }
      if (res.status === 401) {
        return NextResponse.json(
          { error: "GROQ_API_KEY tidak valid. Hubungi administrator." },
          { status: 500 }
        )
      }
      if (res.status === 400) {
        return NextResponse.json(
          { error: "Request ke Groq gagal. Coba kurangi panjang konteks." },
          { status: 400 }
        )
      }
      throw new Error(`Groq API error ${res.status}: ${resText.slice(0, 200)}`)
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(resText)
    } catch {
      throw new Error(`Gagal parse response Groq: ${resText.slice(0, 200)}`)
    }

    type GroqChoice = { message?: { content?: string } }
    const raw = ((data.choices as GroqChoice[])?.[0]?.message?.content ?? "").trim()

    if (!raw) {
      return NextResponse.json(
        { error: "Groq tidak menghasilkan output. Coba lagi." },
        { status: 422 }
      )
    }

    // Bersihkan markdown fence jika ada (paranoid check)
    let cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim()

    // Fallback: ekstrak blok JSON pertama jika ada teks di luar JSON
    if (!cleaned.startsWith("{")) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) cleaned = jsonMatch[0]
    }

    let parsed: { title: string; content: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error("[generate-article] Raw output tidak bisa di-parse:", raw.slice(0, 500))
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

    const result = {
      title:   parsed.title.trim(),
      content: parsed.content.trim(),
    }

    setCache(cacheKey, result.title, result.content)

    type GroqUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    const usage = data.usage as GroqUsage | undefined
    if (usage) {
      console.log(
        `[generate-article] Groq usage — prompt: ${usage.prompt_tokens ?? 0}, ` +
        `completion: ${usage.completion_tokens ?? 0}, total: ${usage.total_tokens ?? 0}`
      )
    }

    return NextResponse.json(result)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi error. Coba lagi."
    console.error("[generate-article] Error:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
