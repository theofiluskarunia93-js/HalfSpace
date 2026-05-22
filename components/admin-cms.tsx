"use client"

import { LoginPage } from "./admin/login-page"
import { CMSDashboard } from "./admin/cms-dashboard"

interface AdminCMSProps {
  isLoggedIn: boolean
  onLogin: (email: string, password: string) => Promise<void>
  onLogout: () => void
  onGoToPublic: () => void
}

export function AdminCMS({ isLoggedIn, onLogin, onLogout, onGoToPublic }: AdminCMSProps) {
  if (!isLoggedIn) {
    return <LoginPage onLogin={onLogin} onGoToPublic={onGoToPublic} />
  }

  return <CMSDashboard onLogout={onLogout} onGoToPublic={onGoToPublic} />
}