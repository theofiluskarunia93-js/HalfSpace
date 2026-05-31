import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Tag } from "lucide-react"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import type { Metadata } from "next"

export const revalidate = 3600

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createClient()
  const { data: tag } = await supabase
    .from("tags")
    .select("name")
    .eq("slug", params.slug)
    .single()

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title = tag ? `#${tag.name} — Artikel | HalfSpace` : "Tag | HalfSpace"
  const description = tag
    ? `Kumpulan artikel bertag ${tag.name} di HalfSpace — berita olahraga terkini.`
    : "Jelajahi artikel berdasarkan tag di HalfSpace."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/tag/${params.slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/tag/${params.slug}`,
      siteName: "HalfSpace",
      images: [
        {
          url: `${BASE_URL}/og-default.jpg`,
          width: 1200,
          height: 630,
          alt: "HalfSpace",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/og-default.jpg`],
    },
  }
}

export default async function TagPage({ params }: Props) {
  const supabase = await createClient()

  const { data: tag } = await supabase
    .from("tags")
    .select("*")
    .eq("slug", params.slug)
    .single()

  if (!tag) notFound()

  const { data: articleTags } = await supabase
    .from("article_tags")
    .select("articles!inner(id, title, slug, excerpt, featured_image_url, author, views, status, published_at, created_at, categories(name, slug))")
    .eq("tag_id", tag.id)
    .eq("articles.status", "published")

  const articles = (articleTags || [])
    .map((at: any) => at.articles)
    .filter(Boolean)
    .sort((a: any, b: any) =>
      new Date(b.published_at || b.created_at).getTime() -
      new Date(a.published_at || a.created_at).getTime()
    )

  const { data: allTags } = await supabase
    .from("tags")
    .select("id, name, slug")
    .order("name")

  return (
    <div className="min-h-screen bg-background">
      <NavbarStandalone />

      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Link
            href="/"
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Beranda
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <Tag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1
                className="text-3xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-oswald)" }}
              >
                #{tag.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {articles.length} artikel ditemukan
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-4">
          {/* Articles Grid */}
          <div className="lg:col-span-3">
            {articles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center">
                <Tag className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">Belum ada artikel dengan tag ini.</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {articles.map((article: any) => {
                  const diff = Date.now() - new Date(article.published_at || article.created_at).getTime()
                  const minutes = Math.floor(diff / 60000)
                  const hours = Math.floor(diff / 3600000)
                  const days = Math.floor(diff / 86400000)
                  const timeAgo = minutes < 1 ? "Baru saja" : minutes < 60 ? `${minutes} menit yang lalu` : hours < 24 ? `${hours} jam yang lalu` : `${days} hari yang lalu`

                  return (
                  <Link key={article.id} href={`/article/${article.slug}`}>
                    <article className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
                      <div className="aspect-video overflow-hidden bg-muted">
                        {article.featured_image_url ? (
                          <img
                            src={article.featured_image_url}
                            alt={article.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <svg className="h-12 w-12 text-muted-foreground opacity-20" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{timeAgo}</p>
                        <h3
                          className="mb-2 line-clamp-3 font-bold leading-snug text-foreground transition-colors group-hover:text-primary text-lg sm:text-xl"
                          style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
                        >
                          {article.title}
                        </h3>
                        {article.excerpt && (
                          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{article.excerpt}</p>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {timeAgo}
                          </span>
                          <span className="text-xs font-semibold text-primary group-hover:underline">Selengkapnya →</span>
                        </div>
                      </div>
                    </article>
                  </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tag Cloud Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 rounded-xl border border-border bg-card p-5">
              <h2
                className="mb-4 text-lg font-bold text-foreground"
                style={{ fontFamily: "var(--font-oswald)" }}
              >
                Semua Tag
              </h2>
              <div className="flex flex-wrap gap-2">
                {(allTags || []).map((t) => (
                  <Link
                    key={t.id}
                    href={`/tag/${t.slug}`}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      t.slug === params.slug
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-primary/15 hover:text-primary"
                    }`}
                  >
                    #{t.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <FooterStandalone />
    </div>
  )
}
