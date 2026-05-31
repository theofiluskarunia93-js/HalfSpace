"use client"

import React, { useEffect, useState } from "react"
import { Star } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface Article {
  id: string
  title: string
  slug: string
  categories: { name: string }[] | null
}

export function EditorChoice() {
  const [articles, setArticles] = useState<Article[]>([])
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function fetchEditorChoice() {
      const { data } = await supabase
        .from("articles")
        .select("id, title, slug, categories(name)")
        .eq("status", "published")
        .eq("is_editor_choice", true)
        .order("published_at", { ascending: false })
        .limit(5)
      if (data) setArticles(data as Article[])
    }
    fetchEditorChoice()
  }, [])

  if (articles.length === 0) return null

  return (
    <section id="editor-choice-section" className="bg-background py-10 border-t border-border/40">
      <div className="mx-auto max-w-7xl px-4">

        {/* Section header */}
        <div className="mb-5 flex items-center gap-3">
          <div
            className="flex items-center gap-2"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            <Star
              className="h-5 w-5 text-primary fill-primary"
              style={{ filter: "drop-shadow(0 0 6px oklch(0.87 0.29 142 / 0.7))" }}
            />
            <h2 className="text-2xl font-bold uppercase tracking-tight text-foreground">
              Editor&apos;s Choice
            </h2>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
        </div>

        {/* Article list */}
        <ul className="divide-y divide-border/50">
          {articles.map((article: Article, idx: number) => (
            <li key={article.id}>
              <button
                onClick={() => router.push(`/article/${article.slug}`)}
                className="group flex w-full items-start gap-4 py-4 text-left transition-colors hover:text-primary"
              >
                {/* Number badge */}
                <span
                  className={[
                    "flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    idx === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary",
                  ].join(" ")}
                >
                  {idx + 1}
                </span>

                {/* Title */}
                <span
                  className="flex-1 text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2 sm:text-lg"
                  style={{ fontFamily: "var(--font-oswald)", letterSpacing: "-0.01em" }}
                >
                  {article.title}
                </span>

                {/* Category badge */}
                {article.categories?.[0]?.name && (
                  <span className="flex-shrink-0 hidden sm:inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {article.categories[0].name}
                  </span>
                )}

                {/* Arrow indicator */}
                <svg
                  className="flex-shrink-0 h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </li>
          ))}
        </ul>

      </div>
    </section>
  )
}