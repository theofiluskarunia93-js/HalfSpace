// lib/ai/gpt5-mini-brief-editor.ts — BARU (menggantikan lib/ai/openrouter-brief-editor.ts)
//
// STEP baru di pipeline (per permintaan pengguna, Juli 2026):
//
//   RAW Data (Bzzoiro+Serper+Tavily) → Normalizer → Exact Dedup → Semantic
//   Dedup → Fact Merging (lib/editorial/raw-data-pipeline.ts)
//     → buildEditorialBrief() (brief deterministik, TANPA AI — tidak berubah)
//     → GPT-5 Mini — Editor Brief (AI, file ini)
//     → Validator (lib/editorial/brief-validator.ts)
//     → Claude Sonnet — Generate Draft (lib/ai/claude-sonnet-writer-prompt.ts)
//
// Tugas AI ini BUKAN menulis artikel, dan BUKAN menentukan fakta — fakta
// (mustUse/canUse/doNotUse) tetap 100% dihasilkan oleh kode deterministik di
// lib/editorial/brief-builder.ts (tidak diubah). AI di sini hanya diminta
// mengambil KEPUTUSAN EDITORIAL: angle mana yang paling kuat, bagaimana
// menuliskan arah judul/lead/narasi secara lebih tajam — dengan syarat WAJIB
// hanya memakai fakta yang sudah diberikan.
//
// Output AI ini TIDAK PERNAH dipakai mentah. Selalu lewat
// lib/editorial/brief-validator.ts (Validator Editor) sebelum digabung ke
// EditorialBrief final yang dikirim ke Claude Sonnet (generate-draft).
//
// BARU: untuk newsType "preview" dan "hasil", brief deterministik SUDAH
// memakai struktur H2 BAKU (4 section, judul tetap — lihat
// FIXED_SECTION_STRUCTURE di lib/editorial/types.ts dan buildH2s() di
// brief-builder.ts). GPT-5 Mini TIDAK BOLEH mengubah judul H2 itu — tugasnya
// hanya mempertajam "focus" tiap section (kalimat arahan isi, bukan fakta
// baru) lewat field "sectionFocus" di JSON output. Untuk tipe lain (transfer/
// konpers/cedera/trivia), field ini tidak dipakai — schema sama seperti versi
// sebelumnya (angle/rationale/headlineDirection/dst).
//
// Model: GPT-5 Mini via OpenAI API (https://api.openai.com/v1/chat/completions).
// Auth pakai OPENAI_API_KEY. Override model via env OPENAI_BRIEF_MODEL kalau
// nama model berubah — cek https://platform.openai.com/docs/models sebelum deploy.
// Override reasoning_effort/verbosity via env OPENAI_BRIEF_REASONING_EFFORT /
// OPENAI_BRIEF_VERBOSITY (default: "low"/"low") — lihat catatan lengkap di
// dalam callBriefEditor().
//
// CATATAN: GPT-5 Mini bersifat best-effort, sama seperti model sebelumnya —
// kalau panggilan gagal (rate limit/timeout/API key hilang), pipeline TETAP
// lanjut memakai brief rule-based sepenuhnya (fallback), tidak memblokir
// Generate Brief.

import type { ArticleAngle, EditorialBrief, NewsType } from "@/lib/editorial/types"
import { FIXED_SECTION_STRUCTURE } from "@/lib/editorial/types"

export const OPENAI_BRIEF_MODEL_DEFAULT = "gpt-5-mini"

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

export interface AiBriefSectionFocus {
  heading: string  // WAJIB persis salah satu dari FIXED_SECTION_STRUCTURE[newsType]
  focus: string     // kalimat arahan isi section ini — HARUS berdasarkan fakta yang diberikan
}

export interface AiBriefSuggestion {
  angle: string
  rationale: string
  headlineDirection: string
  narrativeFocus: string
  subStorylines: string[]
  leadExample: string
  transitionHints: string[]
  // BARU — hanya diisi (dan hanya divalidasi) untuk newsType "preview"/"hasil"
  sectionFocus?: AiBriefSectionFocus[]
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
export function buildBriefEditorSystem(newsType: NewsType): string {
  const fixedStructureBlock = (newsType === "preview" || newsType === "hasil")
    ? `

══════════════════════════════════════════════════
STRUKTUR H2 BAKU — WAJIB, khusus tipe "${newsType}"
══════════════════════════════════════════════════
Untuk tipe berita "${newsType}", artikel HARUS memakai persis 4 section H2 berikut, dengan judul PERSIS seperti ini (jangan diubah kata-katanya, jangan ditambah/dikurangi, jangan diubah urutannya):
${FIXED_SECTION_STRUCTURE[newsType].map((h, i) => `${i + 1}. "${h}"`).join("\n")}

Tugasmu untuk bagian ini HANYA menulis "focus" (1 kalimat arahan isi, bukan fakta baru) untuk masing-masing dari 4 judul di atas, berdasarkan FAKTA WAJIB/FAKTA PENDUKUNG yang diberikan. Keluarkan sebagai field "sectionFocus": array 4 objek {"heading": "<judul PERSIS dari daftar di atas>", "focus": "<1 kalimat arahan isi>"}. DILARANG KERAS mengganti teks "heading" — kalau kamu tulis heading yang tidak persis sama dengan daftar di atas, seluruh section itu akan ditolak validator.`
    : ""

  return `Kamu adalah Editor Senior media olahraga berbahasa Indonesia bergaya The Athletic — analitis, netral, berbasis fakta, tanpa clickbait.

TUGASMU HANYA SATU: memutuskan ARAH EDITORIAL (angle, judul, lead, narasi) untuk satu artikel. Kamu TIDAK menulis artikel itu sendiri — penulisan draft final dilakukan model lain (Claude Sonnet) berdasarkan keputusanmu.

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
  "transitionHints": ["<instruksi kalimat jembatan antar bagian 1>", "<instruksi kalimat jembatan 2>"]${(newsType === "preview" || newsType === "hasil") ? `,
  "sectionFocus": [{"heading": "<judul PERSIS dari daftar STRUKTUR H2 BAKU di bawah>", "focus": "<1 kalimat arahan isi>"}, ... (tepat 4 objek)]` : ""}
}
5. Jawab LANGSUNG dengan JSON di atas. JANGAN menulis proses berpikir, draft, atau pertimbangan apapun sebelum JSON — langsung keluarkan JSON final saja.${fixedStructureBlock}`
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT — dibangun dari brief deterministik (sudah grounded di fakta nyata)
// ─────────────────────────────────────────────────────────────────────────────
export function buildBriefEditorUser(
  newsType: NewsType,
  topic: string,
  deterministicBrief: EditorialBrief,
): string {
  const { keyFacts, angle: ruleBasedAngle, keyPlayers, quotes, structureHints } = deterministicBrief

  const sectionStructureBlock = (newsType === "preview" || newsType === "hasil")
    ? `

STRUKTUR H2 BAKU SAAT INI (rule-based — draft "focus" di bawah ini boleh kamu pertajam, tapi "heading" TIDAK BOLEH diubah):
${structureHints.suggestedH2s.map((h, i) => `${i + 1}. "${h.text}" — focus saat ini: ${h.focus}`).join("\n")}`
    : ""

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
- narrativeFocus: ${ruleBasedAngle.narrativeFocus}${sectionStructureBlock}

Tugasmu: putuskan angle final, dan tulis arah editorial yang lebih tajam dan lebih manusiawi dari usulan rule-based di atas — TETAP hanya berdasarkan fakta yang diberikan. Kembalikan HANYA JSON sesuai skema yang sudah dijelaskan di system prompt. Jawab langsung dengan JSON, tanpa proses berpikir di luar JSON.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitizer & JSON extractor — tetap dipertahankan sebagai jaring pengaman
// walau GPT-5 Mini umumnya jauh lebih taat pada response_format json_object
// dibanding model open-source sebelumnya (Nemotron 3 Super).
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

function extractJsonLoose(rawInput: string): unknown {
  const clean = sanitizeJsonControlChars(rawInput.trim())
  let lastErr = ""

  try { return parseJsonWithAutoRepair(clean) } catch (e) { lastErr = e instanceof Error ? e.message : String(e) }

  const block = clean.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (block) { try { return parseJsonWithAutoRepair(block[1].trim()) } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  const i = clean.indexOf("{"), j = clean.lastIndexOf("}")
  if (i !== -1 && j !== -1 && j > i) { try { return parseJsonWithAutoRepair(clean.slice(i, j + 1)) } catch (e) { lastErr = e instanceof Error ? e.message : lastErr } }

  throw new Error(
    `GPT-5 Mini tidak mengembalikan JSON valid (panjang respons: ${rawInput.length} karakter). ` +
    `Parse error: ${lastErr}. Awal: ${rawInput.slice(0, 150)} ||| Akhir: ${rawInput.slice(-150)}`
  )
}

function normalizeSectionFocus(value: unknown): AiBriefSectionFocus[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({ heading: String(v.heading ?? "").trim(), focus: String(v.focus ?? "").trim() }))
    .filter((v) => v.heading && v.focus)
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL — OpenAI chat completions (GPT-5 Mini)
// ─────────────────────────────────────────────────────────────────────────────
export interface BriefEditorResult {
  suggestion: AiBriefSuggestion | null
  /** Alasan asli kegagalan — null kalau berhasil. Dipakai supaya CMS bisa
   *  menampilkan alasan SEBENARNYA (bukan selalu "cek OPENAI_API_KEY"). */
  failureReason: string | null
}

export async function callBriefEditor(
  newsType: NewsType,
  topic: string,
  deterministicBrief: EditorialBrief,
): Promise<BriefEditorResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    const reason = "OPENAI_API_KEY tidak ditemukan di environment variables."
    console.warn(`⚠️ ${reason} Skip AI editor brief, pakai rule-based saja.`)
    return { suggestion: null, failureReason: reason }
  }

  const model = process.env.OPENAI_BRIEF_MODEL || OPENAI_BRIEF_MODEL_DEFAULT

  // Konfirmasi dari dokumentasi resmi OpenAI (platform.openai.com, dicek
  // Juli 2026 — platform.openai.com/docs/api-reference/chat,
  // platform.openai.com/docs/guides/reasoning,
  // platform.openai.com/docs/models/gpt-5):
  //   • Keluarga model GPT-5 (termasuk gpt-5-mini) TIDAK MENDUKUNG
  //     parameter "temperature" lewat Chat Completions API — hanya nilai
  //     default (1) yang diterima; nilai lain akan ditolak dengan error 400
  //     "Unsupported parameter: 'temperature'". Makanya parameter ini TIDAK
  //     dikirim sama sekali di bawah (bukan diset ke 1 secara eksplisit).
  //   • "max_tokens" sudah deprecated untuk model reasoning — WAJIB pakai
  //     "max_completion_tokens".
  //   • Kontrol kualitas output di GPT-5 dilakukan lewat "reasoning_effort"
  //     (minimal/low/medium/high) dan "verbosity" (low/medium/high), BUKAN
  //     lewat temperature. Untuk tugas Editor Brief (keputusan editorial
  //     angle/judul/lead — butuh sedikit penalaran, tapi tidak serumit
  //     tugas riset/coding), "low" cukup: lebih cepat & murah, dan brief
  //     deterministik sudah menyediakan fakta yang sudah tersaring, jadi
  //     GPT-5 Mini tidak perlu "berpikir keras". Naikkan ke "medium" lewat
  //     env kalau hasil angle/lead terasa kurang tajam.
  //   • "verbosity: low" dipilih karena output WAJIB JSON ringkas sesuai
  //     skema, bukan jawaban naratif panjang.
  const reasoningEffort = process.env.OPENAI_BRIEF_REASONING_EFFORT || "low"
  const verbosity = process.env.OPENAI_BRIEF_VERBOSITY || "low"

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildBriefEditorSystem(newsType) },
          { role: "user", content: buildBriefEditorUser(newsType, topic, deterministicBrief) },
        ],
        // TIDAK mengirim "temperature" — lihat catatan di atas.
        reasoning_effort: reasoningEffort,
        verbosity,
        response_format: { type: "json_object" },
        max_completion_tokens: 4000,
      }),
      // Timeout dijaga longgar (120 detik) untuk model reasoning ringan
      // (mini) — jauh lebih cepat dari model 120B+ sebelumnya, tapi tetap
      // diberi buffer aman dalam budget maxDuration 300s Vercel.
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`OpenAI HTTP ${res.status} (model: ${model}): ${body.slice(0, 300)}`)
    }

    const json = await res.json()
    const choice = json?.choices?.[0]
    const raw: string = choice?.message?.content ?? ""
    const finishReason: string | undefined = choice?.finish_reason

    if (!raw.trim()) {
      throw new Error(
        `OpenAI (${model}) mengembalikan content kosong. finish_reason: ${finishReason ?? "?"}.`
      )
    }

    if (finishReason === "length") {
      console.warn(`⚠️ Respons OpenAI (${model}) kepotong (finish_reason: length) dengan max_completion_tokens=4000. Naikkan kalau ini sering terjadi.`)
    }

    const parsed = extractJsonLoose(raw) as Partial<AiBriefSuggestion>

    if (!parsed.angle || !parsed.headlineDirection || !parsed.narrativeFocus) {
      throw new Error(`Respons OpenAI tidak lengkap (angle/headlineDirection/narrativeFocus hilang). Raw: ${raw.slice(0, 200)}`)
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
        sectionFocus: (newsType === "preview" || newsType === "hasil")
          ? normalizeSectionFocus(parsed.sectionFocus)
          : undefined,
      },
      failureReason: null,
    }
  } catch (err) {
    // AI editor brief bersifat best-effort. Kalau gagal (rate limit, timeout,
    // API key salah, dll), pipeline TETAP lanjut memakai brief rule-based —
    // tidak boleh memblokir Generate Brief hanya karena OpenAI bermasalah.
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`⚠️ callBriefEditor (OpenAI ${model}) gagal, fallback ke rule-based:`, err)
    return { suggestion: null, failureReason: reason }
  }
}

export { ALLOWED_ANGLES }
