// Server Component — fetch artikel di server, render konten awal (SSR),
// lalu hydrate ke ArticleDetail client component dengan initialData.
// Ini memastikan Google/crawler mendapat konten penuh, bukan halaman kosong.
//
// JSON-LD (NewsArticle + BreadcrumbList) dirender di sini (server) agar
// tersedia dalam HTML awal — bukan setelah JS client berjalan.

import { ArticleDetail } from "@/components/article-detail"
import { createClient } from "@/lib/supabase/server"
import type { RelatedArticle } from "@/components/article/RelatedArticles"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspacesport.com"

interface Props {
  articleId: string
  slug: string
}

interface ArticleSSR {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content_type: string | null
  content: string | null
  featured_image_url: string | null
  featured_image_alt: string | null
  featured_image_caption: string | null
  author: string
  views: number
  published_at: string
  created_at: string
  updated_at: string | null
  categories: { name: string; slug: string } | null
  // Sudah di-fetch di query (article_tags(tags(name,slug))) tapi sebelumnya
  // belum dideklarasikan di sini — ditambahkan untuk fetchRelatedArticles().
  // Tangani objek tunggal ATAU array, sesuai inferensi nested relation Supabase.
  article_tags?: { tags: { name: string; slug: string } | { name: string; slug: string }[] | null }[] | null
}

async function fetchArticleFull(id: string): Promise<ArticleSSR | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const res = await fetch(
    `${supabaseUrl}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&status=eq.published&select=id,title,slug,excerpt,content_type,content,featured_image_url,featured_image_alt,featured_image_caption,author,views,published_at,created_at,updated_at,categories(name,slug),article_tags(tags(name,slug))`,
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

// ─── Artikel Terkait — 3 artikel, prioritas TAG sama, fallback KATEGORI sama ─
// Berbeda dari Internal Link Building inline (lib/internal-linking.ts) yang
// hanya muncul kalau ada kecocokan KATA di body — ini SELALU tampil sebagai
// jaring pengaman, dihitung dari relasi tag/kategori, bukan kecocokan teks.
function extractTagSlugs(article: ArticleSSR): string[] {
  const slugs: string[] = []
  for (const at of article.article_tags ?? []) {
    const t = at?.tags
    if (!t) continue
    if (Array.isArray(t)) {
      for (const tt of t) if (tt?.slug) slugs.push(tt.slug)
    } else if (t.slug) {
      slugs.push(t.slug)
    }
  }
  return slugs
}

async function fetchRelatedArticles(article: ArticleSSR): Promise<RelatedArticle[]> {
  const supabase = await createClient()
  const seen = new Map<string, RelatedArticle>()

  // 1. Artikel lain yang berbagi minimal satu TAG yang sama.
  const tagSlugs = extractTagSlugs(article)
  if (tagSlugs.length > 0) {
    const { data } = await supabase
      .from("articles")
      .select(
        "id, title, slug, excerpt, featured_image_url, published_at, categories(name, slug), article_tags!inner(tags!inner(slug))"
      )
      .eq("status", "published")
      .neq("id", article.id)
      .in("article_tags.tags.slug", tagSlugs)
      .order("published_at", { ascending: false })
      .limit(10)

    for (const row of (data ?? []) as any[]) {
      if (!seen.has(row.id)) seen.set(row.id, row as RelatedArticle)
    }
  }

  // 2. Kalau dari tag belum cukup 3, lengkapi dari KATEGORI yang sama.
  if (seen.size < 3 && article.categories?.slug) {
    const excludeIds = [article.id, ...seen.keys()]
    const { data } = await supabase
      .from("articles")
      .select("id, title, slug, excerpt, featured_image_url, published_at, categories!inner(name, slug)")
      .eq("status", "published")
      .eq("categories.slug", article.categories.slug)
      .not("id", "in", `(${excludeIds.join(",")})`)
      .order("published_at", { ascending: false })
      .limit(10)

    for (const row of (data ?? []) as any[]) {
      if (!seen.has(row.id)) seen.set(row.id, row as RelatedArticle)
    }
  }

  return [...seen.values()].slice(0, 3)
}

// ─── JSON-LD dirender server-side ───────────────────────────────────────────

function ArticleJsonLd({ article }: { article: ArticleSSR }) {
  const articleUrl = `${BASE_URL}/article/${article.slug}`

  const newsArticleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt ?? "",
    image: article.featured_image_url
      ? [{ "@type": "ImageObject", url: article.featured_image_url, width: 1200, height: 630 }]
      : [],
    datePublished: article.published_at || article.created_at,
    dateModified: article.updated_at || article.created_at,
    author: {
      "@type": "Organization",
      name: "Redaksi HalfSpace",
      url: `${BASE_URL}/author/redaksi-halfspace`,
    },
    publisher: {
      "@type": "Organization",
      name: "HalfSpace",
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/logo.png`,
        width: 200,
        height: 60,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
    articleSection: article.categories?.name ?? "Umum",
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE_URL}/` },
      ...(article.categories
        ? [{ "@type": "ListItem", position: 2, name: article.categories.name, item: `${BASE_URL}/${article.categories.slug}` }]
        : []),
      { "@type": "ListItem", position: article.categories ? 3 : 2, name: article.title, item: articleUrl },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  )
}

export async function ArticleDetailWrapper({ articleId, slug }: Props) {
  // Fetch di server — data tersedia saat HTML dikirim ke browser
  const article = await fetchArticleFull(articleId)
  const relatedArticles = article ? await fetchRelatedArticles(article) : []

  return (
    <>
      {/* JSON-LD dirender server-side — tersedia di HTML awal untuk Googlebot */}
      {article && <ArticleJsonLd article={article} />}
      {/* Client component menerima initialData agar langsung render tanpa loading */}
      <ArticleDetail articleId={articleId} initialData={article} relatedArticles={relatedArticles} />
    </>
  )
}
