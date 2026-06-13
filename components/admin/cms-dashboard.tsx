"use client"

import { useState } from "react"
import { CMSSidebar } from "./cms-sidebar"
import { DashboardView } from "./views/dashboard-view"
import { PostsView } from "./views/posts-view"
import { AnalyticsView } from "./views/analytics-view"
import { UsersView } from "./views/users-view"
import { SettingsView } from "./views/settings-view"
import { CreateArticleView } from "./views/create-article-view"
import { CommentsView } from "./views/comments-view"
import { SocialMediaView } from "./views/social-media-view"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

export type CMSView = "dashboard" | "posts" | "analytics" | "comments" | "users" | "settings" | "create-article" | "edit-article" | "social-media"

interface CMSDashboardProps {
  onLogout: () => void
  onGoToPublic: () => void
}

export function CMSDashboard({ onLogout, onGoToPublic }: CMSDashboardProps) {
  const [currentView, setCurrentView] = useState<CMSView>("dashboard")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [editArticleId, setEditArticleId] = useState<string | null>(null)
  const [socialArticleId, setSocialArticleId] = useState<string | null>(null)

  const handleCreateArticle = () => {
    setCurrentView("create-article")
  }

  const handleEditArticle = (id: string) => {
    setEditArticleId(id)
    setCurrentView("edit-article")
  }

  const handleBackFromCreate = () => {
    setEditArticleId(null)
    setCurrentView("posts")
  }

  const handleOpenSocialMedia = (id: string) => {
    setSocialArticleId(id)
    setCurrentView("social-media")
  }

  const handleBackFromSocial = () => {
    setSocialArticleId(null)
    setCurrentView("posts")
  }

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView onCreateArticle={handleCreateArticle} />
      case "posts":
        return <PostsView onCreateArticle={handleCreateArticle} onEditArticle={handleEditArticle} onOpenSocialMedia={handleOpenSocialMedia} />
      case "analytics":
        return <AnalyticsView />
      case "comments":
        return <CommentsView />
      case "users":
        return <UsersView />
      case "settings":
        return <SettingsView />
      case "create-article":
        return <CreateArticleView onBack={handleBackFromCreate} />
      case "edit-article":
        return <CreateArticleView key={editArticleId ?? "edit"} articleId={editArticleId} onBack={handleBackFromCreate} />
      case "social-media":
        return socialArticleId
          ? <SocialMediaView articleId={socialArticleId} onBack={handleBackFromSocial} />
          : <PostsView onCreateArticle={handleCreateArticle} onEditArticle={handleEditArticle} onOpenSocialMedia={handleOpenSocialMedia} />
      default:
        return <DashboardView onCreateArticle={handleCreateArticle} />
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <CMSSidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        onLogout={onLogout}
        onGoToPublic={onGoToPublic}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      <main
        className={`flex-1 min-w-0 transition-all duration-300 ${
          isSidebarCollapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        {/* Mobile top bar dengan hamburger */}
        <div className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1
            className="text-lg font-bold text-primary"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            HalfSpace CMS
          </h1>
        </div>

        {renderView()}
      </main>
    </div>
  )
}
