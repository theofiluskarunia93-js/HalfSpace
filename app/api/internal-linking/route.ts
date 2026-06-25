// app/api/internal-linking/route.ts
//
// Internal Link Building — versi RETROAKTIF dengan semantic scoring.
// Dipicu manual dari Posts view (admin) untuk menyisipkan/menyegarkan internal
// link pada artikel yang SUDAH publish. Untuk artikel BARU, proses ini sudah
// berjalan otomatis sendiri di create-article-view.tsx saat disimpan — route
// ini khusus untuk "menyusulkan" link ke konten lama yang sudah ada di DB.
//
// Body request (semua opsional):
//   { "articleId": "uuid" }  → proses HANYA artikel ini
//   {}                       → proses SEMUA artikel published (bulk run)

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import { applyInternalLinks, type LinkCandidate, type SourceArticleContext } from "@/lib/internal-linking"
import { embedArticleTextsBatch } from "@/lib/gemini-embeddings"

export const maxDuration = 60

// Berapa banyak artikel TANPA embedding yang di-backfill per request.
// Dibatasi supaya tidak timeout (maxDuration 60s) atau membengkak biaya kalau
// dijalankan bulk untuk ratusan artikel sekaligus. Kalau masih ada sisa,
// jalankan tombol "proses ulang" beberapa kali — sisanya akan terus dicicil.
const MAX_EMBED_PER_RUN = 40

// Supabase men-generate tipe nested relation "tags(name)" sebagai ARRAY
// ({ name }[]), bukan objek tunggal — meski secara relasi di DB sebenarnya
// satu article_tag hanya merujuk ke satu tag. Tipe di bawah menerima KEDUA
// kemungkinan bentuk supaya cast `as ArticleRow[]` tidak ditolak compiler,
// dan toCandidate() menangani keduanya secara defensif di runtime.
interface ArticleRow {
  id: string
  slug: string
  title: string
  content: string
  category_id?: string | null
  embedding?: number[] | null
  article_tags?: { tags: { name: string } | { name: string }[] | null }[] | null
}

function toCandidate(row: ArticleRow): LinkCandidate {
  const tagNames: string[] = []
  for (const at of row.article_tags ?? []) {
    const t = at?.tags
    if (!t) continue
    if (Array.isArray(t)) {
      for (const tt of t) if (tt?.name) tagNames.push(tt.name)
    } else if (t.name) {
      tagNames.push(t.name)
    }
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categoryId: row.category_id ?? undefined,
    embedding: row.embedding ?? null,
    tags: tagNames,
  }
}

function toSourceContext(row: ArticleRow): SourceArticleContext {
  return {
    categoryId: row.category_id ?? null,
    tags: toCandidate(row).tags,
    embedding: row.embedding ?? null,
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let articleId: string | undefined
  try {
    const body = await req.json()
    articleId = body?.articleId
  } catch {
    // body kosong/tidak ada → bulk run untuk semua artikel published, ini valid.
  }

  const supabase = await createClient()

  // Ambil semua artikel published — dipakai SEKALIGUS sebagai (a) daftar target
  // yang akan diproses, dan (b) daftar kandidat sumber link satu sama lain.
  // category_id ditambahkan agar semantic scoring bisa membandingkan kategori.
  const { data, error } = await supabase
    .from("articles")
    .select("id, slug, title, content, category_id, embedding, article_tags(tags(name))")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(300)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as ArticleRow[]
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, updated: 0, results: [] })
  }

  // ── Backfill embedding semantik untuk artikel yang belum punya ───────────
  // Artikel lama (dibuat sebelum fitur semantic linking ada) belum punya
  // kolom `embedding`. Di-generate sekarang secara batch (1 HTTP call untuk
  // banyak artikel) supaya hemat round-trip, lalu langsung disimpan ke DB
  // agar run berikutnya tidak perlu generate ulang.
  const apiKey = process.env.GEMINI_API_KEY
  let embeddedCount = 0
  if (apiKey) {
    const missing = rows.filter((r) => !r.embedding || r.embedding.length === 0).slice(0, MAX_EMBED_PER_RUN)
    if (missing.length > 0) {
      try {
        const embeddings = await embedArticleTextsBatch(
          apiKey,
          missing.map((r) => ({ title: r.title, bodyText: r.content }))
        )
        for (let i = 0; i < missing.length; i++) {
          const vec = embeddings[i]
          if (!vec || vec.length === 0) continue
          missing[i].embedding = vec // langsung mutasi object di `rows` (referensi sama)
          embeddedCount++
          const { error: embedUpdateError } = await supabase
            .from("articles")
            .update({ embedding: vec })
            .eq("id", missing[i].id)
          if (embedUpdateError) {
            console.error("[internal-linking] Gagal simpan embedding:", missing[i].id, embedUpdateError.message)
          }
        }
      } catch (e) {
        console.error("[internal-linking] Gagal backfill embedding, lanjut tanpa semantic scoring untuk artikel ini:", e)
      }
    }
  }

  const candidates = rows.map(toCandidate)
  const targets = articleId ? rows.filter((r) => r.id === articleId) : rows

  if (articleId && targets.length === 0) {
    return NextResponse.json({ error: "Artikel tidak ditemukan atau belum publish." }, { status: 404 })
  }

  const results: { id: string; title: string; linkedSlugs: string[]; updated: boolean }[] = []
  let updatedCount = 0

  for (const row of targets) {
    // Kirim sourceContext agar kandidat diurutkan berdasarkan relevansi topik
    // artikel ini (kategori + tag yang sama mendapat prioritas lebih tinggi).
    const sourceContext = toSourceContext(row)
    const { html, linkedSlugs } = applyInternalLinks(row.content, row.id, candidates, {}, sourceContext)

    // Hanya tulis ke DB kalau memang ada perubahan — hindari update sia-sia
    // yang cuma menyentuh updated_at tanpa perubahan konten nyata.
    const changed = html !== row.content
    if (changed) {
      const { error: updateError } = await supabase
        .from("articles")
        .update({ content: html, updated_at: new Date().toISOString() })
        .eq("id", row.id)

      if (updateError) {
        results.push({ id: row.id, title: row.title, linkedSlugs, updated: false })
        continue
      }
      updatedCount++
    }

    results.push({ id: row.id, title: row.title, linkedSlugs, updated: changed })
  }

  return NextResponse.json({
    processed: targets.length,
    updated: updatedCount,
    embeddedCount,
    results,
  })
}
