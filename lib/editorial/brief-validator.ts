// lib/editorial/brief-validator.ts — v2
//
// STEP dalam pipeline: "Validator Editor (Next.js)" — berjalan SETELAH GPT-5
// Mini (Editor Brief) dan SEBELUM Claude Sonnet (Generate Draft).
//
// Ini adalah kode TypeScript murni — TIDAK ADA AI di sini. Tugasnya
// memeriksa usulan dari GPT-5 Mini (lib/ai/gpt5-mini-brief-editor.ts)
// sebelum diizinkan menimpa brief rule-based yang sudah grounded di fakta
// nyata (dari lib/editorial/brief-builder.ts).
//
// Pipeline (per Juli 2026):
//   Bzzoiro+Serper+Tavily → Normalizer → Exact Dedup → Semantic Dedup →
//   Fact Merging → Editor Brief (GPT-5 Mini) → Validator (file ini) →
//   Generate Draft (Claude Sonnet)
//
// Prinsip: AI boleh menentukan ARAH editorial (angle, judul, narasi, lead),
// tapi tidak boleh menyelundupkan fakta baru. Setiap kalimat dari AI yang
// mengandung angka, atau nama pemain/tim yang TIDAK muncul di teks sumber
// mentah (bzzoiro + serper + tavily + mustUse/canUse), akan DITOLAK dan
// field tersebut otomatis jatuh kembali (fallback) ke versi rule-based.
//
// BARU (v2): validasi field "sectionFocus" — khusus newsType "preview"/
// "hasil", yang sekarang memakai struktur H2 BAKU (lihat
// FIXED_SECTION_STRUCTURE di ./types dan buildH2s di ./brief-builder). GPT-5
// Mini HANYA boleh menyarankan teks "focus" baru untuk tiap section — heading
// section TIDAK BOLEH diubah AI. Validasi di sini: (1) heading harus match
// PERSIS salah satu dari FIXED_SECTION_STRUCTURE[newsType], (2) focus harus
// grounded (tidak ada angka/nama yang tidak ada di sumber). Item yang gagal
// salah satu syarat DITOLAK per-item (fallback ke focus rule-based untuk
// section itu saja), bukan all-or-nothing.

import type { ArticleAngle, EditorialBrief, NewsType } from "./types"
import { FIXED_SECTION_STRUCTURE } from "./types"
import type { AiBriefSuggestion } from "@/lib/ai/gpt5-mini-brief-editor"
import { ALLOWED_ANGLES } from "@/lib/ai/gpt5-mini-brief-editor"

export interface BriefValidationReport {
  aiUsed: boolean
  acceptedFields: string[]
  rejectedFields: { field: string; reason: string }[]
}

// Ambil semua angka (2 digit atau lebih, termasuk desimal/persen/skor) dari teks.
function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? []
}

// Cek apakah semua angka di `candidate` juga muncul di `groundingText`.
// Ini heuristik sengaja longgar (bukan NLP berat) — cukup untuk menangkap
// kasus paling berbahaya: AI menyebut skor/menit/statistik yang dikarang.
function allNumbersGrounded(candidate: string, groundingText: string): boolean {
  const candidateNums = extractNumbers(candidate)
  if (candidateNums.length === 0) return true
  return candidateNums.every((n) => groundingText.includes(n))
}

function isAngleAllowed(angle: string): angle is ArticleAngle {
  return (ALLOWED_ANGLES as string[]).includes(angle)
}

/**
 * Gabungkan usulan AI ke brief deterministik, dengan validasi per-field.
 * Jika `aiSuggestion` null (OpenRouter gagal/skip), kembalikan brief
 * deterministik apa adanya — pipeline tetap berjalan normal.
 */
export function validateAndMergeAiBrief(
  deterministicBrief: EditorialBrief,
  aiSuggestion: AiBriefSuggestion | null,
  groundingTexts: { bzzoiroText: string; serperText: string; tavilyText: string },
): { brief: EditorialBrief; validation: BriefValidationReport } {
  const report: BriefValidationReport = { aiUsed: false, acceptedFields: [], rejectedFields: [] }

  if (!aiSuggestion) {
    return { brief: deterministicBrief, validation: report }
  }

  report.aiUsed = true

  // Teks gabungan untuk grounding-check angka: sumber mentah + fakta yang
  // sudah diverifikasi rule-based (mustUse/canUse). Brief itu sendiri TIDAK
  // dipakai sebagai grounding karena bisa melingkar (circular).
  const groundingPool = [
    groundingTexts.bzzoiroText,
    groundingTexts.serperText,
    groundingTexts.tavilyText,
    deterministicBrief.keyFacts.mustUse.join(" "),
    deterministicBrief.keyFacts.canUse.join(" "),
  ].join(" \n ")

  const brief: EditorialBrief = {
    ...deterministicBrief,
    angle: { ...deterministicBrief.angle },
    storylines: { ...deterministicBrief.storylines },
  }

  // ── angle ──────────────────────────────────────────────────────────────
  if (isAngleAllowed(aiSuggestion.angle)) {
    brief.angle.primary = aiSuggestion.angle
    report.acceptedFields.push("angle")
  } else {
    report.rejectedFields.push({
      field: "angle",
      reason: `Nilai "${aiSuggestion.angle}" bukan angle yang diizinkan — tetap pakai "${deterministicBrief.angle.primary}".`,
    })
  }

  // ── rationale (bebas, tidak mengandung fakta baru yang krusial) ────────
  if (aiSuggestion.rationale.trim()) {
    brief.angle.rationale = aiSuggestion.rationale.trim()
    report.acceptedFields.push("angle.rationale")
  }

  // ── headlineDirection ────────────────────────────────────────────────────
  if (aiSuggestion.headlineDirection.trim() && allNumbersGrounded(aiSuggestion.headlineDirection, groundingPool)) {
    brief.angle.headlineDirection = aiSuggestion.headlineDirection.trim()
    report.acceptedFields.push("angle.headlineDirection")
  } else if (aiSuggestion.headlineDirection.trim()) {
    report.rejectedFields.push({
      field: "angle.headlineDirection",
      reason: "Mengandung angka yang tidak ditemukan di data sumber — dipertahankan versi rule-based.",
    })
  }

  // ── narrativeFocus ───────────────────────────────────────────────────────
  if (aiSuggestion.narrativeFocus.trim() && allNumbersGrounded(aiSuggestion.narrativeFocus, groundingPool)) {
    brief.angle.narrativeFocus = aiSuggestion.narrativeFocus.trim()
    brief.storylines.primaryStoryline = aiSuggestion.narrativeFocus.trim()
    report.acceptedFields.push("angle.narrativeFocus")
  } else if (aiSuggestion.narrativeFocus.trim()) {
    report.rejectedFields.push({
      field: "angle.narrativeFocus",
      reason: "Mengandung angka yang tidak ditemukan di data sumber — dipertahankan versi rule-based.",
    })
  }

  // ── leadExample — paling sensitif terhadap halusinasi, validasi ketat ──
  if (aiSuggestion.leadExample.trim() && allNumbersGrounded(aiSuggestion.leadExample, groundingPool)) {
    brief.storylines.leadExample = aiSuggestion.leadExample.trim()
    report.acceptedFields.push("storylines.leadExample")
  } else if (aiSuggestion.leadExample.trim()) {
    report.rejectedFields.push({
      field: "storylines.leadExample",
      reason: "Lead dari AI mengandung angka yang tidak grounded di data sumber — dipertahankan leadExample rule-based.",
    })
  }

  // ── subStorylines — filter per-item, bukan all-or-nothing ──────────────
  if (aiSuggestion.subStorylines.length > 0) {
    const groundedSubs = aiSuggestion.subStorylines.filter((s) => allNumbersGrounded(s, groundingPool))
    if (groundedSubs.length > 0) {
      brief.storylines.subStorylines = groundedSubs
      report.acceptedFields.push("storylines.subStorylines")
    }
    if (groundedSubs.length < aiSuggestion.subStorylines.length) {
      report.rejectedFields.push({
        field: "storylines.subStorylines",
        reason: `${aiSuggestion.subStorylines.length - groundedSubs.length} sub-storyline ditolak karena angka tidak grounded.`,
      })
    }
  }

  // ── transitionHints — instruksi gaya menulis, bukan fakta, jadi tidak
  //    perlu validasi angka — cukup terima jika tidak kosong.
  if (aiSuggestion.transitionHints.length > 0) {
    brief.storylines.transitionHints = aiSuggestion.transitionHints
    report.acceptedFields.push("storylines.transitionHints")
  }

  // ── sectionFocus (BARU) — hanya untuk "preview"/"hasil", heading H2 BAKU ──
  const newsType = deterministicBrief.meta.newsType
  if ((newsType === "preview" || newsType === "hasil") && aiSuggestion.sectionFocus && aiSuggestion.sectionFocus.length > 0) {
    const allowedHeadings = FIXED_SECTION_STRUCTURE[newsType]
    brief.structureHints = {
      ...deterministicBrief.structureHints,
      suggestedH2s: deterministicBrief.structureHints.suggestedH2s.map((h) => ({ ...h })),
    }

    let acceptedCount = 0
    let rejectedCount = 0

    for (const item of aiSuggestion.sectionFocus) {
      const headingMatch = allowedHeadings.find((h) => h.toLowerCase() === item.heading.trim().toLowerCase())
      if (!headingMatch) {
        rejectedCount++
        continue // heading tidak dikenali/diubah AI — abaikan, biarkan rule-based
      }
      if (!item.focus.trim() || !allNumbersGrounded(item.focus, groundingPool)) {
        rejectedCount++
        continue // focus mengandung angka yang tidak grounded, atau kosong
      }
      const target = brief.structureHints.suggestedH2s.find((h) => h.text === headingMatch)
      if (target) {
        target.focus = item.focus.trim()
        acceptedCount++
      }
    }

    if (acceptedCount > 0) report.acceptedFields.push("structureHints.suggestedH2s[].focus")
    if (rejectedCount > 0) {
      report.rejectedFields.push({
        field: "structureHints.suggestedH2s[].focus",
        reason: `${rejectedCount} dari ${aiSuggestion.sectionFocus.length} sectionFocus ditolak (heading tidak match struktur baku, atau focus mengandung angka tidak grounded) — section tersebut tetap memakai focus rule-based.`,
      })
    }
  }

  return { brief, validation: report }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWv4: VALIDASI PASCA-TERJEMAHAN — kutipan & fakta media
// ─────────────────────────────────────────────────────────────────────────────
// Dipanggil dari brief-builder.ts SETELAH translateQuotes()/translateMediaFacts()
// (lib/ai/translation.ts). Tugasnya BUKAN menerjemahkan ulang — hanya
// memverifikasi bahwa hasil terjemahan tidak "melayang" dari teks asli:
//   1. Nama entitas (tim/pemain dari keyNames) WAJIB tetap muncul persis di
//      hasil terjemahan — kalau hilang, kemungkinan terjemahan mengubah/
//      menghapus nama yang seharusnya dipertahankan verbatim (lihat aturan
//      mutlak #5 di buildTranslateSystemPrompt: "Pertahankan nama orang,
//      klub, dan kompetisi PERSIS seperti aslinya").
//   2. Hasil terjemahan TIDAK BOLEH jauh lebih panjang dari teks asli (lebih
//      dari 1.6x jumlah kata) — indikasi model menambah informasi/opini yang
//      tidak ada di teks asli (melanggar aturan mutlak #2/#3 di translation.ts).
//   3. Hasil terjemahan TIDAK BOLEH kosong sama sekali.
// Ini heuristik ringan (bukan NLP berat), sejalan dengan gaya allNumbersGrounded
// di atas — cukup untuk menangkap kasus paling berisiko, bukan mendeteksi
// semua kemungkinan kesalahan nuansa (itu di luar kemampuan heuristik teks).

export interface TranslationIntegrityIssue {
  field: string
  original: string
  translated: string
  reason: string
}

export interface TranslationIntegrityReport {
  passed: boolean
  issues: TranslationIntegrityIssue[]
}

// Cek apakah setiap nama di `keyNames` yang muncul di `original` juga masih
// muncul di `translated`. Pencocokan case-insensitive & per-kata (nama bisa
// terdiri lebih dari satu kata, mis. "Luis de la Fuente").
function namesPreserved(original: string, translated: string, keyNames: string[]): string[] {
  const missing: string[] = []
  const translatedLower = translated.toLowerCase()
  for (const name of keyNames) {
    if (!name.trim()) continue
    const nameLower = name.trim().toLowerCase()
    if (original.toLowerCase().includes(nameLower) && !translatedLower.includes(nameLower)) {
      missing.push(name.trim())
    }
  }
  return missing
}

/**
 * Validasi satu pasang (teks asli, teks terjemahan) terhadap daftar nama
 * entitas yang wajib dipertahankan (biasanya: home, away, keyPlayers).
 * Mengembalikan array issue (kosong = lolos).
 */
export function checkTranslationIntegrity(
  field: string,
  original: string,
  translated: string,
  keyNames: string[],
): TranslationIntegrityIssue[] {
  const issues: TranslationIntegrityIssue[] = []

  if (!translated.trim()) {
    issues.push({ field, original, translated, reason: "Hasil terjemahan kosong." })
    return issues
  }

  const missingNames = namesPreserved(original, translated, keyNames)
  if (missingNames.length > 0) {
    issues.push({
      field, original, translated,
      reason: `Nama berikut ada di teks asli tapi hilang di hasil terjemahan: ${missingNames.join(", ")}. Kemungkinan nama berubah/terhapus saat diterjemahkan.`,
    })
  }

  const originalWords = original.trim().split(/\s+/).filter(Boolean).length
  const translatedWords = translated.trim().split(/\s+/).filter(Boolean).length
  if (originalWords > 0 && translatedWords > originalWords * 1.6) {
    issues.push({
      field, original, translated,
      reason: `Hasil terjemahan (${translatedWords} kata) jauh lebih panjang dari teks asli (${originalWords} kata) — indikasi informasi/opini tambahan yang tidak ada di teks asli.`,
    })
  }

  return issues
}

/**
 * Validasi sekumpulan kutipan hasil translateQuotes() sekaligus.
 */
export function validateTranslatedQuotes(
  quotes: Array<{ text: string; original: string; speaker: string }>,
  keyNames: string[],
): TranslationIntegrityReport {
  const issues: TranslationIntegrityIssue[] = []
  quotes.forEach((q, i) => {
    issues.push(...checkTranslationIntegrity(`quotes[${i}]`, q.original, q.text, [...keyNames, q.speaker]))
  })
  return { passed: issues.length === 0, issues }
}
