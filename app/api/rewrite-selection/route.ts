// app/api/rewrite-selection/route.ts — BARU
//
// Menggantikan /api/polish-article (dihapus). Dulu "Polish dengan Editor"
// memoles SELURUH draft lewat tombol di Generation Panel. Sekarang user
// highlight SATU paragraf langsung di TipTap, popup "Tulis Ulang dengan AI"
// muncul, dan hanya bagian yang di-highlight itu yang dikirim ke Groq
// GPT-OSS-120B untuk ditulis ulang — editor jadi AI-native.
//
// Tidak perlu SSE — input/output kecil (1 paragraf), jadi cukup request/
// response JSON biasa, lebih sederhana dan lebih cepat dirasakan user.

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"
import Groq from "groq-sdk"
import {
  buildRewriteSystem,
  buildRewriteUser,
  extractRewriteHtml,
} from "@/lib/ai/groq-rewrite-prompt"

export const GROQ_REWRITE_MODEL = "openai/gpt-oss-120b" as const

interface RewriteRequestBody {
  selectedText: string
  instruction?: string
  articleContext?: string
}

function classifyGroqError(err: unknown): { message: string; isRateLimit: boolean } {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  const isRateLimit =
    lower.includes("rate_limit") || lower.includes("rate limit") ||
    lower.includes("too large") || lower.includes("tokens per minute") ||
    lower.includes("tpm") || (err as any)?.status === 429

  if (isRateLimit) {
    return {
      isRateLimit: true,
      message: `Request ke GPT OSS 120B (Groq) melebihi limit token tier akun kamu. Cek limit di console.groq.com → Settings → Limits. Detail asli: ${raw}`,
    }
  }
  return { isRateLimit: false, message: raw }
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    return NextResponse.json({ error: "GROQ_API_KEY belum dikonfigurasi di environment variables." }, { status: 500 })
  }

  let body: RewriteRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body tidak valid." }, { status: 400 })
  }

  const selectedText = body.selectedText?.trim()
  if (!selectedText) {
    return NextResponse.json({ error: "selectedText wajib diisi (teks yang di-highlight di editor)." }, { status: 400 })
  }
  if (selectedText.length > 6000) {
    return NextResponse.json({ error: "Teks yang di-highlight terlalu panjang (maks ~6000 karakter). Highlight per-paragraf saja." }, { status: 400 })
  }

  try {
    const groq = new Groq({ apiKey: groqKey })

    // max_tokens proporsional ke panjang seleksi — popup ini untuk 1 paragraf,
    // bukan artikel penuh, jadi tidak perlu ceiling besar seperti polish-article dulu.
    const estInputTokens = Math.ceil(selectedText.length / 4)
    const maxTokens = Math.min(1500, Math.max(300, Math.ceil(estInputTokens * 1.6) + 150))

    const completion = await groq.chat.completions.create({
      model: GROQ_REWRITE_MODEL,
      messages: [
        { role: "system", content: buildRewriteSystem() },
        { role: "user", content: buildRewriteUser({
            selectedText,
            instruction: body.instruction,
            articleContext: body.articleContext,
          }),
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.5,
    })

    const raw = completion.choices[0]?.message?.content ?? ""
    if (!raw.trim()) throw new Error("GPT OSS 120B tidak mengembalikan response.")

    const rewrittenHtml = extractRewriteHtml(raw)

    return NextResponse.json({
      success: true,
      original: selectedText,
      rewritten: rewrittenHtml,
      modelUsed: GROQ_REWRITE_MODEL,
    })

  } catch (err) {
    console.error("❌ rewrite-selection error:", err)
    const { message, isRateLimit } = classifyGroqError(err)
    return NextResponse.json({
      error: message,
      isRateLimit,
      hint: isRateLimit ? "Tunggu beberapa menit lalu coba lagi." : undefined,
    }, { status: 500 })
  }
}
