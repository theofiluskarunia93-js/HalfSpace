// Server Component — fetch artikel di server, render konten awal (SSR),
// lalu hydrate ke ArticleDetail client component dengan initialData.
// Ini memastikan Google/crawler mendapat konten penuh, bukan halaman kosong.

import { ArticleDetail } from "@/components/article-detail"

interface Props {
  articleId: string
  slug: string
}

interface ArticleSSR {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  updated_at: string | null
  categories: { name: string; slug: string } | null
}

async function fetchArticleFull(id: string): Promise<ArticleSSR | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const res = await fetch(
    `${supabaseUrl}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&status=eq.published&select=id,title,slug,excerpt,content,featured_image_url,featured_image_alt,author,views,published_at,created_at,updated_at,categories(name,slug)`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 },
    }
  )

  const rows = await res.json()
  return rows?.[0] ?? null
}

export async function ArticleDetailWrapper({ articleId, slug }: Props) {
  // Fetch di server — data tersedia saat HTML dikirim ke browser
  const article = await fetchArticleFull(articleId)

  // Pass initialData ke client component agar langsung render tanpa loading state
  return <ArticleDetail articleId={articleId} initialData={article} />
}
