"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { PublicWebsite } from "@/components/public-website"
import { AdminCMS } from "@/components/admin-cms"
import { AppView, PublicPage } from "@/types/pages"

interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  categories: { name: string; slug: string } | null
}

interface EditorChoiceArticle {
  id: string
  title: string
  slug: string
  categories: { name: string }[] | null
}

interface HomeClientProps {
  // Data yang sudah di-fetch di server — diteruskan ke komponen client
  initialTrending: Article[]
  initialEditorChoice: EditorChoiceArticle[]
}

export function HomeClient({ initialTrending, initialEditorChoice }: HomeClientProps) {
  const [appView, setAppView] = useState<AppView>("public")
  const [currentPage, setCurrentPage] = useState<PublicPage>("home")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleGoToAdmin = () => setAppView("admin")
  const handleGoToPublic = () => { setAppView("public"); setCurrentPage("home") }

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
      initialTrending={initialTrending}
      initialEditorChoice={initialEditorChoice}
    />
  )
}
