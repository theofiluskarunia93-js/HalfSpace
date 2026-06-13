// lib/supabase/server-auth.ts
//
// Helper untuk validasi sesi admin di API routes (server-side).
// Pastikan tabel "profiles" punya kolom "role" (mis. "admin" / "editor").

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function requireAdmin() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          // no-op: API route tidak perlu refresh cookie
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return null
  }

  return user
}
