// app/api/generate-brief/route.ts — v4 (PIPELINE BARU — Juli 2026)
//
// ━━━ PIPELINE ━━━
//
//   API data Bzzoiro + Serper + Tavily (RAW DATA)
//   ├── Bzzoiro: data struktural per tipe artikel (TIDAK diproses pipeline
//   │   pembersihan di bawah — lihat catatan scope di raw-data-pipeline.ts)
//   ├── Serper: berita & SEO real-time (kutipan, highlights, transfer status)
//   └── Tavily: konteks naratif mendalam (historis, taktis, analisis)
//     |
//   Normalizer — hilangkan HTML/iklan/footer/navigasi/copyright/author-bio/
//   kalimat pembuka boilerplate (lib/editorial/raw-data-pipeline.ts)
//     |
//   Exact Deduplication — hapus paragraf/kalimat/judul/metadata identik
//     |
//   Semantic Deduplication — hapus kalimat yang maknanya sama walau beda kata
//     |
//   Fact Merging — gabungkan fakta seluruh sumber, tegakkan target token
//   RAW DATA bersih 1.000–2.000 token
//     |
//   buildEditorialBrief() — ekstraksi fakta deterministik, TANPA AI
//   (lib/editorial/brief-builder.ts — satu-satunya sumber kebenaran untuk
//    mustUse/canUse/doNotUse/SEO/qualityGate/structureHints)
//     |
//   Editor Brief — GPT-5 Mini (AI)
//   (lib/ai/gpt5-mini-brief-editor.ts — hanya memutuskan angle/judul/lead/
//    narasi, WAJIB hanya berdasarkan fakta dari brief deterministik; untuk
//    preview/hasil hanya boleh mempertajam "focus" per section H2 BAKU)
//     |
//   Validator Editor (Next.js, pure TypeScript)
//   (lib/editorial/brief-validator.ts — tolak field AI yang tidak grounded)
//     |
//   Simpan ke Supabase → return EditorialBrief final ke CMS
//     |
//   (lanjut ke: /api/generate-draft → Claude Sonnet)
//
// CATATAN: jika OPENAI_API_KEY tidak ada, atau OpenAI gagal/timeout,
// pipeline TETAP jalan normal memakai brief rule-based saja (best-effort AI).
//
// BARU: kalau seluruh pipeline di atas gagal total (semua sumber RAW DATA
// gagal diambil), route ini sekarang mencoba mengembalikan brief yang SUDAH
// PERNAH berhasil dibuat untuk topik+tipe yang sama sebelum menyerah — lihat
// blok "FALLBACK: brief existing" di bawah — supaya pengguna tidak perlu
// mengulang riset dari nol untuk topik yang sama.

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

// BARU: Normalizer + Exact Dedup + Semantic Dedup + Fact Merging
import { processRawData } from "@/lib/editorial/raw-data-pipeline"

// Brief builder rule-based (tidak berubah)
import { buildEditorialBrief, parseKonpersMatch } from "@/lib/editorial/brief-builder"

// ── Editor Brief AI (GPT-5 Mini) + Validator ────────────────────────────────
import { callBriefEditor } from "@/lib/ai/gpt5-mini-brief-editor"
import { validateAndMergeAiBrief } from "@/lib/editorial/brief-validator"

import type { NewsType } from "@/lib/editorial/types"

// maxDuration 300 detik (maksimum yang diizinkan Vercel Hobby plan). Per
// dokumentasi Vercel terbaru (Mei 2026, sejak Fluid Compute jadi default),
// Hobby plan mengizinkan maxDuration sampai 300 detik (5 menit).
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
  const supabase = await createClient()
  // Disimpan di scope luar try supaya bisa dipakai lagi di catch block untuk
  // fallback "brief existing" — body Request hanya bisa dibaca SEKALI, jadi
  // req.clone() di catch TIDAK akan bekerja setelah req.json() dipanggil di
  // try (stream sudah kepakai). Simpan hasil parse di sini sekali saja.
  let parsedBody: { newsType?: NewsType; topic?: string; manualContext?: string } | null = null

  try {
    const body = await req.json()
    parsedBody = body
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

    const rawBzzoiroText = bzzoiroResult.status === "fulfilled" ? (bzzoiroResult.value.contextText ?? "") : ""
    const rawSerperText  = serperResult.status === "fulfilled"  ? (serperResult.value.contextText ?? "")  : ""
    const rawTavilyText  = tavilyResult.status === "fulfilled"  ? (tavilyResult.value.contextText ?? "")  : ""

    const sourceWarnings: string[] = []
    if (bzzoiroResult.status === "rejected") sourceWarnings.push(`Bzzoiro: ${bzzoiroResult.reason}`)
    if (serperResult.status === "rejected")  sourceWarnings.push(`Serper: ${serperResult.reason}`)
    if (tavilyResult.status === "rejected")  sourceWarnings.push(`Tavily: ${tavilyResult.reason}`)

    if (!rawBzzoiroText && !rawSerperText && !rawTavilyText && !manualContext) {
      // BARU: FALLBACK — brief existing. Sebelum menyerah total, cek apakah
      // topik+tipe yang sama pernah berhasil di-brief sebelumnya. Kalau ada,
      // kembalikan itu (dengan warning eksplisit bahwa ini bukan hasil baru)
      // daripada memaksa pengguna mengulang riset dari nol untuk topik yang
      // persis sama — semua sumber RAW DATA gagal biasanya berarti masalah
      // sementara (rate limit/API down), bukan berarti brief lama sudah tidak
      // relevan.
      const { data: existingBrief } = await supabase
        .from("article_generations")
        .select("id, editorial_brief, brief_token_est")
        .eq("news_type", newsType)
        .eq("topic", topic)
        .not("editorial_brief", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingBrief?.editorial_brief) {
        return NextResponse.json({
          success: true,
          generationId: existingBrief.id,
          brief: existingBrief.editorial_brief,
          reusedExisting: true,
          sourceWarnings: [
            ...sourceWarnings,
            "Semua sumber RAW DATA gagal diambil untuk percobaan ini — menampilkan brief existing yang sudah pernah berhasil dibuat untuk topik & tipe yang sama, bukan hasil generate baru.",
          ],
          tokenEstimate: existingBrief.brief_token_est ?? undefined,
        })
      }

      return NextResponse.json({
        error: "Semua sumber data gagal diambil. Cek API key atau coba lagi.",
        sourceWarnings,
      }, { status: 503 })
    }

    // ── 2. Normalizer → Exact Dedup → Semantic Dedup → Fact Merging ──────────
    // Membersihkan RAW DATA (Serper & Tavily) SEBELUM masuk ke brief builder —
    // lihat lib/editorial/raw-data-pipeline.ts untuk detail tiap tahap.
    // bzzoiroText TIDAK disentuh (data struktural, bukan teks media mentah).
    const cleaned = processRawData({
      bzzoiroText: rawBzzoiroText,
      serperText:  rawSerperText,
      tavilyText:  rawTavilyText,
      manualContext,
    })
    const { bzzoiroText, serperText, tavilyText } = cleaned

    // ── 3. Brief deterministik (fakta grounded, TANPA AI) ─────────────────────
    const deterministicBrief = await buildEditorialBrief({
      newsType,
      topic,
      bzzoiroText,
      serperText,
      tavilyText,
      manualContext,
    })

    // ── 4. GPT-5 Mini — Editor Brief (AI, best-effort) ────────────────────────
    const { suggestion: aiSuggestion, failureReason: aiFailureReason } = await callBriefEditor(newsType, topic, deterministicBrief)

    // ── 5. Validator Editor (Next.js, pure TS) — gabung + tolak yang tidak grounded
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
        `GPT-5 Mini tidak terpakai untuk brief ini — ${aiFailureReason ?? "alasan tidak diketahui"}. ` +
        `Brief memakai rule-based sepenuhnya (artikel tetap bisa lanjut digenerate normal).`
      )
    }

    // Catatan RAW DATA pipeline (Normalizer/Dedup/Fact Merging) — informasional,
    // supaya bisa diaudit dari respons API tanpa perlu buka log server.
    sourceWarnings.push(
      `RAW data pipeline: ${cleaned.report.normalizer.linesRemovedSerper + cleaned.report.normalizer.linesRemovedTavily} baris junk dibuang (Normalizer), ` +
      `${cleaned.report.exactDeduplication.duplicateParagraphsRemoved} paragraf + ${cleaned.report.exactDeduplication.duplicateSentencesRemoved} kalimat + ${cleaned.report.exactDeduplication.duplicateTitlesRemoved} judul duplikat dibuang (Exact Dedup), ` +
      `${cleaned.report.semanticDeduplication.nearDuplicateSentencesRemoved} kalimat bermakna sama dibuang (Semantic Dedup). ` +
      cleaned.report.factMerging.note
    )

    // ── 6. Simpan ke Supabase ────────────────────────────────────────────────
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
        // source_used: Bzzoiro + Serper + Tavily (dibersihkan lewat
        // raw-data-pipeline.ts) → GPT-5 Mini
        source_used:      [
          bzzoiroText ? "bzzoiro" : null,
          serperText  ? "serper"  : null,
          tavilyText  ? "tavily"  : null,
          // Diganti dari "openrouter-nemotron-3-super" — kalau ada kode lain
          // (laporan/analytics) yang memfilter berdasarkan nilai string ini,
          // sesuaikan juga di sana. Tidak ditemukan pemakaian lain di
          // codebase saat perubahan ini dibuat.
          validation.aiUsed ? "gpt-5-mini" : null,
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
      rawDataPipelineReport: cleaned.report,
      sourceWarnings: sourceWarnings.length > 0 ? sourceWarnings : undefined,
      tokenEstimate: brief.meta.tokenEstimate,
    })

  } catch (err) {
    console.error("❌ generate-brief error:", err)

    // BARU: FALLBACK — kalau error terjadi di tengah pipeline (bukan cuma
    // saat fetch RAW DATA di awal, tapi mis. GPT-5 Mini/Validator/Supabase
    // melempar exception tak terduga), tetap coba tawarkan brief existing
    // untuk topik+tipe yang sama sebelum benar-benar mengembalikan error ke CMS.
    try {
      const newsType = parsedBody?.newsType
      const topic = parsedBody?.topic
      if (newsType && topic) {
        const { data: existingBrief } = await supabase
          .from("article_generations")
          .select("id, editorial_brief, brief_token_est")
          .eq("news_type", newsType)
          .eq("topic", topic)
          .not("editorial_brief", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (existingBrief?.editorial_brief) {
          return NextResponse.json({
            success: true,
            generationId: existingBrief.id,
            brief: existingBrief.editorial_brief,
            reusedExisting: true,
            sourceWarnings: [
              `Generate brief baru gagal (${err instanceof Error ? err.message : String(err)}) — menampilkan brief existing untuk topik & tipe yang sama, bukan hasil generate baru.`,
            ],
            tokenEstimate: existingBrief.brief_token_est ?? undefined,
          })
        }
      }
    } catch (fallbackErr) {
      console.error("❌ generate-brief fallback lookup juga gagal:", fallbackErr)
    }

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
// Fallback "brief existing" (lihat blok FALLBACK di atas) & fallback "draft
// existing" di app/api/generate-draft/route.ts membaca kolom yang SUDAH ada
// sebelumnya (editorial_brief, draft_content, dkk) — tidak perlu kolom baru.
//
// ── CATATAN PIPELINE ────────────────────────────────────────────────────────
// Generate-brief ini adalah pipeline lengkap sampai brief siap dipakai:
//   1. Bzzoiro + Serper + Tavily → raw data
//   2. Normalizer → Exact Dedup → Semantic Dedup → Fact Merging (raw-data-pipeline.ts)
//   3. buildEditorialBrief() → brief deterministik
//   4. GPT-5 Mini → editorial suggestion (best-effort)
//   5. Validator → merge + grounding check
//   6. Simpan ke Supabase (status: brief_ready)
// STEP berikutnya (/api/generate-draft) mengirim brief ini ke Claude Sonnet
// untuk generate artikel final.
