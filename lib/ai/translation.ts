// lib/ai/translation.ts — v5 (sebelumnya bernama quote-translator.ts,
// di-rename karena sekarang berisi 2 fungsi: translateQuotes untuk kutipan
// langsung, dan translateMediaFacts untuk fragmen fakta non-kutipan).
//
// PERUBAHAN v5: timeout dinaikkan — translateOneQuote 20s→60s,
// translateMediaFactsBatch 25s→60s (atas laporan warning
// "media_facts_translation GAGAL" muncul di produksi; sempat dicoba 100s,
// diturunkan ke 60s setelah dihitung skenario terburuk total generate-brief
// — lihat CATATAN BUDGET WAKTU di bawah). max_tokens juga dinaikkan
// (400→1500 untuk kutipan, 1200→3000 untuk batch fakta media) — mitigasi
// yang sama dengan openrouter-brief-editor.ts: Nemotron 3 Super adalah
// model reasoning yang reasoning.enabled:false-nya bisa diabaikan diam-diam
// oleh provider, sehingga butuh waktu & ruang token lebih untuk
// menyelesaikan reasoning trace sebelum mencapai jawaban final.
//
// CATATAN BUDGET WAKTU: route.ts (generate-brief) punya maxDuration=300s.
// Fungsi-fungsi di file ini dipanggil SETELAH fetchSerperContext/
// fetchTavilyContext tapi SEBELUM callBriefEditor (Nemotron Editor Brief,
// timeout DITURUNKAN ke 150s — lihat lib/ai/openrouter-brief-editor.ts).
// Skenario TERBURUK total (fetch ~10s + translate kutipan 60s + translate
// fakta media 60s + Editor Brief 150s) = ~280s — masih ada buffer ~20s di
// bawah maxDuration 300s. Kombinasi 60s/60s/150s ini DIPILIH SPESIFIK
// untuk menjaga total skenario terburuk tetap di bawah 300s — kalau salah
// satu angka ini diubah lagi di kemudian hari, hitung ulang totalnya
// (translateQuotes dan translateMediaFacts berjalan SEKUENSIAL satu demi
// satu di brief-builder.ts, lalu SEKUENSIAL lagi sebelum callBriefEditor —
// bukan paralel) supaya tidak kembali melebihi batas Vercel.
//
// MASALAH YANG DIPECAHKAN:
// Sejak serper.ts & tavily.ts diarahkan ke sumber Inggris (ESPN/Sky
// Sports/Goal.com), kutipan pelatih/pemain yang diekstrak SerperExtracted.quotes
// masih dalam Bahasa Inggris. Sebelumnya rencana awal adalah membiarkan Qwen3-Next
// menerjemahkan kutipan ini sambil menulis draft (lewat instruksi
// TRANSLATION_NOTE) — tapi ini RISIKO TINGGI:
//   1. Kutipan adalah ucapan langsung seseorang. Kalau diterjemahkan bebas/
//      diparafrasekan sambil menulis draft, makna bisa melenceng dari yang
//      sebenarnya diucapkan — terutama untuk idiom ("over the moon", "back
//      to the drawing board") yang kalau diterjemahkan literal jadi salah
//      makna dalam Bahasa Indonesia.
//   2. Tidak ada tahap verifikasi terpisah — terjemahan kutipan bercampur
//      dengan tugas lain (parafrase naratif, structuring H2, dst) yang
//      dikerjakan Qwen3-Next 80B (Ollama Cloud) bersamaan dengan tugas gabungan
//      seberat itu sekaligus.
//
// SOLUSI:
// Modul ini menerjemahkan SETIAP kutipan secara terpisah & terkontrol SEBELUM
// masuk ke brief — jadi saat sampai ke Qwen3-Next, kutipan SUDAH dalam Bahasa
// Indonesia final yang tinggal di-quote langsung (tidak boleh diterjemahkan
// ulang/diparafrase lagi). Ini memecah beban: Qwen3-Next cuma perlu menyalin
// kutipan apa adanya, bukan menerjemahkan + menulis draft sekaligus.
//
// Pendekatan: 1 pemanggilan LLM ringan per kutipan (bukan diborongkan jadi
// satu prompt besar bareng draft generation), dengan:
//   - prompt SANGAT sempit: "terjemahkan makna-demi-makna, JANGAN tafsirkan,
//     JANGAN tambah konteks, JANGAN ubah idiom jadi idiom lain yang
//     beda makna — kalau idiom tidak ada bentuk wajar dalam Bahasa Indonesia,
//     terjemahkan makna intinya secara natural, jangan literal kata-per-kata"
//   - temperature 0.1 (deterministik, minim variasi/kreativitas liar)
//   - fallback ke heuristik lokal kalau API gagal/timeout, BUKAN membiarkan
//     kutipan tetap dalam Bahasa Inggris masuk ke brief tanpa tanda apapun
//
// Dipanggil dari brief-builder.ts, sebelum SerperExtracted.quotes dipakai
// untuk membangun brief.quotes.

interface TranslatedQuote {
  text: string         // hasil terjemahan Bahasa Indonesia
  speaker: string
  source: string
  original: string     // teks asli Inggris — disimpan untuk audit/debug, TIDAK dikirim ke Qwen3-Next
  translationOk: boolean // false kalau fallback dipakai (API gagal) — brief-validator bisa pakai ini untuk warning
}

const TRANSLATE_MODEL_DEFAULT = "nvidia/nemotron-3-super-120b-a12b:free"

// Heuristik fallback SANGAT minim — HANYA dipakai kalau API benar-benar gagal
// (network error/timeout/quota), supaya pipeline tidak berhenti total. Ini
// BUKAN pengganti terjemahan asli — hanya membersihkan kutipan secukupnya dan
// MENANDAI translationOk:false, supaya brief-validator & quality gate tahu
// kutipan ini butuh perhatian manual sebelum publish (lihat brief-validator.ts
// dan checkQuality() di types.ts).
function fallbackPassthrough(text: string): string {
  return text.trim()
}

function buildTranslateSystemPrompt(): string {
  return `Kamu adalah penerjemah profesional Bahasa Inggris ke Bahasa Indonesia, KHUSUS untuk kutipan langsung pemain/pelatih sepak bola dalam artikel berita.

ATURAN MUTLAK:
1. Terjemahkan MAKNA, bukan kata-per-kata. Idiom Inggris (mis. "over the moon", "back to the drawing board", "the boys did well") WAJIB diterjemahkan ke makna intinya dalam Bahasa Indonesia yang natural — JANGAN diterjemahkan literal kata-per-kata yang menghasilkan kalimat aneh/tidak bermakna.
2. DILARANG menambah informasi, opini, atau konteks yang tidak ada di teks asli.
3. DILARANG mengurangi atau menghilangkan bagian dari kutipan asli (kecuali filler verbal murni seperti "you know", "I mean" yang diulang berkali-kali).
4. DILARANG mengubah nuansa emosi — kalau nada aslinya kecewa, hasil terjemahan juga harus terasa kecewa (bukan dibuat lebih positif/negatif dari aslinya).
5. Pertahankan nama orang, klub, dan kompetisi PERSIS seperti aslinya (jangan diterjemahkan/diubah ejaannya).
6. Hasil HARUS berupa satu kalimat/paragraf utuh berbahasa Indonesia yang siap dikutip langsung di artikel berita — gaya bahasa formal-jurnalistik, BUKAN bahasa sehari-hari/gaul.
7. Output HANYA teks hasil terjemahan. TANPA tanda kutip pembuka/penutup, TANPA penjelasan, TANPA catatan tambahan.

CONTOH:
Input: "We're over the moon with the result, the boys gave everything tonight."
Output BENAR: Kami sangat senang dengan hasil ini, para pemain memberikan segalanya malam ini.
Output SALAH (literal/idiom rusak): Kami berada di atas bulan dengan hasil ini, anak-anak memberikan segalanya malam ini.

Input: "It is what it is, we move on to the next game."
Output BENAR: Apa boleh buat, kami fokus ke pertandingan selanjutnya.
Output SALAH (terlalu literal): Itu adalah apa itu, kami pindah ke permainan selanjutnya.`
}

async function translateOneQuote(
  apiKey: string,
  model: string,
  text: string,
): Promise<{ translated: string; ok: boolean }> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://halfspacesport.com",
        "X-Title": "HalfSpace Quote Translator",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildTranslateSystemPrompt() },
          { role: "user", content: text },
        ],
        // Temperature rendah — ini tugas penerjemahan presisi, bukan tugas
        // kreatif. Variasi tinggi justru meningkatkan risiko makna melenceng.
        temperature: 0.1,
        // NEWv5: dinaikkan dari 400 → 1500. Sama seperti mitigasi di
        // openrouter-brief-editor.ts — Nemotron 3 Super model reasoning, dan
        // reasoning.enabled:false di bawah bisa diabaikan diam-diam oleh
        // provider. 400 token terlalu kecil untuk menanggung reasoning trace
        // + jawaban terjemahan final sekaligus.
        max_tokens: 1500,
        reasoning: { enabled: false },
      }),
      // NEWv5: dinaikkan dari 20s → 60s atas permintaan, setelah warning
      // "media_facts_translation GAGAL" muncul di produksi (awalnya dicoba
      // 100s, tapi diturunkan ke 60s setelah dihitung skenario terburuk:
      // 60s (kutipan) + 60s (fakta media) + 270s (Editor Brief) = 390s,
      // ditambah fetch Serper/Tavily ~10s = ~400s — masih melebihi
      // maxDuration Vercel 300s di skenario PALING pesimis (ketiga
      // panggilan timeout penuh berurutan), tapi jauh lebih kecil
      // risikonya dibanding 100s yang totalnya ~480s. Diagnosis: 20-25
      // detik kemungkinan terlalu pendek untuk Nemotron 3 Super yang
      // (sesuai mitigasi di openrouter-brief-editor.ts) kadang tetap
      // menjalankan reasoning trace walau diminta tidak — request keburu
      // dibatalkan paksa sebelum model selesai "berpikir". 60s memberi
      // ruang 3x lebih besar dari sebelumnya. translateQuotes() memanggil
      // fungsi ini PARALEL (Promise.all) untuk semua kutipan sekaligus.
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.warn(`⚠️ quote-translator HTTP ${res.status}: ${body.slice(0, 200)}`)
      return { translated: fallbackPassthrough(text), ok: false }
    }

    const json = await res.json()
    const raw: string = json?.choices?.[0]?.message?.content?.trim() ?? ""

    // Validasi minimal: hasil tidak boleh kosong, tidak boleh masih
    // identik 1:1 dengan teks asli (kalau identik, kemungkinan model gagal
    // menerjemahkan dan hanya echo balik teks aslinya).
    if (!raw || raw.toLowerCase() === text.toLowerCase()) {
      console.warn(`⚠️ quote-translator: hasil kosong/echo untuk "${text.slice(0, 60)}..."`)
      return { translated: fallbackPassthrough(text), ok: false }
    }

    // Buang tanda kutip pembungkus kalau model tetap menyertakannya walau
    // sudah dilarang di system prompt (defensif).
    const cleaned = raw.replace(/^["'"]+|["'"]+$/g, "").trim()
    return { translated: cleaned, ok: true }
  } catch (err) {
    console.warn(`⚠️ quote-translator gagal (network/timeout): ${err instanceof Error ? err.message : err}`)
    return { translated: fallbackPassthrough(text), ok: false }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT — dipanggil dari brief-builder.ts
// Menerjemahkan SEMUA kutipan SerperExtracted.quotes secara paralel (jumlahnya
// kecil, maksimal 3 per artikel — lihat extractQuotesFromSnippets), supaya
// tidak menambah latency berarti ke pipeline generate-brief.
// ─────────────────────────────────────────────────────────────────────────────
export async function translateQuotes(
  quotes: Array<{ text: string; speaker: string; source: string }>,
): Promise<TranslatedQuote[]> {
  if (quotes.length === 0) return []

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn("⚠️ OPENROUTER_API_KEY tidak ada — kutipan TIDAK diterjemahkan, pakai fallback passthrough. Kutipan akan tetap berbahasa Inggris di brief, ditandai translationOk:false.")
    return quotes.map((q) => ({
      text: fallbackPassthrough(q.text),
      speaker: q.speaker,
      source: q.source,
      original: q.text,
      translationOk: false,
    }))
  }

  const model = process.env.OPENROUTER_TRANSLATE_MODEL || TRANSLATE_MODEL_DEFAULT

  const results = await Promise.all(
    quotes.map((q) => translateOneQuote(apiKey, model, q.text))
  )

  return quotes.map((q, i) => ({
    text: results[i].translated,
    speaker: q.speaker,
    source: q.source,
    original: q.text,
    translationOk: results[i].ok,
  }))
}

export type { TranslatedQuote }

// ─────────────────────────────────────────────────────────────────────────────
// TERJEMAHAN FAKTA MEDIA NON-KUTIPAN (transferStatus, injuryStatement,
// injuryDetails, mediaHighlights, transferTimeline, additionalFacts)
// ─────────────────────────────────────────────────────────────────────────────
// MASALAH: field-field ini (lihat media-extractor.ts: extractSerperData,
// extractTavilyData) adalah hasil regex match dari teks Inggris mentah
// (ESPN/Sky Sports/Goal.com), BUKAN kutipan langsung — tapi tetap masuk ke
// brief.mustUse/canUse sebagai teks Inggris apa adanya. Risikonya berbeda
// dari kutipan: bukan soal makna ucapan seseorang yang harus presisi
// legal/etis, tapi risiko Qwen3-Next mencampur Inggris-Indonesia dalam draft atau
// menerjemahkan asal-asalan di tengah menulis (sama-sama tidak diinginkan).
//
// SOLUSI: terjemahkan semua field ini SEKALIGUS dalam satu pemanggilan LLM
// (bukan satu-satu seperti kutipan) — lebih efisien karena field ini berupa
// fragmen kalimat pendek (bukan ucapan utuh yang butuh nuansa emosi presisi),
// dan jumlahnya per artikel sedikit (maksimal ~6 field). Tetap dengan
// instruksi "JANGAN tafsirkan/tambahkan", hanya beda dari segi batching demi
// efisiensi token & latency.
export interface MediaFactsToTranslate {
  transferStatus?: string
  injuryStatement?: string
  injuryDetails?: string
  transferTimeline?: string
  mediaHighlights?: string[]
  additionalFacts?: string[]
}

export interface TranslatedMediaFacts {
  transferStatus?: string
  injuryStatement?: string
  injuryDetails?: string
  transferTimeline?: string
  mediaHighlights?: string[]
  additionalFacts?: string[]
  translationOk: boolean // false kalau fallback dipakai (API gagal) — sama pola dengan TranslatedQuote
}

function buildMediaFactsSystemPrompt(): string {
  return `Kamu adalah penerjemah profesional Bahasa Inggris ke Bahasa Indonesia untuk fragmen fakta berita sepak bola (status transfer, pernyataan cedera, highlight media).

ATURAN MUTLAK:
1. Terjemahkan MAKNA secara natural, BUKAN kata-per-kata.
2. DILARANG menambah informasi, asumsi, atau opini yang tidak ada di teks asli.
3. DILARANG menghilangkan detail (angka, nama, tanggal, persentase) — semua detail faktual WAJIB tetap ada di hasil terjemahan.
4. Pertahankan nama orang/klub/kompetisi PERSIS seperti aslinya.
5. Gaya bahasa formal-jurnalistik, ringkas, siap dipakai langsung sebagai fakta di draft artikel.
6. Input berupa JSON array of strings dengan field "id" dan "text". Output HARUS JSON array dengan field "id" dan "translated" — urutan dan jumlah item HARUS SAMA PERSIS dengan input. TANPA teks lain di luar JSON.

CONTOH:
Input: [{"id":"0","text":"Manchester City have agreed a deal worth £116m for the winger, with no add-ons included."}]
Output: [{"id":"0","translated":"Manchester City telah menyepakati kesepakatan senilai £116 juta untuk pemain sayap tersebut, tanpa klausul tambahan."}]`
}

async function translateMediaFactsBatch(
  apiKey: string,
  model: string,
  items: Array<{ id: string; text: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (items.length === 0) return result

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://halfspacesport.com",
        "X-Title": "HalfSpace Media Facts Translator",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildMediaFactsSystemPrompt() },
          { role: "user", content: JSON.stringify(items) },
        ],
        temperature: 0.1,
        // NEWv5: dinaikkan dari 1200 → 3000 — alasan sama dengan
        // translateOneQuote di atas (mitigasi reasoning trace Nemotron 3
        // Super yang tidak selalu bisa dimatikan). Batch ini bisa berisi
        // sampai ~6 item sekaligus, jadi butuh ruang lebih dari kutipan
        // tunggal.
        max_tokens: 3000,
        response_format: { type: "json_object" },
        reasoning: { enabled: false },
      }),
      // NEWv5: dinaikkan dari 25s → 60s — ini SUMBER LANGSUNG warning
      // "media_facts_translation GAGAL" yang dilaporkan (awalnya dicoba
      // 100s, diturunkan ke 60s setelah dihitung skenario terburuk total
      // generate-brief — lihat catatan lengkap di translateOneQuote di atas).
      // Diagnosis: 25 detik kemungkinan keburu habis sebelum Nemotron 3
      // Super selesai memproses (termasuk reasoning trace yang mungkin
      // tetap jalan diam-diam — lihat catatan di openrouter-brief-editor.ts),
      // sehingga request dibatalkan paksa dan ditangkap sebagai "gagal" oleh
      // catch block di bawah.
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.warn(`⚠️ media-facts-translator HTTP ${res.status}: ${body.slice(0, 200)}`)
      return result
    }

    const json = await res.json()
    const raw: string = json?.choices?.[0]?.message?.content?.trim() ?? ""
    if (!raw) return result

    // Model kadang membungkus array dalam objek (mis. {"items":[...]}) walau
    // sudah diminta array murni — tangani kedua kemungkinan secara defensif.
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) return result
      parsed = JSON.parse(match[0])
    }
    const arr: any[] = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.results ?? [])

    for (const entry of arr) {
      if (entry?.id != null && typeof entry.translated === "string" && entry.translated.trim()) {
        result.set(String(entry.id), entry.translated.trim())
      }
    }
    return result
  } catch (err) {
    console.warn(`⚠️ media-facts-translator gagal (network/timeout): ${err instanceof Error ? err.message : err}`)
    return result
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT — dipanggil dari brief-builder.ts, sekali per artikel.
// Mengumpulkan semua field Inggris menjadi satu daftar, satu pemanggilan LLM,
// lalu memetakan hasilnya kembali ke field masing-masing. Field yang gagal
// diterjemahkan (tidak ada di hasil map) di-fallback ke teks asli DAN
// translationOk diset false, supaya brief-validator bisa memberi warning.
// ─────────────────────────────────────────────────────────────────────────────
export async function translateMediaFacts(
  facts: MediaFactsToTranslate,
): Promise<TranslatedMediaFacts> {
  const hasAnyContent =
    !!facts.transferStatus || !!facts.injuryStatement || !!facts.injuryDetails ||
    !!facts.transferTimeline || (facts.mediaHighlights?.length ?? 0) > 0 ||
    (facts.additionalFacts?.length ?? 0) > 0

  if (!hasAnyContent) {
    return { ...facts, translationOk: true }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn("⚠️ OPENROUTER_API_KEY tidak ada — fakta media TIDAK diterjemahkan, pakai fallback passthrough.")
    return { ...facts, translationOk: false }
  }

  const model = process.env.OPENROUTER_TRANSLATE_MODEL || TRANSLATE_MODEL_DEFAULT

  // Bangun daftar item ber-id supaya hasil bisa dipetakan balik ke field asal.
  const items: Array<{ id: string; text: string }> = []
  if (facts.transferStatus)   items.push({ id: "transferStatus",   text: facts.transferStatus })
  if (facts.injuryStatement)  items.push({ id: "injuryStatement",  text: facts.injuryStatement })
  if (facts.injuryDetails)    items.push({ id: "injuryDetails",    text: facts.injuryDetails })
  if (facts.transferTimeline) items.push({ id: "transferTimeline", text: facts.transferTimeline })
  facts.mediaHighlights?.forEach((h, i) => items.push({ id: `mediaHighlight_${i}`, text: h }))
  facts.additionalFacts?.forEach((f, i) => items.push({ id: `additionalFact_${i}`, text: f }))

  const translated = await translateMediaFactsBatch(apiKey, model, items)

  // Kalau API gagal total (map kosong padahal ada item), tandai gagal &
  // fallback ke teks asli — JANGAN biarkan field jadi undefined/hilang.
  const ok = translated.size > 0

  return {
    transferStatus:   translated.get("transferStatus")   ?? facts.transferStatus,
    injuryStatement:  translated.get("injuryStatement")  ?? facts.injuryStatement,
    injuryDetails:    translated.get("injuryDetails")    ?? facts.injuryDetails,
    transferTimeline: translated.get("transferTimeline") ?? facts.transferTimeline,
    mediaHighlights:  facts.mediaHighlights?.map((h, i) => translated.get(`mediaHighlight_${i}`) ?? h),
    additionalFacts:  facts.additionalFacts?.map((f, i) => translated.get(`additionalFact_${i}`) ?? f),
    translationOk: ok,
  }
}
