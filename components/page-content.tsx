"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PublicPage } from "@/app/page"
import { createClient } from "@/lib/supabase/client"
import { trackArticleView } from "@/lib/supabase/tracking"
import { GroupArticleGrid } from "@/components/group-article-grid"

const COMP_TO_ROUTE: Record<string, string> = {
  "champions-league": "/europe/champions-league",
  "premier-league": "/europe/premier-league",
  "la-liga": "/europe/la-liga",
  "bundesliga": "/europe/bundesliga",
  "serie-a": "/europe/serie-a",
  "world-cup": "/international/world-cup",
  "euro": "/international/euro",
  "copa-america": "/international/copa-america",
  "afcon": "/international/afcon",
  "afc-cup": "/asia/afc-cup",
  "aff-cup": "/asia/aff-cup",
}

interface PageContentProps {
  currentPage: PublicPage
  onPageChange: (page: PublicPage) => void
}

const europeLeagues = [
  { id: "champions-league", label: "Champions League", description: "Europe's premier club competition" },
  { id: "premier-league", label: "Premier League", description: "England's top-flight football" },
  { id: "la-liga", label: "La Liga", description: "Spanish football at its finest" },
  { id: "bundesliga", label: "Bundesliga", description: "German football excellence" },
  { id: "serie-a", label: "Serie A", description: "Italian football drama" },
] as const

const internationalComps = [
  { id: "world-cup", label: "World Cup", description: "The biggest sporting event on the planet" },
  { id: "euro", label: "Euro", description: "The best of European national teams" },
  { id: "copa-america", label: "Copa America", description: "South American football passion" },
  { id: "afcon", label: "AFCON", description: "Africa's premier national team competition" },
] as const

const asiaComps = [
  { id: "afc-cup", label: "AFC Cup", description: "Asian club football competition" },
  { id: "aff-cup", label: "AFF Cup", description: "Southeast Asian championship" },
] as const

const pageData: Record<PublicPage, { title: string; description: string; categorySlug?: string }> = {
  home: { title: "Home", description: "" },
  trending: { title: "Trending", description: "The hottest stories in sports right now." },
  standings: { title: "League Standings", description: "Complete standings from leagues around the world." },
  europe: { title: "Europe", description: "Comprehensive coverage of European football." },
  international: { title: "International", description: "Coverage of major international tournaments." },
  asia: { title: "Asia", description: "Latest news from Asian football." },
  liga1: { title: "Liga 1 Indonesia", description: "Indonesia's top-tier professional football league.", categorySlug: "liga1" },
  "champions-league": { title: "UEFA Champions League", description: "Europe's premier club competition.", categorySlug: "champions-league" },
  "premier-league": { title: "Premier League", description: "The world's most watched football league.", categorySlug: "premier-league" },
  "la-liga": { title: "La Liga", description: "Spanish football at its finest.", categorySlug: "la-liga" },
  bundesliga: { title: "Bundesliga", description: "German football excellence.", categorySlug: "bundesliga" },
  "serie-a": { title: "Serie A", description: "Italian football drama.", categorySlug: "serie-a" },
  "world-cup": { title: "FIFA World Cup", description: "The biggest sporting event.", categorySlug: "world-cup" },
  euro: { title: "UEFA European Championship", description: "Best of European national team football.", categorySlug: "euro" },
  "copa-america": { title: "Copa America", description: "South American football.", categorySlug: "copa-america" },
  afcon: { title: "Africa Cup of Nations", description: "Africa's premier competition.", categorySlug: "afcon" },
  "afc-cup": { title: "AFC Cup", description: "Asian club football.", categorySlug: "afc-cup" },
  "aff-cup": { title: "AFF Cup", description: "Southeast Asian championship.", categorySlug: "aff-cup" },
  transfer: { title: "Transfer News", description: "Latest transfer rumors and confirmed deals.", categorySlug: "transfer" },
  about: { title: "About Us", description: "HalfSpace is your ultimate sports destination." },
  contact: { title: "Contact Us", description: "Get in touch with the HalfSpace team." },
}

function ArticleCard({ article, onView }: { article: any; onView: (id: string) => void }) {
  return (
    <article
      onClick={() => onView(article.id)}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="aspect-video bg-muted overflow-hidden">
        {article.featured_image_url ? (
          <img src={article.featured_image_url} alt={article.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <svg className="h-12 w-12 opacity-30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </div>
        )}
      </div>
      <div className="p-4">
        <span className="mb-2 inline-block rounded bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
          {article.categories?.name || "General"}
        </span>
        <h3 className="mb-2 font-semibold text-foreground transition-colors group-hover:text-primary line-clamp-2">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-2">{article.excerpt}</p>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{article.author}</span>
          <span>•</span>
          <span>{article.views || 0} views</span>
          <span>•</span>
          <span>{new Date(article.published_at || article.created_at).toLocaleDateString("id-ID")}</span>
        </div>
      </div>
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card animate-pulse">
      <div className="aspect-video bg-muted" />
      <div className="p-4 space-y-2">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
      </div>
    </div>
  )
}

function ArticleGrid({ categorySlug, title }: { categorySlug?: string; title: string }) {
  const [articles, setArticles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchArticles() {
      let query = supabase
        .from("articles")
        .select("*, categories(name, slug)")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(6)

      if (categorySlug) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", categorySlug)
          .single()
        if (cat) query = query.eq("category_id", cat.id)
      }

      const { data } = await query
      setArticles(data || [])
      setIsLoading(false)
    }
    fetchArticles()
  }, [categorySlug])

  const handleView = async (id: string) => {
    await trackArticleView(id)
    router.push(`/article/${id}`)
  }

  if (isLoading) return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[1,2,3].map(i => <SkeletonCard key={i} />)}
    </div>
  )

  if (articles.length === 0) return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
      Belum ada artikel untuk {title}. Tambahkan artikel melalui CMS.
    </div>
  )

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {articles.map(article => (
        <ArticleCard key={article.id} article={article} onView={handleView} />
      ))}
    </div>
  )
}

export function PageContent({ currentPage, onPageChange }: PageContentProps) {
  const router = useRouter()
  const data = pageData[currentPage]

  if (currentPage === "europe" || currentPage === "international" || currentPage === "asia") {
    const competitions = currentPage === "europe"
      ? europeLeagues
      : currentPage === "international"
        ? internationalComps
        : asiaComps

    return (
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-4 text-4xl font-bold uppercase tracking-tight text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-oswald)" }}>
            {data.title}
          </h1>
          <div className="h-1 w-16 bg-primary" />
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{data.description}</p>
        </div>

        {/* Latest News — DI ATAS */}
        <div className="mb-12">
          <h2 className="mb-6 text-2xl font-bold uppercase tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-oswald)" }}>
            Latest {data.title} News
          </h2>
          <GroupArticleGrid groupKey={currentPage} title={data.title} />
        </div>

        {/* Competition Cards — DI BAWAH */}
        <div>
          <h2 className="mb-6 text-2xl font-bold uppercase tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-oswald)" }}>
            Competitions
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {competitions.map((comp) => (
              <button key={comp.id} onClick={() => router.push(COMP_TO_ROUTE[comp.id])}
                className="group overflow-hidden rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:bg-card/80">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                  <svg className="h-8 w-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                </div>
                <h3 className="mb-2 text-xl font-bold text-foreground transition-colors group-hover:text-primary">
                  {comp.label}
                </h3>
                <p className="text-sm text-muted-foreground">{comp.description}</p>
                <div className="mt-4 flex items-center text-sm font-medium text-primary">
                  View Coverage
                  <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
      <div className="mb-8">
        <h1 className="mb-4 text-4xl font-bold uppercase tracking-tight text-foreground md:text-5xl"
          style={{ fontFamily: "var(--font-oswald)" }}>
          {data.title}
        </h1>
        <div className="h-1 w-16 bg-primary" />
      </div>
      <p className="mb-8 max-w-2xl text-lg text-muted-foreground">{data.description}</p>
      <ArticleGrid categorySlug={data.categorySlug} title={data.title} />
    </main>
  )
}
