// lib/supabase/server-auth.ts
//
// Versi simpel: hanya memastikan user sudah login via Supabase session.
// Tidak cek tabel "profiles" / role — cocok untuk CMS single-admin
// atau yang belum punya sistem role.
//
// Kalau nanti mau tambah role-based access, tambahkan lagi
// pengecekan ke tabel profiles di sini.

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

  return user
}
