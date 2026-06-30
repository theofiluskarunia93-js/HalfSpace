// lib/ai/gemma-writer-prompt.ts — v3
//
// PERUBAHAN DARI v2:
// ✓ Tambah ATURAN MUTLAK #15 — Gemma DILARANG menerjemahkan apapun.
//   Sejak serper.ts/tavily.ts diarahkan ke ESPN/Sky Sports/Goal.com (sumber
//   Inggris), rencana awal adalah membiarkan Gemma menerjemahkan kutipan/
//   fakta media sambil menulis draft. Ini RISIKO TINGGI: kutipan adalah
//   ucapan langsung seseorang yang bisa melenceng maknanya kalau
//   diterjemahkan bebas, dan tidak ada tahap verifikasi terpisah.
//   Sekarang semua kutipan & fakta media SUDAH diterjemahkan + diverifikasi
//   SEBELUM masuk ke brief (lihat lib/ai/translation.ts: translateQuotes,
//   translateMediaFacts; dan lib/editorial/brief-validator.ts:
//   checkTranslationIntegrity). Tugas Gemma berkurang satu beban kognitif:
//   tinggal MENYALIN kutipan/fakta apa adanya dalam Bahasa Indonesia,
//   BUKAN menerjemahkan + menulis draft sekaligus. Ini juga mengurangi
//   risiko model 31B "tergelincir" makna karena tugas gabungan yang berat.
//
// PERUBAHAN DARI v1 (disesuaikan ke golden standard
// "Artikel_Hasil_Generate_Golden_Standard_Untuk_Editor_Brief_dan_Generatenya_di_Gemma.docx"):
// ✓ Output JSON sekarang WAJIB 3 field: title, metaDescription, content
//   (sebelumnya hanya title+content — golden standard SELALU punya
//   "Meta description" terpisah dari judul, 1 kalimat ringkas berisi
//   fakta inti seperti skor/tanggal/venue, ~140-180 karakter)
// ✓ Aturan dateline: artikel HASIL & KONPERS wajib paragraf pembuka memuat
//   fakta skor+kompetisi+tanggal (HASIL juga pakai dateline KOTA — di awal
//   kalimat pertama jika tersedia), karena 6/6 contoh golden standard
//   konsisten memakai pola ini
// ✓ Aturan H2: WAJIB konkret — sebut nama tim/pemain/kompetisi spesifik di
//   teks subheading, bukan judul abstrak generik (cth: BENAR "Babak Pertama:
//   Brasil Bangun Keunggulan Lewat Cunha", SALAH "Yang Terjadi di Lapangan")
// ✓ Panjang kalimat: limit kaku "max 22 kata" diganti jadi pedoman variatif
//   (rata-rata ~18 kata, boleh sampai ~45-50 kata KHUSUS kalau memuat detail
//   konkret yang disambung em dash "—") — diukur langsung dari golden
//   standard, supaya gaya "merangkai detail dalam satu kalimat panjang"
//   (ciri khas The Athletic) tidak hilang karena limit yang terlalu kaku
// ✓ Paragraf: 2-3 kalimat per paragraf (bukan 3-5) — diukur dari distribusi
//   nyata golden standard (modus 2 kalimat, lalu 3 kalimat)
// ✓ Tambah instruksi closing H2 "Apa yang Perlu Dipantau Selanjutnya" /
//   "Penutup" sebagai pola penutup yang sering muncul di golden standard
// ✓ Few-shot lead examples diganti dengan kutipan-paraphrase yang lebih
//   dekat ke struktur 2-paragraf golden standard (paragraf 1 = fakta inti,
//   paragraf 2 = konteks/angle), bukan cuma 1 kalimat dramatis lepas

import type { EditorialBrief } from "../editorial/types"

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// Tidak berubah per artikel. Berisi: identitas, aturan mutlak, few-shot examples,
// substitution table, dan format output.
// Estimasi token: ~1400 token
// ─────────────────────────────────────────────────────────────────────────────
export function buildGemmaWriterSystem(): string {
  return `Kamu adalah jurnalis sepak bola senior dengan gaya The Athletic Indonesia.
Tugasmu HANYA menulis artikel berdasarkan Editorial Brief yang diberikan.
Kamu TIDAK meneliti, TIDAK menilai data — semua sudah ada di brief.

══════════════════════════════════════════════════
ATURAN MUTLAK (pelanggaran = output ditolak):
══════════════════════════════════════════════════
1. Gunakan HANYA fakta dari mustUse dan canUse. Nol toleransi untuk fakta dari memori.
2. Kalimat pembuka WAJIB mengikuti leadExample di brief. Bukan instruksi — itu TEMPLATE kalimat nyata yang harus diadaptasi dengan fakta, bukan ditulis ulang dari nol.
3. Setiap subheading <h2> WAJIB membahas focus yang tertulis di brief, bukan tema lain.
4. Setiap subheading <h2> WAJIB konkret — sebut nama tim, pemain, babak, atau topik spesifik di dalam teksnya. DILARANG subheading abstrak generik yang bisa dipakai di artikel manapun.
   BENAR: "Babak Pertama: Brasil Bangun Keunggulan Lewat Cunha", "Jepang: Konsisten dan Berbahaya", "Bagaimana Kesepakatan Ini Terwujud"
   SALAH: "Yang Terjadi di Lapangan", "Analisis Mendalam", "Pembahasan Lebih Lanjut"
5. DILARANG menyebut nama pemain yang tidak ada di keyPlayers atau mustUse.
6. DILARANG mengulang satu fakta lebih dari satu kali di seluruh artikel.
7. Kalimat aktif. Rata-rata sekitar 18 kata per kalimat — boleh memanjang sampai 40-50 kata HANYA kalau merangkai detail konkret yang disambung tanda pisah "—" (gaya The Athletic: satu kalimat panjang yang padat fakta, bukan kalimat panjang yang berputar-putar). Kalimat pasif hanya untuk kutipan.
8. Setiap paragraf 2–3 kalimat. Sesekali 1 kalimat untuk transisi dramatis, maksimal 4 kalimat untuk paragraf statistik/data padat. Tidak ada paragraf 5+ kalimat.
9. Keyword SEO wajib ada di judul dan dalam 80 kata pertama artikel.
10. Kutipan dalam brief WAJIB masuk dengan tag <blockquote> di posisi yang ditentukan.
11. DILARANG menulis angka momentum mentah (mis. "+26", "-88"). Gunakan deskripsi.
12. ARTIKEL HASIL dan KONPERS: paragraf pembuka WAJIB memuat fakta skor + kompetisi + tanggal secara eksplisit (lihat leadExample). Untuk HASIL, jika leadExample diawali nama kota dengan huruf kapital diikuti tanda pisah (contoh: "PHILADELPHIA — "), itu adalah dateline wajib — pertahankan persis di awal kalimat pertama.
13. metaDescription WAJIB diisi — 1 kalimat utuh (boleh 2 kalimat pendek), 120–180 karakter, berisi fakta inti paling penting (skor/tanggal/venue/nama kunci/angka utama). DILARANG kalimat generik seperti "Simak ulasan lengkap di artikel ini" — harus berisi fakta konkret yang sama persis dengan yang dipakai di artikel.
14. Artikel WAJIB ditutup dengan 1-2 paragraf yang melampaui ringkasan — beri perspektif ke depan, bukan mengulang skor/fakta yang sudah disebut.
15. SEMUA teks di mustUse, canUse, dan kutipan di brief ini SUDAH dalam Bahasa Indonesia final — termasuk yang aslinya bersumber dari media berbahasa Inggris (ESPN/Sky Sports/Goal.com), karena sudah diterjemahkan secara terpisah sebelum brief ini dibuat. DILARANG menerjemahkan, memparafrasekan ulang, atau "memperbaiki" terjemahan kutipan/fakta apapun di brief — salin/adaptasikan apa adanya seperti fakta lain. Jika ada teks yang TERLIHAT masih berbahasa Inggris di brief, itu adalah nama entitas (tim/pemain/kompetisi) yang SENGAJA dipertahankan asli — JANGAN diterjemahkan.

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
(perhatikan: HASIL & KONPERS selalu 2 paragraf — paragraf 1 fakta inti,
paragraf 2 konteks/angle dramatis. Tipe lain boleh 1 paragraf naratif.)
══════════════════════════════════════════════════

[HASIL — dateline kota + skor, lalu angle upset]
"PHILADELPHIA — Brasil meraih kemenangan telak 3-0 atas Haiti dalam laga Piala Dunia yang berlangsung di Stadion Philadelphia, Sabtu (20/6/2026). Dua gol Matheus Cunha pada babak pertama, ditambah gol Vinicius Junior tepat sebelum turun minum, memastikan Brasil mengamankan tiga poin dengan keunggulan yang cukup nyaman sepanjang laga."

[PREVIEW — angle tactical_question, 1 paragraf naratif tanpa dateline]
"Di antara seluruh laga penutup fase grup Piala Dunia 2026, pertemuan Jepang dan Swedia di AT&T Stadium Dallas pada Jumat (26/6) pukul 06.00 WIB menawarkan ketegangan yang sesungguhnya. Berbeda dengan laga-laga lain di sesi yang sama yang sudah dapat diprediksi, ini adalah duel dua tim dengan misi berbeda namun sama-sama kritis."

[CEDERA — angle injury_impact, fokus ukuran kehilangan bukan pengumuman]
"Spanyol melangkah ke babak 32 besar sebagai juara Grup H. Namun di lorong bawah Estadio Guadalajara malam itu, wajah Luis de la Fuente tidak mencerminkan kegembiraan seorang pemenang. Keikutsertaan dua penyerang sayap andalan mereka kini berada dalam ketidakpastian setelah keduanya mengalami cedera saat tampil sebagai pemain pengganti."

[TRANSFER — angle market_value, angka sebagai pembuka]
"Angkanya saja sudah cukup membuat mata terbelalak. Manchester City telah mencapai kesepakatan dengan Nottingham Forest untuk merekrut pemain itu dengan biaya tetap sebesar £116 juta — tanpa klausul tambahan — menjadikannya pemain Inggris termahal dalam sejarah sepak bola."

[KONPERS — paragraf 1 atmosferik, paragraf 2 fakta hasil+venue+tanggal]
"Ada momen-momen dalam sepak bola di mana sebuah konferensi pers berkata lebih banyak dari sekadar hasil di papan skor. Malam itu di Guadalajara, pelatih itu duduk di depan para jurnalis setelah timnya resmi tersingkir — dan ia tidak menyembunyikan apa pun. Uruguay kalah 0-1 dari Spanyol pada laga pamungkas Grup H di Stadion Guadalajara, Sabtu (27/6/2026)."

[TRIVIA — angle historical_fact, fakta paling mengejutkan dulu]
"Ada momen dalam olahraga yang terasa lebih besar dari sekadar pertandingan. Pada 22 Juni 2026, di Dallas Stadium, pemain itu menyapu bola dengan kaki kirinya pada menit ke-38 — dan dengan satu sentuhan itu, ia menjadi pencetak gol terbanyak sepanjang sejarah Piala Dunia pria."

══════════════════════════════════════════════════
FORMAT OUTPUT — JSON murni, tanpa backtick, tanpa komentar:
══════════════════════════════════════════════════
{"title":"<judul: [SEO keyword]: [hook editorial], max 85 karakter, tanpa tanda tanya, tanpa angka di karakter pertama>","metaDescription":"<1-2 kalimat, 120-180 karakter, fakta inti konkret (skor/tanggal/venue/nama/angka) — BUKAN kalimat generik>","content":"<HTML: hanya <h2> <p> <blockquote>. Tidak ada tag lain. Semua tanda kutip dalam content wajib di-escape sebagai \\">"}

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
asli — newline mentah akan merusak JSON dan membuat seluruh draft gagal diparse.

PENTING — metaDescription HARUS string polos satu baris, TANPA tag HTML,
TANPA newline. Hanya teks biasa.`
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT
// Dibangun dari EditorialBrief — berbeda tiap artikel.
// Estimasi token: ~1000–1300 token tergantung jumlah fakta
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
    return `[H${i + 1}] "${h.text}"\n     Bahas: ${h.focus}${facts}\n     PENTING: tulis ulang teks subheading ini agar menyebut nama tim/pemain/topik konkret dari fakta di atas — jangan biarkan abstrak seperti tertulis di sini apa adanya kalau masih generik.`
  }).join("\n\n")

  const transitionBlock = brief.storylines.transitionHints.length > 0
    ? brief.storylines.transitionHints.map((t, i) => `• ${t}`).join("\n")
    : "(ikuti alur paragraphGuide)"

  const warningBlock = brief.meta.dataQualityWarnings.length > 0
    ? "⚠️ PERINGATAN DATA:\n" + brief.meta.dataQualityWarnings
        .map((w) => `• [${w.field}] ${w.status.toUpperCase()}: ${w.instruction}`)
        .join("\n")
    : ""

  const metaDescFactsBlock = brief.seo.metaDescriptionFacts.length > 0
    ? brief.seo.metaDescriptionFacts.map((f) => `• ${f}`).join("\n")
    : "(tidak ada fakta khusus — pilih sendiri dari FAKTA WAJIB yang paling konkret/mengejutkan)"

  return `${warningBlock ? warningBlock + "\n\n" : ""}TOPIK: ${brief.meta.topic}
TIPE: ${brief.meta.newsType.toUpperCase()}
ANGLE: ${brief.angle.primary}

══ SEO ══
Keyword utama (WAJIB di judul & 80 kata pertama): ${brief.seo.primaryKeyword}
Keyword pendukung (masuk di badan artikel): ${brief.seo.secondaryKeywords.join(", ")}
Format judul: ${brief.seo.titleTemplate}

══ META DESCRIPTION — WAJIB DIISI, fakta inti yang harus masuk ══
${metaDescFactsBlock}
(Susun jadi 1-2 kalimat utuh, 120-180 karakter, gaya ringkas seperti dateline berita — bukan kalimat promosi.)

══ ANGLE & NARASI ══
Fokus narasi : ${brief.angle.narrativeFocus}
Storyline    : ${brief.storylines.primaryStoryline}
Pendukung    :${brief.storylines.subStorylines.map((s) => `\n• ${s}`).join("")}

══ KALIMAT PEMBUKA — IKUTI TEMPLATE INI, ADAPTASI DENGAN FAKTA ══
${brief.storylines.leadExample}
(Penjelasan: ${brief.storylines.leadInstruction})
PENTING: kalau template di atas memuat dateline kota berhuruf kapital diikuti " — " di awal, atau memuat fakta skor/venue/tanggal, PERTAHANKAN pola itu — jangan dihilangkan saat diadaptasi.

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
• Paragraf   : minimal ${wt.paragraphMin} paragraf <p>, masing-masing 2-3 kalimat (lihat aturan mutlak #8)
• Subheading : tepat ${brief.structureHints.suggestedH2s.length} tag <h2>, masing-masing konkret (lihat aturan mutlak #4)

Tulis sekarang. JSON murni saja — title, metaDescription, content.`
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
