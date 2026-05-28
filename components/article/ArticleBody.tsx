"use client"

import { useState } from "react"
import { parseWidgetContent } from "@/lib/parseWidgetContent"
import { WidgetEditModal } from "@/components/widgets/WidgetEditModal"
import { useWidgetModal } from "@/components/widgets/useWidgetModal"
import type { WidgetType } from "@/components/widgets/WidgetEditModal"

interface ArticleBodyProps {
  content: string
  isAdmin?: boolean
  className?: string
}

// Deteksi apakah konten mengandung marker widget
function hasWidget(content: string): boolean {
  return /(?:📅|🏆)(JadwalPertandingan|KlasemenGrup)WIDGET/.test(content)
}

export function ArticleBody({
  content,
  isAdmin = false,
  className = "",
}: ArticleBodyProps) {
  // refreshKey dipakai untuk memaksa card fetch ulang setelah simpan
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

  // Jika konten mengandung widget, gunakan parseWidgetContent agar
  // widget dirender sebagai React component (fetch data dari Supabase).
  // Jika tidak ada widget, render langsung via dangerouslySetInnerHTML
  // (lebih efisien dan tidak perlu parsing regex).
  const containsWidget = hasWidget(content)

  return (
    <>
      {/* Konten artikel */}
      <div className={`prose prose-invert max-w-none ${className}`}>
        {containsWidget ? (
          parseWidgetContent(content, {
            isAdmin,
            onEdit: isAdmin ? handleEdit : undefined,
            refreshKey,
          })
        ) : (
          <span dangerouslySetInnerHTML={{ __html: content }} />
        )}
      </div>

      {/* Modal edit widget — hanya muncul jika isAdmin dan ada widgetId */}
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
