// app/api/widget-autofill/route.ts
//
// Route autofill widget dari Bzzoiro.
// Dipanggil oleh tombol "Isi Otomatis dari Bzzoiro" di setiap editor
// pada WidgetEditModal.tsx.
//
// POST /api/widget-autofill
// Body: { widget_type: WidgetType, query: string }
// Response: { data: <sesuai widget_type> } | { error: string }

import { NextRequest, NextResponse } from "next/server"
import {
  fetchBzzJadwal,
  fetchBzzKlasemen,
  fetchBzzStatistik,
  fetchBzzTimeline,
  fetchBzzStartingLineup,
  fetchBzzPeluang,
  fetchBzzPerbandingan,
  fetchBzzTransfer,
  fetchBzzPemainAndalan,
  fetchBzzDaftarPemain,
  fetchBzzAnalisaTaktis,
  fetchBzzProfilStadion,
} from "@/lib/bzzoiro-widget"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { widget_type, query } = body as { widget_type: string; query: string }

    if (!widget_type || !query?.trim()) {
      return NextResponse.json({ error: "widget_type dan query wajib diisi." }, { status: 400 })
    }

    const q = query.trim()
    let data: unknown

    switch (widget_type) {
      case "jadwal":
        data = await fetchBzzJadwal(q)
        break
      case "klasemen":
        data = await fetchBzzKlasemen(q)
        break
      case "statistik_pertandingan":
        data = await fetchBzzStatistik(q)
        break
      case "timeline_pertandingan":
        data = await fetchBzzTimeline(q)
        break
      case "starting_lineup":
        data = await fetchBzzStartingLineup(q)
        break
      case "peluang":
        data = await fetchBzzPeluang(q)
        break
      case "perbandingan_tim":
        data = await fetchBzzPerbandingan(q)
        break
      case "transfer":
        data = await fetchBzzTransfer(q)
        break
      case "pemain_andalan":
        data = await fetchBzzPemainAndalan(q)
        break
      case "daftar_pemain":
        data = await fetchBzzDaftarPemain(q)
        break
      case "analisa_taktis":
        data = await fetchBzzAnalisaTaktis(q)
        break
      case "profil_stadion":
        data = await fetchBzzProfilStadion(q)
        break
      default:
        return NextResponse.json({ error: `Widget type "${widget_type}" tidak didukung.` }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error("[widget-autofill]", err)
    return NextResponse.json(
      { error: err?.message ?? "Gagal mengambil data dari Bzzoiro." },
      { status: 500 }
    )
  }
}
