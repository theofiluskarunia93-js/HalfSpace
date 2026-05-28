import React from "react"
import { JadwalCard, KlasemenCard } from "@/components/widgets/WidgetCards"
import type { WidgetType } from "@/components/widgets/WidgetEditModal"

const WIDGET_PLACEHOLDER_RE =
  /(?:📅|🏆)(JadwalPertandingan|KlasemenGrup)WIDGET\s+AKTIF([\s\S]*?)🖇\s*klik untuk edit([a-zA-Z0-9-]+)(?::([a-zA-Z0-9]+))?/g

interface ParseOptions {
  isAdmin?: boolean
  onEdit?: (widgetId: string, widgetType: WidgetType) => void
  // key untuk memaksa re-render card setelah simpan
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

  // Reset lastIndex tiap pemanggilan
  WIDGET_PLACEHOLDER_RE.lastIndex = 0

  while ((match = WIDGET_PLACEHOLDER_RE.exec(rawContent)) !== null) {
    // Group 3 = widgetId (UUID), group 4 = blockId (opsional, untuk format baru)
    const [fullMatch, rawType, , widgetId] = match
    const matchStart = match.index

    // Teks HTML sebelum placeholder
    if (matchStart > lastIndex) {
      const htmlChunk = rawContent.slice(lastIndex, matchStart)
      nodes.push(
        <span
          key={`html-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: htmlChunk }}
        />
      )
    }

    // Render card sesuai tipe — widgetId dipakai sebagai key Supabase
    const widgetType: WidgetType =
      rawType === "JadwalPertandingan" ? "jadwal" : "klasemen"

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

  // Sisa HTML setelah placeholder terakhir
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
