import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/client"
import { ArticleDetail } from "@/components/article-detail"

interface Props {
  params: { id: string }
}

// ─── Dynamic metadata untuk SEO ──────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase
    .from("articles")
    .select("title, excerpt, featured_image_url, featured_image_alt, published_at, categories(name)")
    .eq("id", params.id)
    .single()

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
        ? [
            {
              url: image,
              width: 1200,
              height: 630,
              alt: data.featured_image_alt ?? data.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
    },
    alternates: {
      canonical: `/article/${params.id}`,
    },
  }
}

export default function ArticlePage({ params }: Props) {
  return <ArticleDetail articleId={params.id} />
}
