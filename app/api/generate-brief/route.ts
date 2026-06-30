// app/api/generate-brief/route.ts — v3 (PIPELINE BARU)
//
// ━━━ PIPELINE (sesuai PDF Data Mapping HalfSpace) ━━━
//
//   API data Bzzoiro + Serper + Tavily (Raw Data)
//   ├── Bzzoiro: data struktural per tipe artikel
//   │   Preview  → predictions, predicted_lineup, odds/comparison (14 bookmaker),
//   │              average_positions, ai_preview (Haiku 4.5, referensi saja)
//   │   Hasil    → stats, incidents, per-shot xG + koordinat, momentum
//   │   Transfer → player profile, market value, player-stats
//   │   Konpers  → fixture, squad/absen, odds (konteks, bukan primer)
//   │   Cedera   → player stats, predicted_lineup (tanpa pemain), odds impact
//   │   Trivia   → shotmap xG per shot, 139k+ stats, 66 liga x 68k+ match
//   ├── Serper: berita & SEO real-time (kutipan, highlights, transfer status)
//   └── Tavily: konteks naratif mendalam (historis, taktis, analisis)
//     |
//   buildEditorialBrief() — ekstraksi fakta deterministik, TANPA AI
//   (lib/editorial/brief-builder.ts — satu-satunya sumber kebenaran untuk
//    mustUse/canUse/doNotUse/SEO/qualityGate)
//     |
//   OpenRouter Nemotron 3 Super — Editor Brief (AI)
//   (lib/ai/openrouter-brief-editor.ts — hanya memutuskan angle/judul/lead/narasi,
//    WAJIB hanya berdasarkan fakta dari brief deterministik)
//     |
//   Validator Editor (Next.js, pure TypeScript)
//   (lib/editorial/brief-validator.ts — tolak field AI yang tidak grounded)
//     |
//   Simpan ke Supabase → return EditorialBrief final ke CMS
//     |
//   (lanjut ke: /api/generate-draft → Gemma 4 31B, per pipeline PDF)
//
// CATATAN: jika OPENROUTER_API_KEY tidak ada, atau OpenRouter gagal/timeout,
// pipeline TETAP jalan normal memakai brief rule-based saja (best-effort AI).

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Bzzoiro fetchers (tidak berubah)
import {
  fetchHasilContext,
  fetchPreviewContext,
  fetchCederaContext,
  fetchTransferContext,
  fetchKonpersContext,
} from "@/lib/news-context/bzzoiro"

// Serper & Tavily fetchers (tidak berubah)
import { fetchSerperContext } from "@/lib/news-context/serper"
import { fetchTavilyContext } from "@/lib/news-context/tavily"

// Brief builder rule-based (tidak berubah)
import { buildEditorialBrief, parseKonpersMatch } from "@/lib/editorial/brief-builder"

// ── BARU: AI Editor Brief (OpenRouter Nemotron 3 Super) + Validator ────────
import { callBriefEditor } from "@/lib/ai/openrouter-brief-editor"
import { validateAndMergeAiBrief } from "@/lib/editorial/brief-validator"

import type { NewsType } from "@/lib/editorial/types"

// NEWv2: model Editor Brief diganti dari Nemotron 3 Ultra (550B-a55B) →
// Nemotron 3 Super (120B-a12B), atas keputusan eksplisit: Ultra terlalu
// lambat diproses dan sering timeout. Lihat catatan lengkap di header
// lib/ai/openrouter-brief-editor.ts.
//
// NEWv3: timeout Editor Brief diturunkan dari 270s → 150s, dan timeout
// translateOneQuote/translateMediaFactsBatch (lib/ai/translation.ts)
// dinaikkan ke 60s masing-masing (untuk mengatasi warning
// "media_facts_translation GAGAL"). Kombinasi ini dipilih supaya skenario
// TERBURUK total satu request generate-brief (fetch Serper/Tavily ~10s +
// translate kutipan 60s + translate fakta media 60s + Editor Brief 150s
// = ~280s) masih punya buffer ~20s di bawah maxDuration 300s Vercel —
// kalau timeout Editor Brief dipertahankan 270s seperti sebelumnya, total
// skenario terburuk bisa mencapai ~400s dan berisiko kepotong paksa oleh
// Vercel sebelum sempat fallback rapi ke rule-based.
//
// maxDuration TETAP 300 detik (maksimum yang diizinkan Vercel Hobby plan).
// Per dokumentasi Vercel terbaru (Mei 2026, sejak Fluid Compute jadi
// default), Hobby plan mengizinkan maxDuration sampai 300 detik (5
// menit) — bukan 60 detik lagi seperti generasi lama.
export const maxDuration = 300

// Map newsType ke Bzzoiro fetcher yang sesuai
const BZZOIRO_FETCHERS: Record<NewsType, (topic: string) => Promise<{ contextText: string; meta: Record<string, unknown>; warning?: string }>> = {
  hasil:    fetchHasilContext,
  preview:  fetchPreviewContext,
  cedera:   fetchCederaContext,
  transfer: fetchTransferContext,
  konpers:  fetchKonpersContext,
  trivia:   async () => ({ contextText: "", meta: {}, warning: "Trivia tidak menggunakan Bzzoiro" }),
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { newsType, topic, manualContext = "" } = body as {
      newsType: NewsType
      topic: string
      manualContext?: string
    }

    if (!newsType || !topic) {
      return NextResponse.json({ error: "newsType dan topic wajib diisi" }, { status: 400 })
    }

    // ── 1. Fetch semua sumber (RAW DATA) ──────────────────────────────────────
    // NEWv3: khusus KONPERS, Bzzoiro di-fetch LEBIH DULU (bukan paralel penuh)
    // supaya skor+venue+tanggal laga yang melatari konpers (lihat
    // fetchKonpersContext → blok "PERTANDINGAN TERKAIT KONPERS") bisa
    // disisipkan sebagai extraTerms ke query Serper & Tavily. Tanpa ini,
    // Serper/Tavily hanya mencari berdasarkan nama tim generik dan berisiko
    // mengembalikan kutipan/konteks dari konpers tim yang sama tapi laga yang
    // berbeda. Tipe lain TETAP fetch paralel penuh seperti sebelumnya (tidak
    // ada penalti latency untuk tipe yang tidak butuh extraTerms ini).
    let bzzoiroResult: PromiseSettledResult<{ contextText: string; meta: Record<string, unknown>; warning?: string }>
    let serperResult: PromiseSettledResult<Awaited<ReturnType<typeof fetchSerperContext>>>
    let tavilyResult: PromiseSettledResult<Awaited<ReturnType<typeof fetchTavilyContext>>>

    if (newsType === "konpers") {
      try {
        const value = await BZZOIRO_FETCHERS[newsType](topic)
        bzzoiroResult = { status: "fulfilled", value }
      } catch (reason) {
        bzzoiroResult = { status: "rejected", reason }
      }

      const konpersMatch = bzzoiroResult.status === "fulfilled"
        ? parseKonpersMatch(bzzoiroResult.value.contextText ?? "")
        : undefined
      const extraTerms = konpersMatch?.matchup // mis. "Uruguay 0 - 1 Spanyol" — disisipkan ke query

      const results = await Promise.allSettled([
        fetchSerperContext(newsType as any, topic, extraTerms),
        fetchTavilyContext(newsType as any, topic, extraTerms),
      ])
      serperResult = results[0]
      tavilyResult = results[1]
    } else {
      const results = await Promise.allSettled([
        BZZOIRO_FETCHERS[newsType](topic),
        fetchSerperContext(newsType as any, topic),
        fetchTavilyContext(newsType as any, topic),
      ])
      bzzoiroResult = results[0]
      serperResult  = results[1]
      tavilyResult  = results[2]
    }

    const bzzoiroText = bzzoiroResult.status === "fulfilled" ? (bzzoiroResult.value.contextText ?? "") : ""
    const serperText  = serperResult.status === "fulfilled"  ? (serperResult.value.contextText ?? "")  : ""
    const tavilyText  = tavilyResult.status === "fulfilled"  ? (tavilyResult.value.contextText ?? "")  : ""

    const sourceWarnings: string[] = []
    if (bzzoiroResult.status === "rejected") sourceWarnings.push(`Bzzoiro: ${bzzoiroResult.reason}`)
    if (serperResult.status === "rejected")  sourceWarnings.push(`Serper: ${serperResult.reason}`)
    if (tavilyResult.status === "rejected")  sourceWarnings.push(`Tavily: ${tavilyResult.reason}`)

    if (!bzzoiroText && !serperText && !tavilyText && !manualContext) {
      return NextResponse.json({
        error: "Semua sumber data gagal diambil. Cek API key atau coba lagi.",
        sourceWarnings,
      }, { status: 503 })
    }

    // ── 2. Brief deterministik (fakta grounded, TANPA AI) ─────────────────────
    const deterministicBrief = await buildEditorialBrief({
      newsType,
      topic,
      bzzoiroText,
      serperText,
      tavilyText,
      manualContext,
    })

    // ── 3. OpenRouter Nemotron 3 Super — Editor Brief (AI, best-effort) ────────
    const { suggestion: aiSuggestion, failureReason: aiFailureReason } = await callBriefEditor(newsType, topic, deterministicBrief)

    // ── 4. Validator Editor (Next.js, pure TS) — gabung + tolak yang tidak grounded
    const { brief, validation } = validateAndMergeAiBrief(
      deterministicBrief,
      aiSuggestion,
      { bzzoiroText, serperText, tavilyText },
    )

    if (validation.aiUsed) {
      if (validation.rejectedFields.length > 0) {
        sourceWarnings.push(
          `Validator menolak ${validation.rejectedFields.length} field dari AI editor brief: ` +
          validation.rejectedFields.map((r) => `${r.field} (${r.reason})`).join(" | ")
        )
      }
    } else {
      sourceWarnings.push(
        `OpenRouter Nemotron 3 Super tidak terpakai untuk brief ini — ${aiFailureReason ?? "alasan tidak diketahui"}. ` +
        `Brief memakai rule-based sepenuhnya (artikel tetap bisa lanjut digenerate normal).`
      )
    }

    // ── 5. Simpan ke Supabase ────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: generation, error: dbError } = await supabase
      .from("article_generations")
      .insert({
        news_type:        newsType,
        topic,
        editorial_brief:  brief,
        angle_selected:   brief.angle.primary,
        brief_token_est:  brief.meta.tokenEstimate,
        brief_ai_used:    validation.aiUsed,            // kolom baru — bool
        brief_ai_report:  validation,                    // kolom baru — jsonb
        status:           "brief_ready",
        // source_used: sesuai pipeline PDF — Bzzoiro + Serper + Tavily → Nemotron 3 Super
        source_used:      [
          bzzoiroText ? "bzzoiro" : null,
          serperText  ? "serper"  : null,
          tavilyText  ? "tavily"  : null,
          // NEWv2: diganti dari "openrouter-nemotron-3-ultra" — kalau ada
          // kode lain (laporan/analytics) yang memfilter berdasarkan nilai
          // string ini, sesuaikan juga di sana. Tidak ditemukan pemakaian
          // lain di codebase saat perubahan ini dibuat.
          validation.aiUsed ? "openrouter-nemotron-3-super" : null,
        ].filter(Boolean).join(","),
      })
      .select("id")
      .single()

    if (dbError) {
      console.error("❌ Supabase insert error:", dbError)
      sourceWarnings.push(
        `Brief berhasil dibuat, tapi GAGAL disimpan ke database (${dbError.message}). ` +
        `Tombol "Generate Draft" tidak akan berfungsi sampai masalah ini diperbaiki — ` +
        `cek skema tabel "article_generations" di Supabase. ` +
        `Jika kolom "brief_ai_used"/"brief_ai_report" belum ada, tambahkan dulu (lihat catatan di bawah route ini).`
      )
    }

    return NextResponse.json({
      success: true,
      generationId: generation?.id ?? null,
      brief,
      aiValidation: validation,
      sourceWarnings: sourceWarnings.length > 0 ? sourceWarnings : undefined,
      tokenEstimate: brief.meta.tokenEstimate,
    })

  } catch (err) {
    console.error("❌ generate-brief error:", err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Terjadi error tidak diketahui",
    }, { status: 500 })
  }
}

// ── CATATAN MIGRASI SUPABASE ────────────────────────────────────────────────
// Route ini menulis 2 kolom baru ke tabel "article_generations":
//   - brief_ai_used   boolean
//   - brief_ai_report jsonb
// Jika kolom ini belum ada, tambahkan via SQL:
//
//   alter table article_generations
//     add column if not exists brief_ai_used boolean default false,
//     add column if not exists brief_ai_report jsonb;
//
// ── CATATAN PIPELINE ────────────────────────────────────────────────────────
// Generate-brief ini adalah STEP 1-3 dari pipeline lengkap HalfSpace per PDF:
//   1. Bzzoiro + Serper + Tavily → raw data
//   2. buildEditorialBrief() → brief deterministik
//   3. Nemotron 3 Super → editorial suggestion (best-effort)
//   4. Validator → merge + grounding check
//   5. Simpan ke Supabase (status: brief_ready)
// STEP berikutnya (/api/generate-draft) mengirim brief ini ke Gemma 4 31B
// untuk generate artikel final. (Per PDF, disesuaikan: "Pipeline: Bzzoiro +
// Serper + Tavily → Nemotron 3 Super Brief → Gemma 4 31B" — model Editor
// Brief diganti dari Nemotron 3 Ultra ke Super, lihat catatan di header file.)
