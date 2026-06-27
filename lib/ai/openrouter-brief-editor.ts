// lib/ai/openrouter-brief-editor.ts — BARU
//
// STEP 2 dari pipeline baru: "OpenRouter Nemotron 3 Ultra (Editor Brief)".
//
// Pipeline lengkap per PDF Data Mapping HalfSpace:
//   Bzzoiro + Serper + Tavily → Nemotron 3 Ultra Brief → Gemma 4 31B
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
// Model: nvidia/nemotron-3-ultra-550b-a55b:free (free tier OpenRouter).
// Override via env OPENROUTER_BRIEF_MODEL jika slug berubah —
// cek selalu https://openrouter.ai/models sebelum deploy, slug free tier
// OpenRouter cukup sering berubah.

import type { ArticleAngle, EditorialBrief, NewsType } from "@/lib/editorial/types"

export const OPENROUTER_BRIEF_MODEL_DEFAULT = "nvidia/nemotron-3-ultra-550b-a55b:free"

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
}`
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

Tugasmu: putuskan angle final, dan tulis arah editorial yang lebih tajam dan lebih manusiawi dari usulan rule-based di atas — TETAP hanya berdasarkan fakta yang diberikan. Kembalikan HANYA JSON sesuai skema yang sudah dijelaskan di system prompt.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitizer — sama pendekatannya dengan generate-draft/route.ts (Llama 4 Scout):
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
      const m = msg.match(/position (\d+)/)
      if (!m) throw e
      const pos = Number(m[1])
      // Scan mundur dari posisi error untuk cari tanda kutip mentah
      // terdekat — itu yang salah menutup string duluan. V8 kadang skip
      // whitespace setelah kutip itu sebelum melapor posisi error, jadi
      // posisi error TIDAK selalu pas persis di karakter kutipnya.
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
  const raw = stripThinkingBlocks(rawInput)
  const clean = sanitizeJsonControlChars(raw)
  let lastErr = ""

  try { return parseJsonWithAutoRepair(clean) } catch (e) { lastErr = e instanceof Error ? e.message : String(e) }

  const block = clean.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (block) { try { return parseJsonWithAutoRepair(block[1].trim()) } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  const i = clean.indexOf("{"), j = clean.lastIndexOf("}")
  if (i !== -1 && j !== -1 && j > i) { try { return parseJsonWithAutoRepair(clean.slice(i, j + 1)) } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  throw new Error(
    `OpenRouter (Nemotron 3 Ultra) tidak mengembalikan JSON valid (panjang respons: ${raw.length} karakter, ` +
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
        // Nemotron 3 Ultra adalah "frontier reasoning model" — reasoning-nya
        // kemungkinan TIDAK bisa benar-benar dimatikan (beda dari model
        // reasoning ringan lain). max_tokens di sini menanggung reasoning +
        // jawaban JSON final sekaligus, jadi harus jauh lebih besar daripada
        // model non-reasoning biasa — kalau kekecilan, semua kuota kepakai
        // buat "berpikir" dan jawaban final jadi kosong (ini yang awalnya
        // terjadi waktu masih 1600).
        max_tokens: 6000,
        response_format: { type: "json_object" },
        // effort "low" supaya reasoning tidak berlebihan & hemat token,
        // exclude:true supaya teks reasoning tidak ikut numpuk di response
        // body (kita memang tidak butuh reasoning trace-nya, cuma JSON final).
        reasoning: { effort: "low", exclude: true },
      }),
      // Dinaikkan dari 50s -> 270s (4.5 menit). Per dokumentasi resmi Vercel
      // (terakhir update Mei 2026, sejak Fluid Compute jadi default), Hobby
      // plan sekarang juga dapat maxDuration sampai 300s — bukan 60s lagi
      // seperti generasi lama. Disisakan ~30s dari budget 300s di route.ts
      // untuk fetch Bzzoiro/Serper/Tavily + buildEditorialBrief + validator +
      // insert Supabase, supaya total tidak kepotong paksa oleh Vercel
      // (FUNCTION_INVOCATION_TIMEOUT / 504) sebelum sempat fallback rapi ke
      // rule-based. Kalau Nemotron 3 Ultra di free tier OpenRouter ternyata
      // konsisten butuh lebih dari ini, kemungkinan besar bukan soal timeout
      // lagi tapi model/slug-nya memang lambat atau kena rate limit — cek log
      // failureReason di sourceWarnings.
      signal: AbortSignal.timeout(270_000),
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
        `panjang reasoning: ${reasoningText.length} karakter${finishReason === "length" ? " — kemungkinan max_tokens masih kurang untuk model reasoning sebesar ini, atau reasoning effort perlu diturunkan lagi" : ""}.`
      )
    }

    if (finishReason === "length") {
      console.warn(
        `⚠️ Respons OpenRouter (${model}) kepotong (finish_reason: length) dengan max_tokens=6000. ` +
        `Kalau ini sering terjadi, naikkan lagi nilainya di openrouter-brief-editor.ts.`
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
    // model lagi down di free tier, slug berubah), pipeline TETAP lanjut
    // memakai brief rule-based — tidak boleh memblokir Generate Brief hanya
    // karena OpenRouter bermasalah. Tapi alasannya tetap dikembalikan supaya
    // bisa ditampilkan apa adanya ke CMS, bukan disamarkan jadi pesan generic.
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`⚠️ callBriefEditor (OpenRouter ${model}) gagal, fallback ke rule-based:`, err)
    return { suggestion: null, failureReason: reason }
  }
}

export { ALLOWED_ANGLES }
