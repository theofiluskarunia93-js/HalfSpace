// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic — pipeline DUA TAHAP:
//
//   Tahap 1 (Penulis) : OpenRouter menulis draft lengkap (judul + isi)
//                        berdasarkan prompt editorial (gaya The Athletic) di bawah.
//   Tahap 2 (Editor)   : Gemini membaca draft dari OpenRouter, lalu MEREVISI
//                        sebagai editor senior — memperkuat hook, ritme kalimat,
//                        membuang frasa AI-fingerprint yang lolos, dan menjaga
//                        draft tetap sesuai aturan struktur/tipe berita.
//
// Kedua tahap ini berjalan otomatis di background dalam satu request —
// klien hanya menerima HASIL AKHIR yang sudah melalui kedua proses tersebut
// (sudah final, sudah diedit). Progress tetap di-stream lewat SSE supaya UI
// admin bisa menampilkan status "Menulis Draft" → "Revisi Editor" → "Selesai".
//
// Pipeline:
//   Step 1 : Menyusun prompt editorial (gaya penulisan + tipe berita + topik/konteks)
//   Step 2 : OpenRouter menulis draft pertama (judul + isi)
//   Step 3 : Gemini merevisi draft sebagai editor (output final)
//   Step 4 : Draft final dikirim ke editor artikel
//
// Streaming progress via SSE (Server-Sent Events) ke client — kontrak event
// SSE ("progress" | "done" | "error") dipertahankan sama seperti sebelumnya
// agar frontend (create-article-view.tsx) tidak perlu mengubah cara baca stream.
//
// Input : newsType + topic + context
// Output: SSE stream → { event: "progress"|"done"|"error", data: ... }
//
// Catatan API key:
// - OPENROUTER_API_KEY  → dipakai untuk tahap penulisan draft awal (OpenRouter REST API,
//   format kompatibel OpenAI chat completions: https://openrouter.ai/api/v1/chat/completions).
//   Akun ini memakai FREE TIER OpenRouter — model default & fallback semua memakai
//   suffix ":free" (lihat DEFAULT_FREE_MODELS di bawah). Free tier rate limit-nya
//   ketat (umumnya ~20 req/menit, 50-1000 req/hari), jadi sudah disiapkan fallback
//   otomatis antar beberapa model gratis kalau salah satu kena limit.
// - GEMINI_API_KEY      → dipakai untuk tahap revisi/editor (format Google AI Studio
//   terbaru: "AQ.xxx"). SDK: @google/genai (class GoogleGenAI) — jangan fetch manual
//   ke endpoint v1beta lama.
// - OPENROUTER_MODEL (opsional) → kalau diisi, dicoba duluan sebelum fallback ke
//   daftar model gratis. Kosongkan saja kalau memang mau pakai free tier sepenuhnya.
// - Model Gemini untuk tahap editor: gemini-3.5-flash

import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { requireAdmin } from "@/lib/supabase/server-auth"

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

// ─── BASE SYSTEM PROMPT ───────────────────────────────────────────────────────

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
- Jika tipe berita memiliki struktur bagian (lihat instruksi tipe di bawah), bagian-bagian itu HARUS tetap ditulis sebagai narasi yang mengalir lewat paragraf biasa — bukan dengan menulis label bagian secara literal di dalam teks
- Tutup artikel dengan paragraf yang memperluas perspektif, bukan meringkas ulang apa yang sudah ditulis
- Output HANYA JSON murni, tanpa markdown fence, tanpa komentar`

// ─── System prompt per tipe berita ───────────────────────────────────────────

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
Struktur artikel WAJIB mengikuti urutan berikut, ditulis sebagai satu narasi yang mengalir lewat paragraf biasa (TANPA heading/subheading literal — transisi antar bagian harus terasa alami, bukan daftar bersekat):

1. NARASI PEMBUKA — Buka dengan "taruhan" pertandingan ini: apa yang sesungguhnya dipertaruhkan kedua pihak, tensi yang melingkupi laga ini, atau momentum yang sedang dibawa masing-masing tim. Bangun atmosfer sebelum nama tim disebutkan secara langsung.
2. ANALISA TIM KANDANG — Bedah kekuatan dan kelemahan tim tuan rumah dari sudut pandang taktis: pola permainan, kondisi skuat terkini, performa kandang belakangan ini, pemain yang sedang on-fire atau yang absen.
3. ANALISA TIM TANDANG — Lakukan hal serupa untuk tim tamu, dan secara spesifik tunjukkan di titik mana benturan taktis paling menarik akan terjadi ketika kedua gaya bermain bertemu.
4. PREDIKSI JALANNYA PERTANDINGAN — Tutup dengan prediksi yang didukung analisis dari dua bagian sebelumnya: bagaimana laga ini diperkirakan berjalan, fase mana yang krusial, dan kemungkinan hasil yang paling realistis — bukan sekadar "pertandingan ini akan seru".

Sentuh head-to-head dan tren terkini HANYA jika benar-benar relevan dan memperkuat analisa taktis di atas — jangan dipaksakan jadi bagian terpisah.

Nada: seperti analis taktis yang juga bisa bercerita.
Panjang: 600–800 kata`,

  hasil: `Tipe: LAPORAN HASIL PERTANDINGAN
Struktur artikel WAJIB mengikuti urutan berikut, ditulis sebagai satu narasi yang mengalir lewat paragraf biasa (TANPA heading/subheading literal — setiap bagian harus mengalir natural ke bagian berikutnya):

1. NARASI PEMBUKA — Tangkap esensi pertandingan dalam satu atau dua kalimat pembuka yang kuat. Jangan dibuka dengan skor atau nama pencetak gol.
2. JALANNYA BABAK PERTAMA — Ceritakan ritme 45 menit pertama: bagaimana permainan terbangun, momen-momen yang membentuk arah laga, gol-gol yang lahir di babak ini lengkap dengan konteksnya — bukan play-by-play menit per menit.
3. JALANNYA BABAK KEDUA — Lanjutkan dengan apa yang berubah setelah turun minum: pergantian taktik, perubahan intensitas permainan, gol-gol tambahan, dan bagaimana situasi berkembang hingga peluit panjang.
4. MOMENT PENGUBAH JALANNYA PERTANDINGAN — Soroti satu titik balik paling krusial di laga ini — kartu merah, pergantian pemain, keputusan wasit, atau momen individu — yang benar-benar mengubah arah pertandingan. Jelaskan secara konkret mengapa momen ini menjadi pembeda.
5. DAMPAK DARI HASIL AKHIR — Tutup dengan apa arti hasil ini untuk gambaran besar: posisi klasemen, momentum menuju laga berikutnya, atau narasi musim masing-masing tim.

Sisipkan satu observasi taktis singkat tentang mengapa pemenang menang dan mengapa yang kalah gagal — leburkan secara alami ke salah satu bagian di atas, bukan sebagai bagian terpisah.

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ─── TAHAP 1 (Penulis): OpenRouter menulis draft pertama ─────────────────────
// Memakai endpoint REST OpenRouter (kompatibel format chat completions OpenAI).
// Model bisa dikonfigurasi lewat env OPENROUTER_MODEL — default ke model GRATIS
// (suffix ":free") karena akun ini memakai free tier OpenRouter, bukan berbayar.
// Free tier rate limit-nya ketat (umumnya ~20 req/menit, 50-1000 req/hari
// tergantung histori top-up), jadi disiapkan beberapa model fallback gratis:
// kalau model utama kena 429 (rate limit) atau lagi unavailable, otomatis
// coba model gratis berikutnya di daftar sebelum benar-benar gagal.
//
// Catatan: roster model ":free" di OpenRouter berubah-ubah dari waktu ke waktu.
// Kalau salah satu ID di bawah sudah tidak aktif, cek daftar terbaru di
// https://openrouter.ai/models?max_price=0 dan update FALLBACK_MODELS.
const DEFAULT_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3.1:free",
  "qwen/qwen3-235b-a22b:free",
]

async function openRouterGenerateJson(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const configuredModel = process.env.OPENROUTER_MODEL?.trim()
  const modelsToTry = configuredModel
    ? [configuredModel, ...DEFAULT_FREE_MODELS.filter((m) => m !== configuredModel)]
    : DEFAULT_FREE_MODELS

  let lastError: Error | null = null

  for (const model of modelsToTry) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
          // Header opsional yang direkomendasikan OpenRouter untuk identifikasi app —
          // tidak wajib diisi dengan URL valid, tapi membantu tracking di dashboard mereka.
          "HTTP-Referer":  process.env.NEXT_PUBLIC_SITE_URL ?? "https://halfspacesport.com",
          "X-Title":       "HalfSpace.id Article Generator",
        },
        body: JSON.stringify({
          model,
          temperature: 0.85,
          max_tokens:  8192,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()

        // 429 (rate limit) atau 404/503 (model gratis lagi penuh/unavailable)
        // → jangan langsung gagal, coba model fallback berikutnya di daftar.
        if (res.status === 429 || res.status === 404 || res.status === 503) {
          lastError = new Error(`Model ${model} tidak tersedia saat ini (${res.status}). Mencoba model fallback...`)
          console.warn(`[generate-article] ${lastError.message}`)
          continue
        }

        if (res.status === 401) throw new Error("OPENROUTER_API_KEY tidak valid. Hubungi administrator.")
        if (res.status === 402) throw new Error("OpenRouter: kredit/saldo akun habis atau melebihi limit free tier harian.")
        throw new Error(`OpenRouter API error ${res.status}: ${errText.slice(0, 200)}`)
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[] }
      const content = (data.choices?.[0]?.message?.content ?? "").trim()
      if (content) return content

      lastError = new Error(`Model ${model} mengembalikan output kosong. Mencoba model fallback...`)
    } catch (err) {
      // Error network/parsing sementara → tetap coba model fallback berikutnya
      lastError = err instanceof Error ? err : new Error("Error tidak diketahui saat memanggil OpenRouter.")
      if (lastError.message.includes("OPENROUTER_API_KEY tidak valid")) throw lastError
    }
  }

  throw new Error(
    lastError?.message
      ? `Semua model gratis OpenRouter gagal dicoba. Error terakhir: ${lastError.message}`
      : "OpenRouter rate limit tercapai di semua model gratis. Tunggu beberapa saat lalu coba lagi."
  )
}

// ─── TAHAP 2 (Editor): Gemini merevisi draft dari OpenRouter ─────────────────
// Gemini di sini berperan sebagai editor senior — bukan menulis dari nol,
// tapi membaca draft yang sudah ada dan mengembalikan versi revisi final
// dalam format JSON yang sama (title + content).
async function geminiReviseJson(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const genai = new GoogleGenAI({ apiKey })

  const response = await genai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature:       0.7,
      maxOutputTokens:   8192,
      responseMimeType:  "application/json",
    },
  })

  return (response.text ?? "").trim()
}

// System prompt khusus untuk tahap editor — Gemini diposisikan sebagai editor
// senior yang mengoreksi draft, BUKAN menulis ulang dari nol. Aturan gaya/struktur
// dari BASE_SYSTEM tetap dilampirkan supaya revisi tidak melenceng dari standar editorial.
const EDITOR_SYSTEM = `${BASE_SYSTEM}

━━━ PERAN KAMU SEKARANG: EDITOR SENIOR ━━━
Kamu menerima draft artikel yang SUDAH DITULIS oleh jurnalis lain. Tugasmu BUKAN menulis ulang dari nol,
tapi MENYUNTING draft tersebut menjadi versi final yang lebih kuat, dengan tetap mempertahankan substansi,
fakta, dan struktur yang sudah ada di draft. Fokus revisi:
- Perkuat hook paragraf pembuka jika masih lemah atau melanggar aturan hook di atas
- Perbaiki ritme kalimat yang monoton, variasikan panjang kalimat
- Hapus/ganti frasa fingerprint AI yang masih lolos di draft (lihat daftar frasa terlarang di atas)
- Pastikan penyebutan nama/tim sudah divariasikan, tidak diulang berlebihan
- Rapikan transisi antar paragraf agar mengalir lebih natural
- JANGAN mengubah fakta, angka, atau detail yang sudah ada di draft — hanya kualitas penulisannya
- JANGAN menambah heading/subheading — hanya <p> dan <blockquote>
- Output tetap HANYA JSON murni dengan struktur {"title": "...", "content": "..."}, tanpa markdown fence, tanpa komentar`

// Parsing JSON dengan beberapa fallback, karena model kadang tetap menyisipkan
// markdown fence atau teks tambahan walau sudah diminta JSON murni.
function extractJsonObject<T>(raw: string): T | null {
  let cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()

  if (cleaned.startsWith("{")) {
    try {
      return JSON.parse(cleaned) as T
    } catch {
      // lanjut ke strategi berikutnya
    }
  }

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0]) as T
    } catch {
      // gagal juga → null
    }
  }

  return null
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY
  const geminiKey      = process.env.GEMINI_API_KEY

  if (!openRouterKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY belum dikonfigurasi di environment variables." },
      { status: 500 }
    )
  }
  if (!geminiKey) {
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

  // ── SSE Stream ───────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        // ── STEP 1: Susun prompt editorial ───────────────────────────────────
        send("progress", { step: 1, label: "Menyusun Prompt Editorial" })

        const userPrompt = `${TYPE_INSTRUCTION[newsType]}

TOPIK: ${topic.trim()}

KONTEKS / FAKTA YANG DIKETAHUI:
${context.trim()}

Tulis artikel berdasarkan topik dan konteks di atas.
Ingat: kamu jurnalis senior — bukan generator teks. Pilih angle yang paling menarik dari konteks yang diberikan, dan biarkan narasi berkembang secara organik mengikuti struktur yang sudah ditentukan di atas.

Kembalikan HANYA JSON dengan format berikut (tidak ada teks di luar JSON):
{
  "title": "<judul artikel: menarik, informatif, max 80 karakter, tanpa tanda tanya, tanpa clickbait>",
  "content": "<konten artikel dalam HTML — gunakan <p> untuk paragraf dan <blockquote> untuk kutipan langsung dari narasumber. JANGAN gunakan tag HTML lain apapun, termasuk heading.>"
}`

        // ── STEP 2: OpenRouter menulis draft pertama ────────────────────────
        send("progress", { step: 2, label: "Menulis Draft dengan OpenRouter" })

        const rawDraft = await openRouterGenerateJson(openRouterKey, BASE_SYSTEM, userPrompt)

        if (!rawDraft) {
          throw new Error("OpenRouter tidak menghasilkan output. Coba lagi.")
        }

        const draft = extractJsonObject<{ title: string; content: string }>(rawDraft)

        if (!draft?.title?.trim() || !draft?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil OpenRouter. Raw:", rawDraft.slice(0, 800))
          throw new Error("Gagal memproses hasil OpenRouter. Coba lagi dalam beberapa detik.")
        }

        // ── STEP 3: Gemini merevisi draft sebagai editor ────────────────────
        send("progress", { step: 3, label: "Revisi Editor oleh Gemini" })

        const editorUserPrompt = `Berikut draft artikel yang perlu kamu revisi sebagai editor senior.

TIPE BERITA: ${newsType}

DRAFT (judul):
${draft.title.trim()}

DRAFT (isi, HTML):
${draft.content.trim()}

Revisi draft di atas sesuai instruksi editor yang sudah diberikan. Kembalikan HASIL REVISI FINAL dalam format JSON:
{
  "title": "<judul hasil revisi: menarik, informatif, max 80 karakter, tanpa tanda tanya, tanpa clickbait>",
  "content": "<konten hasil revisi dalam HTML — gunakan <p> untuk paragraf dan <blockquote> untuk kutipan langsung. JANGAN gunakan tag HTML lain apapun, termasuk heading.>"
}`

        const rawFinal = await geminiReviseJson(geminiKey, EDITOR_SYSTEM, editorUserPrompt)

        if (!rawFinal) {
          throw new Error("Gemini (editor) tidak menghasilkan output. Coba lagi.")
        }

        const final = extractJsonObject<{ title: string; content: string }>(rawFinal)

        if (!final?.title?.trim() || !final?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil revisi Gemini. Raw:", rawFinal.slice(0, 800))
          throw new Error("Gagal memproses hasil revisi editor. Coba lagi dalam beberapa detik.")
        }

        // ── STEP 4: Done — hasil sudah melalui penulisan + revisi editor ────
        send("progress", { step: 4, label: "Draft Final Selesai" })

        send("done", {
          title:   final.title.trim(),
          content: final.content.trim(),
        })

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Terjadi error. Coba lagi."
        console.error("[generate-article] Error:", err)

        // Error dari OpenRouter (tahap 1) sudah punya pesan jelas sendiri
        // (lihat openRouterGenerateJson) — jangan ditimpa label Gemini.
        if (message.includes("OpenRouter") || message.includes("OPENROUTER")) {
          send("error", { error: message })
        }
        // Deteksi error spesifik Gemini (tahap 2/editor) agar pesannya jelas bagi admin
        else if (message.includes("400") || message.includes("INVALID_ARGUMENT")) {
          send("error", { error: "Gemini: request tidak valid. Pastikan GEMINI_API_KEY benar dan model tersedia." })
        } else if (message.includes("403") || message.includes("PERMISSION_DENIED")) {
          send("error", { error: "Gemini: API key tidak memiliki akses. Cek quota atau billing di Google AI Studio." })
        } else if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
          send("error", { error: "Gemini: quota free tier habis. Tunggu beberapa saat atau upgrade plan." })
        } else {
          send("error", { error: message })
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  })
}
