import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props) {
  const supabase = await createClient()
  const { data: article } = await supabase
    .from("articles")
    .select("title, excerpt, featured_image_url, meta_title, meta_description")
    .eq("id", params.id)
    .eq("status", "published")
    .single()

  if (!article) return { title: "Artikel Tidak Ditemukan" }

  return {
    title: article.meta_title || article.title,
    description: article.meta_description || article.excerpt || "",
    openGraph: {
      title: article.meta_title || article.title,
      description: article.meta_description || article.excerpt || "",
      images: article.featured_image_url ? [{ url: article.featured_image_url }] : [],
    },
  }
}

export default async function ArticlePage({ params }: Props) {
  const supabase = await createClient()

  const { data: article } = await supabase
    .from("articles")
    .select("*, categories(name, slug)")
    .eq("id", params.id)
    .eq("status", "published")
    .single()

  if (!article) notFound()

  // Increment views
  await supabase
    .from("articles")
    .update({ views: (article.views || 0) + 1 })
    .eq("id", params.id)

  return (
    <div className="min-h-screen bg-background">
      <NavbarStandalone />

      {/* Breadcrumb bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Beranda
          </Link>
          {article.categories && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                {article.categories.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Article */}
      <article className="mx-auto max-w-4xl px-4 py-10">
        {/* Featured image */}
        {article.featured_image_url && (
          <div className="mb-8 overflow-hidden rounded-xl">
            <img
              src={article.featured_image_url}
              alt={article.title}
              className="h-auto w-full object-cover"
            />
          </div>
        )}

        {/* Title */}
        <h1
          className="mb-4 text-3xl font-bold leading-tight text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-oswald)" }}
        >
          {article.title}
        </h1>

        {/* Meta */}
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {article.author && <span>{article.author}</span>}
          {article.author && <span>·</span>}
          <span>
            {new Date(article.published_at || article.created_at).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span>·</span>
          <span>{article.views || 0} views</span>
        </div>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="mb-8 border-l-4 border-primary pl-4 text-lg text-muted-foreground italic">
            {article.excerpt}
          </p>
        )}

        {/* Content */}
        <div
          className="prose prose-invert max-w-none prose-headings:font-bold prose-headings:text-foreground prose-p:text-foreground/90 prose-p:leading-relaxed prose-a:text-primary prose-strong:text-foreground prose-img:rounded-xl"
          dangerouslySetInnerHTML={{ __html: article.content || "" }}
        />
      </article>

      <FooterStandalone />
    </div>
  )
}
