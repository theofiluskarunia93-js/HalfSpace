"use client"

import { useState, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from "recharts"
import { createClient } from "@/lib/supabase/client"

const COLORS = ["oklch(0.87 0.29 142)", "oklch(0.7 0.2 142)", "oklch(0.5 0.15 142)", "oklch(0.4 0.1 142)", "oklch(0.3 0.05 142)"]
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const tooltipStyle = {
  contentStyle: {
    backgroundColor: "oklch(0.12 0 0)",
    border: "1px solid oklch(0.25 0 0)",
    borderRadius: "8px",
    color: "oklch(0.98 0 0)",
  },
}

export function AnalyticsView() {
  const [viewsData, setViewsData] = useState(DAYS.map(d => ({ name: d, views: 0 })))
  const [engagementData, setEngagementData] = useState([
    { name: "Week 1", engagement: 0 },
    { name: "Week 2", engagement: 0 },
    { name: "Week 3", engagement: 0 },
    { name: "Week 4", engagement: 0 },
  ])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [summary, setSummary] = useState({
    totalViews: 0,
    publishedArticles: 0,
    totalCategories: 0,
    avgViews: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchAll() {
      const [
        { data: articles },
        { data: pageViews },
        { data: categories },
      ] = await Promise.all([
        supabase.from("articles").select("views, status, category_id"),
        supabase.from("page_views").select("day_of_week, week_number"),
        supabase.from("articles").select("categories(name)"),
      ])

      // Summary stats
      if (articles) {
        const published = articles.filter(a => a.status === "published")
        const totalViews = articles.reduce((sum, a) => sum + (a.views || 0), 0)
        setSummary({
          totalViews,
          publishedArticles: published.length,
          totalCategories: new Set(articles.map(a => a.category_id).filter(Boolean)).size,
          avgViews: published.length > 0 ? Math.round(totalViews / published.length) : 0,
        })
      }

      // Daily views dari page_views
      if (pageViews) {
        const countPerDay: Record<string, number> = {}
        pageViews.forEach(v => {
          if (v.day_of_week) countPerDay[v.day_of_week] = (countPerDay[v.day_of_week] || 0) + 1
        })
        setViewsData(DAYS.map(day => ({ name: day, views: countPerDay[day] || 0 })))

        // Weekly engagement — views per minggu sebagai persentase dari total
        const countPerWeek: Record<number, number> = {}
        pageViews.forEach(v => {
          if (v.week_number) countPerWeek[v.week_number] = (countPerWeek[v.week_number] || 0) + 1
        })
        const total = pageViews.length || 1
        setEngagementData([1, 2, 3, 4].map(w => ({
          name: `Week ${w}`,
          engagement: Math.round(((countPerWeek[w] || 0) / total) * 100),
        })))
      }

      // Category distribution
      if (categories) {
        const countMap: Record<string, number> = {}
        categories.forEach((a: any) => {
          const name = a.categories?.name || "Other"
          countMap[name] = (countMap[name] || 0) + 1
        })
        const total = Object.values(countMap).reduce((a, b) => a + b, 0) || 1
        setCategoryData(
          Object.entries(countMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, value]) => ({
              name,
              value: Math.round((value / total) * 100),
            }))
        )
      }

      setIsLoading(false)
    }

    fetchAll()
  }, [])

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
          Analytics
        </h1>
        <p className="text-muted-foreground">Track your content performance and reader engagement</p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading analytics...</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily Views */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-6 text-lg font-semibold text-foreground">Daily Views</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={viewsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0 0)" />
                  <XAxis dataKey="name" stroke="oklch(0.6 0 0)" fontSize={12} />
                  <YAxis stroke="oklch(0.6 0 0)" fontSize={12} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="views" fill="oklch(0.87 0.29 142)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {viewsData.every(d => d.views === 0) && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Belum ada views. Data akan muncul saat pengunjung membaca artikel.
              </p>
            )}
          </div>

          {/* Weekly Engagement */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-6 text-lg font-semibold text-foreground">Weekly Engagement Rate</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0 0)" />
                  <XAxis dataKey="name" stroke="oklch(0.6 0 0)" fontSize={12} />
                  <YAxis stroke="oklch(0.6 0 0)" fontSize={12} unit="%" />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "Engagement"]} />
                  <Line type="monotone" dataKey="engagement" stroke="oklch(0.87 0.29 142)"
                    strokeWidth={2} dot={{ fill: "oklch(0.87 0.29 142)", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Pie */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-6 text-lg font-semibold text-foreground">Content by Category</h2>
            {categoryData.length > 0 ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60}
                        outerRadius={80} paddingAngle={5} dataKey="value">
                        {categoryData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "Share"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-4">
                  {categoryData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-xs text-muted-foreground">{item.name} ({item.value}%)</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                Belum ada artikel. Buat artikel untuk melihat distribusi kategori.
              </div>
            )}
          </div>

          {/* Performance Summary */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-6 text-lg font-semibold text-foreground">Performance Summary</h2>
            <div className="space-y-4">
              {[
                { label: "Total Page Views", value: summary.totalViews.toLocaleString() },
                { label: "Published Articles", value: summary.publishedArticles.toLocaleString() },
                { label: "Active Categories", value: summary.totalCategories.toLocaleString() },
                { label: "Avg Views / Article", value: summary.avgViews.toLocaleString() },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-xl font-bold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}