// app/api/internal-linking/embed-source/route.ts
//
// Generate embedding semantik (Gemini Embedding API) untuk artikel yang
// SEDANG ditulis/disimpan di admin (components/admin/views/create-article-view.tsx).
//
// Endpoint ini dipisah sendiri karena create-article-view.tsx adalah
// komponen "use client" — GEMINI_API_KEY tidak boleh dipanggil langsung dari
// browser, jadi proses embed-nya harus lewat server route ini.
//
// Best-effort: kalau gagal (rate limit, key belum diset, dll), tetap balas
// 200 dengan embedding: null supaya proses simpan artikel di client TIDAK
// ikut gagal cuma karena semantic scoring-nya error — sama seperti pola
// "fail silent" yang sudah dipakai internal-linking sebelumnya.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { embedArticleText } from "@/lib/gemini-embeddings"

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ embedding: null, error: "GEMINI_API_KEY belum dikonfigurasi." }, { status: 200 })
  }

  let body: { title?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title wajib diisi." }, { status: 400 })
  }

  try {
    const embedding = await embedArticleText(apiKey, body.title.trim(), body.text ?? "")
    return NextResponse.json({ embedding })
  } catch (error) {
    console.error("[internal-linking/embed-source]", error)
    const message = error instanceof Error ? error.message : "Gagal generate embedding."
    return NextResponse.json({ embedding: null, error: message }, { status: 200 })
  }
}
