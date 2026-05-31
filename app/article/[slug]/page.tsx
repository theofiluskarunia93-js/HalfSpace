import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ArticleDetail } from "@/components/article-detail"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

// ─── Fetch artikel by slug (dipakai di metadata & page) ──────────────────
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
      cache: "no-store",
    }
  )

  const rows = await res.json()
  return rows?.[0] ?? null
}

// ─── Dynamic metadata untuk SEO ──────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  try {
    const data = await fetchArticleBySlug(slug)

    if (!data) {
      return { title: "Artikel Tidak Ditemukan | HalfSpace" }
    }

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
    const title = `${data.title} | HalfSpace`
    const description = data.excerpt ?? "Baca artikel terbaru dari HalfSpace."
    const image = data.featured_image_url ?? undefined

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        publishedTime: data.published_at,
        authors: ["Redaksi HalfSpace"],
        section: (data.categories as any)?.name ?? "Umum",
        images: image
          ? [{ url: image, width: 1200, height: 630, alt: data.featured_image_alt ?? data.title }]
          : [],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: image ? [image] : [],
      },
      alternates: {
        canonical: `${BASE_URL}/article/${slug}`,
      },
    }
  } catch {
    return { title: "HalfSpace" }
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params

  // Resolve slug → id di server, lalu lempar ke client component
  const data = await fetchArticleBySlug(slug)
  if (!data) notFound()

  return <ArticleDetail articleId={data.id} />
}
