// components/article/RelatedArticles.tsx
//
// "Artikel Terkait" — pelengkap dari Internal Link Building inline (lihat
// lib/internal-linking.ts). Internal link inline hanya muncul kalau ADA
// kecocokan kata di body artikel; komponen ini SELALU tampil (kalau ada
// kandidat) sebagai jaring pengaman di akhir artikel, terlepas dari isi teks.
//
// Data sudah di-resolve di server (article-detail-wrapper.tsx) — komponen ini
// murni presentasional, tidak fetch apa pun sendiri.

import Image from "next/image"
import Link from "next/link"

export interface RelatedArticle {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featured_image_url: string | null
  published_at: string | null
  categories: { name: string; slug: string } | null
}

interface RelatedArticlesProps {
  articles: RelatedArticle[]
}

export function RelatedArticles({ articles }: RelatedArticlesProps) {
  if (!articles || articles.length === 0) return null

  return (
    <section className="mt-10 border-t border-border pt-8">
      <h2
        className="mb-4 text-xl font-bold uppercase tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-oswald)" }}
      >
        Artikel Terkait
      </h2>

      <div className="grid gap-4 sm:grid-cols-3">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/article/${article.slug}`}
            className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
          >
            <div className="relative h-36 w-full overflow-hidden bg-muted">
              {article.featured_image_url ? (
                <Image
                  src={article.featured_image_url}
                  alt={article.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <svg className="h-10 w-10 opacity-30" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                  </svg>
                </div>
              )}
              {article.categories?.name && (
                <span className="absolute left-2 top-2 rounded bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  {article.categories.name}
                </span>
              )}
            </div>
            <div className="p-3">
              <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
                {article.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
