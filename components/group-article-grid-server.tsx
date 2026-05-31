// Server Component — fetch data di server, tidak ada "use client"
import Link from "next/link"
import Image from "next/image"

const GROUP_SLUGS: Record<string, string[]> = {
  europe: ["champions-league", "premier-league", "la-liga", "bundesliga", "serie-a"],
  international: ["world-cup", "euro", "copa-america", "afcon"],
  asia: ["afc-cup", "aff-cup"],
}

interface Article {
  id: string
  title: string
  slug: string
  excerpt: string | null
  featured_image_url: string | null
  published_at: string
  created_at: string
  categories: { name: string; slug: string } | null
}

function timeAgoServer(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return "Baru saja"
  if (minutes < 60) return `${minutes} menit yang lalu`
  if (hours < 24) return `${hours} jam yang lalu`
  return `${days} hari yang lalu`
}

async function fetchGroupArticles(groupKey: string): Promise<Article[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Support group key (europe, asia, dll) maupun single category slug (liga1, transfer, dll)
  const slugs = GROUP_SLUGS[groupKey] ?? [groupKey]
  if (slugs.length === 0) return []

  try {
    // Fetch category IDs
    const catsRes = await fetch(
      `${supabaseUrl}/rest/v1/categories?slug=in.(${slugs.join(",")})&select=id`,
      {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        next: { revalidate: 3600 },
      }
    )
    if (!catsRes.ok) return []
    const cats: { id: string }[] = await catsRes.json()
    if (!cats.length) return []

    const catIds = cats.map((c) => c.id).join(",")

    const articlesRes = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.published&category_id=in.(${catIds})&select=id,title,slug,excerpt,featured_image_url,published_at,created_at,categories(name,slug)&order=published_at.desc&limit=9`,
      {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        next: { revalidate: 3600 },
      }
    )
    if (!articlesRes.ok) return []
    return articlesRes.json()
  } catch {
    return []
  }
}

interface Props {
  groupKey: string
  title: string
}

export async function GroupArticleGridServer({ groupKey, title }: Props) {
  const articles = await fetchGroupArticles(groupKey)

  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
        Belum ada artikel untuk {title}. Tambahkan artikel melalui CMS.
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <Link key={article.id} href={`/article/${article.slug}`}>
          <article className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">
            <div className="aspect-video overflow-hidden bg-muted relative">
              {article.featured_image_url ? (
                <Image
                  src={article.featured_image_url}
                  alt={article.title}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <svg className="h-12 w-12 opacity-30" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {timeAgoServer(article.published_at || article.created_at)}
              </p>
              <h3
                className="mb-2 font-bold leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-3 text-lg sm:text-xl"
                style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
              >
                {article.title}
              </h3>
              {article.excerpt && (
                <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2 sm:text-[15px]">
                  {article.excerpt}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {timeAgoServer(article.published_at || article.created_at)}
                </span>
                <span className="text-xs font-semibold text-primary group-hover:underline">
                  Selengkapnya →
                </span>
              </div>
            </div>
          </article>
        </Link>
      ))}
    </div>
  )
}
