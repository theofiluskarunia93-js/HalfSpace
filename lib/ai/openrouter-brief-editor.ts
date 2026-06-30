// lib/ai/openrouter-brief-editor.ts — v2
//
// PERUBAHAN DARI v1:
// ✓ Model default DIGANTI dari Nemotron 3 Ultra (550B-a55B) → Nemotron 3
//   Super (120B-a12B), atas keputusan eksplisit pengguna: Ultra terlalu
//   lambat diproses dan sering timeout. Super jauh lebih cepat (12B active
//   params vs 55B) sambil tetap dari keluarga model yang sama.
// ✓ Timeout DITURUNKAN dari 270 detik → 150 detik. Awalnya dipertahankan
//   270s saat model diganti ke Super, tapi setelah translation.ts (lihat
//   lib/ai/translation.ts) juga menaikkan timeoutnya ke 60 detik per
//   panggilan untuk masalah terkait, total skenario terburuk generate-brief
//   (fetch Serper/Tavily + translate kutipan + translate fakta media +
//   Editor Brief) berisiko melebihi maxDuration Vercel (300s). 150 detik
//   dipilih supaya total skenario terburuk (~280s) masih punya buffer aman
//   di bawah batas 300s, sambil tetap memberi waktu jauh lebih longgar
//   dari budget awal Editor Brief sebelum masalah ini (yang sempat di angka
//   lebih rendah dan menyebabkan timeout pada Nemotron 3 Ultra).
// ✓ max_tokens DINAIKKAN dari 6000 → 16000. Riset menemukan bug yang dikenal
//   di parser reasoning keluarga Nemotron 3 (super_v3/nemotron_v3, dipakai
//   baik di Super maupun Ultra — lihat vLLM issue #39581 dan #39103):
//   parameter "nonaktifkan reasoning" SERING diabaikan diam-diam oleh
//   provider, sehingga model tetap menghasilkan reasoning trace penuh
//   walau reasoning.enabled:false dikirim. Kalau max_tokens terlalu kecil
//   untuk menanggung reasoning trace + jawaban JSON final sekaligus, output
//   terpotong DI TENGAH reasoning trace — ini match dengan simptom yang
//   dialami: token "<unk>" berulang dan teks acak di akhir respons, bukan
//   sekadar "JSON kepotong". Menaikkan max_tokens memberi ruang model
//   menyelesaikan reasoning-nya (kalau ada) sebelum mencapai jawaban final.
// ✓ Tambah detectCorruptedOutput() — deteksi eksplisit pola output rusak
//   (token "<unk>" berulang, gibberish non-kata berulang) SEBELUM mencoba
//   parse JSON. Riset (GitHub issues RooCode #11968, OpenCode #18484)
//   mengonfirmasi Nemotron 3 Super melalui OpenRouter memang dikenal kadang
//   menghasilkan output rusak/infinite-loop — bukan kasus langka. Dengan
//   deteksi eksplisit, sistem langsung fallback ke rule-based dengan pesan
//   jelas ("output model rusak/corrupt"), bukan mencoba parse JSON yang
//   sudah pasti gagal dan malah membuang waktu di auto-repair JSON.
// ✓ Semua komentar, dokumentasi, dan error message diperbarui agar
//   konsisten menyebut "Nemotron 3 Super" (bukan lagi "Nemotron 3 Ultra").
//
// STEP 2 dari pipeline: "OpenRouter Nemotron 3 Super (Editor Brief)".
//
// Pipeline lengkap per PDF Data Mapping HalfSpace:
//   Bzzoiro + Serper + Tavily → Nemotron 3 Super Brief → Gemma 4 31B
//
// Tugas AI ini BUKAN menulis artikel, dan BUKAN menentukan fakta — fakta
// (mustUse/canUse/doNotUse) tetap 100% dihasilkan oleh kode deterministik di
// lib/editorial/brief-builder.ts (tidak diubah). AI di sini hanya diminta
// mengambil KEPUTUSAN EDITORIAL: angle mana yang paling kuat, bagaimana
// menuliskan arah judul/lead/narasi secara lebih tajam — dengan syarat WAJIB
// hanya memakai fakta yang sudah diberikan.
//
// Output AI ini TIDAK PERNAH dipakai mentah. Selalu lewat
// lib/editorial/brief-validator.ts (STEP 3 — Validator Editor) sebelum
// digabung ke EditorialBrief final yang dikirim ke Gemma 4 31B (generate-draft).
//
// Model: nvidia/nemotron-3-super-120b-a12b:free (free tier OpenRouter).
// Override via env OPENROUTER_BRIEF_MODEL jika slug berubah —
// cek selalu https://openrouter.ai/models sebelum deploy, slug free tier
// OpenRouter cukup sering berubah.
//
// CATATAN PENTING soal stabilitas model ini: beberapa laporan komunitas
// (RooCode, OpenCode — pengguna agentic coding tools, bukan khusus pipeline
// ini) mendokumentasikan Nemotron 3 Super melalui OpenRouter kadang
// menghasilkan output rusak atau terjebak infinite-loop reasoning. Modul ini
// SUDAH didesain best-effort (fallback ke rule-based brief-builder.ts kalau
// AI gagal/rusak) — jadi risiko ini tertangani secara struktural, bukan
// diabaikan. Kalau frekuensi kegagalan tetap tinggi setelah perbaikan v2 ini,
// pertimbangkan model non-reasoning sebagai alternatif (lihat catatan di
// callBriefEditor di bawah).

import type { ArticleAngle, EditorialBrief, NewsType } from "@/lib/editorial/types"

export const OPENROUTER_BRIEF_MODEL_DEFAULT = "nvidia/nemotron-3-super-120b-a12b:free"

const ALLOWED_ANGLES: ArticleAngle[] = [
  "upset_result",
  "tactical_breakdown",
  "individual_brilliance",
  "injury_impact",
  "comeback",
  "milestone",
  "controversy",
  "negotiation_drama",
  "market_value",
  "departure_narrative",
  "press_conference_reveal",
  "form_contrast",
  "tactical_question",
  "historical_fact",
  "default",
]

export interface AiBriefSuggestion {
  angle: string
  rationale: string
  headlineDirection: string
  narrativeFocus: string
  subStorylines: string[]
  leadExample: string
  transitionHints: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
export function buildBriefEditorSystem(): string {
  return `Kamu adalah Editor Senior media olahraga berbahasa Indonesia bergaya The Athletic — analitis, netral, berbasis fakta, tanpa clickbait.

TUGASMU HANYA SATU: memutuskan ARAH EDITORIAL (angle, judul, lead, narasi) untuk satu artikel. Kamu TIDAK menulis artikel itu sendiri.

ATURAN MUTLAK (tidak boleh dilanggar):
1. Kamu HANYA boleh memakai fakta, angka, nama, dan kutipan yang ADA di "FAKTA WAJIB" dan "FAKTA PENDUKUNG" yang diberikan. DILARANG KERAS menambahkan angka, skor, statistik, atau nama yang tidak disebutkan di sana — bahkan jika kamu "yakin" itu benar dari pengetahuan umum. Ini adalah pelanggaran paling serius.
2. "angle" WAJIB salah satu dari daftar berikut, tulis PERSIS sama (snake_case): ${ALLOWED_ANGLES.join(", ")}.
3. Jika fakta yang diberikan terlalu tipis untuk angle yang ambisius, PILIH angle "default" atau "tactical_breakdown" — jangan memaksakan narasi dramatis dari data yang tidak mendukung.
4. Keluarkan HANYA JSON valid, tanpa teks lain, tanpa markdown code fence, dengan skema:
{
  "angle": "<salah satu dari daftar di atas>",
  "rationale": "<1-2 kalimat alasan memilih angle ini, berdasarkan fakta yang ada>",
  "headlineDirection": "<1 kalimat arah judul, tanpa tanda tanya, tanpa clickbait>",
  "narrativeFocus": "<1-2 kalimat fokus narasi utama artikel>",
  "subStorylines": ["<sub-narasi pendukung 1>", "<sub-narasi pendukung 2>"],
  "leadExample": "<1-2 kalimat CONTOH paragraf pembuka yang konkret, bukan instruksi abstrak — gaya The Athletic>",
  "transitionHints": ["<instruksi kalimat jembatan antar bagian 1>", "<instruksi kalimat jembatan 2>"]
}
5. Jawab LANGSUNG dengan JSON di atas. JANGAN menulis proses berpikir, draft, atau pertimbangan apapun sebelum JSON — langsung keluarkan JSON final saja.`
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT — dibangun dari brief deterministik (sudah grounded di fakta nyata)
// ─────────────────────────────────────────────────────────────────────────────
export function buildBriefEditorUser(
  newsType: NewsType,
  topic: string,
  deterministicBrief: EditorialBrief,
): string {
  const { keyFacts, angle: ruleBasedAngle, keyPlayers, quotes } = deterministicBrief

  return `TIPE BERITA: ${newsType}
TOPIK: ${topic}

FAKTA WAJIB (mustUse — semua HARUS termanfaatkan, dan ini SATU-SATUNYA sumber kebenaran):
${keyFacts.mustUse.map((f, i) => `${i + 1}. ${f}`).join("\n") || "(tidak ada)"}

FAKTA PENDUKUNG (canUse — boleh dipakai sebagai pelengkap):
${keyFacts.canUse.slice(0, 12).map((f, i) => `${i + 1}. ${f}`).join("\n") || "(tidak ada)"}

DILARANG DIPAKAI (doNotUse):
${keyFacts.doNotUse.map((f) => `- ${f}`).join("\n")}

PEMAIN KUNCI: ${keyPlayers.join(" | ") || "(tidak ada)"}
KUTIPAN TERSEDIA: ${quotes.map((q) => `"${q.text}" — ${q.speaker}`).join(" | ") || "(tidak ada)"}

ANGLE USULAN DARI SISTEM RULE-BASED (boleh kamu pertahankan jika sudah paling kuat, atau kamu timpa dengan angle lain dari daftar yang diizinkan jika menurutmu ada angle yang lebih kuat dan tetap didukung fakta di atas):
- angle: ${ruleBasedAngle.primary}
- rationale: ${ruleBasedAngle.rationale}
- headlineDirection: ${ruleBasedAngle.headlineDirection}
- narrativeFocus: ${ruleBasedAngle.narrativeFocus}

Tugasmu: putuskan angle final, dan tulis arah editorial yang lebih tajam dan lebih manusiawi dari usulan rule-based di atas — TETAP hanya berdasarkan fakta yang diberikan. Kembalikan HANYA JSON sesuai skema yang sudah dijelaskan di system prompt. Jawab langsung dengan JSON, tanpa proses berpikir di luar JSON.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitizer — sama pendekatannya dengan generate-draft/route.ts (Gemma):
// model open-source kadang menulis newline/tab MENTAH di tengah string JSON
// (bukan \n yang sudah di-escape), padahal JSON murni tidak boleh punya
// karakter kontrol mentah di dalam string. Ini menyusuri karakter satu per
// satu dan HANYA escape newline/tab kalau posisinya di DALAM string (antara
// tanda kutip), supaya struktur { } di luar string tidak ikut rusak.
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeJsonControlChars(raw: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue }
      if (ch === "\\") { out += ch; escaped = true; continue }
      if (ch === '"') { out += ch; inString = false; continue }
      if (ch === "\n") { out += "\\n"; continue }
      if (ch === "\r") { continue }
      if (ch === "\t") { out += "\\t"; continue }
      out += ch
    } else {
      if (ch === '"') inString = true
      out += ch
    }
  }
  return out
}

// Beberapa model reasoning (termasuk varian Nemotron) kadang tetap
// menyisipkan blok "berpikir" sebelum jawaban final meski reasoning sudah
// diminta nonaktif via parameter request. Buang kalau ada.
function stripThinkingBlocks(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWv2: DETEKSI OUTPUT RUSAK/CORRUPT — dipanggil SEBELUM mencoba parse JSON
// sama sekali. Berdasarkan riset, pola berikut adalah ciri-ciri DIKENAL dari
// kegagalan reasoning-parser keluarga Nemotron 3 melalui OpenRouter (BUKAN
// sekadar JSON yang kepotong rapi di tengah kalimat — itu beda kasus, sudah
// ditangani auto-repair di bawah):
//   1. Token literal "<unk>" muncul berulang kali (>= 3x) — tanda decoder
//      menghasilkan token yang gagal di-map balik ke teks oleh tokenizer.
//      JSON dengan SATU "<unk>" di tengah teks editorial (mis. dalam kutipan)
//      bisa jadi false-positive ringan, makanya threshold-nya >=3, bukan >=1.
//   2. Rangkaian kata bersambung tanpa spasi yang tidak membentuk struktur
//      JSON/kalimat wajar (mis. "genness(LOGbugwebkituniteinkMC...") — pola
//      "repetition collapse" khas model reasoning yang outputnya rusak.
// Kalau salah satu pola ini terdeteksi, JANGAN coba parse JSON / auto-repair
// sama sekali — itu hanya buang waktu karena output sudah pasti tidak bisa
// diselamatkan. Langsung lempar error spesifik supaya pemanggil (route.ts)
// bisa fallback ke rule-based dengan pesan yang akurat.
// ─────────────────────────────────────────────────────────────────────────────
function detectCorruptedOutput(raw: string): string | null {
  const unkCount = (raw.match(/<unk>/g) ?? []).length
  if (unkCount >= 3) {
    return `Output model rusak (corrupt) — token "<unk>" muncul ${unkCount} kali. Ini adalah kegagalan dikenal pada reasoning-parser Nemotron 3 di OpenRouter (model menghasilkan token yang gagal di-decode), bukan masalah max_tokens atau JSON yang kepotong rapi.`
  }

  // Heuristik kedua: cari rangkaian >= 40 karakter alfanumerik TANPA spasi
  // sama sekali yang juga TIDAK mengandung karakter JSON struktural ({ } " : ,)
  // — kombinasi ini sangat tidak mungkin muncul di output JSON yang sehat
  // (field terpanjang sekalipun, mis. narrativeFocus, selalu berupa kalimat
  // berbahasa Indonesia dengan spasi normal).
  const gibberishMatch = raw.match(/[A-Za-z0-9]{40,}/)
  if (gibberishMatch && !/[{}":,]/.test(gibberishMatch[0])) {
    return `Output model rusak (corrupt) — terdeteksi rangkaian karakter tanpa spasi sepanjang ${gibberishMatch[0].length} karakter ("${gibberishMatch[0].slice(0, 40)}..."), ciri khas "repetition collapse" pada model reasoning yang gagal, bukan JSON valid yang kepotong.`
  }

  return null
}

// Auto-repair generic: kalau JSON.parse gagal karena tanda kutip mentah yang
// tidak di-escape di tengah value (paling sering kejadian di field
// leadExample, karena field ini memang diminta berisi CONTOH kalimat nyata
// yang gaya The Athletic sering pakai tanda kutip lurus untuk kutipan
// langsung) — deteksi posisi persis dari pesan error JSON.parse, sisipkan
// backslash di depan tanda kutip itu, lalu parse ulang. Diulang sampai
// berhasil atau errornya bukan lagi soal tanda kutip.
function parseJsonWithAutoRepair(text: string): unknown {
  let current = text
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return JSON.parse(current)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const posMatch = msg.match(/position (\d+)/)
      if (!posMatch) throw e
      const pos = parseInt(posMatch[1], 10)
      let quoteIdx = -1
      for (let k = pos; k >= 0; k--) {
        if (current[k] === '"') { quoteIdx = k; break }
      }
      if (quoteIdx === -1) throw e
      current = current.slice(0, quoteIdx) + "\\" + current.slice(quoteIdx)
    }
  }
  throw new Error("Auto-repair JSON melebihi batas percobaan (kemungkinan masalah lain, bukan tanda kutip mentah)")
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON extractor — longgar, karena model open-source kadang membungkus
// jawabannya dengan ```json, menambahkan kalimat di luar JSON, menyisipkan
// newline mentah di dalam string, atau kepotong sebelum JSON selesai.
// ─────────────────────────────────────────────────────────────────────────────
function extractJsonLoose(rawInput: string): unknown {
  // NEWv2: cek output rusak/corrupt SEBELUM apapun lain — lihat
  // detectCorruptedOutput() di atas untuk alasan lengkapnya.
  const corruptionReason = detectCorruptedOutput(rawInput)
  if (corruptionReason) {
    throw new Error(
      `OpenRouter (Nemotron 3 Super) — ${corruptionReason} ` +
      `Awal: ${rawInput.slice(0, 150)} ||| Akhir: ${rawInput.slice(-150)}`
    )
  }

  const raw = stripThinkingBlocks(rawInput)
  const clean = sanitizeJsonControlChars(raw)
  let lastErr = ""

  try { return parseJsonWithAutoRepair(clean) } catch (e) { lastErr = e instanceof Error ? e.message : String(e) }

  const block = clean.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (block) { try { return parseJsonWithAutoRepair(block[1].trim()) } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  const i = clean.indexOf("{"), j = clean.lastIndexOf("}")
  if (i !== -1 && j !== -1 && j > i) { try { return parseJsonWithAutoRepair(clean.slice(i, j + 1)) } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  throw new Error(
    `OpenRouter (Nemotron 3 Super) tidak mengembalikan JSON valid (panjang respons: ${raw.length} karakter, ` +
    `kemungkinan kepotong karena max_tokens kurang). Parse error: ${lastErr}. ` +
    `Awal: ${raw.slice(0, 150)} ||| Akhir: ${raw.slice(-150)}`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL — OpenRouter chat completions
// ─────────────────────────────────────────────────────────────────────────────
export interface BriefEditorResult {
  suggestion: AiBriefSuggestion | null
  /** Alasan asli kegagalan — null kalau berhasil. Dipakai supaya CMS bisa
   *  menampilkan alasan SEBENARNYA (bukan selalu "cek OPENROUTER_API_KEY"). */
  failureReason: string | null
}

export async function callBriefEditor(
  newsType: NewsType,
  topic: string,
  deterministicBrief: EditorialBrief,
): Promise<BriefEditorResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    const reason = "OPENROUTER_API_KEY tidak ditemukan di environment variables."
    console.warn(`⚠️ ${reason} Skip AI editor brief, pakai rule-based saja.`)
    return { suggestion: null, failureReason: reason }
  }

  const model = process.env.OPENROUTER_BRIEF_MODEL || OPENROUTER_BRIEF_MODEL_DEFAULT

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Header opsional yang direkomendasikan OpenRouter untuk atribusi app.
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://halfspacesport.com",
        "X-Title": "HalfSpace Editorial Brief",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildBriefEditorSystem() },
          { role: "user", content: buildBriefEditorUser(newsType, topic, deterministicBrief) },
        ],
        temperature: 0.4,
        // NEWv2: dinaikkan dari 6000 → 16000. Nemotron 3 Super JUGA model
        // reasoning (parser super_v3) — sama seperti Ultra, parameter
        // "reasoning.enabled:false" di bawah BISA diabaikan diam-diam oleh
        // provider (bug dikenal di parser keluarga Nemotron 3, lihat catatan
        // panjang di header file ini). Kalau itu terjadi, model tetap
        // menghasilkan reasoning trace penuh sebelum jawaban JSON final —
        // max_tokens kecil membuat reasoning trace itu kepotong DI TENGAH,
        // dan pemotongan di tengah reasoning trace model besar berisiko
        // menghasilkan token rusak (pola "<unk>" yang dialami sebelumnya).
        // 16000 memberi ruang jauh lebih aman tanpa membuat biaya/latency
        // membengkak tak terkendali (model ini gratis di OpenRouter, jadi
        // biaya bukan pertimbangan; latency tetap dijaga lewat timeout di
        // signal AbortSignal di bawah, bukan lewat membatasi max_tokens).
        max_tokens: 16000,
        response_format: { type: "json_object" },
        // effort "low" / enabled:false supaya reasoning tidak berlebihan &
        // hemat token — TAPI lihat catatan di atas: ini TIDAK SELALU
        // dihormati oleh provider untuk model reasoning keluarga Nemotron 3,
        // makanya max_tokens dinaikkan sebagai mitigasi tambahan, bukan
        // mengandalkan parameter ini sepenuhnya.
        reasoning: { enabled: false },
      }),
      // DITURUNKAN dari 270 detik → 150 detik (2.5 menit). Setelah
      // translation.ts juga menaikkan timeoutnya (translateOneQuote dan
      // translateMediaFactsBatch, masing-masing ke 60 detik) untuk mengatasi
      // warning "media_facts_translation GAGAL", skenario terburuk TOTAL
      // generate-brief (fetch Serper/Tavily ~10s + translate kutipan 60s +
      // translate fakta media 60s + Editor Brief ini) berisiko melebihi
      // budget 300s Vercel Hobby plan kalau timeout di sini tetap 270s
      // (10+60+60+270 = 400s). 150 detik membuat skenario terburuk total
      // jadi ~280s — masih ada buffer ~20s di bawah batas 300s
      // (FUNCTION_INVOCATION_TIMEOUT / 504) sebelum sempat fallback rapi ke
      // rule-based.
      signal: AbortSignal.timeout(150_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`OpenRouter HTTP ${res.status} (model: ${model}): ${body.slice(0, 300)}`)
    }

    const json = await res.json()
    const choice = json?.choices?.[0]
    const raw: string = choice?.message?.content ?? ""
    const reasoningText: string = choice?.message?.reasoning ?? ""
    const finishReason: string | undefined = choice?.finish_reason

    if (!raw.trim()) {
      // Diagnostik: kalau ini terjadi lagi, kita sekarang tahu PERSIS sebabnya
      // (reasoning kepanjangan vs benar-benar kosong dari provider) — bukan
      // cuma "kemungkinan di-deprecate" seperti sebelumnya.
      throw new Error(
        `OpenRouter (${model}) mengembalikan content kosong. finish_reason: ${finishReason ?? "?"}, ` +
        `panjang reasoning: ${reasoningText.length} karakter${finishReason === "length" ? " — kemungkinan max_tokens masih kurang, atau reasoning.enabled:false diabaikan provider (bug dikenal pada parser Nemotron 3 — lihat catatan di header file ini)." : ""}.`
      )
    }

    if (finishReason === "length") {
      console.warn(
        `⚠️ Respons OpenRouter (${model}) kepotong (finish_reason: length) dengan max_tokens=16000. ` +
        `Kemungkinan reasoning.enabled:false diabaikan provider untuk model reasoning ini. ` +
        `Kalau ini sering terjadi, naikkan lagi max_tokens di openrouter-brief-editor.ts, atau ` +
        `pertimbangkan model non-reasoning sebagai alternatif (cek https://openrouter.ai/models filter "reasoning: false").`
      )
    }

    const parsed = extractJsonLoose(raw) as Partial<AiBriefSuggestion>

    if (!parsed.angle || !parsed.headlineDirection || !parsed.narrativeFocus) {
      throw new Error(`Respons OpenRouter tidak lengkap (angle/headlineDirection/narrativeFocus hilang). Raw: ${raw.slice(0, 200)}`)
    }

    return {
      suggestion: {
        angle: String(parsed.angle),
        rationale: String(parsed.rationale ?? ""),
        headlineDirection: String(parsed.headlineDirection),
        narrativeFocus: String(parsed.narrativeFocus),
        subStorylines: Array.isArray(parsed.subStorylines) ? parsed.subStorylines.map(String) : [],
        leadExample: String(parsed.leadExample ?? ""),
        transitionHints: Array.isArray(parsed.transitionHints) ? parsed.transitionHints.map(String) : [],
      },
      failureReason: null,
    }
  } catch (err) {
    // AI editor brief bersifat best-effort. Kalau gagal (rate limit, timeout,
    // model lagi down di free tier, slug berubah, ATAU output rusak/corrupt —
    // lihat detectCorruptedOutput), pipeline TETAP lanjut memakai brief
    // rule-based — tidak boleh memblokir Generate Brief hanya karena
    // OpenRouter bermasalah. Tapi alasannya tetap dikembalikan supaya bisa
    // ditampilkan apa adanya ke CMS, bukan disamarkan jadi pesan generic.
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`⚠️ callBriefEditor (OpenRouter ${model}) gagal, fallback ke rule-based:`, err)
    return { suggestion: null, failureReason: reason }
  }
}

export { ALLOWED_ANGLES }
