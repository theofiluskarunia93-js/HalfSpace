"use client"

import { useState } from "react"

export type WidgetType = "jadwal" | "klasemen" | "transfer" | "peluang" | "analisa_taktis" | "perbandingan_tim" | "timeline_pertandingan"

export function useWidgetModal() {
  const [modalWidgetId, setModalWidgetId] = useState<string | null>(null)
  const [modalWidgetType, setModalWidgetType] = useState<WidgetType | null>(null)

  function openWidgetModal(widgetId: string, widgetType: WidgetType) {
    setModalWidgetId(widgetId)
    setModalWidgetType(widgetType)
  }

  function closeWidgetModal() {
    setModalWidgetId(null)
    setModalWidgetType(null)
  }

  return { modalWidgetId, modalWidgetType, openWidgetModal, closeWidgetModal }
}
