"use client"

import { useState, useCallback } from "react"
import type { WidgetType } from "./WidgetEditModal"

interface ModalState {
  widgetId: string | null
  widgetType: WidgetType | null
}

export function useWidgetModal() {
  const [modal, setModal] = useState<ModalState>({
    widgetId: null,
    widgetType: null,
  })

  const openWidgetModal = useCallback(
    (widgetId: string, widgetType: WidgetType) => {
      setModal({ widgetId, widgetType })
    },
    []
  )

  const closeWidgetModal = useCallback(() => {
    setModal({ widgetId: null, widgetType: null })
  }, [])

  return {
    modalWidgetId: modal.widgetId,
    modalWidgetType: modal.widgetType,
    openWidgetModal,
    closeWidgetModal,
  }
}
