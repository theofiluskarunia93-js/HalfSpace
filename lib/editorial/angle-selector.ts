// lib/editorial/angle-selector.ts — v2
//
// PERUBAHAN DARI v1 (berdasarkan audit):
// ✓ [FIX #11] isComeback() diperbaiki — harus ada kronologi tim tertinggal lalu berbalik
//             v1 memberikan false positive karena hanya cek "ada gol di babak 1 + total ≥ 2"
//             v2 melacak skor berjalan dari urutan insiden untuk deteksi comeback nyata

import type { ArticleAngle, NewsType } from "./types"
import type {
  BzzoiroExtractedHasil,
  BzzoiroExtractedPreview,
  BzzoiroExtractedPlayer,
} from "./extractors/bzzoiro-extractor"
import type { SerperExtracted, TavilyExtracted } from "./extractors/media-extractor"

export interface AngleResult {
  angle: ArticleAngle
  rationale: string
  headlineDirection: string
  narrativeFocus: string
  subStorylines: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function hasRedCard(incidents: BzzoiroExtractedHasil["keyIncidents"]): boolean {
  return incidents.some((i) => i.type.toLowerCase().includes("red"))
}

function hasPenalty(incidents: BzzoiroExtractedHasil["keyIncidents"]): boolean {
  return incidents.some((i) =>
    i.type.toLowerCase().includes("penalty") || i.type.toLowerCase().includes("penalti")
  )
}

function isHatTrick(incidents: BzzoiroExtractedHasil["keyIncidents"]): { is: boolean; player?: string } {
  const counts = new Map<string, number>()
  for (const i of incidents) {
    if (!i.player) continue
    const t = i.type.toLowerCase()
    if (t.includes("goal") && !t.includes("own goal")) {
      counts.set(i.player, (counts.get(i.player) ?? 0) + 1)
    }
  }
  for (const [player, count] of counts) {
    if (count >= 3) return { is: true, player }
  }
  return { is: false }
}

function isUpset(winProbHome: number, homeScore: number, awayScore: number): boolean {
  if (winProbHome > 55 && awayScore > homeScore) return true
  if (winProbHome < 30 && homeScore > awayScore) return true
  return false
}

// ── [FIX #11] isComeback — versi diperbaiki ───────────────────────────────────
// v1 bug: hanya cek "ada gol babak 1 + total ≥ 2" → false positive tinggi
// v2 fix: lacak skor berjalan kronologis, deteksi apakah tim pemenang pernah tertinggal
function isComeback(
  incidents: BzzoiroExtractedHasil["keyIncidents"],
  finalScore: string,
  home: string,
  away: string,
): { is: boolean; losingTeam?: string } {
  const scoreMatch = finalScore.match(/(\d+)\s*-\s*(\d+)/)
  if (!scoreMatch) return { is: false }

  const finalHome = parseInt(scoreMatch[1])
  const finalAway = parseInt(scoreMatch[2])

  // Tidak ada pemenang yang jelas → bukan comeback
  if (finalHome === finalAway) return { is: false }
  const winner = finalHome > finalAway ? home : away
  const loser  = finalHome > finalAway ? away : home

  // Urutkan insiden berdasarkan menit
  const sortedGoals = incidents
    .filter((i) => {
      const t = i.type.toLowerCase()
      return t.includes("goal")
    })
    .map((i) => ({
      ...i,
      minuteNum: typeof i.minute === "string" ? parseInt(i.minute) : i.minute,
      isOwnGoal: i.type.toLowerCase().includes("own goal"),
    }))
    .sort((a, b) => a.minuteNum - b.minuteNum)

  if (sortedGoals.length < 2) return { is: false }

  // Simulasi skor berjalan
  let scoreHome = 0, scoreAway = 0
  let winnerEverTrailing = false

  for (const goal of sortedGoals) {
    // Tim yang mencetak: jika own goal, gol untuk lawan
    const scoringTeam = goal.isOwnGoal
      ? (goal.team.toLowerCase().includes(home.toLowerCase()) ? away : home)
      : (goal.team.toLowerCase().includes(home.toLowerCase()) ? home : away)

    if (scoringTeam.toLowerCase() === home.toLowerCase()) scoreHome++
    else scoreAway++

    // Cek apakah pemenang sedang tertinggal setelah gol ini
    if (winner.toLowerCase() === home.toLowerCase() && scoreHome < scoreAway) {
      winnerEverTrailing = true
    }
    if (winner.toLowerCase() === away.toLowerCase() && scoreAway < scoreHome) {
      winnerEverTrailing = true
    }
  }

  // Comeback valid hanya jika: pemenang pernah tertinggal DAN selisih akhir ≤ 2
  const finalDiff = Math.abs(finalHome - finalAway)
  return {
    is: winnerEverTrailing && finalDiff <= 2,
    losingTeam: winnerEverTrailing ? loser : undefined,
  }
}

// ── xG paradox: tim kalah xG tapi menang ────────────────────────────────────
function hasXgParadox(
  stats: BzzoiroExtractedHasil["stats"],
  homeScore: number,
  awayScore: number,
): { is: boolean; efficientTeam?: string; dominantTeam?: string } {
  if (!stats.xgTotal) return { is: false }
  const [xgH, xgA] = stats.xgTotal
  const diff = 0.6 // threshold minimum agar paradoks signifikan

  if (xgH > xgA + diff && homeScore < awayScore) {
    return { is: true, efficientTeam: "away", dominantTeam: "home" }
  }
  if (xgA > xgH + diff && awayScore < homeScore) {
    return { is: true, efficientTeam: "home", dominantTeam: "away" }
  }
  return { is: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR: HASIL
// ─────────────────────────────────────────────────────────────────────────────
export function selectAngleHasil(
  bzzoiro: BzzoiroExtractedHasil,
  serper: SerperExtracted,
  tavily: TavilyExtracted,
  winProb?: BzzoiroExtractedPreview["winProbability"],
): AngleResult {
  const { home, away, score, keyIncidents, stats } = bzzoiro
  const scoreMatch = score.match(/(\d+)\s*-\s*(\d+)/)
  const homeScore  = scoreMatch ? parseInt(scoreMatch[1]) : 0
  const awayScore  = scoreMatch ? parseInt(scoreMatch[2]) : 0

  // Priority 1: Hat-trick
  const hatTrick = isHatTrick(keyIncidents)
  if (hatTrick.is && hatTrick.player) {
    return {
      angle: "individual_brilliance",
      rationale: `Hat-trick oleh ${hatTrick.player}`,
      headlineDirection: `Judul berfokus pada malam personal ${hatTrick.player} — tiga gol sebagai momen yang mendefinisikan laga, bukan skor akhirnya`,
      narrativeFocus: `Hat-trick ${hatTrick.player}: bagaimana satu pemain mengambil alih narasi pertandingan`,
      subStorylines: [
        `Kualitas dan variasi tiga gol — bukan sekadar hitungan`,
        `Dampak performa ${hatTrick.player} ke posisi tim di klasemen atau kompetisi`,
      ],
    }
  }

  // Priority 2: Upset vs probabilitas
  if (winProb && isUpset(winProb.home, homeScore, awayScore)) {
    const unexpectedWinner = winProb.home > 55 ? away : home
    const disappointedFav  = winProb.home > 55 ? home : away
    const probOfWinner     = winProb.home > 55 ? winProb.away : winProb.home
    return {
      angle: "upset_result",
      rationale: `${unexpectedWinner} menang meski probabilitas hanya ${probOfWinner}%`,
      headlineDirection: `Benturkan angka probabilitas (${probOfWinner}%) dengan hasil nyata — ${unexpectedWinner} mengalahkan ekspektasi`,
      narrativeFocus: `Bagaimana ${unexpectedWinner} membalikkan narasi yang sudah ditulis sebelum peluit pertama`,
      subStorylines: [
        `Apa yang data tidak tangkap tentang ${unexpectedWinner} sebelum laga ini`,
        `Mengapa ${disappointedFav} gagal meskipun diunggulkan`,
      ],
    }
  }

  // Priority 3: Comeback (v2 — dengan logika yang diperbaiki)
  const comebackResult = isComeback(keyIncidents, score, home, away)
  if (comebackResult.is) {
    const winner = homeScore > awayScore ? home : away
    return {
      angle: "comeback",
      rationale: `${winner} pernah tertinggal sebelum berbalik menang`,
      headlineDirection: `Fokus pada momen ketika laga terasa sudah selesai — lalu berbalik. Bukan kronologi linear.`,
      narrativeFocus: `Anatomi comeback ${winner}: dari tekanan ke pembalikan, apa yang berubah`,
      subStorylines: [
        `Momen spesifik ketika momentum berpindah — siapa yang memicunya`,
        `Respons taktis pelatih terhadap situasi tertinggal`,
      ],
    }
  }

  // Priority 4: Kartu merah sebagai game-changer
  if (hasRedCard(keyIncidents)) {
    const redCard = keyIncidents.find((i) => i.type.toLowerCase().includes("red"))!
    const minNum  = typeof redCard.minute === "string" ? parseInt(redCard.minute) : redCard.minute
    return {
      angle: "controversy",
      rationale: `Kartu merah menit ${redCard.minute}' mengubah dinamika laga`,
      headlineDirection: `Judul menyiratkan perubahan di menit ${redCard.minute}' — sebelum dan sesudah adalah dua pertandingan berbeda`,
      narrativeFocus: `Laga sebelum dan setelah menit ${redCard.minute}': kartu merah sebagai pemisah narasi`,
      subStorylines: [
        `Konteks keputusan wasit — apakah tepat berdasarkan deskripsi insiden`,
        `Bagaimana tim yang tersisa 10 orang mengadaptasi permainannya`,
      ],
    }
  }

  // Priority 5: xG paradox
  const xgParadox = hasXgParadox(stats, homeScore, awayScore)
  if (xgParadox.is) {
    const efficient  = xgParadox.efficientTeam === "home" ? home : away
    const dominant   = xgParadox.dominantTeam  === "home" ? home : away
    const [xgH, xgA] = stats.xgTotal ?? [0, 0]
    return {
      angle: "tactical_breakdown",
      rationale: `Paradoks xG: ${dominant} xG lebih tinggi tapi kalah`,
      headlineDirection: `Ironi statistik — ${efficient} menang bukan karena mendominasi, tapi karena lebih efisien. Judul bisa memainkan kontradiksi ini.`,
      narrativeFocus: `Efisiensi brutal ${efficient} vs dominasi steril ${dominant} — dan mengapa angka xG gagal meramalkan pemenang`,
      subStorylines: [
        `Bagaimana ${efficient} mengkonversi peluang terbatas menjadi kemenangan`,
        `Apa yang harus dievaluasi ${dominant} dari performa malam ini`,
      ],
    }
  }

  // Priority 6: Penalti dramatis
  if (hasPenalty(keyIncidents)) {
    const penaltyGoal = keyIncidents.find((i) =>
      i.type.toLowerCase().includes("penalty") || i.type.toLowerCase().includes("penalti")
    )!
    return {
      angle: "controversy",
      rationale: `Penalti menit ${penaltyGoal.minute}' sebagai momen penentu`,
      headlineDirection: `Judul berfokus pada penalti sebagai turning point — bukan sekadar gol biasa`,
      narrativeFocus: `Penalti menit ${penaltyGoal.minute}' yang memutuskan: konteks, drama, dan konsekuensinya`,
      subStorylines: [
        `Situasi laga sebelum penalti dijatuhkan — seberapa krusial momen itu`,
        `Reaksi kedua kubu terhadap keputusan wasit`,
      ],
    }
  }

  // Default: tactical breakdown
  return {
    angle: "tactical_breakdown",
    rationale: "Tidak ada kondisi khusus — analisis taktis sebagai angle utama",
    headlineDirection: `Judul mengambil satu aspek taktis atau statistik paling menarik dari laga ${home} vs ${away}`,
    narrativeFocus: `Bagaimana taktik dan keputusan lapangan membentuk hasil ${score}`,
    subStorylines: [
      `Duel posisi atau personal yang menentukan arah laga`,
      `Implikasi hasil ini ke klasemen atau perjalanan kompetisi`,
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR: PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
export function selectAnglePreview(
  bzzoiro: BzzoiroExtractedPreview,
  serper: SerperExtracted,
  tavily: TavilyExtracted,
): AngleResult {
  const { home, away, winProbability, formHome, formAway } = bzzoiro

  // Priority 1: Absen pemain kunci dari Serper/Tavily
  const injuryMention = serper.injuryStatement
    ?? tavily.additionalFacts.find((f) =>
        /absen|cedera|miss|ruled out/i.test(f)
      )
  if (injuryMention) {
    return {
      angle: "injury_impact",
      rationale: "Pemain kunci absen — mengubah kalkulasi laga",
      headlineDirection: "Judul mengisyaratkan ketidakhadiran krusial — bukan sekadar 'X absen', tapi apa yang berubah karena itu",
      narrativeFocus: "Bagaimana satu ketidakhadiran mengubah opsi taktis dan peluang kedua tim",
      subStorylines: [
        "Siapa yang kemungkinan mengisi posisi tersebut dan seberapa berbeda dampaknya",
        winProbability?.label ?? "Konteks probabilitas laga",
      ],
    }
  }

  // Priority 2: Form kontras signifikan
  // Hitung poin form dari string "MMSSK" (M=Menang, S=Seri, K=Kalah)
  const calcFormPoints = (formStr: string): number => {
    return [...formStr.toUpperCase()].reduce((acc, c) => {
      if (c === "W" || c === "M") return acc + 3
      if (c === "D" || c === "S") return acc + 1
      return acc
    }, 0)
  }

  // Ambil hanya huruf form dari string (bisa ada format "W D W L W")
  const homeFormStr = formHome.replace(/[^WwDdLlMmSsKk]/g, "").slice(0, 5)
  const awayFormStr = formAway.replace(/[^WwDdLlMmSsKk]/g, "").slice(0, 5)
  const homePoints  = calcFormPoints(homeFormStr)
  const awayPoints  = calcFormPoints(awayFormStr)

  if (homeFormStr && awayFormStr && Math.abs(homePoints - awayPoints) >= 6) {
    const hotTeam  = homePoints > awayPoints ? home : away
    const coldTeam = homePoints > awayPoints ? away : home
    return {
      angle: "form_contrast",
      rationale: `Form kontras signifikan: ${hotTeam} (${homePoints > awayPoints ? homePoints : awayPoints} poin) vs ${coldTeam} (${homePoints > awayPoints ? awayPoints : homePoints} poin)`,
      headlineDirection: `Judul menyiratkan benturan dua tim dengan momentum berbeda — ${hotTeam} yang menyala vs ${coldTeam} yang mencari diri`,
      narrativeFocus: `Benturan form: ${hotTeam} sedang dalam tren terbaik, ${coldTeam} perlu jawaban. Apakah tren berlanjut atau berbalik?`,
      subStorylines: [
        `Apa yang mendorong form ${hotTeam} — pola dalam kemenangan beruntun`,
        `Penyebab spesifik ${coldTeam} kesulitan dan apa yang perlu berubah`,
      ],
    }
  }

  // Priority 3: Win probability sangat dekat (laga terbuka)
  if (winProbability && Math.abs(winProbability.home - winProbability.away) < 12) {
    return {
      angle: "tactical_question",
      rationale: `Probabilitas sangat dekat: ${home} ${winProbability.home}% vs ${away} ${winProbability.away}%`,
      headlineDirection: `Judul mengangkat pertanyaan taktis yang belum terjawab — bukan prediksi, tapi ketidakpastian produktif`,
      narrativeFocus: "Laga yang tidak bisa diprediksi angka: apa pertanyaan taktis yang akan dijawab di lapangan",
      subStorylines: [
        `Duel kunci yang akan menentukan siapa yang berhasil memaksakan gaya bermainnya`,
        `H2H sebagai konteks — apa yang terjadi terakhir kali kondisinya serupa`,
      ],
    }
  }

  // Default
  return {
    angle: "tactical_question",
    rationale: "Default preview — satu pertanyaan taktis belum terjawab",
    headlineDirection: `Judul mengangkat satu pertanyaan taktis konkret tentang ${home} vs ${away}`,
    narrativeFocus: "Pertarungan taktis: siapa yang berhasil memaksakan ritme permainannya",
    subStorylines: [
      `Kondisi kedua tim menjelang laga — form dan faktor pembeda`,
      winProbability?.label ?? "Konteks kompetisi dan taruhan tiga poin ini",
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR: TRANSFER
// ─────────────────────────────────────────────────────────────────────────────
export function selectAngleTransfer(
  player: BzzoiroExtractedPlayer,
  serper: SerperExtracted,
  tavily: TavilyExtracted,
): AngleResult {
  // Priority 1: Ada angka fee spesifik
  const hasFee = !!(
    player.marketValue ||
    serper.transferStatus?.match(/\d+\s*(?:million|juta|m€|€|ribu)/i) ||
    serper.mediaHighlights.some((h) => /\d+\s*(?:million|juta|€)/i.test(h))
  )

  if (hasFee) {
    const feeContext = serper.transferStatus ?? player.marketValue ?? ""
    return {
      angle: "market_value",
      rationale: `Ada angka fee/market value yang bisa jadi angle finansial`,
      headlineDirection: `Judul menggunakan angka sebagai klaim tentang masa depan ${player.name}, bukan masa lalunya`,
      narrativeFocus: `Apa yang angka transfer itu katakan tentang ekspektasi kedua klub terhadap ${player.name}`,
      subStorylines: [
        `Statistik ${player.name} yang membenarkan (atau mempertanyakan) valuasi tersebut`,
        `Dampak finansial dan skuad ke klub asal`,
      ],
    }
  }

  // Priority 2: Ada detail negosiasi dari Serper/Tavily
  const hasNegotiationDetail = !!(
    serper.transferStatus ||
    tavily.transferTimeline ||
    serper.mediaHighlights.some((h) => /deal|agree|talks|personal terms|bid/i.test(h))
  )

  if (hasNegotiationDetail) {
    return {
      angle: "negotiation_drama",
      rationale: "Ada detail proses negosiasi yang bisa dibangun jadi narasi",
      headlineDirection: `Judul menyiratkan proses — bukan hanya hasil. "Bagaimana ${player.name} akhirnya..." bukan "X pindah ke Y"`,
      narrativeFocus: `Dari rumor ke kenyataan: kronologi yang membawa transfer ini ke titik ini`,
      subStorylines: [
        `Apa yang ${player.name} cari di fase karir ini`,
        `Mengapa sekarang — konteks waktu transfer ini terjadi`,
      ],
    }
  }

  // Default
  return {
    angle: "departure_narrative",
    rationale: "Tidak ada detail fee atau negosiasi — narasi perpisahan/kedatangan",
    headlineDirection: `Judul fokus pada makna kepindahan bagi karir ${player.name}, bukan sekadar fakta perpindahan`,
    narrativeFocus: `Apa yang mendorong perpindahan ini dan apa artinya bagi karir ${player.name} ke depan`,
    subStorylines: [
      `Warisan ${player.name} di ${player.team}: kontribusi yang ditinggalkan`,
      `Harapan realistis dari klub tujuan`,
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR: CEDERA
// ─────────────────────────────────────────────────────────────────────────────
export function selectAngleCedera(
  player: BzzoiroExtractedPlayer,
  serper: SerperExtracted,
  tavily: TavilyExtracted,
): AngleResult {
  const hasStats = !!player.recentStats.summary
  return {
    angle: "injury_impact",
    rationale: `Cedera ${player.name} — dampak ke tim sebagai angle utama`,
    headlineDirection: `Judul mengukur kehilangan, bukan mengumumkan cedera. "Bukan hanya satu nama di daftar absen" bukan "[Nama] cedera"`,
    narrativeFocus: `Ukuran kehilangan ${player.name}: dari angka statistik ke dampak taktis nyata`,
    subStorylines: [
      hasStats
        ? `${player.recentStats.summary} — angka yang menjelaskan betapa sulitnya mengisi posisi ini`
        : `Peran taktis ${player.name} yang tidak bisa digantikan begitu saja`,
      `Laga-laga krusial yang akan dilewati dan implikasinya ke target musim tim`,
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR: KONPERS
// ─────────────────────────────────────────────────────────────────────────────
export function selectAngleKonpers(
  serper: SerperExtracted,
  tavily: TavilyExtracted,
): AngleResult {
  if (serper.quotes.length > 0) {
    // Pilih kutipan terkuat untuk tentukan angle
    const strongestQuote = serper.quotes[0]
    const isSurprising   = /tidak|bukan|jangan|selesai|pergi|kontrak|mundur|keluar|resign/i.test(strongestQuote.text)

    return {
      angle: "press_conference_reveal",
      rationale: `${serper.quotes.length} kutipan tersedia, kutipan terkuat dari ${strongestQuote.speaker}`,
      headlineDirection: isSurprising
        ? `Judul mengisyaratkan pernyataan yang mengejutkan tanpa membocorkan isinya`
        : `Judul mengambil esensi dari apa yang ${strongestQuote.speaker} katakan — bukan nama + tanggal konpers`,
      narrativeFocus: `Apa yang dikatakan, apa yang tidak dikatakan, dan apa yang berubah setelah konpers ini`,
      subStorylines: [
        `Konteks mengapa konpers ini lebih dari rutinitas — situasi tim sebelumnya`,
        `Analisis pernyataan: antara diplomasi, frustrasi, atau kepastian yang baru`,
      ],
    }
  }

  return {
    angle: "default",
    rationale: "Tidak ada kutipan kuat — rekap konpers berdasarkan konteks",
    headlineDirection: "Judul mengangkat fakta atau pernyataan paling signifikan dari konpers, bukan format 'Pelatih X Bicara Soal Y'",
    narrativeFocus: "Apa yang konpers ini ungkapkan tentang kondisi, rencana, atau arah tim ke depan",
    subStorylines: [
      "Situasi tim sebelum konpers sebagai konteks",
      "Implikasi pernyataan untuk laga atau keputusan selanjutnya",
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR: TRIVIA
// ─────────────────────────────────────────────────────────────────────────────
export function selectAngleTrivia(): AngleResult {
  return {
    angle: "historical_fact",
    rationale: "Trivia: fakta historis sebagai angle default",
    headlineDirection: "Judul membuat pembaca merasa HARUS tahu ini — tanpa clickbait. Fokus pada keunikan atau aspek kontraintuitif dari fakta ini",
    narrativeFocus: "Fakta mengejutkan sebagai kail → konteks historis yang memberi makna → relevansi ke masa kini",
    subStorylines: [
      "Konteks era dan kondisi ketika fakta ini pertama terjadi",
      "Relevansi atau perbandingan ke sepak bola modern",
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
export function selectAngle(
  newsType: NewsType,
  bzzoiroText: string,
  serper: SerperExtracted,
  tavily: TavilyExtracted,
  meta: {
    hasilData?:   BzzoiroExtractedHasil
    previewData?: BzzoiroExtractedPreview
    playerData?:  BzzoiroExtractedPlayer
  } = {},
  winProb?: BzzoiroExtractedPreview["winProbability"],
): AngleResult {
  const fallback = (angle: ArticleAngle, note: string): AngleResult => ({
    angle,
    rationale: note,
    headlineDirection: "Judul berdasarkan fakta paling kuat yang tersedia",
    narrativeFocus: "Narasi berdasarkan data yang tersedia",
    subStorylines: [],
  })

  switch (newsType) {
    case "hasil":
      return meta.hasilData
        ? selectAngleHasil(meta.hasilData, serper, tavily, winProb)
        : fallback("tactical_breakdown", "Data hasil tidak tersedia")

    case "preview":
      return meta.previewData
        ? selectAnglePreview(meta.previewData, serper, tavily)
        : fallback("tactical_question", "Data preview tidak tersedia")

    case "transfer":
      return meta.playerData
        ? selectAngleTransfer(meta.playerData, serper, tavily)
        : fallback("departure_narrative", "Data pemain tidak tersedia")

    case "cedera":
      return meta.playerData
        ? selectAngleCedera(meta.playerData, serper, tavily)
        : fallback("injury_impact", "Data pemain tidak tersedia")

    case "konpers":
      return selectAngleKonpers(serper, tavily)

    case "trivia":
      return selectAngleTrivia()

    default:
      return fallback("default", `NewsType tidak dikenali: ${newsType}`)
  }
}
