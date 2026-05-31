"use client"

import { useState, useEffect } from "react"
import { PublicPage } from "@/types/pages"
import { Navbar } from "./navbar"
import { HeroSection } from "./hero-section"
import { LiveScores } from "./live-scores"
import { TrendingArticles } from "./trending-articles"
import { EditorChoice } from "./editor-choice"
import { StandingsSection } from "./standings-section"
import { Footer } from "./footer"
import { PageContent } from "./page-content"
import { createClient } from "@/lib/supabase/client"

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

interface PublicWebsiteProps {
  currentPage: PublicPage
  onPageChange: (page: PublicPage) => void
  onGoToAdmin: () => void
  initialTrending: Article[]
  initialEditorChoice: EditorChoiceArticle[]
}

export function PublicWebsite({
  currentPage,
  onPageChange,
  onGoToAdmin,
  initialTrending,
  initialEditorChoice,
}: PublicWebsiteProps) {
  const [showLiveScore, setShowLiveScore] = useState(true)
  const [showStandings, setShowStandings] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("site_settings")
        .select("show_football_widgets, show_live_score, show_standings")
        .single()
      if (data) {
        const allEnabled = data.show_football_widgets !== false
        setShowLiveScore(allEnabled && data.show_live_score !== false)
        setShowStandings(allEnabled && data.show_standings !== false)
      }
    }
    loadSettings()
  }, [])

  const handleScrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        currentPage={currentPage}
        onPageChange={onPageChange}
        onScrollToSection={handleScrollToSection}
      />

      {currentPage === "home" ? (
        <>
          <HeroSection />
          {showLiveScore && <LiveScores />}
          <TrendingArticles
            widgetVisible={showLiveScore || showStandings}
            initialArticles={initialTrending}
          />
          <EditorChoice initialArticles={initialEditorChoice} />
          {showStandings && <StandingsSection />}
        </>
      ) : (
        <PageContent currentPage={currentPage} onPageChange={onPageChange} />
      )}

      <Footer onGoToAdmin={onGoToAdmin} onPageChange={onPageChange} />
    </div>
  )
}
