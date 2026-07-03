// lib/editorial/date-formatter.ts — BARU
//
// MASALAH YANG DIPECAHKAN:
// event_date dari Bzzoiro API dipakai mentah apa adanya di seluruh pipeline
// (lihat lib/news-context/bzzoiro.ts) — tanpa normalisasi format. Risikonya:
//   1. Kalau format aslinya ambigu (mis. "06/27/2026" — bisa dibaca 27 Juni
//      ATAU 6 Februari tergantung locale), tanggal yang ditulis Qwen3-Next di
//      draft artikel bisa SALAH tanpa terdeteksi sama sekali.
//   2. Format ISO mentah (mis. "2026-06-27T18:00:00Z") kalau ditulis apa
//      adanya di draft akan terasa aneh/tidak jurnalistik dalam Bahasa
//      Indonesia (golden standard selalu pakai format "Sabtu (27/6/2026)"
//      atau "27 Juni 2026").
//
// SOLUSI: satu fungsi normalizer terpusat yang:
//   - Mem-parsing format umum (ISO 8601 date/datetime) secara EKSPLISIT,
//     BUKAN lewat `new Date(string)` browser-default yang perilakunya bisa
//     berbeda antar environment untuk string ambigu.
//   - Mengembalikan format Indonesia yang TIDAK AMBIGU: "Sabtu (27/6/2026)"
//     — selalu menyertakan nama hari, supaya posisi DD vs MM tidak pernah
//     bisa salah dibaca (beda dengan "06/27/2026" yang ambigu murni angka).
//   - Kalau format tidak dikenali, FALLBACK ke string asli + flag `ok:false`
//     — JANGAN PERNAH menampilkan tanggal yang sudah diparsing tapi mungkin
//     salah. Lebih aman tampil mentah dengan warning daripada tampil rapi
//     tapi salah tanggal/hari.
//
// Dipakai di brief-builder.ts untuk titik-titik yang ditulis sebagai FAKTA
// di paragraf artikel (dateline hasil, blok pertandingan terkait konpers) —
// bukan untuk seluruh 19 titik pakai event_date di bzzoiro.ts (banyak di
// antaranya hanya referensi sekunder/internal seperti form 5 laga terakhir,
// bukan fakta utama yang langsung ditulis Qwen3-Next di body artikel).

const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

export interface FormattedDate {
  display: string  // "Sabtu (27/6/2026)" — siap ditulis langsung di artikel
  ok: boolean       // false kalau format asli tidak dikenali (fallback ke string asli)
}

// Parsing EKSPLISIT untuk format ISO 8601 — TIDAK memakai `new Date(string)`
// langsung pada string yang berpotensi ambigu, supaya tidak bergantung pada
// asumsi locale runtime. Mendukung:
//   "2026-06-27"                  (date only)
//   "2026-06-27T18:00:00"         (datetime, dengan/tanpa Z atau offset)
//   "2026-06-27 18:00:00"         (datetime dengan spasi, varian umum API)
function parseIsoDateStrict(raw: string): { year: number; month: number; day: number } | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10) // 1-12
  const day = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

// Hitung nama hari dari Y-M-D secara manual (algoritma Zeller-like via Date
// UTC) — aman karena kita HANYA memakai bagian tanggal (bukan parsing string
// ambigu), jadi tidak ada risiko salah locale.
function dayOfWeekIndex(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCDay() // 0 = Minggu
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
export function formatDateIndonesian(raw?: string | null): FormattedDate {
  if (!raw || !raw.trim() || raw.trim() === "-") {
    return { display: "", ok: false }
  }

  const parsed = parseIsoDateStrict(raw)
  if (!parsed) {
    // Format tidak dikenali — JANGAN menebak. Tampilkan apa adanya supaya
    // editor manusia bisa lihat ada yang aneh, daripada diam-diam salah.
    console.warn(`⚠️ formatDateIndonesian: format tanggal tidak dikenali, fallback ke string asli: "${raw}"`)
    return { display: raw.trim(), ok: false }
  }

  const { year, month, day } = parsed
  const dow = dayOfWeekIndex(year, month, day)
  const display = `${HARI_ID[dow]} (${day}/${month}/${year})`
  return { display, ok: true }
}

// Varian lengkap dengan nama bulan (mis. untuk metaDescription yang butuh
// format lebih formal) — "Sabtu, 27 Juni 2026".
export function formatDateIndonesianLong(raw?: string | null): FormattedDate {
  if (!raw || !raw.trim() || raw.trim() === "-") {
    return { display: "", ok: false }
  }

  const parsed = parseIsoDateStrict(raw)
  if (!parsed) {
    console.warn(`⚠️ formatDateIndonesianLong: format tanggal tidak dikenali, fallback ke string asli: "${raw}"`)
    return { display: raw.trim(), ok: false }
  }

  const { year, month, day } = parsed
  const dow = dayOfWeekIndex(year, month, day)
  const display = `${HARI_ID[dow]}, ${day} ${BULAN_ID[month - 1]} ${year}`
  return { display, ok: true }
}
