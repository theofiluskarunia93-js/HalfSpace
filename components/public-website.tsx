"use client"

import { useState, useEffect } from "react"
import { PublicPage } from "@/app/page"
import { Navbar } from "./navbar"
import { HeroSection } from "./hero-section"
import { LiveScores } from "./live-scores"
import { TrendingArticles } from "./trending-articles"
import { EditorChoice } from "./editor-choice"
import { StandingsSection } from "./standings-section"
import { Footer } from "./footer"
import { PageContent } from "./page-content"
import { createClient } from "@/lib/supabase/client"

interface PublicWebsiteProps {
  currentPage: PublicPage
  onPageChange: (page: PublicPage) => void
  onGoToAdmin: () => void
}

export function PublicWebsite({ currentPage, onPageChange, onGoToAdmin }: PublicWebsiteProps) {
  const [showFootballWidgets, setShowFootballWidgets] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from("site_settings").select("show_football_widgets").single()
      if (data) {
        setShowFootballWidgets(data.show_football_widgets !== false)
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
          {showFootballWidgets && <LiveScores />}
          <TrendingArticles widgetVisible={showFootballWidgets} />
          {/* Editor Choice — tepat di bawah Trending */}
          <EditorChoice />
          {showFootballWidgets && <StandingsSection />}
        </>
      ) : (
        <PageContent currentPage={currentPage} onPageChange={onPageChange} />
      )}
      
      <Footer onGoToAdmin={onGoToAdmin} onPageChange={onPageChange} />
    </div>
  )
}
