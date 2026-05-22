"use client"

import { useState, useEffect } from "react"
import { Plus, FileText, Eye, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

interface DashboardViewProps {
  onCreateArticle: () => void
}

export function DashboardView({ onCreateArticle }: DashboardViewProps) {
  const [stats, setStats] = useState({ totalPosts: 0, totalViews: 0, published: 0, drafts: 0 })
  const [recentPosts, setRecentPosts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const [{ data: articles }, { data: recent }] = await Promise.all([
        supabase.from("articles").select("status, views"),
        supabase.from("articles").select("*, categories(name)").order("created_at", { ascending: false }).limit(5),
      ])

      if (articles) {
        const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0)
        const published = articles.filter((a) => a.status === "published").length
        setStats({
          totalPosts: articles.length,
          totalViews,
          published,
          drafts: articles.length - published,
        })
      }

      if (recent) setRecentPosts(recent)
      setIsLoading(false)
    }

    fetchData()
  }, [])

  const statCards = [
    { label: "Total Posts", value: stats.totalPosts.toString(), icon: FileText, change: `${stats.drafts} drafts` },
    { label: "Total Views", value: stats.totalViews.toLocaleString(), icon: Eye, change: "All time" },
    { label: "Published", value: stats.published.toString(), icon: TrendingUp, change: "Live articles" },
  ]

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
            Dashboard
          </h1>
          <p className="text-muted-foreground">Welcome back to HalfSpace CMS</p>
        </div>
        <Button onClick={onCreateArticle} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Create Article
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading dashboard...</div>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statCards.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-xs text-primary">{stat.change}</p>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">Recent Posts</h2>
            </div>
            <div className="divide-y divide-border">
              {recentPosts.map((post) => (
                <div key={post.id} className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-secondary/50">
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">{post.title}</h3>
                    <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {post.categories?.name || "-"}
                      </span>
                      <span>{post.views?.toLocaleString() || 0} views</span>
                      <span>{new Date(post.created_at).toLocaleDateString("id-ID")}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    View
                  </Button>
                </div>
              ))}
              {recentPosts.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">Belum ada artikel. Buat artikel pertamamu!</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}