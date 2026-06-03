// Server Component — metadata + initial SSR data.
// Query ?q= dibaca dari searchParams (server-side) agar:
// 1. Googlebot dapat HTML hasil pencarian langsung (bukan shell kosong)
// 2. URL /search?q=messi bisa di-share dan di-bookmark
// 3. SearchAction di JSON-LD layout.tsx valid dan berfungsi

import type { Metadata } from "next"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import { SearchClient } from "@/components/search-client"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspacesport.com"

interface Props {
  searchParams: Promise<{ q?: string }>
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams
  const query = q?.trim() ?? ""

  const title = query
    ? `Hasil pencarian "${query}" | HalfSpace`
    : "Cari Artikel | HalfSpace"
  const description = query
    ? `Temukan artikel tentang "${query}" di HalfSpace — berita olahraga terkini.`
    : "Cari berita olahraga terkini di HalfSpace. Temukan artikel tentang liga, transfer, dan turnamen favoritmu."

  return {
    title,
    description,
    alternates: {
      canonical: query ? `${BASE_URL}/search?q=${encodeURIComponent(query)}` : `${BASE_URL}/search`,
    },
    robots: {
      // Halaman search dengan query: boleh di-index tapi jangan follow link
      // Halaman search tanpa query: tidak perlu di-index
      index: query.length > 0,
      follow: true,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: query ? `${BASE_URL}/search?q=${encodeURIComponent(query)}` : `${BASE_URL}/search`,
      siteName: "HalfSpace",
      images: [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630, alt: "HalfSpace" }],
    },
  }
}

async function fetchSearchResults(query: string) {
  if (!query || query.trim().length < 2) return []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  try {
    // Full-text search via Supabase ilike — cari di title dan excerpt
    const q = encodeURIComponent(`%${query.trim()}%`)
    const res = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.published&or=(title.ilike.${q},excerpt.ilike.${q})&select=id,title,slug,excerpt,featured_image_url,featured_image_alt,author,published_at,created_at,categories(name,slug)&order=published_at.desc&limit=30`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        // Jangan cache hasil search — setiap query bisa berbeda
        cache: "no-store",
      }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams
  const query = q?.trim() ?? ""
  const results = await fetchSearchResults(query)

  return (
    <div className="min-h-screen bg-background">
      <NavbarStandalone />
      <SearchClient initialQuery={query} initialResults={results} />
      <FooterStandalone />
    </div>
  )
}
