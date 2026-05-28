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
    // Paksa semua card widget re-fetch data terbaru dari Supabase
    setRefreshKey((k) => k + 1)
  }

  const nodes = parseWidgetContent(content, {
    isAdmin,
    onEdit: isAdmin ? handleEdit : undefined,
    refreshKey,
  })

  return (
    <>
      {/* Konten artikel */}
      <div className={`prose prose-invert max-w-none ${className}`}>
        {nodes}
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
