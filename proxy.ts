import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// proxy.ts — pengganti middleware.ts
//
// Next.js 16 men-deprecate konvensi file "middleware.ts" dan menggantinya
// dengan "proxy.ts" (nama fungsi juga berubah dari `middleware` menjadi
// `proxy`). Logic auth-guard di bawah ini TIDAK berubah sama sekali dari
// middleware.ts sebelumnya — hanya nama file & nama fungsi yang disesuaikan
// dengan konvensi baru. Lihat: https://nextjs.org/docs/messages/middleware-to-proxy

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname === '/admin'

  // Kalau sudah login dan buka halaman login, redirect ke dashboard
  if (isLoginPage && user) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  // Kalau belum login dan bukan halaman login, redirect ke login
  if (!isLoginPage && request.nextUrl.pathname.startsWith('/admin') && !user) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*'],
}
