"use client"

import { useState } from "react"
import { parseWidgetContent, hasWidgetShortcode } from "@/lib/parseWidgetContent"
import { WidgetEditModal } from "@/components/widgets/WidgetEditModal"
import { useWidgetModal } from "@/components/widgets/useWidgetModal"
import type { WidgetType } from "@/components/widgets/useWidgetModal"

interface ArticleBodyProps {
  content: string
  isAdmin?: boolean
  className?: string
}

// ─── Sanitasi badge HTML editor ────────────────────────────────────────────
// Jika badge `.widget-shortcode-badge` terlanjur tersimpan di DB sebagai HTML
// (bukan sebagai shortcode teks), fungsi ini mengekstrak shortcode bersihnya
// sehingga teks internal badge (label, ID, dll.) tidak bocor ke halaman publik.
function sanitizeBadgeContent(content: string): string {
  if (typeof window === "undefined") return content
  if (!content.includes("widget-shortcode-badge")) return content

  const parser = new DOMParser()
  const doc = parser.parseFromString(content, "text/html")

  doc.querySelectorAll<HTMLElement>(".widget-shortcode-badge").forEach((el) => {
    const shortcode =
      el.dataset.shortcode ||
      (() => {
        const wId = el.dataset.widgetId
        const wType = el.dataset.widgetType
        if (!wId || !wType) return null
        const scMap: Record<string, string> = {
          jadwal:                  `[match_data id="${wId}"]`,
          klasemen:                `[klasemen_data id="${wId}"]`,
          transfer:                `[transfer_data id="${wId}"]`,
          peluang:                 `[peluang_data id="${wId}"]`,
          analisa_taktis:          `[analisa_taktis_data id="${wId}"]`,
          perbandingan_tim:        `[perbandingan_tim_data id="${wId}"]`,
          timeline_pertandingan:   `[timeline_pertandingan_data id="${wId}"]`,
        }
        return scMap[wType] ?? null
      })()

    const parentP = el.closest("p")
    if (shortcode) {
      const p = doc.createElement("p")
      p.textContent = shortcode
      if (parentP && parentP !== el) parentP.replaceWith(p)
      else el.replaceWith(p)
    } else {
      // Tidak ada info widget — hapus seluruhnya
      if (parentP && parentP !== el) parentP.remove()
      else el.remove()
    }
  })

  return doc.body.innerHTML
}

// ─── Inject heading IDs ────────────────────────────────────────────────────
// Memastikan setiap <h1>–<h3> punya id="heading-N" agar TOC bisa scroll ke sana.
// Heading yang sudah punya id (mis. dari DB) dibiarkan apa adanya.
function injectHeadingIds(html: string): string {
  let i = 0
  return html.replace(/<h([1-3])([^>]*)>/gi, (match, level, attrs) => {
    if (/id=/i.test(attrs)) return match
    const id = `heading-${i++}`
    return `<h${level}${attrs} id="${id}">`
  })
}

export function ArticleBody({
  content,
  isAdmin = false,
  className = "",
}: ArticleBodyProps) {
  // refreshKey memaksa card melakukan fetch ulang setelah admin menyimpan perubahan
  const [refreshKey, setRefreshKey] = useState(0)

  const {
    modalWidgetId,
    modalWidgetType,
    openWidgetModal,
    closeWidgetModal,
  } = useWidgetModal()

  function handleEdit(widgetId: string, widgetType: WidgetType) {
    openWidgetModal(widgetId, widgetType)
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1)
  }

  // Bersihkan badge HTML lama sebelum apapun diproses —
  // ini mencegah teks internal badge bocor ke halaman publik
  const safeContent = sanitizeBadgeContent(content)

  const containsWidget = hasWidgetShortcode(safeContent)

  // Selalu inject heading IDs agar TOC bisa scroll ke heading yang benar,
  // termasuk untuk artikel yang mengandung widget shortcode (rawContent path).
  const renderedContent = injectHeadingIds(safeContent)

  return (
    <>
      <div className={`prose prose-invert max-w-none ${className}`}>
        {containsWidget ? (
          parseWidgetContent(renderedContent, {
            isAdmin,
            // onEdit hanya diteruskan untuk admin — di halaman publik undefined
            onEdit: isAdmin ? handleEdit : undefined,
            refreshKey,
          })
        ) : (
          <span dangerouslySetInnerHTML={{ __html: renderedContent }} />
        )}
      </div>

      {/* Modal edit widget — hanya muncul untuk admin */}
      {isAdmin && (
        <WidgetEditModal
          widgetId={modalWidgetId}
          widgetType={modalWidgetType}
          onClose={closeWidgetModal}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
