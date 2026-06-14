// app/api/generate-article/route.ts
//
// Generate artikel sepak bola bergaya The Athletic — powered by Groq (llama-3.3-70b-versatile).
// + Tavily fact-check integration (4-step pipeline)
// + Auth-only (no rate limit)
//
// Pipeline:
//   Step 1 : Groq tulis draft dari konteks
//   Step 2 : Tavily fact-check klaim dari draft
//   Step 3 : Groq sisipkan fakta inline ke draft
//   Step 4 : Output muncul di editor
//
// Streaming progress via SSE (Server-Sent Events) ke client.
// Input : newsType + topic + context
// Output: SSE stream → { event: "progress"|"done"|"error", data: ... }

import { NextRequest, NextResponse } from "next/server"
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function groqChat(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      temperature: 0.85,
      max_tokens:  2800,
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
    if (res.status === 400) throw new Error("Request ke Groq gagal. Coba kurangi panjang konteks.")
    throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

async function tavilySearch(apiKey: string, query: string): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:        apiKey,
      query:          query,
      search_depth:   "basic",
      max_results:    5,
      include_answer: true,
    }),
  })

  if (!res.ok) {
    // Tavily gagal → lanjutkan tanpa fact-check (non-fatal)
    console.warn("[generate-article] Tavily error:", res.status)
    return ""
  }

  const data = await res.json() as {
    answer?: string
    results?: { title?: string; content?: string; url?: string }[]
  }

  const parts: string[] = []
  if (data.answer) parts.push(`Ringkasan: ${data.answer}`)
  if (data.results) {
    data.results.slice(0, 3).forEach((r, i) => {
      parts.push(`[${i + 1}] ${r.title ?? ""}: ${(r.content ?? "").slice(0, 300)}`)
    })
  }
  return parts.join("\n")
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const groqKey   = process.env.GROQ_API_KEY
  const tavilyKey = process.env.TAVILY_API_KEY

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
        // ── STEP 1: Groq tulis draft ────────────────────────────────────────
        send("progress", { step: 1, label: "Menulis Draft" })

        const userPromptDraft = `${TYPE_INSTRUCTION[newsType]}

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

        const draftRaw = await groqChat(groqKey, BASE_SYSTEM, userPromptDraft)

        let draftCleaned = draftRaw
          .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim()
        if (!draftCleaned.startsWith("{")) {
          const m = draftCleaned.match(/\{[\s\S]*\}/)
          if (m) draftCleaned = m[0]
        }

        let draft: { title: string; content: string }
        try {
          draft = JSON.parse(draftCleaned)
        } catch {
          throw new Error("Gagal parse draft dari Groq. Coba lagi.")
        }

        if (!draft.title?.trim() || !draft.content?.trim()) {
          throw new Error("Draft Groq tidak lengkap. Tambahkan konteks lebih detail.")
        }

        // ── STEP 2: Tavily fact-check ───────────────────────────────────────
        send("progress", { step: 2, label: "Memverifikasi Fakta" })

        let factContext = ""
        if (tavilyKey) {
          // Buat query dari topik + judul draft
          const searchQuery = `${topic.trim()} ${draft.title}`.slice(0, 200)
          factContext = await tavilySearch(tavilyKey, searchQuery)
        }

        // ── STEP 3: Groq sisipkan fakta inline ─────────────────────────────
        send("progress", { step: 3, label: "Menyempurnakan Konten" })

        let finalDraft = draft

        if (factContext.trim()) {
          const refinementPrompt = `Kamu adalah editor jurnalistik senior di HalfSpace.id.

Kamu menerima sebuah draft artikel dan hasil riset terbaru dari web. Tugasmu adalah menyisipkan fakta-fakta yang relevan dari hasil riset ke dalam draft secara INLINE dan NATURAL — bukan menambah section baru, bukan mengubah struktur, dan TIDAK mengubah gaya penulisan yang sudah ada.

ATURAN PENYISIPAN:
- Sisipkan fakta hanya jika benar-benar memperkuat narasi yang sudah ada
- Pertahankan gaya jurnalistik, hook pembuka, dan penutup artikel
- Jangan ubah judul
- Jangan tambahkan heading atau subheading baru
- Output tetap HANYA JSON murni: { "title": "...", "content": "..." }

DRAFT ARTIKEL:
${JSON.stringify(draft)}

HASIL RISET TERBARU (gunakan jika relevan):
${factContext}

Kembalikan artikel yang telah disempurnakan dalam format JSON yang sama.`

          const refinedRaw = await groqChat(
            groqKey,
            "Kamu adalah editor jurnalistik senior. Output HANYA JSON murni, tanpa markdown fence, tanpa komentar.",
            refinementPrompt
          )

          let refinedCleaned = refinedRaw
            .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim()
          if (!refinedCleaned.startsWith("{")) {
            const m = refinedCleaned.match(/\{[\s\S]*\}/)
            if (m) refinedCleaned = m[0]
          }

          try {
            const refined = JSON.parse(refinedCleaned) as { title: string; content: string }
            if (refined.title?.trim() && refined.content?.trim()) {
              finalDraft = refined
            }
          } catch {
            // Gagal refine → gunakan draft awal (non-fatal)
            console.warn("[generate-article] Refinement parse failed, using original draft")
          }
        }

        // ── STEP 4: Done ────────────────────────────────────────────────────
        send("progress", { step: 4, label: "Draft Selesai" })

        send("done", {
          title:   finalDraft.title.trim(),
          content: finalDraft.content.trim(),
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
