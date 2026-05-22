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
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface CMSSidebarProps {
  currentView: CMSView
  onViewChange: (view: CMSView) => void
  onLogout: () => void
  onGoToPublic: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

const menuItems = [
  { id: "dashboard" as CMSView, label: "Dashboard", icon: LayoutDashboard },
  { id: "posts" as CMSView, label: "Posts", icon: FileText },
  { id: "analytics" as CMSView, label: "Analytics", icon: BarChart3 },
  { id: "users" as CMSView, label: "Users", icon: Users },
  { id: "settings" as CMSView, label: "Settings", icon: Settings },
]

export function CMSSidebar({
  currentView,
  onViewChange,
  onLogout,
  onGoToPublic,
  isCollapsed,
  onToggleCollapse,
}: CMSSidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-card transition-all ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {!isCollapsed && (
          <h1 
            className="text-xl font-bold text-primary"
            style={{ fontFamily: 'var(--font-oswald)' }}
          >
            HalfSpace CMS
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id || (currentView === "create-article" && item.id === "posts")
          
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="border-t border-border p-2">
        <button
          onClick={onGoToPublic}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Globe className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span>View Website</span>}
        </button>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
