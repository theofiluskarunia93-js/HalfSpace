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

  const containsWidget = hasWidgetShortcode(content)

  return (
    <>
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
