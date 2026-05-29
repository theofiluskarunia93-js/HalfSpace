import React from "react"
import { JadwalCard, KlasemenCard } from "@/components/widgets/WidgetCards"
import type { WidgetType } from "@/components/widgets/useWidgetModal"

/**
 * parseWidgetContent
 *
 * Mendeteksi shortcode widget dalam konten HTML artikel dan
 * me-render komponen React yang sesuai.
 *
 * Format shortcode yang didukung:
 *   [match_data id="<uuid>"]
 *   [klasemen_data id="<uuid>"]
 *
 * Shortcode ini disisipkan oleh WidgetInserter saat admin mengklik
 * "Simpan & Insert" di editor artikel. Saat artikel dirender di frontend,
 * fungsi ini menggantikan setiap shortcode dengan komponen JadwalCard /
 * KlasemenCard yang mengambil data langsung dari Supabase via widget_id.
 *
 * Karena shortcode disimpan di dalam tag <p> oleh TipTap, regex
 * juga menangani wrapping <p>...</p> agar tidak ada tag kosong tersisa.
 */

// Mencocokkan shortcode baik di dalam maupun di luar tag <p>
// Grup 1: tipe widget ("match_data" | "klasemen_data")
// Grup 2: UUID widget
const SHORTCODE_RE =
  /(?:<p[^>]*>)?\s*\[(match_data|klasemen_data)\s+id="([a-fA-F0-9-]{36})"\]\s*(?:<\/p>)?/g

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
    const rawType = match[1]   // "match_data" | "klasemen_data"
    const widgetId = match[2]  // UUID

    if (!rawType || !widgetId) continue

    // 1. Render HTML sebelum shortcode
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

    // 2. Render widget card
    const widgetType: WidgetType = rawType === "match_data" ? "jadwal" : "klasemen"

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

  // 3. Render sisa HTML setelah shortcode terakhir
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

/**
 * hasWidgetShortcode
 *
 * Cek cepat apakah konten mengandung shortcode widget.
 * Digunakan oleh ArticleBody untuk memilih render path.
 */
export function hasWidgetShortcode(content: string): boolean {
  return /\[(match_data|klasemen_data)\s+id="[a-fA-F0-9-]{36}"\]/.test(content)
}
