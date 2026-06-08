import type { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"

// Regenerate sitemap setiap 10 menit agar artikel baru langsung masuk
// tanpa perlu deploy ulang
export const revalidate = 600

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://halfspacesport.com"

// Halaman statis yang selalu ada
const STATIC_ROUTES: MetadataRoute.Sitemap = [
  {
    url: BASE_URL,
    changeFrequency: "hourly",
    priority: 1.0,
  },
  {
    url: `${BASE_URL}/europe`,
    changeFrequency: "daily",
    priority: 0.8,
  },
  {
    url: `${BASE_URL}/europe/champions-league`,
    changeFrequency: "daily",
    priority: 0.8,
  },
  {
    url: `${BASE_URL}/europe/premier-league`,
    changeFrequency: "daily",
    priority: 0.8,
  },
  {
    url: `${BASE_URL}/europe/la-liga`,
    changeFrequency: "daily",
    priority: 0.8,
  },
  {
    url: `${BASE_URL}/europe/bundesliga`,
    changeFrequency: "daily",
    priority: 0.8,
  },
  {
    url: `${BASE_URL}/europe/serie-a`,
    changeFrequency: "daily",
    priority: 0.8,
  },
  {
    url: `${BASE_URL}/international`,
    changeFrequency: "daily",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/international/world-cup`,
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/international/euro`,
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/international/copa-america`,
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/international/afcon`,
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/asia`,
    changeFrequency: "daily",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/asia/afc-cup`,
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/asia/aff-cup`,
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/liga1`,
    changeFrequency: "daily",
    priority: 0.8,
  },
  {
    url: `${BASE_URL}/transfer`,
    changeFrequency: "daily",
    priority: 0.7,
  },
  {
    url: `${BASE_URL}/sejarah`,
    changeFrequency: "weekly",
    priority: 0.6,
  },
  {
    url: `${BASE_URL}/author/redaksi-halfspace`,
    changeFrequency: "weekly",
    priority: 0.5,
  },
  {
    url: `${BASE_URL}/about-us`,
    changeFrequency: "monthly",
    priority: 0.4,
  },
  {
    url: `${BASE_URL}/contact-us`,
    changeFrequency: "monthly",
    priority: 0.4,
  },
  {
    url: `${BASE_URL}/privacy-policy`,
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    url: `${BASE_URL}/search`,
    changeFrequency: "monthly",
    priority: 0.3,
  },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // ── Artikel ──────────────────────────────────────────────────────────────
  // Gunakan published_at sebagai lastModified utama.
  // updated_at hanya dipakai jika lebih baru dari published_at,
  // agar artikel yang baru publish langsung punya lastModified yang akurat.
  const { data: articles } = await supabase
    .from("articles")
    .select("slug, published_at, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })

  const articleRoutes: MetadataRoute.Sitemap = (articles ?? []).map((article) => {
    const published = new Date(article.published_at)
    const updated = article.updated_at ? new Date(article.updated_at) : null
    // Pakai tanggal yang paling baru di antara keduanya
    const lastModified = updated && updated > published ? updated : published

    return {
      url: `${BASE_URL}/article/${article.slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    }
  })

  // ── Tag ───────────────────────────────────────────────────────────────────
  // Ambil tag yang punya minimal 1 artikel published,
  // lastModified diambil dari artikel terbaru di tag tersebut
  const { data: tagData } = await supabase
    .from("article_tags")
    .select("tags(slug), articles!inner(published_at, updated_at, status)")
    .eq("articles.status", "published")

  // Kelompokkan per tag: ambil tanggal terbaru dari artikel di tag tsb
  const tagMap = new Map<string, Date>()
  for (const row of tagData ?? []) {
    const slug = (row.tags as any)?.slug
    const article = row.articles as any
    if (!slug) continue
    const published = new Date(article.published_at)
    const updated = article.updated_at ? new Date(article.updated_at) : null
    const date = updated && updated > published ? updated : published
    const existing = tagMap.get(slug)
    if (!existing || date > existing) tagMap.set(slug, date)
  }

  const tagRoutes: MetadataRoute.Sitemap = Array.from(tagMap.entries()).map(
    ([slug, lastDate]) => ({
      url: `${BASE_URL}/tag/${slug}`,
      lastModified: lastDate,
      changeFrequency: "daily",
      priority: 0.6,
    })
  )

  return [...STATIC_ROUTES, ...articleRoutes, ...tagRoutes]
}
