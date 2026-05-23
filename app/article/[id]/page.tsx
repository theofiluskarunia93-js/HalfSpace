import type { Metadata } from "next"
import { ArticleDetail } from "@/components/article-detail"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

// ─── Dynamic metadata untuk SEO ──────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const res = await fetch(
      `${supabaseUrl}/rest/v1/articles?id=eq.${id}&select=title,excerpt,featured_image_url,featured_image_alt,published_at,categories(name)`,
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
    const data = rows?.[0]

    if (!data) {
      return { title: "Artikel Tidak Ditemukan | HalfSpace" }
    }

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
        canonical: `/article/${id}`,
      },
    }
  } catch {
    return { title: "HalfSpace" }
  }
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params
  return <ArticleDetail articleId={id} />
}
