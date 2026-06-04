import React from "react"
import { JadwalCard, KlasemenCard, TransferCard, PeluangCard, AnalisaTaktisCard } from "@/components/widgets/WidgetCards"
import type { WidgetType } from "@/components/widgets/useWidgetModal"

/**
 * parseWidgetContent
 *
 * Shortcode yang didukung:
 *   [match_data id="<uuid>"]
 *   [klasemen_data id="<uuid>"]
 *   [transfer_data id="<uuid>"]
 *   [peluang_data id="<uuid>"]
 *   [analisa_taktis_data id="<uuid>"]
 */

const SHORTCODE_RE =
  /(?:<p[^>]*>)?\s*\[(match_data|klasemen_data|transfer_data|peluang_data|analisa_taktis_data)\s+id="([a-fA-F0-9-]{36})"\]\s*(?:<\/p>)?/g

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

  SHORTCODE_RE.lastIndex = 0

  while ((match = SHORTCODE_RE.exec(rawContent)) !== null) {
    const fullMatch = match[0]
    const matchStart = match.index
    const rawType = match[1]
    const widgetId = match[2]

    if (!rawType || !widgetId) continue

    if (matchStart > lastIndex) {
      const htmlChunk = rawContent.slice(lastIndex, matchStart)
      if (htmlChunk.trim()) {
        nodes.push(
          <span
            key={`html-${lastIndex}`}
            dangerouslySetInnerHTML={{ __html: htmlChunk }}
          />
        )
      }
    }

    const widgetType: WidgetType =
      rawType === "match_data"          ? "jadwal"          :
      rawType === "klasemen_data"       ? "klasemen"        :
      rawType === "transfer_data"       ? "transfer"        :
      rawType === "analisa_taktis_data" ? "analisa_taktis"  :
      "peluang"

    if (widgetType === "jadwal") {
      nodes.push(
        <JadwalCard
          key={`jadwal-${widgetId}-${refreshKey}`}
          widgetId={widgetId}
          isAdmin={isAdmin}
          onEdit={onEdit ? (id) => onEdit(id, "jadwal") : undefined}
        />
      )
    } else if (widgetType === "klasemen") {
      nodes.push(
        <KlasemenCard
          key={`klasemen-${widgetId}-${refreshKey}`}
          widgetId={widgetId}
          isAdmin={isAdmin}
          onEdit={onEdit ? (id) => onEdit(id, "klasemen") : undefined}
        />
      )
    } else if (widgetType === "transfer") {
      nodes.push(
        <TransferCard
          key={`transfer-${widgetId}-${refreshKey}`}
          widgetId={widgetId}
          isAdmin={isAdmin}
          onEdit={onEdit ? (id) => onEdit(id, "transfer") : undefined}
        />
      )
    } else if (widgetType === "analisa_taktis") {
      nodes.push(
        <AnalisaTaktisCard
          key={`analisa_taktis-${widgetId}-${refreshKey}`}
          widgetId={widgetId}
          isAdmin={isAdmin}
          onEdit={onEdit ? (id) => onEdit(id, "analisa_taktis") : undefined}
        />
      )
    } else {
      nodes.push(
        <PeluangCard
          key={`peluang-${widgetId}-${refreshKey}`}
          widgetId={widgetId}
          isAdmin={isAdmin}
          onEdit={onEdit ? (id) => onEdit(id, "peluang") : undefined}
        />
      )
    }

    lastIndex = matchStart + fullMatch.length
  }

  if (lastIndex < rawContent.length) {
    const htmlChunk = rawContent.slice(lastIndex)
    if (htmlChunk.trim()) {
      nodes.push(
        <span
          key={`html-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: htmlChunk }}
        />
      )
    }
  }

  return nodes
}

export function hasWidgetShortcode(content: string): boolean {
  return /\[(match_data|klasemen_data|transfer_data|peluang_data|analisa_taktis_data)\s+id="[a-fA-F0-9-]{36}"\]/.test(content)
}
