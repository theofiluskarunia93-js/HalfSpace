/**
 * parseWidgetContent.ts
 *
 * Mem-parse konten artikel HTML, mendeteksi shortcode widget, dan
 * mengembalikan array React nodes (teks HTML + komponen widget).
 *
 * Shortcode yang didukung:
 *  [match_data id="<uuid>"]              → JadwalCard
 *  [klasemen_data id="<uuid>"]           → KlasemenCard
 *  [transfer_data id="<uuid>"]           → TransferCard
 *  [peluang_data id="<uuid>"]            → PeluangCard
 *  [analisa_taktis_data id="<uuid>"]     → AnalisaTaktisCard
 *  [perbandingan_tim_data id="<uuid>"]   → PerbandinganTimCard  ← BARU
 *  [timeline_pertandingan_data id="<uuid>"] → TimelinePertandinganCard ← BARU
 */

import React from "react"
import { JadwalCard }               from "@/components/widgets/JadwalCard"
import { KlasemenCard }             from "@/components/widgets/KlasemenCard"
import { TransferCard }             from "@/components/widgets/TransferCard"
import { PeluangCard }              from "@/components/widgets/PeluangCard"
import { AnalisaTaktisCard }        from "@/components/widgets/AnalisaTaktisCard"
import { PerbandinganTimCard }      from "@/components/widgets/PerbandinganTimCard"
import { TimelinePertandinganCard } from "@/components/widgets/TimelinePertandinganCard"
import type { WidgetType }          from "@/components/widgets/WidgetInserter"

// ─── Regex: cocokkan SEMUA shortcode yang dikenal ─────────────────────────────
const WIDGET_SHORTCODE_RE =
  /\[(match_data|klasemen_data|transfer_data|peluang_data|analisa_taktis_data|perbandingan_tim_data|timeline_pertandingan_data)\s+id="([a-fA-F0-9-]{36})"\]/g

// ─── hasWidgetShortcode ───────────────────────────────────────────────────────
export function hasWidgetShortcode(content: string): boolean {
  WIDGET_SHORTCODE_RE.lastIndex = 0
  return WIDGET_SHORTCODE_RE.test(content)
}

// ─── parseWidgetContent ───────────────────────────────────────────────────────
export function parseWidgetContent(
  content: string,
  options: {
    isAdmin?: boolean
    onEdit?: (widgetId: string, widgetType: WidgetType) => void
    refreshKey?: number
  } = {}
): React.ReactNode[] {
  const { isAdmin = false, onEdit, refreshKey = 0 } = options
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  WIDGET_SHORTCODE_RE.lastIndex = 0

  while ((match = WIDGET_SHORTCODE_RE.exec(content)) !== null) {
    const [fullMatch, rawType, widgetId] = match
    const matchStart = match.index

    // Teks HTML sebelum shortcode ini
    if (matchStart > lastIndex) {
      const html = content.slice(lastIndex, matchStart)
      if (html.trim()) {
        nodes.push(
          React.createElement("span", {
            key: `html-${lastIndex}`,
            dangerouslySetInnerHTML: { __html: html },
          })
        )
      }
    }

    // Render widget yang sesuai
    const key = `widget-${widgetId}-${lastIndex}`

    switch (rawType) {
      case "match_data":
        nodes.push(
          React.createElement(JadwalCard, {
            key,
            widgetId,
            isAdmin,
            onEdit: isAdmin && onEdit ? (id: string) => onEdit(id, "jadwal") : undefined,
            refreshKey,
          })
        )
        break

      case "klasemen_data":
        nodes.push(
          React.createElement(KlasemenCard, {
            key,
            widgetId,
            isAdmin,
            onEdit: isAdmin && onEdit ? (id: string) => onEdit(id, "klasemen") : undefined,
            refreshKey,
          })
        )
        break

      case "transfer_data":
        nodes.push(
          React.createElement(TransferCard, {
            key,
            widgetId,
            isAdmin,
            onEdit: isAdmin && onEdit ? (id: string) => onEdit(id, "transfer") : undefined,
            refreshKey,
          })
        )
        break

      case "peluang_data":
        nodes.push(
          React.createElement(PeluangCard, {
            key,
            widgetId,
            isAdmin,
            onEdit: isAdmin && onEdit ? (id: string) => onEdit(id, "peluang") : undefined,
            refreshKey,
          })
        )
        break

      case "analisa_taktis_data":
        nodes.push(
          React.createElement(AnalisaTaktisCard, {
            key,
            widgetId,
            isAdmin,
            onEdit: isAdmin && onEdit ? (id: string) => onEdit(id, "analisa_taktis") : undefined,
            refreshKey,
          })
        )
        break

      case "perbandingan_tim_data":
        nodes.push(
          React.createElement(PerbandinganTimCard, {
            key,
            widgetId,
            isAdmin,
            onEdit: isAdmin && onEdit
              ? (id: string) => onEdit(id, "perbandingan_tim" as WidgetType)
              : undefined,
            refreshKey,
          })
        )
        break

      case "timeline_pertandingan_data":
        nodes.push(
          React.createElement(TimelinePertandinganCard, {
            key,
            widgetId,
            isAdmin,
            onEdit: isAdmin && onEdit
              ? (id: string) => onEdit(id, "timeline_pertandingan" as WidgetType)
              : undefined,
            refreshKey,
          })
        )
        break
    }

    lastIndex = matchStart + fullMatch.length
  }

  // Sisa HTML setelah shortcode terakhir
  if (lastIndex < content.length) {
    const html = content.slice(lastIndex)
    if (html.trim()) {
      nodes.push(
        React.createElement("span", {
          key: `html-end`,
          dangerouslySetInnerHTML: { __html: html },
        })
      )
    }
  }

  return nodes
}
