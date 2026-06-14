import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/supabase/server-auth"

// ─── Model list yang tersedia via OpenRouter ───────────────────────────────────
// Tambah / hapus sesuai kebutuhan. id = model string OpenRouter.
export const OPENROUTER_MODELS = [
  { id: "anthropic/claude-sonnet-4-5",        label: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-3-5-haiku",         label: "Claude Haiku 3.5" },
  { id: "google/gemini-2.0-flash-001",        label: "Gemini 2.0 Flash" },
  { id: "google/gemini-2.5-pro",              label: "Gemini 2.5 Pro" },
  { id: "openai/gpt-4o-mini",                 label: "GPT-4o Mini" },
  { id: "openai/gpt-4o",                      label: "GPT-4o" },
  { id: "meta-llama/llama-3.3-70b-instruct",  label: "Llama 3.3 70B" },
  { id: "mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1" },
  { id: "deepseek/deepseek-chat-v3-0324",     label: "DeepSeek V3" },
] as const

interface GenerateCaptionsRequest {
  title: string
  excerpt: string
  model?: string
}

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────
  const user = await requireAdmin()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { title, excerpt, model }: GenerateCaptionsRequest = await request.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: "Judul artikel wajib diisi" }, { status: 400 })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY belum dikonfigurasi di environment variables." },
        { status: 500 }
      )
    }

    // Default ke model pertama jika tidak dipilih
    const selectedModel = model || OPENROUTER_MODELS[0].id

    const prompt = `Kamu adalah copywriter media sosial profesional untuk portal berita olahraga HalfSpace.id yang berfokus pada sepak bola.

Berdasarkan artikel berikut, buat caption untuk 5 platform sekaligus:

JUDUL: ${title}
EXCERPT: ${excerpt || "(tidak ada excerpt)"}

Buat caption yang:
- Natural, engaging, dan sesuai karakter masing-masing platform
- Gunakan bahasa Indonesia yang kasual tapi profesional
- Sertakan emoji yang relevan
- Sertakan hashtag yang tepat di akhir (sesuai platform)
- Jangan sertakan link artikel (akan ditambahkan manual)

ATURAN PER PLATFORM:
- Instagram: Max 2200 karakter, storytelling, 15-20 hashtag di bagian akhir dengan #
- TikTok: Max 2200 karakter, casual, pakai kata "guys" / "sob", 5-10 hashtag ringan
- X (Twitter): MAKSIMAL 240 karakter (penting!), langsung ke poin, pakai 1-2 hashtag saja
- Facebook: Panjang boleh, tone informatif, sertakan sedikit context untuk audiens dewasa
- Threads: Max 500 karakter, casual, lebih personal, 2-5 hashtag

Jawab HANYA dalam format JSON seperti ini, tanpa teks lain apapun, tanpa markdown backtick:
{
  "instagram": "...",
  "tiktok": "...",
  "x": "...",
  "facebook": "...",
  "threads": "..."
}`

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://halfspace.id",
        "X-Title": "HalfSpace CMS",
      },
      body: JSON.stringify({
        model: selectedModel,
        temperature: 0.8,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error("[generate-social-captions] OpenRouter error:", res.status, errText)

      if (res.status === 401) {
        return NextResponse.json(
          { error: "OPENROUTER_API_KEY tidak valid. Cek konfigurasi .env.local." },
          { status: 401 }
        )
      }
      if (res.status === 429) {
        return NextResponse.json(
          { error: "Rate limit OpenRouter tercapai. Tunggu beberapa detik lalu coba lagi." },
          { status: 429 }
        )
      }

      return NextResponse.json(
        { error: `OpenRouter error ${res.status}. Coba lagi.` },
        { status: 500 }
      )
    }

    const data = await res.json()
    const rawText: string = data.choices?.[0]?.message?.content ?? ""

    // Strip JSON fences jika model menambahkan ```json ... ```
    const cleanJson = rawText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim()

    const captions = JSON.parse(cleanJson)

    // Pastikan semua platform ada
    const requiredKeys = ["instagram", "tiktok", "x", "facebook", "threads"]
    for (const key of requiredKeys) {
      if (!captions[key]) captions[key] = ""
    }

    return NextResponse.json(captions)
  } catch (error) {
    console.error("[generate-social-captions]", error)
    return NextResponse.json(
      { error: "Gagal generate caption. Coba lagi." },
      { status: 500 }
    )
  }
}
