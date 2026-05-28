"use client"

import { useState } from "react"
import { CMSSidebar } from "./cms-sidebar"
import { DashboardView } from "./views/dashboard-view"
import { PostsView } from "./views/posts-view"
import { AnalyticsView } from "./views/analytics-view"
import { UsersView } from "./views/users-view"
import { SettingsView } from "./views/settings-view"
import { CreateArticleView } from "./views/create-article-view"

export type CMSView = "dashboard" | "posts" | "analytics" | "users" | "settings" | "create-article" | "edit-article"

interface CMSDashboardProps {
  onLogout: () => void
  onGoToPublic: () => void
}

export function CMSDashboard({ onLogout, onGoToPublic }: CMSDashboardProps) {
  const [currentView, setCurrentView] = useState<CMSView>("dashboard")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [editArticleId, setEditArticleId] = useState<string | null>(null)

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

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView onCreateArticle={handleCreateArticle} />
      case "posts":
        return <PostsView onCreateArticle={handleCreateArticle} onEditArticle={handleEditArticle} />
      case "analytics":
        return <AnalyticsView />
      case "users":
        return <UsersView />
      case "settings":
        return <SettingsView />
      case "create-article":
        return <CreateArticleView onBack={handleBackFromCreate} />
      case "edit-article":
        return <CreateArticleView key={editArticleId ?? "edit"} articleId={editArticleId} onBack={handleBackFromCreate} />
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
      />
      <main className={`flex-1 transition-all ${isSidebarCollapsed ? "ml-16" : "ml-64"}`}>
        {renderView()}
      </main>
    </div>
  )
}
