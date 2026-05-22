"use client"

import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { LoginPage } from "@/components/admin/login-page"

export default function AdminPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    router.push("/admin/dashboard")
  }

  const handleGoToPublic = () => {
    router.push("/")
  }

  return (
    <LoginPage
      onLogin={handleLogin}
      onGoToPublic={handleGoToPublic}
    />
  )
}