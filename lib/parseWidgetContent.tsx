import React from "react"
import { JadwalCard, KlasemenCard } from "@/components/widgets/WidgetCards"
import type { WidgetType } from "@/components/widgets/WidgetEditModal"

// ─── Regex untuk mengenali marker widget yang disimpan di DB ──────────────────
//
// Format marker yang disimpan ke DB (mode "save" di resolveCards):
//   <p>📅JadwalPertandinganWIDGET AKTIF\n🖇 klik untuk edit{widgetId}:{blockId}</p>
//   <p>🏆KlasemenGrupWIDGET AKTIF\n🖇 klik untuk edit{widgetId}:{blockId}</p>
//
// Setelah melalui TipTap getHTML() / DOMParser, \n bisa menjadi <br> atau tetap \n.
// Regex ini menangani kedua kemungkinan, serta strip tag HTML pembungkus (<p>, <br>).
//
// Pola yang dikenali (dalam raw HTML string):
//   Opsional: <p> (dengan atribut apapun)
//   Emoji awal: 📅 atau 🏆
//   Tipe: JadwalPertandingan atau KlasemenGrup
//   WIDGET AKTIF
//   Karakter apapun (termasuk \n, <br>, <br/>, spasi, emoji 🖇)
//   "klik untuk edit"
//   widgetId: UUID (hex + dash)
//   ":" + blockId (alphanumeric) — blockId diabaikan, hanya widgetId yang diperlukan
//   Opsional: </p>
//
const WIDGET_PLACEHOLDER_RE =
  /<p[^>]*>\s*(?:📅|🏆)(JadwalPertandingan|KlasemenGrup)WIDGET\s+AKTIF[\s\S]*?klik\s+untuk\s+edit([a-fA-F0-9-]{36})[^<]*<\/p>|(?:📅|🏆)(JadwalPertandingan|KlasemenGrup)WIDGET\s+AKTIF[\s\S]*?klik\s+untuk\s+edit([a-fA-F0-9-]{36})/g

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
    const fullMatch = match[0]
    const matchStart = match.index

    // Grup 1 & 2: dari pola dengan <p> wrapper
    // Grup 3 & 4: dari pola tanpa <p> wrapper (fallback)
    const rawType = match[1] ?? match[3]
    const widgetId = match[2] ?? match[4]

    if (!rawType || !widgetId) continue

    // 1. Render teks HTML (sebelum marker widget)
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

    // 2. Render Widget Card berdasarkan tipe
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

  // 3. Render sisa teks HTML setelah widget terakhir
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
