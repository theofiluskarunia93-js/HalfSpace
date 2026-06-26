// lib/editorial/brief-builder.ts — v2
//
// PERUBAHAN DARI v1 (berdasarkan audit):
// ✓ [FIX #1]  leadExample: kalimat pembuka KONKRET berdasarkan data nyata, bukan instruksi abstrak
// ✓ [FIX #2]  paragraphGuide tidak menyebut ulang fakta — hanya instruksi alur
// ✓ [FIX #3]  transitionHints: instruksi eksplisit kalimat jembatan antar subheading
// ✓ [FIX #6]  suggestedH2s: setiap H2 punya focus dan mustMentionFacts — tidak ada placeholder
// ✓ [FIX #7]  dataQualityWarnings: blokir hallucination saat data tidak lengkap
// ✓ [FIX #9]  seoKeywords: keyword wajib masuk judul & 100 kata pertama
// ✓ [FIX #11] isComeback() diperbaiki — harus ada kronologi tim tertinggal lalu unggul

import {
  type EditorialBrief,
  type EditorialBriefQuote,
  type DataQualityWarning,
  type SeoMeta,
  type NewsType,
  WORD_TARGETS,
  DEFAULT_QUALITY_GATE,
  estimateTokens,
} from "./types"
import {
  type BzzoiroExtractedHasil,
  type BzzoiroExtractedPreview,
  type BzzoiroExtractedPlayer,
  summarizeMomentum,
  extractKeyIncidents,
  extractStats,
  formatWinProbability,
  summarizeH2H,
} from "./extractors/bzzoiro-extractor"
import {
  type SerperExtracted,
  type TavilyExtracted,
  extractSerperData,
  extractTavilyData,
} from "./extractors/media-extractor"
import { selectAngle } from "./angle-selector"
import type { ArticleAngle, AngleResult } from "./angle-selector"

interface BuildBriefInput {
  newsType: NewsType
  topic: string
  bzzoiroText: string
  serperText: string
  tavilyText: string
  manualContext: string
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSERS BZZOIRO
// ─────────────────────────────────────────────────────────────────────────────

function parseTeamNames(bzzoiroText: string, topic: string): [string, string] {
  const pertMatch = bzzoiroText.match(/PERTANDINGAN:\s*(.+?)\s+vs\s+(.+)/)
  if (pertMatch) return [pertMatch[1].trim(), pertMatch[2].trim()]
  const scoreLine = bzzoiroText.match(/SKOR AKHIR:\s*(.+?)\s+\d+\s*-\s*\d+\s+(.+)/)
  if (scoreLine) return [scoreLine[1].trim(), scoreLine[2].trim()]
  const topicSplit = topic.match(/^(.+?)\s+(?:vs|v)\s+(.+)$/i)
  if (topicSplit) return [topicSplit[1].trim(), topicSplit[2].trim()]
  return [topic, ""]
}

function parseBzzoiroHasil(bzzoiroText: string, home: string, away: string): BzzoiroExtractedHasil {
  return {
    home, away,
    score:       bzzoiroText.match(/SKOR AKHIR:\s*(.+)/)?.[1]?.trim() ?? "? - ?",
    competition: bzzoiroText.match(/Liga\/Kompetisi:\s*(.+)/)?.[1]?.trim() ?? "",
    date:        bzzoiroText.match(/Tanggal:\s*(.+)/)?.[1]?.trim() ?? "",
    keyIncidents: extractKeyIncidents(bzzoiroText),
    stats:        extractStats(bzzoiroText),
    momentumSummary: summarizeMomentum(bzzoiroText, home, away),
  }
}

function parseBzzoiroPreview(bzzoiroText: string, home: string, away: string): BzzoiroExtractedPreview {
  const h2hSection = bzzoiroText.match(/H2H 5 PERTANDINGAN TERAKHIR:\n([\s\S]+?)(?:\n\n|\nFORM)/)?.[1] ?? ""
  return {
    home, away,
    competition: bzzoiroText.match(/Liga\/Kompetisi:\s*(.+)/)?.[1]?.trim() ?? "",
    matchDate:   bzzoiroText.match(/Tanggal & Waktu:\s*(.+)/)?.[1]?.trim() ?? "",
    venue:       bzzoiroText.match(/Venue:\s*(.+)/)?.[1]?.trim(),
    winProbability: formatWinProbability(bzzoiroText, home, away),
    h2hSummary:  summarizeH2H(h2hSection.split("\n").filter(Boolean), home, away),
    formHome:    bzzoiroText.match(new RegExp(`FORM 5 LAGA — ${home}:\\n([\\s\\S]+?)(?:\\n\\n|\\nFORM|\\nKLASEMEN|$)`))?.[1]?.trim() ?? "",
    formAway:    bzzoiroText.match(new RegExp(`FORM 5 LAGA — ${away}:\\n([\\s\\S]+?)(?:\\n\\n|\\nKLASEMEN|$)`))?.[1]?.trim() ?? "",
    standingsHome: bzzoiroText.match(new RegExp(`${home}:[^\\n]+poin[^\\n]+`, "i"))?.[0],
    standingsAway: bzzoiroText.match(new RegExp(`${away}:[^\\n]+poin[^\\n]+`, "i"))?.[0],
  }
}

function parseBzzoiroPlayer(bzzoiroText: string, topic: string): BzzoiroExtractedPlayer {
  const statsLine = bzzoiroText.match(/Total menit:\s*(\d+)[^|]*\|\s*Gol:\s*(\d+)[^|]*\|\s*Assist:\s*(\d+)/)
  const details: BzzoiroExtractedPlayer["recentStats"]["details"] = []
  const detailLines = bzzoiroText.match(/•\s+.+?—\s+\d+\s+menit.*/g) ?? []
  for (const line of detailLines.slice(0, 5)) {
    details.push({
      match:   line.match(/•\s+(.+?)\s+—/)?.[1]?.trim() ?? "",
      minutes: parseInt(line.match(/(\d+)\s+menit/)?.[1] ?? "0"),
      goals:   line.match(/gol:\s*(\d+)/)   ? parseInt(line.match(/gol:\s*(\d+)/)![1])   : undefined,
      assists: line.match(/assist:\s*(\d+)/) ? parseInt(line.match(/assist:\s*(\d+)/)![1]) : undefined,
      rating:  line.match(/rating:\s*([0-9.]+)/) ? parseFloat(line.match(/rating:\s*([0-9.]+)/)![1]) : undefined,
    })
  }
  return {
    name:        bzzoiroText.match(/Nama:\s*(.+)/)?.[1]?.trim() ?? topic,
    team:        bzzoiroText.match(/Tim(?:\s+Saat Ini)?:\s*(.+)/)?.[1]?.trim() ?? "",
    position:    bzzoiroText.match(/Posisi:\s*(.+)/)?.[1]?.trim() ?? "",
    age:         bzzoiroText.match(/Usia(?:\/Lahir)?:\s*(.+)/)?.[1]?.trim(),
    marketValue: bzzoiroText.match(/Nilai Pasar:\s*(.+)/)?.[1]?.trim(),
    recentStats: {
      summary: statsLine
        ? `${statsLine[1]} menit, ${statsLine[2]} gol, ${statsLine[3]} assist dalam 5 laga terakhir`
        : "",
      details,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO BUILDER — keyword otomatis dari topik dan newsType
// ─────────────────────────────────────────────────────────────────────────────
function buildSeoMeta(newsType: NewsType, topic: string, home?: string, away?: string): SeoMeta {
  const cleanTopic = topic.trim()

  const primaryByType: Record<NewsType, string> = {
    hasil:    home && away ? `Hasil ${home} vs ${away}` : `Hasil ${cleanTopic}`,
    preview:  home && away ? `Prediksi ${home} vs ${away}` : `Preview ${cleanTopic}`,
    transfer: `Transfer ${cleanTopic}`,
    cedera:   `Cedera ${cleanTopic}`,
    konpers:  `Konferensi Pers ${cleanTopic}`,
    trivia:   cleanTopic,
  }

  const secondaryByType: Record<NewsType, string[]> = {
    hasil:    ["analisis pertandingan", home ?? "", away ?? ""].filter(Boolean),
    preview:  ["prediksi", "head to head", home ?? "", away ?? ""].filter(Boolean),
    transfer: ["kabar transfer", "bursa transfer"],
    cedera:   ["update cedera", "absen"],
    konpers:  ["pernyataan pelatih", "berita terbaru"],
    trivia:   ["fakta sepak bola", "sejarah"],
  }

  const templateByType: Record<NewsType, string> = {
    hasil:    `${primaryByType.hasil}: [hook editorial]`,
    preview:  `${primaryByType.preview}: [hook editorial]`,
    transfer: `${primaryByType.transfer}: [hook editorial]`,
    cedera:   `${primaryByType.cedera}: [hook editorial]`,
    konpers:  `${primaryByType.konpers}: [hook editorial]`,
    trivia:   `[hook editorial] — ${primaryByType.trivia}`,
  }

  return {
    primaryKeyword:     primaryByType[newsType],
    secondaryKeywords:  secondaryByType[newsType],
    titleTemplate:      templateByType[newsType],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA QUALITY WARNINGS — [FIX #7]
// ─────────────────────────────────────────────────────────────────────────────
function buildDataWarnings(
  newsType: NewsType,
  playerData?: BzzoiroExtractedPlayer,
  hasilData?: BzzoiroExtractedHasil,
): DataQualityWarning[] {
  const warnings: DataQualityWarning[] = []

  if (playerData && !playerData.recentStats.summary) {
    warnings.push({
      field: "player_stats",
      status: "missing",
      instruction: "Statistik pemain TIDAK TERSEDIA. DILARANG menyebut angka gol, assist, rating, atau menit bermain apapun. Tulis hanya berdasarkan konteks teks yang ada.",
    })
  }
  if (playerData && !playerData.marketValue && newsType === "transfer") {
    warnings.push({
      field: "transfer_fee",
      status: "missing",
      instruction: "Nilai transfer atau market value TIDAK TERSEDIA. DILARANG menyebut angka biaya transfer apapun. Jika ada angka di mustUse, gunakan itu. Jika tidak ada, jangan sebut angka.",
    })
  }
  if (hasilData && hasilData.keyIncidents.length === 0) {
    warnings.push({
      field: "match_incidents",
      status: "partial",
      instruction: "Data insiden pertandingan (gol, kartu) TIDAK TERSEDIA. Jangan menyebut gol di menit berapa atau siapa yang mencetak. Fokus ke statistik dan narasi umum yang ada di mustUse.",
    })
  }

  return warnings
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD EXAMPLE BUILDER — [FIX #1]
// Membuat kalimat pembuka konkret berdasarkan data nyata, bukan instruksi abstrak
// ─────────────────────────────────────────────────────────────────────────────
function buildLeadExample(
  newsType: NewsType,
  angle: ArticleAngle,
  hasilData?: BzzoiroExtractedHasil,
  previewData?: BzzoiroExtractedPreview,
  playerData?: BzzoiroExtractedPlayer,
  serper?: SerperExtracted,
): string {
  // HASIL
  if (newsType === "hasil" && hasilData) {
    const { home, away, score, keyIncidents } = hasilData
    const redCard = keyIncidents.find((i) => i.type.toLowerCase().includes("red"))
    const firstGoal = keyIncidents.find((i) => i.type.toLowerCase().includes("goal") && !i.type.toLowerCase().includes("own"))

    if (angle === "upset_result") {
      return `Angka tidak pernah salah. Kecuali malam itu. Ketika ${away} tiba dengan probabilitas menang yang kecil, tidak ada yang menyangka mereka yang akan meninggalkan lapangan dengan tiga poin.`
    }
    if (angle === "comeback" && firstGoal) {
      const scoreParts = score.match(/(\d+)\s*-\s*(\d+)/)
      const winner = scoreParts && parseInt(scoreParts[1]) > parseInt(scoreParts[2]) ? home : away
      return `Untuk beberapa saat, semuanya terlihat sudah ditentukan. Lalu ${winner} membuktikan bahwa pertandingan baru benar-benar selesai ketika peluit terakhir dibunyikan.`
    }
    if (angle === "controversy" && redCard) {
      return `Menit ${redCard.minute}. Kartu merah untuk ${redCard.player}. Sejak saat itu, ini bukan lagi pertandingan yang sama — dan semua orang di stadion tahu itu.`
    }
    if (angle === "individual_brilliance") {
      const hatTrickPlayer = (() => {
        const counts = new Map<string, number>()
        for (const i of keyIncidents) {
          if (i.type.toLowerCase().includes("goal") && !i.type.toLowerCase().includes("own") && i.player)
            counts.set(i.player, (counts.get(i.player) ?? 0) + 1)
        }
        for (const [p, c] of counts) if (c >= 3) return p
        return null
      })()
      if (hatTrickPlayer) return `Ada malam-malam di mana statistik cukup untuk menceritakan semuanya. Tiga gol. Satu pemain. Dan sebuah pertandingan yang tidak akan dilupakan siapapun yang menyaksikannya.`
    }
    if (hasilData.stats.xgTotal) {
      const [xgH, xgA] = hasilData.stats.xgTotal
      const scoreParts = score.match(/(\d+)\s*-\s*(\d+)/)
      if (scoreParts && hasilData.stats.xgTotal) {
        return `xG ${home} ${xgH}, xG ${away} ${xgA}. Angka itu seharusnya menceritakan siapa yang menang. Kenyataannya berbeda — dan itulah yang membuat ${score} menjadi lebih dari sekadar skor.`
      }
    }
    return `${score}. Dua angka yang membutuhkan lebih dari satu paragraf untuk dijelaskan.`
  }

  // PREVIEW
  if (newsType === "preview" && previewData) {
    const { home, away, winProbability } = previewData
    if (angle === "injury_impact") {
      return `Bukan tentang siapa yang bermain. Kadang, yang paling menentukan adalah siapa yang tidak bisa hadir.`
    }
    if (angle === "form_contrast") {
      return `Dua tim dengan lintasan yang sangat berbeda menuju pertandingan yang sama. Angka form itu tidak bohong — tapi sepak bola juga bukan sekadar angka.`
    }
    if (winProbability) {
      return `${winProbability.label}. Itulah yang dikatakan model statistik. Tapi pertanyaan yang lebih menarik bukan siapa yang diunggulkan — melainkan mengapa ${home} vs ${away} bisa berlangsung dengan cara yang berbeda dari prediksi.`
    }
    return `Setiap pertandingan punya pertanyaan yang baru bisa dijawab setelah peluit akhir. Untuk ${home} vs ${away}, pertanyaannya sudah jelas sejak jauh sebelum kick-off.`
  }

  // CEDERA
  if (newsType === "cedera" && playerData) {
    const stats = playerData.recentStats.summary
    return stats
      ? `Bukan nama di kertas absen yang paling penting. Yang paling penting adalah apa yang ikut hilang bersamanya — ${stats} — dan betapa sulitnya mengisi kekosongan itu.`
      : `Ketika satu nama hilang dari daftar skuad, seluruh rencana bisa berubah. Dan kali ini, nama itu adalah ${playerData.name}.`
  }

  // TRANSFER
  if (newsType === "transfer" && playerData) {
    if (playerData.marketValue) {
      return `${playerData.marketValue}. Angka itu bukan sekadar harga — itu adalah pernyataan tentang apa yang kedua klub percayai tentang ${playerData.name} dalam tiga tahun ke depan.`
    }
    return `Ada kesepakatan transfer yang selesai dalam hitungan hari. Dan ada yang membutuhkan berbulan-bulan. Transfer ${playerData.name} termasuk yang mana, dan mengapa itu penting — itulah yang akan dibahas di sini.`
  }

  // KONPERS
  if (newsType === "konpers") {
    if (serper?.quotes && serper.quotes.length > 0) {
      const q = serper.quotes[0]
      // Gunakan kutipan terkuat sebagai pembuka — tapi tidak boleh langsung kutip panjang
      // (itu kerja Llama, kita hanya template)
      return `Pelatih itu tidak butuh banyak kata. Tapi kata-kata yang keluar dari bibirnya hari itu terasa lebih berat dari biasanya.`
    }
    return `Konferensi pers bisa menjadi formalitas. Tapi ada momen-momen ketika ruangan itu menjadi tempat di mana arah sebuah musim ditentukan.`
  }

  // TRIVIA (menggunakan fakta pertama dari brief)
  return `Ada angka-angka dalam sejarah sepak bola yang berdiri begitu lama bukan karena tidak ada yang mencoba menumbangkannya — melainkan karena tidak ada yang menyadari seberapa tinggi standar yang pertama kali ditetapkan.`
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD INSTRUCTION — tetap ada sebagai penjelasan di balik leadExample
// ─────────────────────────────────────────────────────────────────────────────
function buildLeadInstruction(
  newsType: NewsType,
  angle: ArticleAngle,
): string {
  const base: Record<ArticleAngle | "default", string> = {
    upset_result:           "Buka dengan kontradiksi antara ekspektasi dan kenyataan. Template di atas menggunakan paradoks probabilitas vs hasil.",
    comeback:               "Buka dengan momen ketika laga terasa sudah selesai — lalu balikkan. Jangan buka dari awal kronologi.",
    controversy:            "Buka langsung di momen kontroversial. Waktu, nama, dan apa yang berubah setelahnya.",
    individual_brilliance:  "Buka dengan kesan keseluruhan dulu, lalu masuk ke detail. Jangan buka dengan 'Pemain X mencetak hat-trick.'",
    tactical_breakdown:     "Buka dengan paradoks atau ironi statistik yang merangkum keseluruhan laga.",
    injury_impact:          "Buka dengan apa yang HILANG — bukan dengan pengumuman cedera. Ukuran kehilangan, bukan faktanya.",
    form_contrast:          "Buka dengan kontras dua lintasan tim. Tunjukkan perbedaannya, jangan sebut 'form yang berbeda'.",
    tactical_question:      "Buka dengan pertanyaan yang belum terjawab. Tapi jangan buat kalimat tanya. Parafrase jadi pernyataan.",
    market_value:           "Buka dengan angka transfer sebagai klaim tentang masa depan, bukan tentang masa lalu pemain.",
    negotiation_drama:      "Buka di tengah proses — bukan di awal atau akhir negosiasi. Momen ketegangan tertinggi.",
    departure_narrative:    "Buka dengan resonansi perpisahan. Apa yang ditinggalkan vs apa yang dibawa.",
    press_conference_reveal:"Buka dengan suasana ruangan atau berat kata-kata — bukan dengan nama pelatih dan tanggal.",
    historical_fact:        "Buka dengan angka atau fakta paling mengejutkan. Biarkan fakta itu bernafas satu kalimat sebelum konteks.",
    milestone:              "Buka dengan momen pencapaian itu terjadi — bukan dengan pengumuman 'X mencapai rekor Y'.",
    default:                "Buka dengan fakta paling kuat atau momen paling konkret dari brief.",
  }
  return base[angle] ?? base.default
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION HINTS — [FIX #3]
// Instruksi eksplisit kalimat jembatan berdasarkan angle
// ─────────────────────────────────────────────────────────────────────────────
function buildTransitionHints(
  newsType: NewsType,
  angle: ArticleAngle,
  suggestedH2Count: number,
): string[] {
  if (suggestedH2Count < 2) return []

  const hints: Record<NewsType, string[]> = {
    hasil: [
      `Tutup paragraf sebelum [H1] dengan kalimat yang membuka pertanyaan — misalnya tentang kondisi tim atau ekspektasi sebelum laga — yang langsung dijawab di paragraf pertama [H1].`,
      `Tutup [H1] dengan fakta yang membutuhkan penjelasan. Buka [H2] dengan penjelasan itu — bukan subjek baru.`,
      `Tutup [H2] dengan implikasi taktis. Buka [H3] dengan konsekuensi konkretnya — ke depan atau ke laga berikutnya.`,
    ],
    preview: [
      `Tutup paragraf tentang tim pertama dengan kelemahan mereka. Buka paragraf tim kedua dengan bagaimana kelemahan itu bisa dieksploitasi.`,
      `Tutup analisis kondisi dengan pertanyaan taktis. Buka bagian pertarungan kunci dengan jawabannya.`,
      `Tutup bagian pertarungan kunci dengan ketidakpastian. Buka penutup dengan mengapa ketidakpastian itu yang membuat laga layak ditonton.`,
    ],
    cedera: [
      `Tutup lead dengan ukuran kehilangan. Buka [H1] dengan rincian statistik yang membuktikan ukuran itu.`,
      `Tutup [H1] dengan angka statistik. Buka [H2] dengan apa yang tidak bisa diukur statistik — dampak taktis dan psikologis.`,
      `Tutup [H2] dengan kekosongan yang ditinggalkan. Buka [H3] dengan langkah ke depan — opsi pengganti atau timeline kembali.`,
    ],
    konpers: [
      `Kutipan pembuka harus langsung diikuti konteks — mengapa kata-kata itu lebih berat dari biasanya.`,
      `Setiap pernyataan penting diikuti analisis singkat: apa yang dikatakan vs apa yang tidak dikatakan.`,
      `Penutup konpers harus melampaui isi pernyataan — apa implikasinya untuk laga atau situasi ke depan.`,
    ],
    transfer: [
      `Tutup lead dengan pertanyaan tentang mengapa transfer ini terjadi. Buka [H1] dengan jawaban berdasarkan konteks kedua klub.`,
      `Tutup [H1] tentang klub asal dengan apa yang mereka korbankan. Buka [H2] tentang klub tujuan dengan apa yang mereka harapkan.`,
      `Tutup analisis dampak dengan ketidakpastian. Penutup: apa yang akan membuktikan transfer ini benar atau salah.`,
    ],
    trivia: [
      `Tutup lead dengan fakta mengejutkan. Buka [H1] dengan konteks yang membuat fakta itu lebih masuk akal.`,
      `Tutup [H1] dengan detail historis. Buka [H2] dengan hubungannya ke situasi atau pemain modern.`,
      `Tutup [H2] dengan perbandingan era. Buka penutup dengan mengapa fakta ini layak diingat hari ini.`,
    ],
  }

  return (hints[newsType] ?? []).slice(0, suggestedH2Count)
}

// ─────────────────────────────────────────────────────────────────────────────
// H2 BUILDER dengan focus + mustMentionFacts — [FIX #6]
// ─────────────────────────────────────────────────────────────────────────────
function buildH2s(
  newsType: NewsType,
  angle: ArticleAngle,
  hasilData?: BzzoiroExtractedHasil,
  previewData?: BzzoiroExtractedPreview,
  playerData?: BzzoiroExtractedPlayer,
  mustUseFacts?: string[],
): EditorialBrief["structureHints"]["suggestedH2s"] {
  const facts = mustUseFacts ?? []

  if (newsType === "hasil" && hasilData) {
    const { home, away } = hasilData
    const redCard   = hasilData.keyIncidents.find((i) => i.type.toLowerCase().includes("red"))
    const incidents = hasilData.keyIncidents

    if (angle === "controversy" && redCard) return [
      { text: `Menit ${redCard.minute}' dan Dua Pertandingan Berbeda`, focus: `Situasi sebelum kartu merah vs setelahnya — bagaimana dinamika berubah`, mustMentionFacts: facts.filter((f) => f.includes(redCard.player) || f.includes("merah") || f.includes("red")) },
      { text: `Membaca Angka yang Sebenarnya`, focus: `Statistik pertandingan — apa yang diungkapkan dan apa yang disembunyikan`, mustMentionFacts: facts.filter((f) => f.includes("%") || f.includes("xG") || f.includes("tembakan")) },
      { text: `Implikasinya Melampaui Tiga Poin`, focus: `Konsekuensi hasil ini untuk kompetisi, posisi klasemen, dan laga berikutnya`, mustMentionFacts: [] },
    ]

    if (angle === "upset_result") return [
      { text: `Apa yang Dikatakan Data Sebelum Kick-Off`, focus: `Win probability dan kondisi kedua tim — mengapa ${away} tidak diunggulkan`, mustMentionFacts: facts.filter((f) => f.includes("%") || f.includes("probabilitas") || f.includes("form")) },
      { text: `Bagaimana Itu Bisa Terjadi`, focus: `Kronologi momen krusial dan keputusan taktis yang membalikkan prediksi`, mustMentionFacts: facts.filter((f) => f.includes("Menit") || f.includes("gol") || f.includes("kartu")) },
      { text: `Artinya untuk Kedua Tim`, focus: `Dampak ke klasemen dan apa yang perlu dievaluasi oleh tim yang kalah`, mustMentionFacts: [] },
    ]

    if (angle === "comeback") return [
      { text: `Ketika Semua Terlihat Sudah Ditentukan`, focus: `Situasi tim yang akhirnya menang saat tertinggal — tekanan dan konteks`, mustMentionFacts: facts.filter((f) => f.includes("Menit") && parseInt((f.match(/Menit (\d+)/)?.[1] ?? "99")) < 46) },
      { text: `Babak Kedua yang Berbeda`, focus: `Pergeseran taktis atau momentum di babak kedua yang memungkinkan comeback`, mustMentionFacts: facts.filter((f) => f.includes("Menit") && parseInt((f.match(/Menit (\d+)/)?.[1] ?? "0")) >= 46) },
      { text: `Pelajaran dari Malam Itu`, focus: `Apa yang dapat dipelajari dari comeback ini — tentang tim, pelatih, atau mentalitas`, mustMentionFacts: [] },
    ]

    if (angle === "individual_brilliance") return [
      { text: `Malam Milik Satu Orang`, focus: `Siapa pemain itu dan bagaimana performanya mendefinisikan laga`, mustMentionFacts: facts.filter((f) => facts.findIndex((ff) => ff === f) < 4) },
      { text: `Detail yang Membuat Perbedaan`, focus: `Kualitas gol atau aksi individual — bukan hanya jumlahnya`, mustMentionFacts: facts.filter((f) => f.includes("Menit")) },
      { text: `Apa Artinya untuk Tim`, focus: `Bagaimana performa individual ini berdampak ke tim secara keseluruhan dan ke depan`, mustMentionFacts: [] },
    ]

    // Default tactical breakdown
    return [
      { text: `Yang Terjadi di Lapangan`, focus: `Kronologi dan dinamika laga berdasarkan insiden kunci`, mustMentionFacts: facts.filter((f) => f.includes("Menit") || f.includes("gol")).slice(0, 3) },
      { text: `Membaca Statistik dengan Benar`, focus: `Apa yang dikatakan statistik dan apa yang tidak — xG, penguasaan, efisiensi`, mustMentionFacts: facts.filter((f) => f.includes("%") || f.includes("xG") || f.includes("tembakan")) },
      { text: `Implikasi ke Depan`, focus: `Apa artinya hasil ini untuk klasemen, perjalanan kompetisi, dan evaluasi taktis`, mustMentionFacts: [] },
    ]
  }

  if (newsType === "preview" && previewData) {
    const { home, away } = previewData
    return [
      { text: `Kondisi Menuju Kick-Off`, focus: `Form, absen, dan kondisi kedua tim — ${home} dan ${away} datang dengan apa`, mustMentionFacts: facts.filter((f) => f.includes("Form") || f.includes("H2H") || f.includes("absen") || f.includes("cedera")) },
      { text: `Pertarungan yang Akan Menentukan`, focus: `Duel taktis spesifik di lapangan yang akan mempengaruhi hasil laga`, mustMentionFacts: [] },
      { text: `Apa yang Angka Belum Bisa Jawab`, focus: `Win probability sebagai konteks, bukan jawaban — dan kenapa laga ini terbuka`, mustMentionFacts: facts.filter((f) => f.includes("probability") || f.includes("%")) },
    ]
  }

  if (newsType === "transfer" && playerData) {
    return [
      { text: `Lebih dari Sekadar Perpindahan`, focus: `Konteks karir ${playerData.name} — mengapa transfer ini terjadi sekarang`, mustMentionFacts: facts.filter((_, i) => i < 3) },
      { text: `Angka di Balik Keputusan`, focus: `Fee, kontrak, nilai pasar — apa yang membuat kedua klub sepakat`, mustMentionFacts: facts.filter((f) => f.includes("€") || f.includes("juta") || f.includes("nilai") || f.includes("kontrak")) },
      { text: `Dampak untuk Kedua Pihak`, focus: `Apa yang ${playerData.team} kehilangan dan apa yang klub tujuan harapkan`, mustMentionFacts: [] },
    ]
  }

  if (newsType === "cedera" && playerData) {
    return [
      { text: `Angka yang Menjelaskan Ukuran Kehilangan`, focus: `Statistik ${playerData.name} dalam 5 laga terakhir sebagai bukti konkret dampaknya`, mustMentionFacts: facts.filter((f) => f.includes("menit") || f.includes("gol") || f.includes("assist")) },
      { text: `Dampak ke Taktik dan Rencana Tim`, focus: `Bagaimana cedera ini mengubah opsi pelatih — formasi, rotasi, strategi`, mustMentionFacts: facts.filter((f) => f.includes("absen") || f.includes("laga") || f.includes("pernyataan")) },
      { text: `Jalan Menuju Kembali`, focus: `Timeline pemulihan dan laga-laga penting yang akan dilewati`, mustMentionFacts: facts.filter((f) => f.includes("minggu") || f.includes("bulan") || f.includes("prognosis")) },
    ]
  }

  if (newsType === "konpers") {
    return [
      { text: `Di Balik Kata-Kata Itu`, focus: `Analisis pernyataan terkuat — apa yang dikatakan dan apa yang tidak dikatakan`, mustMentionFacts: facts.filter((f) => f.includes("Kutipan") || f.includes('"')) },
      { text: `Konteks yang Membuat Ini Berbeda`, focus: `Mengapa konpers ini lebih bermakna dari biasanya — situasi tim, tekanan, konteks kompetisi`, mustMentionFacts: facts.filter((f) => !f.includes('"')).slice(0, 2) },
      { text: `Apa yang Akan Terjadi Selanjutnya`, focus: `Implikasi pernyataan untuk laga, kebijakan, atau situasi ke depan`, mustMentionFacts: [] },
    ]
  }

  // TRIVIA
  return [
    { text: `Konteks yang Membuat Ini Penting`, focus: `Era, kondisi, dan situasi ketika fakta ini pertama kali terjadi`, mustMentionFacts: facts.slice(0, 3) },
    { text: `Detail yang Membuat Angka Ini Berbeda`, focus: `Nuansa dan fakta pendukung yang memperdalam pemahaman`, mustMentionFacts: facts.slice(3, 5) },
    { text: `Mengapa Ini Masih Relevan Hari Ini`, focus: `Hubungan ke sepak bola modern, pemain, atau tren saat ini`, mustMentionFacts: [] },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// PARAGRAPH GUIDE — [FIX #2]
// Tidak menyebut ulang fakta — hanya instruksi alur dan jumlah paragraf
// ─────────────────────────────────────────────────────────────────────────────
function buildParagraphGuide(newsType: NewsType, angle: ArticleAngle): string {
  const guides: Record<NewsType, string> = {
    hasil:    "Lead (1-2 paragraf dari leadExample, adaptasi ke data nyata) → [H1]: 2-3 paragraf sesuai focus H1 → [H2]: 2 paragraf sesuai focus H2, sertakan statistik jika ada → [H3]: 1-2 paragraf penutup dengan perspektif ke depan. JANGAN sebut ulang fakta yang sudah ada di paragraf sebelumnya.",
    preview:  "Lead (1-2 paragraf dari leadExample) → [H1]: 2 paragraf kondisi tim pertama + kondisi tim kedua → [H2]: 2 paragraf pertarungan taktis spesifik → [H3]: 1-2 paragraf data probabilitas sebagai konteks + kalimat penutup yang membuka rasa ingin tahu. Jangan simpulkan siapa yang menang.",
    cedera:   "Lead (1-2 paragraf dari leadExample, fokus pada ukuran kehilangan) → [H1]: 2 paragraf statistik sebagai narasi, bukan daftar angka → [H2]: 2 paragraf dampak taktis konkret, opsi pengganti → [H3]: 1-2 paragraf timeline dan implikasi ke jadwal kompetisi.",
    konpers:  "Lead (masuk langsung dengan kutipan TERKUAT atau suasana ruangan, 1-2 kalimat) → 1 paragraf konteks pre-konpers → [H1]: 2 paragraf analisis pernyataan utama → [H2]: 2 paragraf pernyataan pendukung + apa yang tidak dikatakan → [H3]: 1-2 paragraf implikasi.",
    transfer: "Lead (1-2 paragraf dari leadExample dengan fakta paling kuat) → [H1]: 2 paragraf latar belakang dan alasan → [H2]: 2 paragraf detail finansial dan kontraktual (jika tersedia) → [H3]: 2 paragraf dampak ke kedua klub. Jangan spekulasi angka yang tidak ada di brief.",
    trivia:   "Lead (fakta paling mengejutkan, 1-2 paragraf) → [H1]: 2 paragraf konteks historis → [H2]: 2 paragraf detail dan nuansa fakta pendukung → [H3]: 2 paragraf relevansi ke masa kini dan penutup yang resonan.",
  }
  return guides[newsType]
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: buildEditorialBrief
// ─────────────────────────────────────────────────────────────────────────────
export async function buildEditorialBrief(input: BuildBriefInput): Promise<EditorialBrief> {
  const { newsType, topic, bzzoiroText, serperText, tavilyText, manualContext } = input

  const serper = extractSerperData(serperText, newsType)
  const tavily = extractTavilyData(tavilyText, bzzoiroText, serperText, newsType)

  const [home, away] = parseTeamNames(bzzoiroText, topic)

  const hasilData   = newsType === "hasil"    ? parseBzzoiroHasil(bzzoiroText, home, away)   : undefined
  const previewData = newsType === "preview"  ? parseBzzoiroPreview(bzzoiroText, home, away) : undefined
  const playerData  = (newsType === "cedera" || newsType === "transfer") ? parseBzzoiroPlayer(bzzoiroText, topic) : undefined

  const angleResult = selectAngle(newsType, bzzoiroText, serper, tavily, { hasilData, previewData, playerData }, previewData?.winProbability)
  const angle = angleResult.angle

  // ── Bangun mustUse facts ──────────────────────────────────────────────────
  const mustUse: string[] = []
  const canUse:  string[] = []
  const doNotUse: string[] = [
    "Angka momentum mentah per menit",
    "xG per menit (hanya gunakan total xG)",
    "Data odds pre-match dalam format desimal",
    "Nama pemain yang tidak ada di keyPlayers",
  ]

  if (newsType === "hasil" && hasilData) {
    mustUse.push(`Skor akhir: ${hasilData.score} (${hasilData.home} vs ${hasilData.away})`)
    if (hasilData.competition) mustUse.push(`Kompetisi: ${hasilData.competition}`)
    hasilData.keyIncidents.forEach((i) => mustUse.push(`Menit ${i.minute}' — ${i.type} — ${i.player}${i.team ? ` (${i.team})` : ""}`))
    if (hasilData.momentumSummary) mustUse.push(`Gambaran permainan: ${hasilData.momentumSummary}`)
    if (hasilData.stats.xgTotal)   canUse.push(`xG: ${hasilData.home} ${hasilData.stats.xgTotal[0]} — ${hasilData.away} ${hasilData.stats.xgTotal[1]}`)
    if (hasilData.stats.possession) canUse.push(`Penguasaan bola: ${hasilData.home} ${hasilData.stats.possession[0]}% — ${hasilData.away} ${hasilData.stats.possession[1]}%`)
    if (hasilData.stats.shots)      canUse.push(`Tembakan: ${hasilData.home} ${hasilData.stats.shots[0]} (tepat sasaran ${hasilData.stats.shotsOnTarget?.[0] ?? "?"}) — ${hasilData.away} ${hasilData.stats.shots[1]} (${hasilData.stats.shotsOnTarget?.[1] ?? "?"})`)
    if (hasilData.stats.bestPlayer) canUse.push(`Man of the Match: ${hasilData.stats.bestPlayer}`)
  }

  if (newsType === "preview" && previewData) {
    mustUse.push(`Pertandingan: ${previewData.home} vs ${previewData.away}, ${previewData.matchDate}`)
    if (previewData.winProbability) mustUse.push(`Win probability: ${previewData.winProbability.label}`)
    if (previewData.h2hSummary)     mustUse.push(`H2H: ${previewData.h2hSummary}`)
    if (previewData.formHome)       mustUse.push(`Form ${previewData.home}: ${previewData.formHome.split("\n").slice(0, 3).join(" | ")}`)
    if (previewData.formAway)       mustUse.push(`Form ${previewData.away}: ${previewData.formAway.split("\n").slice(0, 3).join(" | ")}`)
    if (previewData.standingsHome)  canUse.push(previewData.standingsHome)
    if (previewData.standingsAway)  canUse.push(previewData.standingsAway)
  }

  if ((newsType === "transfer" || newsType === "cedera") && playerData) {
    mustUse.push(`Pemain: ${playerData.name} (${playerData.position}, ${playerData.team})`)
    if (playerData.age)         mustUse.push(`Usia: ${playerData.age}`)
    if (playerData.marketValue) mustUse.push(`Nilai pasar: ${playerData.marketValue}`)
    if (playerData.recentStats.summary) mustUse.push(`Statistik 5 laga terakhir: ${playerData.recentStats.summary}`)
    if (serper.transferStatus)  mustUse.push(`Status: ${serper.transferStatus}`)
    playerData.recentStats.details.slice(0, 3).forEach((d) =>
      canUse.push(`${d.match}: ${d.minutes} menit${d.goals != null ? `, ${d.goals} gol` : ""}${d.assists != null ? `, ${d.assists} assist` : ""}${d.rating != null ? `, rating ${d.rating}` : ""}`)
    )
  }

  if (newsType === "konpers") {
    serper.quotes.forEach((q) => mustUse.push(`Kutipan: "${q.text}" — ${q.speaker}`))
    serper.mediaHighlights.forEach((h) => mustUse.push(h))
  }

  if (newsType === "trivia") {
    const manualFacts = manualContext.split("\n").map((l) => l.trim()).filter((l) => l.length > 15)
    manualFacts.forEach((f) => mustUse.push(f))
  }

  // Serper dan Tavily sebagai canUse (bukan mustUse) untuk semua tipe
  if (newsType !== "konpers") {
    serper.mediaHighlights.forEach((h) => canUse.push(h))
    tavily.additionalFacts.forEach((f) => canUse.push(f))
  }

  // Manual context (non-trivia)
  if (manualContext.trim() && newsType !== "trivia") {
    manualContext.split("\n").filter((l) => l.trim().length > 10)
      .forEach((l) => canUse.push(`[Admin] ${l.trim()}`))
  }

  // ── Quotes dari Serper ────────────────────────────────────────────────────
  const quotes: EditorialBriefQuote[] = serper.quotes.slice(0, 3).map((q, i) => ({
    text: q.text,
    speaker: q.speaker,
    placement: (i === 0 ? "middle" : i === 1 ? "closing" : "middle") as EditorialBriefQuote["placement"],
  }))

  // Konpers: kutipan pertama bisa jadi lead
  if (newsType === "konpers" && quotes.length > 0) {
    quotes[0].placement = "lead"
  }

  // ── Key players ───────────────────────────────────────────────────────────
  const keyPlayers: string[] = []
  if (hasilData) {
    const seen = new Set<string>()
    hasilData.keyIncidents.forEach((i) => {
      if (i.player && !seen.has(i.player)) {
        seen.add(i.player)
        keyPlayers.push(`${i.player}${i.team ? ` (${i.team})` : ""} — ${i.type} menit ${i.minute}'`)
      }
    })
    if (hasilData.stats.bestPlayer) keyPlayers.push(`${hasilData.stats.bestPlayer} — Man of the Match`)
  }
  if (playerData) keyPlayers.push(`${playerData.name} (${playerData.team}) — subjek utama`)
  if (serper.manOfMatch && !keyPlayers.some((p) => p.includes(serper.manOfMatch!)))
    keyPlayers.push(`${serper.manOfMatch} — Man of the Match`)

  // ── Build H2s ─────────────────────────────────────────────────────────────
  const suggestedH2s = buildH2s(newsType, angle, hasilData, previewData, playerData, mustUse)

  // ── Data quality warnings ─────────────────────────────────────────────────
  const dataQualityWarnings = buildDataWarnings(newsType, playerData, hasilData)

  // ── Build brief ───────────────────────────────────────────────────────────
  const brief: EditorialBrief = {
    meta: {
      newsType,
      topic,
      generatedAt:       new Date().toISOString(),
      tokenEstimate:     0,
      dataQualityWarnings,
    },
    seo: buildSeoMeta(newsType, topic, home || undefined, away || undefined),
    angle: {
      primary:           angle,
      rationale:         angleResult.rationale,
      headlineDirection: angleResult.headlineDirection,
      narrativeFocus:    angleResult.narrativeFocus,
    },
    keyFacts: { mustUse, canUse, doNotUse },
    storylines: {
      leadExample:       buildLeadExample(newsType, angle, hasilData, previewData, playerData, serper),
      leadInstruction:   buildLeadInstruction(newsType, angle),
      primaryStoryline:  angleResult.narrativeFocus,
      subStorylines:     angleResult.subStorylines,
      transitionHints:   buildTransitionHints(newsType, angle, suggestedH2s.length),
    },
    keyPlayers: keyPlayers.slice(0, 6),
    quotes,
    structureHints: {
      suggestedH2s,
      paragraphGuide: buildParagraphGuide(newsType, angle),
    },
    wordTarget: WORD_TARGETS[newsType],
    qualityGate: {
      ...DEFAULT_QUALITY_GATE,
      requiresBlockquote: quotes.length > 0,
    },
  }

  brief.meta.tokenEstimate = estimateTokens(JSON.stringify(brief))

  return brief
}
