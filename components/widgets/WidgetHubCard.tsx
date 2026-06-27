"use client"

/**
 * WidgetHubCard.tsx
 *
 * Render shortcode [hub_data id="<uuid>"]
 * Fetch dari tabel `widget_hub`, tampilkan tab bar,
 * tiap tab render widget card yang sudah ada.
 */

import React, { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, AlertCircle, LayoutDashboard, Pencil } from "lucide-react"
import { JadwalCard }               from "@/components/widgets/JadwalCard"
import { KlasemenCard }             from "@/components/widgets/KlasemenCard"
import { TransferCard }             from "@/components/widgets/TransferCard"
import { PeluangCard }              from "@/components/widgets/PeluangCard"
import { AnalisaTaktisCard }        from "@/components/widgets/AnalisaTaktisCard"
import { PerbandinganTimCard }      from "@/components/widgets/PerbandinganTimCard"
import { TimelinePertandinganCard } from "@/components/widgets/TimelinePertandinganCard"
import { ProfilStadionCard }        from "@/components/widgets/ProfilStadionCard"
import { DaftarPemainCard }         from "@/components/widgets/DaftarPemainCard"
import { PemainAndalanCard }        from "@/components/widgets/PemainAndalanCard"
import { StatistikPertandinganCard } from "@/components/widgets/StatistikPertandinganCard"
import { StartingLineupCard }       from "@/components/widgets/StartingLineupCard"
import type { WidgetType } from "@/components/widgets/WidgetInserter"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HubSlot {
  type: WidgetType
  widget_id: string
  label: string
}

export interface WidgetHubRow {
  id: string
  title: string
  slots: HubSlot[]
  created_at: string
}

interface WidgetHubCardProps {
  widgetId: string
  isAdmin?: boolean
  onEdit?: (widgetId: string) => void
  refreshKey?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_ICONS: Record<WidgetType, string> = {
  jadwal:                "📅",
  klasemen:              "🏆",
  transfer:              "🔄",
  peluang:               "⭐",
  analisa_taktis:        "🧠",
  perbandingan_tim:      "⚔️",
  timeline_pertandingan: "📋",
  profil_stadion:        "🏟️",
  daftar_pemain:         "👥",
  pemain_andalan:        "🌟",
  hub:                   "🗂️",
  statistik_pertandingan: "📊",
  starting_lineup:        "🧩",
}

function renderSlotCard(slot: HubSlot, refreshKey: number) {
  const props = { widgetId: slot.widget_id, refreshKey }
  switch (slot.type) {
    case "jadwal":                return <JadwalCard               key={slot.widget_id} {...props} />
    case "klasemen":              return <KlasemenCard             key={slot.widget_id} {...props} />
    case "transfer":              return <TransferCard             key={slot.widget_id} {...props} />
    case "peluang":               return <PeluangCard              key={slot.widget_id} {...props} />
    case "analisa_taktis":        return <AnalisaTaktisCard        key={slot.widget_id} {...props} />
    case "perbandingan_tim":      return <PerbandinganTimCard      key={slot.widget_id} {...props} />
    case "timeline_pertandingan": return <TimelinePertandinganCard key={slot.widget_id} {...props} />
    case "profil_stadion":        return <ProfilStadionCard        key={slot.widget_id} {...props} />
    case "daftar_pemain":         return <DaftarPemainCard         key={slot.widget_id} {...props} />
    case "pemain_andalan":        return <PemainAndalanCard        key={slot.widget_id} {...props} />
    case "statistik_pertandingan": return <StatistikPertandinganCard key={slot.widget_id} {...props} />
    case "starting_lineup":        return <StartingLineupCard       key={slot.widget_id} {...props} />
    default: return null
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WidgetHubCard({ widgetId, isAdmin, onEdit, refreshKey = 0 }: WidgetHubCardProps) {
  const [hub, setHub]           = useState<WidgetHubRow | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    async function fetchHub() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("widget_hub")
          .select("*")
          .eq("id", widgetId)
          .maybeSingle()
        if (error) throw error
        if (!data) throw new Error("Hub tidak ditemukan.")
        setHub(data as WidgetHubRow)
        setActiveTab(0)
      } catch (e: any) {
        setError(e.message ?? "Gagal memuat hub.")
      } finally {
        setLoading(false)
      }
    }
    fetchHub()
  }, [widgetId, refreshKey])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="not-prose my-6 rounded-2xl border border-white/10 bg-[#0f1117] shadow-lg overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#13151c] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <LayoutDashboard size={18} className="text-[#39FF14]" />
          <span className="font-semibold text-white">
            {hub?.title ?? "Widget Hub"}
          </span>
        </div>
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(widgetId)}
            className="flex items-center gap-1.5 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/10 px-3 py-1.5 text-xs font-medium text-[#39FF14] transition-all hover:bg-[#39FF14]/20 hover:border-[#39FF14]/60"
          >
            <Pencil size={12} />
            Edit Hub
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex min-h-35 items-center justify-center gap-2 text-gray-400">
          <Loader2 size={16} className="animate-spin text-[#39FF14]" />
          <span className="text-sm">Memuat hub...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center justify-center gap-2 py-10 text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Empty slots */}
      {!loading && hub && hub.slots.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">Hub ini belum memiliki slot widget.</p>
      )}

      {/* Tab bar + content */}
      {!loading && hub && hub.slots.length > 0 && (
        <>
          {/* Tab bar — horizontal scroll */}
          <div className="flex overflow-x-auto border-b border-white/10 bg-[#0d1410] scrollbar-hide">
            {hub.slots.map((slot, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={[
                  "flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
                  activeTab === idx
                    ? "border-b-2 border-[#39FF14] text-[#39FF14]"
                    : "text-gray-400 hover:text-gray-200",
                ].join(" ")}
              >
                <span className="text-base leading-none">
                  {SLOT_ICONS[slot.type] ?? "📦"}
                </span>
                {slot.label}
              </button>
            ))}
          </div>

          {/* Active slot content — no extra wrapper padding, cards handle their own styling */}
          <div>
            {renderSlotCard(hub.slots[activeTab], refreshKey)}
          </div>
        </>
      )}
    </div>
  )
}
