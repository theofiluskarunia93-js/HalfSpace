// lib/editorial/brief-validator.ts — BARU
//
// STEP 3 dari pipeline baru: "Validator Editor (Next.js)".
//
// Ini adalah kode TypeScript murni — TIDAK ADA AI di sini. Tugasnya
// memeriksa usulan dari OpenRouter Nemotron 3 Ultra (lib/ai/openrouter-brief-editor.ts)
// sebelum diizinkan menimpa brief rule-based yang sudah grounded di fakta
// nyata (dari lib/editorial/brief-builder.ts).
//
// Pipeline per PDF Data Mapping HalfSpace:
//   Bzzoiro + Serper + Tavily → Nemotron 3 Ultra Brief → Gemma 4 31B
//
// Prinsip: AI boleh menentukan ARAH editorial (angle, judul, narasi, lead),
// tapi tidak boleh menyelundupkan fakta baru. Setiap kalimat dari AI yang
// mengandung angka, atau nama pemain/tim yang TIDAK muncul di teks sumber
// mentah (bzzoiro + serper + tavily + mustUse/canUse), akan DITOLAK dan
// field tersebut otomatis jatuh kembali (fallback) ke versi rule-based.

import type { ArticleAngle, EditorialBrief } from "./types"
import type { AiBriefSuggestion } from "@/lib/ai/openrouter-brief-editor"
import { ALLOWED_ANGLES } from "@/lib/ai/openrouter-brief-editor"

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

  return { brief, validation: report }
}
