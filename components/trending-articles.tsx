"use client"

import { useRef, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export function TrendingArticles() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [articles, setArticles] = useState<any[]>([])
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function fetchTrending() {
      const { data } = await supabase
        .from("articles")
        .select("*, categories(name)")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(10)
      if (data) setArticles(data)
    }
    fetchTrending()
  }, [])

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -400 : 400,
        behavior: "smooth",
      })
    }
  }

  if (articles.length === 0) return null

  return (
    <section id="trending-section" className="bg-background py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <h2
            className="text-2xl font-bold uppercase tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            Trending Now
          </h2>
          <div className="hidden gap-2 md:flex">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border hover:border-primary hover:text-primary"
              onClick={() => scroll("left")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border hover:border-primary hover:text-primary"
              onClick={() => scroll("right")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="hide-scrollbar flex gap-6 overflow-x-auto pb-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {articles.map((article) => (
            <article
              key={article.id}
              onClick={() => router.push(`/article/${article.id}`)}
              className="group min-w-[350px] flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 md:min-w-[400px]"
            >
              <div className="relative h-48 overflow-hidden bg-muted">
                {article.featured_image_url ? (
                  <img
                    src={article.featured_image_url}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <svg className="h-16 w-16 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                    </svg>
                  </div>
                )}
                <div className="absolute left-4 top-4">
                  <span className="rounded bg-primary px-2 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
                    {article.categories?.name || "General"}
                  </span>
                </div>
              </div>
              <div className="p-5">
                <h3 className="mb-2 line-clamp-2 text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                  {article.title}
                </h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {article.excerpt}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
