// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic — pipeline DUA TAHAP:
//
//   Tahap 1 (Penulis) : Groq (gpt-oss-120b) menulis draft lengkap (judul + isi)
//                        berdasarkan prompt editorial (gaya The Athletic) di bawah.
//   Tahap 2 (Editor)   : Groq (Qwen 3.6 27B / qwen/qwen3-6-27b-instruct) membaca
//                        draft dari Groq tahap 1, lalu MEREVISI sebagai editor
//                        senior — memperkuat hook, ritme kalimat, membuang frasa
//                        AI-fingerprint yang lolos, dan menjaga draft tetap sesuai
//                        aturan struktur/tipe berita.
//
// Kedua tahap ini berjalan otomatis di background dalam satu request —
// klien hanya menerima HASIL AKHIR yang sudah melalui kedua proses tersebut
// (sudah final, sudah diedit). Progress tetap di-stream lewat SSE supaya UI
// admin bisa menampilkan status "Menulis Draft" → "Revisi Editor" → "Selesai".
//
// Pipeline:
//   Step 1 : Menyusun prompt editorial (gaya penulisan + tipe berita + topik/konteks)
//   Step 2 : Groq menulis draft pertama (judul + isi) via gpt-oss-120b
//   Step 3 : Groq Qwen 3.6 27B merevisi draft sebagai editor
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
// - GROQ_API_KEY → dipakai untuk kedua tahap (draft + editor). Model draft:
//   openai/gpt-oss-120b. Model editor: qwen/qwen3-6-27b-instruct (Qwen 3.6 27B).
//   OpenRouter tidak dipakai sama sekali.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"

// Pipeline ini memanggil Groq dua kali (draft + editor) — total durasi bisa lewat 10 detik.
// Catatan: di Hobby plan, durasi >10 detik hanya berlaku kalau Fluid Compute aktif
// (Project Settings → Functions → Fluid Compute), yang mengizinkan sampai 60 detik
// di plan gratis.
export const maxDuration = 60

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
  model?:   string  // opsional, tidak dipakai di tahap draft (Groq fixed), tapi dipertahankan untuk kompatibilitas UI
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
- Setiap tipe berita memiliki bagian-bagian dengan judul <h2> — lihat instruksi per tipe di bawah untuk judul <h2> yang WAJIB dipakai persis seperti yang tertulis
- Paragraf narasi ditulis mengalir di bawah setiap <h2>, JANGAN tulis label bagian sebagai teks biasa di dalam <p>
- JANGAN gunakan <h1>, <h3>, atau heading lain — HANYA <h2> untuk judul bagian
- Tutup artikel dengan paragraf yang memperluas perspektif, bukan meringkas ulang apa yang sudah ditulis
- Output HANYA JSON murni, tanpa markdown fence, tanpa komentar`

// ─── System prompt per tipe berita ───────────────────────────────────────────

const TYPE_INSTRUCTION: Record<NewsType, string> = {
  transfer: `Tipe: BERITA TRANSFER
Struktur artikel WAJIB menggunakan judul <h2> berikut secara berurutan, diikuti paragraf narasi di bawahnya:

1. <h2>Latar Belakang</h2> — Buka dengan tegangan atau situasi "mengapa ini terjadi sekarang", bukan langsung umumkan nama dan klub tujuan.
2. <h2>Detail Transfer</h2> — Nilai transfer, durasi kontrak, siapa yang mengonfirmasi, bagaimana prosesnya berjalan.
3. <h2>Dampak bagi Kedua Klub</h2> — Performa pemain belakangan ini, kebutuhan klub yang merekrut, mengapa transfer ini masuk akal atau mengejutkan.
4. <h2>Ke Depan</h2> — Apa artinya ini bagi pemain, kedua klub, dan persaingan di liga.

Nada: serius tapi tidak kering. Ini bukan siaran pers — ini narasi tentang karier seorang manusia dan keputusan besar yang menyertainya.
Panjang: 500–700 kata`,

  konpers: `Tipe: KONFERENSI PERS
Struktur artikel WAJIB menggunakan judul <h2> berikut secara berurutan, diikuti paragraf narasi di bawahnya:

1. <h2>Atmosfer Konpers</h2> — Buka dengan atmosfer atau momen paling signifikan — bukan dengan "Pelatih X menghadiri konferensi pers".
2. <h2>Kutipan Kunci</h2> — Hadirkan kutipan terkuat sebagai blockquote setelah konteks awal dibangun.
3. <h2>Di Balik Kata-Kata</h2> — Elaborasi apa yang sesungguhnya ada di balik pernyataan — apa yang tidak dikatakan sama pentingnya.
4. <h2>Implikasi</h2> — Apa yang berubah setelah konpers ini, apa yang masih menggantung.

Nada: seperti jurnalis yang ada di ruangan itu dan membaca lebih dari sekadar transkrip.
Panjang: 600–800 kata`,

  cedera: `Tipe: BERITA CEDERA
Struktur artikel WAJIB menggunakan judul <h2> berikut secara berurutan, diikuti paragraf narasi di bawahnya:

1. <h2>Kronologi Cedera</h2> — Buka dengan dampak atau kehilangan yang ditimbulkan, lalu jelaskan kapan, di pertandingan mana, dan bagaimana momen itu terjadi.
2. <h2>Dampak bagi Tim</h2> — Apa artinya ini bagi tim: jadwal ke depan, pengganti yang mungkin, posisi di klasemen. Jika relevan, beri konteks riwayat cedera — apakah ini pola mengkhawatirkan?
3. <h2>Prognosis</h2> — Prognosis terbaru dan apa yang ditunggu semua pihak.

Nada: empati terhadap pemain, tapi tetap analitis terhadap dampaknya.
Panjang: 400–550 kata`,

  preview: `Tipe: PREVIEW PERTANDINGAN
Struktur artikel WAJIB menggunakan judul <h2> berikut secara berurutan, diikuti paragraf narasi di bawahnya:

1. <h2>[Nama Tim Kandang]: Momentum Tuan Rumah</h2> — Ganti [Nama Tim Kandang] dengan nama tim yang sebenarnya. Bedah kekuatan dan kelemahan tim tuan rumah: pola permainan, kondisi skuat terkini, performa kandang, pemain on-fire atau absen.
2. <h2>[Nama Tim Tandang]: [Satu frasa karakter tim]</h2> — Ganti dengan nama dan karakter nyata tim tamu. Lakukan analisa serupa dan tunjukkan di titik mana benturan taktis paling menarik akan terjadi.
3. <h2>[Nama Pemain A] vs [Nama Pemain B]</h2> — Ganti dengan duel individual paling krusial di laga ini. Jelaskan mengapa pertarungan ini bisa jadi penentu.
4. <h2>[Nama Tim Kandang] Diunggulkan, [Nama Tim Tandang] Punya Kejutan</h2> — Ganti dengan frasa prediksi yang relevan. Tutup dengan prediksi yang didukung analisis: bagaimana laga diperkirakan berjalan, fase krusial, dan kemungkinan hasil paling realistis.

Sentuh head-to-head dan tren terkini HANYA jika benar-benar relevan dan memperkuat analisa — leburkan ke bagian yang paling sesuai, bukan bagian terpisah.

Nada: seperti analis taktis yang juga bisa bercerita.
Panjang: 600–800 kata`,

  hasil: `Tipe: LAPORAN HASIL PERTANDINGAN
Struktur artikel WAJIB menggunakan judul <h2> berikut secara berurutan, diikuti paragraf narasi di bawahnya:

1. <h2>Babak Pertama</h2> — Buka dengan narasi yang menangkap esensi pertandingan (JANGAN dibuka dengan skor atau nama pencetak gol). Ceritakan ritme 45 menit pertama: bagaimana permainan terbangun, momen-momen pembentuk arah laga, gol-gol yang lahir beserta konteksnya.
2. <h2>Babak Kedua</h2> — Apa yang berubah setelah turun minum: pergantian taktik, perubahan intensitas, gol-gol tambahan, bagaimana situasi berkembang hingga peluit panjang.
3. <h2>Momen Penentu</h2> — Satu titik balik paling krusial di laga ini — kartu merah, pergantian pemain, keputusan wasit, atau momen individu — yang benar-benar mengubah arah pertandingan. Sisipkan observasi taktis singkat tentang mengapa pemenang menang dan yang kalah gagal.
4. <h2>Dampak Hasil Akhir</h2> — Apa arti hasil ini untuk gambaran besar: posisi klasemen, momentum menuju laga berikutnya, atau narasi musim masing-masing tim.

Nada: ini bukan laporan pertandingan biasa — ini esai tentang apa yang terjadi dan mengapa itu penting.
Panjang: 700–900 kata`,

  trivia: `Tipe: ARTIKEL TRIVIA SEPAK BOLA
Struktur artikel WAJIB menggunakan judul <h2> berikut secara berurutan, diikuti paragraf narasi di bawahnya:

1. <h2>Fakta yang Mengejutkan</h2> — Buka dengan fakta atau paradoks yang membuat pembaca berpikir "tunggu, serius?".
2. <h2>Konteks Sejarah</h2> — Bangun konteks sejarah secara bertahap, hubungkan fakta-fakta pendukung dengan cara yang tidak terduga — kejutan kecil di setiap paragraf.
3. <h2>Era Modern</h2> — Jembatani ke era modern: apakah ini masih relevan? Apakah ada yang mendekati rekor ini hari ini? Tutup dengan perspektif yang membuat pembaca melihat sesuatu yang familiar dengan cara berbeda.

Nada: ringan, kadang sedikit jenaka, tapi selalu ada substansinya. Seperti ngobrol dengan teman yang sangat tahu sepak bola.
Boleh gunakan satu atau dua kalimat pendek yang menghentak sebagai penekanan.
Panjang: 450–600 kata`,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ─── TAHAP 1 (Penulis): Groq menulis draft pertama ───────────────────────────
// Memakai Groq REST API (kompatibel OpenAI chat completions).
// Model: moonshotai/kimi-k2-instruct — ini adalah model yang di Groq dikenal
// sebagai GPT-OSS-120B. Groq free tier jauh lebih longgar (umumnya 6000 RPM,
// 500K tokens/menit), sehingga jarang kena rate limit.
async function groqGenerateJson(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       "openai/gpt-oss-120b",
      temperature: 0.85,
      max_tokens:  6000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new Error("Groq API rate limit tercapai. Tunggu beberapa detik lalu coba lagi.")
    if (res.status === 401) throw new Error("GROQ_API_KEY tidak valid. Hubungi administrator.")
    if (res.status === 400) throw new Error("Request ke Groq gagal (400). Coba kurangi panjang konteks.")
    throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// ─── TAHAP 2 (Editor): Groq Qwen 3.6 27B merevisi draft ─────────────────────
// Model: qwen/qwen3-6-27b-instruct di Groq — lebih cepat dan stabil untuk
// tahap editor. Groq dipakai di kedua tahap sehingga hanya butuh satu API key.
// OpenRouter tidak dipakai sama sekali.
async function groqReviseJson(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       "qwen/qwen3-6-27b-instruct",
      temperature: 0.7,
      max_tokens:  6000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new Error("Groq Editor (Qwen 3.6 27B) rate limit tercapai. Tunggu beberapa detik lalu coba lagi.")
    if (res.status === 401) throw new Error("GROQ_API_KEY tidak valid. Hubungi administrator.")
    if (res.status === 400) throw new Error("Request ke Groq Editor gagal (400). Coba lagi.")
    throw new Error(`Groq Editor API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// System prompt khusus untuk tahap editor — Groq Qwen 3.6 27B diposisikan sebagai
// editor senior yang mengoreksi draft dari Groq, BUKAN menulis ulang dari nol.
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
- PERTAHANKAN semua tag <h2> persis seperti di draft — jangan hapus, ganti teks, atau pindahkan posisinya
- JANGAN menambah heading baru selain yang sudah ada — hanya <p>, <h2>, dan <blockquote>
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

  const groqKey = process.env.GROQ_API_KEY

  if (!groqKey) {
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

        // ── STEP 2: Groq menulis draft pertama (GPT-OSS-120B) ───────────────
        send("progress", { step: 2, label: "Menulis Draft dengan Groq (GPT-OSS-120B)" })

        const rawDraft = await groqGenerateJson(groqKey, BASE_SYSTEM, userPrompt)

        if (!rawDraft) {
          throw new Error("Groq tidak menghasilkan output. Coba lagi.")
        }

        const draft = extractJsonObject<{ title: string; content: string }>(rawDraft)

        if (!draft?.title?.trim() || !draft?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil Groq. Raw:", rawDraft.slice(0, 800))
          throw new Error("Gagal memproses hasil Groq. Coba lagi dalam beberapa detik.")
        }

        // ── STEP 3: Groq Qwen 3.6 27B merevisi draft sebagai editor ──────────
        send("progress", { step: 3, label: "Revisi Editor oleh Groq Qwen 3.6 27B" })

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

        const rawFinal = await groqReviseJson(groqKey, EDITOR_SYSTEM, editorUserPrompt)

        if (!rawFinal) {
          throw new Error("Groq Editor (Qwen 3.6 27B) tidak menghasilkan output. Coba lagi.")
        }

        const final = extractJsonObject<{ title: string; content: string }>(rawFinal)

        if (!final?.title?.trim() || !final?.content?.trim()) {
          console.error("[generate-article] Gagal parse hasil revisi Groq Editor. Raw:", rawFinal.slice(0, 800))
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

        send("error", { error: message })
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
