import type { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://halfspace.id"

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
    url: `${BASE_URL}/author/redaksi-halfspace`,
    changeFrequency: "weekly",
    priority: 0.5,
  },
  {
    url: `${BASE_URL}/about-us`,
    changeFrequency: "monthly",
    priority: 0.4,
  },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Ambil semua artikel yang sudah published
  const { data: articles } = await supabase
    .from("articles")
    .select("id, published_at, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })

  const articleRoutes: MetadataRoute.Sitemap = (articles ?? []).map((article) => ({
    url: `${BASE_URL}/article/${article.id}`,
    lastModified: new Date(article.updated_at ?? article.published_at),
    changeFrequency: "weekly",
    priority: 0.9,
  }))

  // Ambil semua tag yang punya artikel published
  const { data: tags } = await supabase
    .from("tags")
    .select("slug")

  const tagRoutes: MetadataRoute.Sitemap = (tags ?? []).map((tag) => ({
    url: `${BASE_URL}/tag/${tag.slug}`,
    changeFrequency: "daily",
    priority: 0.6,
  }))

  return [...STATIC_ROUTES, ...articleRoutes, ...tagRoutes]
}
