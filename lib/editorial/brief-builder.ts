// lib/editorial/brief-builder.ts — v3
//
// PERUBAHAN DARI v2 (disesuaikan dengan PDF Data Mapping HalfSpace):
// ✓ [PDF Preview]   parseBzzoiroPreview: tambah predicted_lineup, oddsComparison
//                   (14 bookmaker), averagePositions, aiPreview (Haiku 4.5, referensi awal)
// ✓ [PDF Preview]   mustUse: predicted XI home & away, odds pasar sebagai canUse
//                   aiPreview masuk canUse + doNotUse warning (bukan fakta primer)
// ✓ [PDF Cedera]    parseBzzoiroCedera: pisah dari parseBzzoiroPlayer —
//                   tambah predicted_lineup tanpa pemain, odds impact, upcoming matches
// ✓ [PDF Cedera]    buildH2s cedera: H2 kedua kini fokus projected lineup + pengganti
//                   H2 ketiga kini berisi laga terdampak dari upcoming matches
// ✓ [PDF Cedera]    buildDataWarnings: warning baru jika predicted_lineup kosong
// ✓ [PDF Trivia]    parseBzzoiroTrivia: memanfaatkan shotmap xG per shot,
//                   historical stats 139k+ records, H2H lintas musim 66 liga
//                   (bukan hanya manualContext seperti v2)
// ✓ [PDF Trivia]    buildDataWarnings: warning baru jika shotmap + stats kosong
// ✓ [PDF Trivia]    mustUse trivia: shotmap facts + historical facts dari Bzzoiro,
//                   manualContext sebagai pelengkap
// TIDAK BERUBAH dari v2:
// ✓ [FIX #1]  leadExample: kalimat pembuka KONKRET berdasarkan data nyata
// ✓ [FIX #2]  paragraphGuide tidak menyebut ulang fakta — hanya instruksi alur
// ✓ [FIX #3]  transitionHints: instruksi eksplisit kalimat jembatan
// ✓ [FIX #6]  suggestedH2s: setiap H2 punya focus dan mustMentionFacts
// ✓ [FIX #7]  dataQualityWarnings: blokir hallucination saat data tidak lengkap
// ✓ [FIX #9]  seoKeywords: keyword wajib masuk judul & 100 kata pertama
// ✓ [FIX #11] isComeback() diperbaiki di angle-selector

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
  type BzzoiroExtractedCedera,
  type BzzoiroExtractedTrivia,
  type BzzoiroPredictedLineup,
  summarizeMomentum,
  extractKeyIncidents,
  extractStats,
  formatWinProbability,
  summarizeH2H,
  extractPredictedLineup,
  extractAveragePositions,
  extractOddsComparison,
  extractShotmap,
  extractTriviaFacts,
  extractAiPreview,
  extractUpcomingMatches,
} from "./extractors/bzzoiro-extractor"
import {
  type SerperExtracted,
  type TavilyExtracted,
  extractSerperData,
  extractTavilyData,
} from "./extractors/media-extractor"
import { selectAngle } from "./angle-selector"
import type { AngleResult } from "./angle-selector"
import type { ArticleAngle } from "./types"
import { translateQuotes, translateMediaFacts } from "../ai/translation" // NEWv4 — terjemahan kutipan & fakta media terkontrol, lihat catatan di buildEditorialBrief
import { formatDateIndonesian } from "./date-formatter" // NEWv4 — normalisasi tanggal Bzzoiro ke format Indonesia yang tidak ambigu
import { validateTranslatedQuotes } from "./brief-validator" // NEWv4 — validasi integritas nama entitas pasca-terjemahan kutipan

interface BuildBriefInput {
  newsType: NewsType
  topic: string
  bzzoiroText: string
  serperText: string
  tavilyText: string
  manualContext: string
}

// Tipe internal untuk membawa parsed data antar fungsi build
interface ParsedBzzoiroData {
  hasilData?:   BzzoiroExtractedHasil
  previewData?: BzzoiroExtractedPreview
  playerData?:  BzzoiroExtractedPlayer
  cederaData?:  BzzoiroExtractedCedera
  triviaData?:  BzzoiroExtractedTrivia
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
  const rawDate = bzzoiroText.match(/Tanggal:\s*(.+)/)?.[1]?.trim() ?? ""
  // NEWv4: normalisasi tanggal ke format Indonesia tidak ambigu (lihat
  // date-formatter.ts). Kalau format asli tidak dikenali, formatted.display
  // fallback ke rawDate apa adanya (TIDAK pernah menampilkan tanggal yang
  // sudah diproses tapi mungkin salah).
  const formattedDate = formatDateIndonesian(rawDate)
  return {
    home, away,
    score:       bzzoiroText.match(/SKOR AKHIR:\s*(.+)/)?.[1]?.trim() ?? "? - ?",
    competition: bzzoiroText.match(/Liga\/Kompetisi:\s*(.+)/)?.[1]?.trim() ?? "",
    date:        formattedDate.display || rawDate,
    venue:       bzzoiroText.match(/Venue:\s*(.+)/)?.[1]?.trim(),
    keyIncidents: extractKeyIncidents(bzzoiroText),
    stats:        extractStats(bzzoiroText),
    momentumSummary: summarizeMomentum(bzzoiroText, home, away),
  }
}

// NEWv3: Golden standard match report SELALU dibuka dengan dateline
// "KOTA — narasi..." (contoh: "PHILADELPHIA — Brasil meraih kemenangan...").
// Helper ini mengambil nama kota dari string venue mentah Bzzoiro, yang
// biasanya berformat "Stadion X, Kota" atau "Kota, Negara" atau cuma "Kota".
// Heuristik longgar: ambil token terakhir setelah koma jika ada koma; kalau
// tidak ada koma, ambil kata terakhir dari venue (paling sering nama kota
// ditempel di akhir nama stadion, mis. "AT&T Stadium Dallas" → "Dallas").
function extractCityFromVenue(venue?: string): string | undefined {
  if (!venue) return undefined
  const trimmed = venue.trim()
  if (!trimmed) return undefined
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean)
    return parts[parts.length - 1]
  }
  const words = trimmed.split(/\s+/).filter(Boolean)
  return words[words.length - 1]
}

// NEWv3: Parser untuk blok "PERTANDINGAN TERKAIT KONPERS" — laga terbaru yang
// melatari konferensi pers (skor, kompetisi, venue, tanggal). Golden standard
// artikel konpers selalu menyebut fakta ini di paragraf pembuka, jadi field
// ini WAJIB ada di mustUse, bukan sekadar tersembunyi di teks mentah.
// NEWv3: di-export (sebelumnya private) — dipakai ulang di
// app/api/generate-brief/route.ts untuk membangun extraTerms (skor/tanggal
// laga) yang disisipkan ke query Serper & Tavily khusus tipe konpers, supaya
// hasil pencarian media/konteks terikat ke laga yang sama persis dengan yang
// diidentifikasi di Bzzoiro — bukan dihitung ulang dengan regex duplikat.
export interface KonpersMatchInfo {
  matchup: string   // "Uruguay 0 - 1 Spanyol"
  competition?: string
  venue?: string
  date?: string
}
export function parseKonpersMatch(bzzoiroText: string): KonpersMatchInfo | undefined {
  const block = bzzoiroText.match(/PERTANDINGAN TERKAIT KONPERS[^:]*:\s*\n([\s\S]+?)(?:\n\nFORM|\nFORM 5|$)/)?.[1]
  if (!block) return undefined
  const matchup = block.match(/^\s*(.+?\s+\d+\s*-\s*\d+\s+.+?)\s*$/m)?.[1]?.trim()
  if (!matchup) return undefined
  const rawDate = block.match(/Tanggal:\s*(.+)/)?.[1]?.trim()
  // NEWv4: normalisasi tanggal — lihat catatan di parseBzzoiroHasil di atas.
  const formattedDate = rawDate ? formatDateIndonesian(rawDate) : undefined
  return {
    matchup,
    competition: block.match(/Kompetisi:\s*(.+)/)?.[1]?.trim(),
    venue:       block.match(/Venue:\s*(.+)/)?.[1]?.trim(),
    date:        formattedDate?.display || rawDate,
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
    // NEWv3: data tambahan per PDF — predicted_lineup, odds/comparison, average_positions, ai_preview
    predictedLineup:  extractPredictedLineup(bzzoiroText, home, away),
    averagePositions: extractAveragePositions(bzzoiroText),
    oddsComparison:   extractOddsComparison(bzzoiroText, home, away),
    aiPreview:        extractAiPreview(bzzoiroText),
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

// NEWv3: Parser untuk Cedera — includes predicted_lineup (proyeksi tanpa pemain),
// odds impact, dan upcoming matches. Per PDF: Bzzoiro adalah sumber untuk
// player stats SEBELUM cedera + projected lineup + dampak odds.
function parseBzzoiroCedera(bzzoiroText: string, topic: string): BzzoiroExtractedCedera {
  const player = parseBzzoiroPlayer(bzzoiroText, topic)
  const teamName = player.team

  // Proyeksi lineup TANPA pemain yang cedera
  const withoutSection = bzzoiroText.match(
    /LINEUP WITHOUT[^:]*:\s*\n([\s\S]+?)(?=\nODDS IMPACT|\nUPCOMING|\n\n|$)/i
  )?.[1] ?? ""
  const projFormation = withoutSection.match(/Formation[:\s]+([0-9-]+)/i)?.[1]?.trim() ?? ""
  const replacementsRaw = withoutSection.match(/(?:Likely Replacement|Pengganti)[s]?[:\s]+(.+)/i)?.[1] ?? ""
  const likelyReplacements = replacementsRaw.split(",").map((s) => s.trim()).filter(Boolean)

  const withoutPlayer = (projFormation || likelyReplacements.length > 0)
    ? { team: teamName, projectedFormation: projFormation, likelyReplacements }
    : undefined

  // Odds impact — pergeseran odds akibat absensi
  const oddsImpact = bzzoiroText.match(/ODDS IMPACT[^:]*:\s*(.+)/i)?.[1]?.trim()

  // Upcoming matches yang terdampak
  const upcomingMatches = extractUpcomingMatches(bzzoiroText)

  return { player, predictedLineupWithout: withoutPlayer, oddsImpact, upcomingMatches }
}

// NEWv3: Parser untuk Trivia — memanfaatkan database besar Bzzoiro.
// Per PDF: 62k+ pemain, 139k+ stats records, shotmap 15.5k pertandingan,
// per-shot xG unik, head-to-head 66 liga x 68k+ match, momentum historis.
function parseBzzoiroTrivia(bzzoiroText: string, manualContext: string): BzzoiroExtractedTrivia {
  const manualFacts = manualContext.split("\n").map((l) => l.trim()).filter((l) => l.length > 15)
  return extractTriviaFacts(bzzoiroText, manualFacts)
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO BUILDER — keyword otomatis dari topik dan newsType
// NEWv3: tambah parameter `mustUse` — golden standard SELALU menulis meta
// description sebagai 1 kalimat ringkas berisi fakta inti (skor, tanggal,
// venue/kompetisi, nama kunci), bukan kalimat generik. Field ini diteruskan
// ke Gemma sebagai daftar fakta WAJIB masuk meta description, supaya hasilnya
// konsisten konkret seperti "Brasil menang 3-0 atas Haiti di Stadion
// Philadelphia pada laga Piala Dunia, Sabtu (20/6/2026)..." — bukan kalimat
// kosong seperti "Simak ulasan lengkap pertandingan ini di artikel berikut."
// ─────────────────────────────────────────────────────────────────────────────
function buildSeoMeta(newsType: NewsType, topic: string, home?: string, away?: string, mustUse?: string[]): SeoMeta {
  const cleanTopic = topic.trim()
  const facts = mustUse ?? []

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

  // Pilih fakta paling konkret untuk tiap tipe — pola sama dengan golden
  // standard: skor+tanggal+venue (hasil/konpers), matchDate+winProbability
  // (preview), nilai transfer (transfer), diagnosa+timeline (cedera), fakta
  // rekor utama (trivia). Maksimal 3 fakta supaya tetap ringkas ~140-180 char.
  const metaFactsByType: Record<NewsType, string[]> = {
    hasil:    facts.filter((f) => f.startsWith("Skor akhir") || f.startsWith("Kompetisi") || f.startsWith("Menit")).slice(0, 3),
    preview:  facts.filter((f) => f.startsWith("Pertandingan") || f.startsWith("Win probability")).slice(0, 2),
    transfer: facts.filter((f) => f.includes("Nilai pasar") || f.startsWith("Pemain") || f.includes("Status")).slice(0, 2),
    cedera:   facts.filter((f) => f.startsWith("Pemain") || f.includes("Diagnosa") || f.includes("Dampak odds")).slice(0, 2),
    konpers:  facts.filter((f) => f.startsWith("Kutipan")).slice(0, 1),
    trivia:   facts.slice(0, 2),
  }

  return {
    primaryKeyword:        primaryByType[newsType],
    secondaryKeywords:     secondaryByType[newsType],
    titleTemplate:         templateByType[newsType],
    metaDescriptionFacts:  metaFactsByType[newsType],
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// DATA QUALITY WARNINGS — [FIX #7]
// ─────────────────────────────────────────────────────────────────────────────
function buildDataWarnings(
  newsType: NewsType,
  playerData?: BzzoiroExtractedPlayer,
  hasilData?: BzzoiroExtractedHasil,
  cederaData?: BzzoiroExtractedCedera,
  triviaData?: BzzoiroExtractedTrivia,
  quoteTranslationFailureCount = 0, // NEWv4
  mediaFactsTranslationFailed = false, // NEWv4
  quoteIntegrityIssues: { field: string; reason: string }[] = [], // NEWv4
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
  // NEWv3: Warning untuk Cedera — jika tidak ada predicted_lineup
  if (newsType === "cedera" && cederaData && !cederaData.predictedLineupWithout) {
    warnings.push({
      field: "predicted_lineup_without",
      status: "missing",
      instruction: "Proyeksi lineup tanpa pemain cedera TIDAK TERSEDIA dari Bzzoiro. DILARANG menyebut nama kandidat pengganti spesifik kecuali ada di canUse. Tulis dampak taktis secara umum.",
    })
  }
  // NEWv3: Warning untuk Trivia — jika shotmap kosong (tidak ada xG per shot)
  if (newsType === "trivia" && triviaData && triviaData.topShotmapFacts.length === 0 && triviaData.historicalStatFacts.length === 0) {
    warnings.push({
      field: "trivia_bzzoiro_data",
      status: "missing",
      instruction: "Data shotmap xG dan statistik historis dari Bzzoiro TIDAK TERSEDIA. Artikel trivia hanya boleh menggunakan fakta dari manualContext. DILARANG mengarang statistik historis.",
    })
  }
  // NEWv4: Warning jika terjemahan kutipan gagal (API error/timeout) dan
  // fallback passthrough dipakai — kutipan kemungkinan masih berbahasa
  // Inggris atau kurang natural. Editor manusia perlu mengecek kutipan ini
  // sebelum publish (lihat lib/ai/quote-translator.ts).
  if (quoteTranslationFailureCount > 0) {
    warnings.push({
      field: "quote_translation",
      status: "partial",
      instruction: `${quoteTranslationFailureCount} kutipan GAGAL diterjemahkan otomatis ke Bahasa Indonesia (API error/timeout) dan memakai fallback teks asli. WAJIB cek manual sebelum publish — kutipan ini mungkin masih berbahasa Inggris atau kurang natural. Jangan biarkan Gemma menerjemahkan ulang kutipan ini sendiri.`,
    })
  }
  // NEWv4: Warning jika terjemahan fakta media (transferStatus/
  // injuryStatement/mediaHighlights/dst) gagal — field-field ini kemungkinan
  // masih berbahasa Inggris di mustUse/canUse.
  if (mediaFactsTranslationFailed) {
    warnings.push({
      field: "media_facts_translation",
      status: "partial",
      instruction: `Penerjemahan fakta media (status transfer/cedera/highlight) GAGAL (API error/timeout). Sebagian fakta di mustUse/canUse mungkin masih berbahasa Inggris. WAJIB cek manual sebelum publish.`,
    })
  }
  // NEWv4: Warning jika validasi integritas terjemahan kutipan menemukan
  // masalah (nama hilang, atau hasil terjemahan menggembung) — lihat
  // checkTranslationIntegrity() di brief-validator.ts.
  if (quoteIntegrityIssues.length > 0) {
    warnings.push({
      field: "quote_translation_integrity",
      status: "partial",
      instruction: `Validasi integritas terjemahan kutipan menemukan ${quoteIntegrityIssues.length} masalah: ${quoteIntegrityIssues.map((i) => i.reason).join(" | ")}. WAJIB cek manual kutipan ini sebelum publish — kemungkinan nama berubah atau ada informasi tambahan yang tidak ada di sumber asli.`,
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
  bzzoiroText?: string,
): string {
  // HASIL
  // NEWv3: golden standard match report SELALU dibuka dengan dateline
  // "KOTA — narasi faktual (skor, kompetisi, tanggal)..." dalam SATU paragraf
  // lead, baru paragraf KEDUA boleh masuk angle/dramatisasi. Sebelumnya
  // leadExample di sini langsung melompat ke kalimat dramatis tanpa dateline
  // sama sekali — sekarang dateline+fakta inti digabung sebagai kalimat
  // pembuka WAJIB, dan variasi angle di bawah ini jadi kalimat KEDUA dst.
  if (newsType === "hasil" && hasilData) {
    const { home, away, score, competition, date, keyIncidents } = hasilData
    const city = extractCityFromVenue(hasilData.venue)
    const dateline = city ? `${city.toUpperCase()} — ` : ""
    const compPhrase = competition ? ` dalam laga ${competition}` : ""
    const datePhrase = date ? `, ${date}` : ""
    const factualOpening = `${dateline}${home} ${parseInt(score.split("-")[0]?.trim() ?? "0") >= parseInt(score.split("-")[1]?.trim() ?? "0") ? "meraih kemenangan" : "menghadapi"} ${score} atas ${away}${compPhrase}${datePhrase}.`

    const redCard = keyIncidents.find((i) => i.type.toLowerCase().includes("red"))
    const firstGoal = keyIncidents.find((i) => i.type.toLowerCase().includes("goal") && !i.type.toLowerCase().includes("own"))

    if (angle === "upset_result") {
      return `${factualOpening} Angka tidak pernah salah. Kecuali malam itu — ketika ${away} tiba dengan probabilitas menang yang kecil, tidak ada yang menyangka mereka yang akan meninggalkan lapangan dengan tiga poin.`
    }
    if (angle === "comeback" && firstGoal) {
      const scoreParts = score.match(/(\d+)\s*-\s*(\d+)/)
      const winner = scoreParts && parseInt(scoreParts[1]) > parseInt(scoreParts[2]) ? home : away
      return `${factualOpening} Untuk beberapa saat, semuanya terlihat sudah ditentukan. Lalu ${winner} membuktikan bahwa pertandingan baru benar-benar selesai ketika peluit terakhir dibunyikan.`
    }
    if (angle === "controversy" && redCard) {
      return `${factualOpening} Menit ${redCard.minute}, kartu merah untuk ${redCard.player} mengubah segalanya — sejak saat itu, ini bukan lagi pertandingan yang sama.`
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
      if (hatTrickPlayer) return `${factualOpening} Tiga gol, satu pemain — ${hatTrickPlayer} mencatatkan namanya dalam pertandingan yang tidak akan dilupakan siapapun yang menyaksikannya.`
    }
    if (hasilData.stats.xgTotal) {
      const [xgH, xgA] = hasilData.stats.xgTotal
      return `${factualOpening} xG ${home} ${xgH}, xG ${away} ${xgA} — angka yang seharusnya menceritakan siapa yang lebih dominan, namun kenyataan di papan skor berbicara dengan caranya sendiri.`
    }
    return factualOpening
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
  // NEWv3: golden standard konpers SELALU punya 2 paragraf lead — paragraf 1
  // atmosferik/dramatis (tanpa angka), paragraf 2 fakta konkret hasil laga +
  // venue + tanggal (mis. "Uruguay kalah 0-1 dari Spanyol pada laga pamungkas
  // Grup H di Stadion Guadalajara, Sabtu (27/6/2026)."). Sebelumnya leadExample
  // konpers cuma 1 kalimat atmosferik tanpa fakta sama sekali.
  if (newsType === "konpers") {
    const konpersMatch = parseKonpersMatch(bzzoiroText ?? "")
    const factualSecondPara = konpersMatch
      ? ` ${konpersMatch.matchup}${konpersMatch.competition ? ` pada laga ${konpersMatch.competition}` : ""}${konpersMatch.venue ? ` di ${konpersMatch.venue}` : ""}${konpersMatch.date ? `, ${konpersMatch.date}` : ""}.`
      : ""

    if (serper?.quotes && serper.quotes.length > 0) {
      return `Pelatih itu tidak butuh banyak kata. Tapi kata-kata yang keluar dari bibirnya hari itu terasa lebih berat dari biasanya.${factualSecondPara}`
    }
    return `Konferensi pers bisa menjadi formalitas. Tapi ada momen-momen ketika ruangan itu menjadi tempat di mana arah sebuah musim ditentukan.${factualSecondPara}`
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
  cederaData?: BzzoiroExtractedCedera,
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
    // NEWv3: H2 ketiga lebih konkret — laga terdampak dari upcoming events Bzzoiro
    const upcomingFacts = cederaData?.upcomingMatches.slice(0, 2).map(
      (m) => `Laga terdampak: ${m.opponent} (${m.competition})`
    ) ?? []
    return [
      { text: `Angka yang Menjelaskan Ukuran Kehilangan`, focus: `Statistik ${playerData.name} dalam 5 laga terakhir sebagai bukti konkret dampaknya`, mustMentionFacts: facts.filter((f) => f.includes("menit") || f.includes("gol") || f.includes("assist")) },
      { text: `Dampak ke Taktik dan Rencana Tim`, focus: `Bagaimana cedera ini mengubah opsi pelatih — proyeksi formasi, kandidat pengganti dari predicted_lineup`, mustMentionFacts: facts.filter((f) => f.includes("Proyeksi") || f.includes("absen") || f.includes("pengganti") || f.includes("formasi")) },
      { text: `Jalan Menuju Kembali`, focus: `Timeline pemulihan, laga-laga krusial yang akan dilewati, dan dampak odds`, mustMentionFacts: [...facts.filter((f) => f.includes("minggu") || f.includes("bulan") || f.includes("odds")), ...upcomingFacts] },
    ]
  }

  if (newsType === "konpers") {
    return [
      { text: `Di Balik Kata-Kata Itu`, focus: `Analisis pernyataan terkuat — apa yang dikatakan dan apa yang tidak dikatakan`, mustMentionFacts: facts.filter((f) => f.includes("Kutipan") || f.includes('"')) },
      { text: `Konteks yang Membuat Ini Berbeda`, focus: `Mengapa konpers ini lebih bermakna dari biasanya — situasi tim, tekanan, konteks kompetisi`, mustMentionFacts: facts.filter((f) => !f.includes('"')).slice(0, 2) },
      { text: `Apa yang Akan Terjadi Selanjutnya`, focus: `Implikasi pernyataan untuk laga, kebijakan, atau situasi ke depan`, mustMentionFacts: [] },
    ]
  }

  // TRIVIA — NEWv3: H2 sekarang lebih konkret berdasarkan jenis data Bzzoiro yang tersedia
  return [
    { text: `Konteks yang Membuat Ini Penting`, focus: `Era, kondisi, dan situasi ketika fakta ini pertama kali terjadi`, mustMentionFacts: facts.slice(0, 3) },
    { text: `Detail yang Membuat Angka Ini Berbeda`, focus: `Nuansa dan fakta pendukung — termasuk xG per shot jika tersedia dari database Bzzoiro`, mustMentionFacts: facts.slice(3, 5) },
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

  // NEWv4: dipindah ke atas (sebelumnya dipanggil sesudah blok terjemahan
  // kutipan) — supaya home/away sudah tersedia untuk quoteIntegrityCheck di
  // bawah, yang butuh tahu nama tim agar bisa memverifikasi nama itu tetap
  // muncul utuh di hasil terjemahan kutipan.
  const [home, away] = parseTeamNames(bzzoiroText, topic)

  // NEWv4: TERJEMAHAN KUTIPAN TERKONTROL — lihat lib/ai/quote-translator.ts.
  // serper.quotes hasil extractSerperData() masih berbahasa Inggris (karena
  // serper.ts/tavily.ts sekarang diarahkan ke ESPN/Sky Sports/Goal.com).
  // Sebelumnya rencana awal membiarkan Gemma menerjemahkan kutipan sambil
  // menulis draft — RISIKO TINGGI karena kutipan adalah ucapan langsung
  // seseorang, idiom bisa melenceng maknanya, dan tidak ada tahap verifikasi
  // terpisah. Sekarang kutipan diterjemahkan SEBELUM masuk ke brief lewat
  // pemanggilan LLM kecil & terkontrol (temperature 0.1, tugas tunggal),
  // supaya saat sampai ke Gemma, kutipan SUDAH final dalam Bahasa Indonesia
  // dan Gemma tinggal menyalinnya apa adanya (tidak boleh diterjemahkan/
  // diparafrase ulang — lihat aturan mutlak baru di gemma-writer-prompt.ts).
  // translatedQuotes.translationOk:false menandai kutipan yang GAGAL
  // diterjemahkan (API error/timeout) — brief-validator memakai flag ini
  // untuk menambahkan dataQualityWarnings (lihat brief-validator.ts).
  const translatedQuotes = await translateQuotes(serper.quotes)
  serper.quotes = translatedQuotes.map((tq) => ({ text: tq.text, speaker: tq.speaker, source: tq.source }))
  const quoteTranslationFailures = translatedQuotes.filter((tq) => !tq.translationOk)

  // NEWv4: VALIDASI INTEGRITAS TERJEMAHAN — lihat checkTranslationIntegrity()
  // di brief-validator.ts. Mengecek bahwa nama tim/pemain tetap utuh di hasil
  // terjemahan kutipan, dan hasil terjemahan tidak "menggembung" berisi
  // informasi tambahan yang tidak ada di teks asli. Ini lapis verifikasi
  // TERPISAH dari translateQuotes() sendiri — supaya kalaupun model
  // penerjemah "lolos" menghasilkan output yang formatnya valid tapi
  // isinya menyimpang, masalah itu tetap terdeteksi di sini, bukan baru
  // ketahuan setelah draft jadi/dipublish.
  const quoteIntegrityCheck = validateTranslatedQuotes(translatedQuotes, [home, away])

  // NEWv4: terjemahan fakta media non-kutipan (transferStatus, injuryStatement,
  // mediaHighlights dari Serper; injuryDetails, transferTimeline,
  // additionalFacts dari Tavily) — lihat catatan lengkap di
  // lib/ai/translation.ts (translateMediaFacts). Field-field ini sebelumnya
  // langsung dimasukkan apa adanya (Bahasa Inggris) ke mustUse/canUse, dengan
  // risiko Gemma mencampur Inggris-Indonesia dalam draft.
  const translatedMediaFacts = await translateMediaFacts({
    transferStatus:   serper.transferStatus,
    injuryStatement:  serper.injuryStatement,
    injuryDetails:    tavily.injuryDetails,
    transferTimeline: tavily.transferTimeline,
    mediaHighlights:  serper.mediaHighlights,
    additionalFacts:  tavily.additionalFacts,
  })
  serper.transferStatus   = translatedMediaFacts.transferStatus
  serper.injuryStatement  = translatedMediaFacts.injuryStatement
  serper.mediaHighlights  = translatedMediaFacts.mediaHighlights ?? serper.mediaHighlights
  tavily.injuryDetails    = translatedMediaFacts.injuryDetails
  tavily.transferTimeline = translatedMediaFacts.transferTimeline
  tavily.additionalFacts  = translatedMediaFacts.additionalFacts ?? tavily.additionalFacts
  const mediaFactsTranslationFailed = !translatedMediaFacts.translationOk

  const hasilData   = newsType === "hasil"    ? parseBzzoiroHasil(bzzoiroText, home, away)   : undefined
  const previewData = newsType === "preview"  ? parseBzzoiroPreview(bzzoiroText, home, away) : undefined

  // NEWv3: cedera sekarang pakai parseBzzoiroCedera (ada predicted_lineup + odds impact + upcoming)
  // transfer tetap pakai parseBzzoiroPlayer (cukup player profile + stats saja)
  const cederaData  = newsType === "cedera"   ? parseBzzoiroCedera(bzzoiroText, topic) : undefined
  const playerData  = newsType === "transfer" ? parseBzzoiroPlayer(bzzoiroText, topic)
                    : newsType === "cedera"   ? cederaData?.player
                    : undefined

  // NEWv3: trivia pakai parseBzzoiroTrivia (shotmap xG + historical stats dari database besar Bzzoiro)
  const triviaData  = newsType === "trivia"   ? parseBzzoiroTrivia(bzzoiroText, manualContext) : undefined

  const angleResult = selectAngle(newsType, bzzoiroText, serper, tavily, { hasilData, previewData, playerData, triviaData }, previewData?.winProbability)
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
    // NEWv3: predicted_lineup (lineup prediksi) dan odds/comparison (14 bookmaker)
    if (previewData.predictedLineup?.home) {
      const pl = previewData.predictedLineup.home
      mustUse.push(`Prediksi XI ${previewData.home}: ${pl.formation} — ${pl.startingXI.slice(0, 6).join(", ")}${pl.startingXI.length > 6 ? "..." : ""}`)
    }
    if (previewData.predictedLineup?.away) {
      const pl = previewData.predictedLineup.away
      mustUse.push(`Prediksi XI ${previewData.away}: ${pl.formation} — ${pl.startingXI.slice(0, 6).join(", ")}${pl.startingXI.length > 6 ? "..." : ""}`)
    }
    if (previewData.oddsComparison?.summary) canUse.push(`Odds pasar: ${previewData.oddsComparison.summary}`)
    // AI Preview dari Haiku 4.5 hanya sebagai referensi awal — masuk canUse, BUKAN mustUse
    // (per PDF: "referensi awal", bukan fakta primer)
    if (previewData.aiPreview?.rawText) {
      canUse.push(`[Referensi awal AI Preview Bzzoiro]: ${previewData.aiPreview.rawText.slice(0, 200)}...`)
      doNotUse.push("Angka atau klaim spesifik dari AI Preview Bzzoiro — verifikasi dulu ke data struktural di atas")
    }
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
    // NEWv3: Cedera — tambah predicted_lineup, odds impact, dan upcoming matches per PDF
    if (newsType === "cedera" && cederaData) {
      // Per PDF Serper (Cedera): "Laporan cedera terbaru & diagnosa resmi",
      // "Estimasi waktu kembali bermain (return date)", "Pernyataan resmi
      // klub/pelatih". Sebelumnya field ini hanya numpang lewat
      // mediaHighlights/additionalFacts generik tanpa label eksplisit —
      // sekarang dipush eksplisit sebagai mustUse karena ini fakta paling
      // dicari pembaca artikel cedera.
      if (serper.injuryStatement) mustUse.push(`Diagnosa/pernyataan resmi: ${serper.injuryStatement}`)
      // Per PDF Tavily (Cedera): "Riwayat cedera pemain sebelumnya". Sebelumnya
      // hanya lolos lewat tavily.additionalFacts tanpa label — sekarang masuk
      // canUse eksplisit supaya angle/narrativeFocus bisa merujuknya langsung.
      if (tavily.injuryDetails) canUse.push(`Riwayat/konteks cedera: ${tavily.injuryDetails}`)
      if (cederaData.predictedLineupWithout) {
        const wo = cederaData.predictedLineupWithout
        mustUse.push(`Proyeksi lineup ${wo.team} tanpa ${playerData.name}: formasi ${wo.projectedFormation || "?"}`)
        if (wo.likelyReplacements.length > 0)
          canUse.push(`Kandidat pengganti: ${wo.likelyReplacements.join(", ")}`)
      }
      if (cederaData.oddsImpact) mustUse.push(`Dampak odds: ${cederaData.oddsImpact}`)
      cederaData.upcomingMatches.slice(0, 3).forEach((m) =>
        canUse.push(`Laga terdampak: vs ${m.opponent} (${m.competition})${m.date ? `, ${m.date}` : ""}`)
      )
    }
  }

  if (newsType === "konpers") {
    // NEWv3: skor + venue + tanggal laga yang melatari konpers — golden
    // standard SELALU menyebut ini eksplisit di paragraf pembuka/kedua.
    const konpersMatch = parseKonpersMatch(bzzoiroText)
    if (konpersMatch) {
      mustUse.push(`Hasil laga: ${konpersMatch.matchup}${konpersMatch.competition ? ` (${konpersMatch.competition})` : ""}`)
      if (konpersMatch.venue) mustUse.push(`Venue: ${konpersMatch.venue}`)
      if (konpersMatch.date)  mustUse.push(`Tanggal: ${konpersMatch.date}`)
    }
    serper.quotes.forEach((q) => mustUse.push(`Kutipan: "${q.text}" — ${q.speaker}`))
    serper.mediaHighlights.forEach((h) => mustUse.push(h))
  }

  if (newsType === "trivia") {
    // NEWv3: Trivia pakai data dari Bzzoiro (shotmap xG + historical stats)
    // plus manualContext sebagai pelengkap — per PDF, Bzzoiro adalah use case
    // terkuat untuk trivia karena kedalaman database (62k+ pemain, 139k+ stats)
    if (triviaData) {
      triviaData.topShotmapFacts.forEach((f) => mustUse.push(f.description))
      triviaData.historicalStatFacts.forEach((f) => mustUse.push(f))
      if (triviaData.h2hCrossSeasonSummary) canUse.push(triviaData.h2hCrossSeasonSummary)
      if (triviaData.historicMomentumNote)  canUse.push(triviaData.historicMomentumNote)
      triviaData.manualFacts.forEach((f) => mustUse.push(f))
    } else {
      // Fallback ke manualContext murni jika Bzzoiro tidak mengembalikan trivia data
      const manualFacts = manualContext.split("\n").map((l) => l.trim()).filter((l) => l.length > 15)
      manualFacts.forEach((f) => mustUse.push(f))
    }
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
  // NEWv4: originalText diambil dari translatedQuotes (bukan serper.quotes,
  // yang sudah di-overwrite jadi versi terjemahan tanpa field original) —
  // lihat blok translateQuotes() di atas. Index harus konsisten karena
  // serper.quotes di-assign dari translatedQuotes.map(...) di urutan yang sama.
  const quotes: EditorialBriefQuote[] = serper.quotes.slice(0, 3).map((q, i) => ({
    text: q.text,
    speaker: q.speaker,
    placement: (i === 0 ? "middle" : i === 1 ? "closing" : "middle") as EditorialBriefQuote["placement"],
    originalText: translatedQuotes[i]?.original,
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
  const suggestedH2s = buildH2s(newsType, angle, hasilData, previewData, playerData, mustUse, cederaData)

  // ── Data quality warnings ─────────────────────────────────────────────────
  const dataQualityWarnings = buildDataWarnings(newsType, playerData, hasilData, cederaData, triviaData, quoteTranslationFailures.length, mediaFactsTranslationFailed, quoteIntegrityCheck.issues)

  // ── Build brief ───────────────────────────────────────────────────────────
  const brief: EditorialBrief = {
    meta: {
      newsType,
      topic,
      generatedAt:       new Date().toISOString(),
      tokenEstimate:     0,
      dataQualityWarnings,
    },
    seo: buildSeoMeta(newsType, topic, home || undefined, away || undefined, mustUse),
    angle: {
      primary:           angle,
      rationale:         angleResult.rationale,
      headlineDirection: angleResult.headlineDirection,
      narrativeFocus:    angleResult.narrativeFocus,
    },
    keyFacts: { mustUse, canUse, doNotUse },
    storylines: {
      leadExample:       buildLeadExample(newsType, angle, hasilData, previewData, playerData, serper, bzzoiroText),
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
