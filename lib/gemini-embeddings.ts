// lib/gemini-embeddings.ts
//
// Helper untuk generate semantic embedding artikel via Gemini Embedding API
// (model: gemini-embedding-001) — dipakai untuk Internal Link Building
// semantic (lib/internal-linking.ts).
//
// PENTING: modul ini berisi panggilan ke Gemini API memakai GEMINI_API_KEY,
// jadi HANYA boleh dipakai dari kode server (API route / server component).
// Jangan pernah import + panggil fungsi-fungsi fetch di sini langsung dari
// komponen "use client" — apiKey dikirim sebagai parameter justru supaya
// tidak ada satu pun env var yang ke-bundle ke browser.

const EMBEDDING_MODEL = "gemini-embedding-001"

// Dimensi output dikecilkan dari default 3072 ke 768 — cukup akurat untuk
// cosine similarity antar artikel sepak bola, tapi jauh lebih ringkas untuk
// disimpan di kolom `articles.embedding` (jsonb).
const OUTPUT_DIMENSIONALITY = 768

// Potong teks supaya hemat token & tetap representatif (judul + beberapa
// paragraf awal sudah cukup mewakili topik artikel untuk keperluan similarity).
const MAX_INPUT_CHARS = 6000

export class GeminiEmbeddingError extends Error {}

function sanitizeForEmbedding(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INPUT_CHARS)
}

/**
 * Generate 1 embedding vector dari judul + isi (plain text) sebuah artikel.
 *
 * task_type "SEMANTIC_SIMILARITY" dipakai karena kebutuhan kita simetris:
 * "seberapa mirip makna artikel A dengan artikel B" — bukan query→dokumen
 * seperti pencarian (yang biasanya pakai RETRIEVAL_QUERY/RETRIEVAL_DOCUMENT).
 */
export async function embedArticleText(
  apiKey: string,
  title: string,
  bodyText: string
): Promise<number[]> {
  const text = sanitizeForEmbedding(`${title}\n\n${bodyText}`)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: OUTPUT_DIMENSIONALITY,
      }),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    if (res.status === 429) throw new GeminiEmbeddingError("Gemini embedding rate limit tercapai. Coba lagi sebentar.")
    if (res.status === 401 || res.status === 403) throw new GeminiEmbeddingError("GEMINI_API_KEY tidak valid untuk Gemini Embedding API.")
    throw new GeminiEmbeddingError(`Gemini embedding error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } }
  const values = data.embedding?.values
  if (!values || values.length === 0) {
    throw new GeminiEmbeddingError("Gemini tidak mengembalikan embedding values.")
  }
  return values
}

/**
 * Versi batch — embed beberapa artikel sekaligus dalam 1 HTTP call.
 * Dipakai di proses retroaktif (banyak artikel lama belum punya embedding)
 * agar tidak perlu ratusan round-trip satu per satu.
 */
export async function embedArticleTextsBatch(
  apiKey: string,
  items: { title: string; bodyText: string }[]
): Promise<number[][]> {
  if (items.length === 0) return []

  const requests = items.map((it) => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text: sanitizeForEmbedding(`${it.title}\n\n${it.bodyText}`) }] },
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: OUTPUT_DIMENSIONALITY,
  }))

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new GeminiEmbeddingError(`Gemini batch embedding error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = (await res.json()) as { embeddings?: { values?: number[] }[] }
  return (data.embeddings ?? []).map((e) => e.values ?? [])
}

/**
 * Cosine similarity antara 2 vector embedding. Hasil di-clamp ke rentang 0..1
 * (cosine asli bisa negatif untuk vektor yang berlawanan arah makna, kita
 * anggap itu = 0 relevansi, bukan "relevansi negatif").
 */
export function cosineSimilarity(
  a: number[] | null | undefined,
  b: number[] | null | undefined
): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0

  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  return Math.max(0, Math.min(1, sim))
}
