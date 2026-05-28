import React from "react"
import { JadwalCard, KlasemenCard } from "@/components/widgets/WidgetCards"
import type { WidgetType } from "@/components/widgets/WidgetEditModal"

// Regex untuk mengenali format badge Anda:
// Mendukung emoji 📅 atau 🏆, teks "WIDGET AKTIF", dan menangkap ID di akhir.
const WIDGET_PLACEHOLDER_RE = /(?:📅|🏆)(JadwalPertandingan|KlasemenGrup)WIDGET\s+AKTIF[\s\S]*?klik untuk edit([a-zA-Z0-9-]+)/g

interface ParseOptions {
  isAdmin?: boolean
  onEdit?: (widgetId: string, widgetType: WidgetType) => void
  refreshKey?: number
}

export function parseWidgetContent(
  rawContent: string,
  options: ParseOptions = {}
): React.ReactNode[] {
  const { isAdmin = false, onEdit, refreshKey = 0 } = options

  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset lastIndex agar pencarian selalu dimulai dari awal string
  WIDGET_PLACEHOLDER_RE.lastIndex = 0

  while ((match = WIDGET_PLACEHOLDER_RE.exec(rawContent)) !== null) {
    const [fullMatch, rawType, widgetId] = match
    const matchStart = match.index

    // 1. Render teks HTML (sebelum badge widget)
    if (matchStart > lastIndex) {
      const htmlChunk = rawContent.slice(lastIndex, matchStart)
      nodes.push(
        <span
          key={`html-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: htmlChunk }}
        />
      )
    }

    // 2. Render Widget Card berdasarkan tipe
    const widgetType: WidgetType = rawType === "JadwalPertandingan" ? "jadwal" : "klasemen"

    if (widgetType === "jadwal") {
      nodes.push(
        <JadwalCard
          key={`jadwal-${widgetId}-${refreshKey}`}
          widgetId={widgetId}
          isAdmin={isAdmin}
          onEdit={onEdit ? (id) => onEdit(id, "jadwal") : undefined}
        />
      )
    } else {
      nodes.push(
        <KlasemenCard
          key={`klasemen-${widgetId}-${refreshKey}`}
          widgetId={widgetId}
          isAdmin={isAdmin}
          onEdit={onEdit ? (id) => onEdit(id, "klasemen") : undefined}
        />
      )
    }

    lastIndex = matchStart + fullMatch.length
  }

  // 3. Render sisa teks HTML setelah widget terakhir
  if (lastIndex < rawContent.length) {
    const htmlChunk = rawContent.slice(lastIndex)
    nodes.push(
      <span
        key={`html-${lastIndex}`}
        dangerouslySetInnerHTML={{ __html: htmlChunk }}
      />
    )
  }

  return nodes
}