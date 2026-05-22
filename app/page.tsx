"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { PublicWebsite } from "@/components/public-website"
import { AdminCMS } from "@/components/admin-cms"

export type AppView = "public" | "admin"
export type PublicPage = "home" | "trending" | "standings" | "europe" | "international" | "asia" | "liga1" | "champions-league" | "premier-league" | "la-liga" | "bundesliga" | "serie-a" | "world-cup" | "euro" | "copa-america" | "afcon" | "afc-cup" | "aff-cup" | "transfer" | "about" | "contact"

export default function Home() {
  const [appView, setAppView] = useState<AppView>("public")
  const [currentPage, setCurrentPage] = useState<PublicPage>("home")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const supabase = createClient()

  // Cek session saat pertama load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleGoToAdmin = () => {
    setAppView("admin")
  }

  const handleGoToPublic = () => {
    setAppView("public")
    setCurrentPage("home")
  }

  const handleLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    setIsLoggedIn(true)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setAppView("public")
  }

  if (appView === "admin") {
    return (
      <AdminCMS
        isLoggedIn={isLoggedIn}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onGoToPublic={handleGoToPublic}
      />
    )
  }

  return (
    <PublicWebsite
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      onGoToAdmin={handleGoToAdmin}
    />
  )
}