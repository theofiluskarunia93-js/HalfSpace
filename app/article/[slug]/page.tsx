import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ArticleDetailWrapper } from "@/components/article-detail-wrapper"

// ISR: re-generate halaman ini maksimal sekali per jam.
// 10.000 pengunjung artikel yang sama = 1 query ke Supabase, bukan 10.000.
export const revalidate = 3600

// Artikel di luar daftar ini tetap bisa diakses (on-demand),
// tapi tidak akan diblokir — dynamicParams default true.
export async function generateStaticParams() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.published&select=slug&order=published_at.desc&limit=100`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    )
    if (!res.ok) return []
    const articles: { slug: string }[] = await res.json()
    return articles.map((a) => ({ slug: a.slug }))
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ slug: string }>
}

async function fetchArticleBySlug(slug: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const res = await fetch(
    `${supabaseUrl}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&select=id,title,slug,excerpt,featured_image_url,featured_image_alt,published_at,categories(name)`,
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  try {
    const data = await fetchArticleBySlug(slug)
    if (!data) return { title: "Artikel Tidak Ditemukan | HalfSpace" }

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
    const title = `${data.title} | HalfSpace`
    const description = data.excerpt ?? "Baca artikel terbaru dari HalfSpace."
    const image = data.featured_image_url ?? undefined

    return {
      title,
      description,
      alternates: {
        canonical: `${BASE_URL}/article/${slug}`,
      },
      openGraph: {
        title,
        description,
        type: "article",
        publishedTime: data.published_at,
        authors: ["Redaksi HalfSpace"],
        section: (data.categories as any)?.name ?? "Umum",
        images: image
          ? [{ url: image, width: 1200, height: 630, alt: data.featured_image_alt ?? data.title }]
          : [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630, alt: "HalfSpace" }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: image ? [image] : [`${BASE_URL}/og-default.jpg`],
      },
    }
  } catch {
    return { title: "HalfSpace" }
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const data = await fetchArticleBySlug(slug)
  if (!data) notFound()

  return <ArticleDetailWrapper articleId={data.id} slug={slug} />
}
