// app/api/generate-brief/route.ts
//
// STEP 1: Menerima newsType + topic, fetch data paralel dari semua sumber,
// jalankan Brief Generator (tanpa AI), simpan ke Supabase, return brief JSON.
//
// Tidak ada streaming di sini — brief generation adalah operasi sinkron cepat
// karena tidak ada AI yang terlibat. Response langsung JSON.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Bzzoiro fetchers (import dari file yang sudah ada)
import {
  fetchHasilContext,
  fetchPreviewContext,
  fetchCederaContext,
  fetchTransferContext,
  fetchKonpersContext,
} from "@/lib/news-context/bzzoiro"

// Serper & Tavily fetchers (import dari file yang sudah ada)
import { fetchSerperContext } from "@/lib/news-context/serper"
import { fetchTavilyContext } from "@/lib/news-context/tavily"

// Brief builder (baru)
import { buildEditorialBrief } from "@/lib/editorial/brief-builder"

import type { NewsType } from "@/lib/editorial/types"

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

    // ── Fetch semua sumber secara paralel ────────────────────────────────────
    const [bzzoiroResult, serperResult, tavilyResult] = await Promise.allSettled([
      BZZOIRO_FETCHERS[newsType](topic),
      fetchSerperContext(newsType as any, topic),
      fetchTavilyContext(newsType as any, topic),
    ])

    // Ambil contextText, fallback ke string kosong jika gagal
    const bzzoiroText = bzzoiroResult.status === "fulfilled"
      ? (bzzoiroResult.value.contextText ?? "")
      : ""
    const serperText  = serperResult.status === "fulfilled"
      ? (serperResult.value.contextText ?? "")
      : ""
    const tavilyText  = tavilyResult.status === "fulfilled"
      ? (tavilyResult.value.contextText ?? "")
      : ""

    // Catat warning dari sumber yang gagal (untuk log, bukan blocking)
    const sourceWarnings: string[] = []
    if (bzzoiroResult.status === "rejected") sourceWarnings.push(`Bzzoiro: ${bzzoiroResult.reason}`)
    if (serperResult.status === "rejected")  sourceWarnings.push(`Serper: ${serperResult.reason}`)
    if (tavilyResult.status === "rejected")  sourceWarnings.push(`Tavily: ${tavilyResult.reason}`)

    // Jika semua sumber gagal dan trivia tanpa manualContext → tolak
    if (!bzzoiroText && !serperText && !tavilyText && !manualContext) {
      return NextResponse.json({
        error: "Semua sumber data gagal diambil. Cek API key atau coba lagi.",
        sourceWarnings,
      }, { status: 503 })
    }

    // ── Build Editorial Brief (pure TypeScript, no AI) ────────────────────
    const brief = await buildEditorialBrief({
      newsType,
      topic,
      bzzoiroText,
      serperText,
      tavilyText,
      manualContext,
    })

    // ── Simpan ke Supabase ────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: generation, error: dbError } = await supabase
      .from("article_generations")
      .insert({
        news_type:        newsType,
        topic,
        editorial_brief:  brief,
        angle_selected:   brief.angle.primary,
        brief_token_est:  brief.meta.tokenEstimate,
        status:           "brief_ready",
        source_used:      [
          bzzoiroText ? "bzzoiro" : null,
          serperText  ? "serper"  : null,
          tavilyText  ? "tavily"  : null,
        ].filter(Boolean).join(","),
      })
      .select("id")
      .single()

    if (dbError) {
      console.error("❌ Supabase insert error:", dbError)
      // Jangan gagalkan request karena DB error — brief tetap dikembalikan
    }

    return NextResponse.json({
      success: true,
      generationId: generation?.id ?? null,
      brief,
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
