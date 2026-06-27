// lib/ai/groq-rewrite-prompt.ts — BARU
//
// Dipakai oleh app/api/rewrite-selection/route.ts — pengganti langkah
// "Polish dengan Editor" lama di Generation Panel. Sekarang editing dilakukan
// per-paragraf, langsung di TipTap, lewat teks yang di-highlight user.

export interface RewriteOptions {
  selectedText: string
  instruction?: string
  articleContext?: string // opsional: judul / paragraf sekitar, untuk konsistensi gaya & fakta
}

export function buildRewriteSystem(): string {
  return `Kamu adalah editor naskah sepak bola berbahasa Indonesia bergaya The Athletic — analitis, netral, tanpa clickbait, variasi panjang kalimat yang enak dibaca.

ATURAN MUTLAK:
1. Tulis ulang HANYA teks yang diberikan user di "TEKS YANG DI-HIGHLIGHT". Jangan menambah paragraf baru, jangan menulis komentar, jangan menambah heading.
2. DILARANG mengubah atau menambah fakta apapun — nama, skor, tanggal, statistik, kutipan. Hanya ubah cara penyampaiannya (gaya, ritme kalimat, ketajaman).
3. Panjang hasil harus sebanding dengan teks asli (boleh ±20%), kecuali instruksi user secara eksplisit minta diperpanjang/dipersingkat.
4. Output HANYA teks hasil tulis ulang dalam HTML sederhana (gunakan <p> per paragraf, <blockquote> jika ada kutipan langsung). JANGAN gunakan tag lain. JANGAN bungkus dengan markdown code fence. JANGAN tambahkan penjelasan di luar HTML.`
}

export function buildRewriteUser({ selectedText, instruction, articleContext }: RewriteOptions): string {
  return `${articleContext ? `KONTEKS ARTIKEL (untuk menjaga konsistensi gaya & fakta, JANGAN ditulis ulang):\n${articleContext}\n\n` : ""}TEKS YANG DI-HIGHLIGHT (tulis ulang ini saja):
${selectedText}

INSTRUKSI: ${instruction?.trim() || "Tulis ulang agar lebih tajam, mengalir, dan menarik — tetap dengan fakta yang sama persis."}

Kembalikan HANYA HTML hasil tulis ulang.`
}

// Sanitasi ringan output: buang code fence atau teks pembuka yang kadang
// tetap disisipkan model meski sudah dilarang di system prompt.
export function extractRewriteHtml(raw: string): string {
  let text = raw.trim()

  const block = text.match(/```(?:html)?\s*([\s\S]+?)```/)
  if (block) text = block[1].trim()

  // Jika model tetap menambahkan kalimat pembuka sebelum tag HTML pertama,
  // potong sampai tag pertama.
  const firstTagIdx = text.search(/<(p|blockquote|h[1-3])[ >]/i)
  if (firstTagIdx > 0) text = text.slice(firstTagIdx)

  if (!text) throw new Error("Groq tidak mengembalikan hasil tulis ulang yang valid.")
  return text
}
