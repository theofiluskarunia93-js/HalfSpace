// Server Component — fetch data di server, tidak ada "use client".
// ISR: halaman di-generate ulang setiap 5 menit.
// Googlebot mendapat HTML penuh dengan artikel, bukan shell kosong.

import { HomeClient } from "@/components/home-client"

export const revalidate = 300 // 5 menit

interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  categories: { name: string; slug: string } | null
}

interface EditorChoiceArticle {
  id: string
  title: string
  slug: string
  categories: { name: string }[] | null
}

async function fetchTrendingArticles(): Promise<Article[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.published&or=(is_editor_choice.is.null,is_editor_choice.eq.false)&select=id,title,slug,excerpt,featured_image_url,featured_image_alt,author,views,published_at,created_at,categories(name,slug)&order=created_at.desc&limit=12`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        next: { revalidate: 300 },
      }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

async function fetchEditorChoiceArticles(): Promise<EditorChoiceArticle[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.published&is_editor_choice=eq.true&select=id,title,slug,categories(name)&order=published_at.desc&limit=5`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        next: { revalidate: 300 },
      }
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export default async function Home() {
  // Kedua fetch berjalan paralel — tidak blocking satu sama lain
  const [initialTrending, initialEditorChoice] = await Promise.all([
    fetchTrendingArticles(),
    fetchEditorChoiceArticles(),
  ])

  return (
    <HomeClient
      initialTrending={initialTrending}
      initialEditorChoice={initialEditorChoice}
    />
  )
}
