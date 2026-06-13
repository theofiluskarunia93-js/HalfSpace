"use client"

import { CMSView } from "./cms-dashboard"
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Globe,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Share2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface CMSSidebarProps {
  currentView: CMSView
  onViewChange: (view: CMSView) => void
  onLogout: () => void
  onGoToPublic: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  // Mobile drawer state (dikelola dari cms-dashboard)
  isMobileOpen: boolean
  onMobileClose: () => void
}

const menuItems = [
  { id: "dashboard" as CMSView, label: "Dashboard", icon: LayoutDashboard },
  { id: "posts" as CMSView, label: "Posts", icon: FileText },
  { id: "analytics" as CMSView, label: "Analytics", icon: BarChart3 },
  { id: "comments" as CMSView, label: "Komentar", icon: MessageSquare },
  { id: "users" as CMSView, label: "Users", icon: Users },
  { id: "settings" as CMSView, label: "Settings", icon: Settings },
  { id: "social-media" as CMSView, label: "Social Media", icon: Share2 },
]

function SidebarContent({
  currentView,
  onViewChange,
  onLogout,
  onGoToPublic,
  isCollapsed,
  onToggleCollapse,
  onMobileClose,
  isMobile = false,
}: CMSSidebarProps & { isMobile?: boolean }) {
  const handleItemClick = (view: CMSView) => {
    onViewChange(view)
    if (isMobile) onMobileClose()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {(!isCollapsed || isMobile) && (
          <h1
            className="text-xl font-bold text-primary"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            HalfSpace CMS
          </h1>
        )}
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMobileClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive =
            currentView === item.id ||
            (currentView === "create-article" && item.id === "posts") ||
            (currentView === "social-media" && item.id === "social-media")

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {(!isCollapsed || isMobile) && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => { onGoToPublic(); if (isMobile) onMobileClose() }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Globe className="h-5 w-5 flex-shrink-0" />
          {(!isCollapsed || isMobile) && <span>View Website</span>}
        </button>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {(!isCollapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </div>
  )
}

export function CMSSidebar(props: CMSSidebarProps) {
  const { isCollapsed, isMobileOpen, onMobileClose } = props

  return (
    <>
      {/* ── Desktop sidebar (md ke atas) ── */}
      <aside
        className={`fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border bg-card transition-all duration-300 md:flex ${
          isCollapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent {...props} isMobile={false} />
      </aside>

      {/* ── Mobile overlay backdrop ── */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer (di bawah md) ── */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-border bg-card transition-transform duration-300 md:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent {...props} isMobile={true} />
      </aside>
    </>
  )
}
