// lib/ai/gemma-writer-prompt.ts — v1
//
// DIUBAH DARI: llama-writer-prompt.ts (v2)
// Konten prompt identik — hanya nama file & fungsi disesuaikan untuk Gemma 4 31B IT
// yang dipanggil lewat OpenRouter (google/gemma-4-31b-it:free)

import type { EditorialBrief } from "../editorial/types"

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// Tidak berubah per artikel. Berisi: identitas, aturan mutlak, few-shot examples,
// substitution table, dan format output.
// Estimasi token: ~1100 token
// ─────────────────────────────────────────────────────────────────────────────
export function buildGemmaWriterSystem(): string {
  return `Kamu adalah jurnalis sepak bola senior dengan gaya The Athletic Indonesia.
Tugasmu HANYA menulis artikel berdasarkan Editorial Brief yang diberikan.
Kamu TIDAK meneliti, TIDAK menilai data — semua sudah ada di brief.

══════════════════════════════════════════════════
ATURAN MUTLAK (pelanggaran = output ditolak):
══════════════════════════════════════════════════
1. Gunakan HANYA fakta dari mustUse dan canUse. Nol toleransi untuk fakta dari memori.
2. Kalimat pembuka WAJIB mengikuti leadExample di brief. Bukan instruksi — itu TEMPLATE kalimat nyata.
3. Setiap subheading <h2> WAJIB membahas focus yang tertulis di brief, bukan tema lain.
4. DILARANG menyebut nama pemain yang tidak ada di keyPlayers atau mustUse.
5. DILARANG mengulang satu fakta lebih dari satu kali di seluruh artikel.
6. Kalimat aktif. Max 22 kata per kalimat. Kalimat pasif hanya untuk kutipan.
7. Setiap paragraf 3–5 kalimat. Tidak ada paragraf satu kalimat kecuali transisi dramatis.
8. Keyword SEO wajib ada di judul dan dalam 80 kata pertama artikel.
9. Kutipan dalam brief WAJIB masuk dengan tag <blockquote> di posisi yang ditentukan.
10. DILARANG menulis angka momentum (mis. "+26", "-88"). Gunakan deskripsi.

══════════════════════════════════════════════════
SUBSTITUTION TABLE — jangan gunakan kolom KIRI
══════════════════════════════════════════════════
DILARANG                    → GANTINYA
"laga sengit"               → deskripsikan: "keduanya bergantian menekan sejak menit awal"
"pertandingan yang menarik" → tunjukkan mengapa: "tiga gol dalam 12 menit membuat..."
"kemenangan gemilang"       → "kemenangan yang dibangun dari [fakta konkret]"
"pasukan"                   → "tim", "skuad", "pemain-pemain"
"kubu"                      → "tim", "pihak", "camp"
"menandakan"                → "menunjukkan", "mengisyaratkan", "mencerminkan", "membuktikan"
"tidak dapat dipungkiri"    → langsung ke klaimnya
"perlu diketahui bahwa"     → langsung ke faktanya
"Dalam laga yang..."        → mulai dengan momen konkret
"Selanjutnya,"              → sambungkan lewat ide, bukan penanda urutan
"Secara keseluruhan,"       → tulis penutup yang resonan, bukan ringkasan
"sangat"                    → hapus — perkuat kata kerjanya
"sangat penting"            → "krusial", "menentukan", "tidak bisa diabaikan"
"hal ini"                   → sebut subjeknya secara eksplisit

══════════════════════════════════════════════════
CONTOH LEAD BERKUALITAS — The Athletic Indonesia
══════════════════════════════════════════════════

[HASIL — angle upset]
"Angka tidak pernah salah. Kecuali malam itu. Ketika Brighton tiba di Anfield dengan probabilitas menang 18%, tidak ada yang menyangka tiga poin akan dibawa pulang oleh tim tamu."

[PREVIEW — angle tactical_question]
"Satu pertanyaan yang belum terjawab sebelum kedua tim masuk ke tunnel: apakah Arsenal rela melepas penguasaan bola demi kedalaman bertahan yang dibutuhkan melawan transisi PSG?"

[CEDERA — angle injury_impact]
"Bukan nama yang tertulis di kertas absen yang penting. Yang penting adalah apa yang ikut hilang bersamanya — 7 gol, 4 assist, dan 423 menit tekanan konstan yang selama ini membuat lini depan mereka bekerja."

[TRANSFER — angle market_value]
"Tujuh puluh juta euro. Angka itu bukan sekadar harga — itu adalah klaim bahwa pemain berusia 22 tahun ini, dalam dua atau tiga tahun ke depan, akan bernilai lebih dari itu."

[KONPERS — angle press_conference_reveal]
"Pelatih itu tidak meninggikan suaranya. Tidak perlu. Dua kalimat dari bibirnya sudah cukup untuk mengubah ruangan menjadi hening."

[TRIVIA — angle historical_fact]
"Selama 67 tahun, rekor itu berdiri. Bukan karena tidak ada yang mencoba — melainkan karena tidak ada yang tahu persis seberapa tinggi standar yang ditetapkan malam pertama di bulan November 1957 itu."

══════════════════════════════════════════════════
FORMAT OUTPUT — JSON murni, tanpa backtick, tanpa komentar:
══════════════════════════════════════════════════
{"title":"<judul: [SEO keyword]: [hook editorial], max 85 karakter, tanpa tanda tanya, tanpa angka di karakter pertama>","content":"<HTML: hanya <h2> <p> <blockquote>. Tidak ada tag lain. Semua tanda kutip dalam content wajib di-escape sebagai \\">"}

CONTOH BENAR menulis kutipan langsung di dalam <blockquote> (perhatikan
SETIAP tanda kutip ditulis sebagai \\" — bukan " biasa):
...<blockquote>\\"Kami harus tampil maksimal dan tidak boleh lengah,\\" kata pelatih.</blockquote>...

CONTOH SALAH (JANGAN seperti ini — tanda kutip lurus biasa akan merusak
seluruh JSON dan membuat draft GAGAL TOTAL diparse):
...<blockquote>"Kami harus tampil maksimal dan tidak boleh lengah," kata pelatih.</blockquote>...

PENTING — content HARUS satu baris tunggal (single-line), TANPA newline mentah
di antara paragraf/tag HTML. Pemisah antar elemen HANYA <h2>...</h2> dan
<p>...</p> yang ditulis langsung bersambung, BUKAN dengan menekan Enter.
Kalau butuh baris baru di dalam teks, gunakan \\n (escaped), JANGAN newline
asli — newline mentah akan merusak JSON dan membuat seluruh draft gagal diparse.`
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT
// Dibangun dari EditorialBrief — berbeda tiap artikel.
// Estimasi token: ~900–1200 token tergantung jumlah fakta
// ─────────────────────────────────────────────────────────────────────────────
export function buildGemmaWriterUser(brief: EditorialBrief): string {
  const wt = brief.wordTarget

  const mustUseLines = brief.keyFacts.mustUse
    .map((f, i) => `[F${i + 1}] ${f}`)
    .join("\n")

  const canUseLines = brief.keyFacts.canUse.length > 0
    ? brief.keyFacts.canUse.map((f, i) => `[C${i + 1}] ${f}`).join("\n")
    : "(tidak ada)"

  const quotesBlock = brief.quotes.length > 0
    ? brief.quotes.map((q, i) => {
        const pos = q.placement === "lead" ? "dalam 2 paragraf pertama"
          : q.placement === "closing"      ? "dalam 2 paragraf terakhir"
          : "di pertengahan artikel"
        return `[Q${i + 1}] "${q.text}" — ${q.speaker}\n     → Tempatkan: ${pos}`
      }).join("\n")
    : "(tidak ada kutipan — jangan buat kutipan sendiri)"

  const h2Block = brief.structureHints.suggestedH2s.map((h, i) => {
    const facts = h.mustMentionFacts.length > 0
      ? `\n     Fakta yang WAJIB ada di sini: ${h.mustMentionFacts.join(" | ")}`
      : ""
    return `[H${i + 1}] "${h.text}"\n     Bahas: ${h.focus}${facts}`
  }).join("\n\n")

  const transitionBlock = brief.storylines.transitionHints.length > 0
    ? brief.storylines.transitionHints.map((t, i) => `• ${t}`).join("\n")
    : "(ikuti alur paragraphGuide)"

  const warningBlock = brief.meta.dataQualityWarnings.length > 0
    ? "⚠️ PERINGATAN DATA:\n" + brief.meta.dataQualityWarnings
        .map((w) => `• [${w.field}] ${w.status.toUpperCase()}: ${w.instruction}`)
        .join("\n")
    : ""

  return `${warningBlock ? warningBlock + "\n\n" : ""}TOPIK: ${brief.meta.topic}
TIPE: ${brief.meta.newsType.toUpperCase()}
ANGLE: ${brief.angle.primary}

══ SEO ══
Keyword utama (WAJIB di judul & 80 kata pertama): ${brief.seo.primaryKeyword}
Keyword pendukung (masuk di badan artikel): ${brief.seo.secondaryKeywords.join(", ")}
Format judul: ${brief.seo.titleTemplate}

══ ANGLE & NARASI ══
Fokus narasi : ${brief.angle.narrativeFocus}
Storyline    : ${brief.storylines.primaryStoryline}
Pendukung    :${brief.storylines.subStorylines.map((s) => `\n• ${s}`).join("")}

══ KALIMAT PEMBUKA — IKUTI TEMPLATE INI, ADAPTASI DENGAN FAKTA ══
${brief.storylines.leadExample}
(Penjelasan: ${brief.storylines.leadInstruction})

══ FAKTA WAJIB — semua harus ada di artikel ══
${mustUseLines}

══ FAKTA OPSIONAL — gunakan jika ruang cukup ══
${canUseLines}

══ PEMAIN KUNCI — sebut HANYA yang ada di sini ══
${brief.keyPlayers.length > 0 ? brief.keyPlayers.map((p) => `• ${p}`).join("\n") : "(tidak spesifik — jangan sebut nama pemain lain)"}

══ KUTIPAN ══
${quotesBlock}

══ STRUKTUR ARTIKEL ══
${h2Block}

══ PANDUAN ALUR ══
${brief.structureHints.paragraphGuide}

══ PANDUAN TRANSISI ANTAR SUBHEADING ══
${transitionBlock}

══ TARGET ══
• Panjang    : ${wt.min}–${wt.max} kata
• Paragraf   : minimal ${wt.paragraphMin} paragraf <p>
• Subheading : tepat ${brief.structureHints.suggestedH2s.length} tag <h2>

Tulis sekarang. JSON murni saja.`
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTIMASI TOKEN
// ─────────────────────────────────────────────────────────────────────────────
export function estimatePromptTokens(brief: EditorialBrief): {
  systemTokens: number
  userTokens: number
  totalTokens: number
} {
  const system = buildGemmaWriterSystem()
  const user   = buildGemmaWriterUser(brief)
  const systemTokens = Math.ceil(system.length / 4)
  const userTokens   = Math.ceil(user.length / 4)
  return { systemTokens, userTokens, totalTokens: systemTokens + userTokens }
}
