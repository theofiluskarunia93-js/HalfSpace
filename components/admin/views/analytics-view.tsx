"use client"

import { useState, useEffect } from "react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts"
import { createClient } from "@/lib/supabase/client"
import { TrendingUp, Eye, FileText, Tag, LayoutGrid, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react"

// ─── Constants ──────────────────────────────────────────────────────────────
const GREEN = [
  "oklch(0.87 0.29 142)",
  "oklch(0.72 0.22 142)",
  "oklch(0.57 0.17 142)",
  "oklch(0.44 0.12 142)",
  "oklch(0.32 0.07 142)",
]

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "oklch(0.12 0 0)",
    border: "1px solid oklch(0.25 0 0)",
    borderRadius: "8px",
    color: "oklch(0.98 0 0)",
    fontSize: "12px",
  },
}

const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// ─── Types ───────────────────────────────────────────────────────────────────
interface PopularArticle {
  id: string
  title: string
  views: number
  category: string
  published_at: string
}

interface Summary {
  totalViews: number
  publishedArticles: number
  totalCategories: number
  avgViews: number
  totalTags: number
  viewsThisWeek: number
  viewsLastWeek: number
}

interface TrendPoint {
  label: string
  views: number
}

interface CategoryStat {
  name: string
  articles: number
  views: number
  share: number
}

interface TagStat {
  name: string
  articles: number
  views: number
}

// ─── Helper Components ───────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  trend?: number
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">{label}</span>
        <div className="rounded-lg bg-secondary/60 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <div>
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? "text-green-400" : "text-red-400"}`}>
          {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          <span>{Math.abs(trend)}% vs minggu lalu</span>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

type TabKey = "daily" | "weekly" | "monthly"

// ─── Main Component ───────────────────────────────────────────────────────────
export function AnalyticsView() {
  const [tab, setTab] = useState<TabKey>("daily")
  const [summary, setSummary] = useState<Summary>({
    totalViews: 0, publishedArticles: 0, totalCategories: 0,
    avgViews: 0, totalTags: 0, viewsThisWeek: 0, viewsLastWeek: 0,
  })
  const [popularArticles, setPopularArticles] = useState<PopularArticle[]>([])
  const [dailyTrend, setDailyTrend] = useState<TrendPoint[]>([])
  const [weeklyTrend, setWeeklyTrend] = useState<TrendPoint[]>([])
  const [monthlyTrend, setMonthlyTrend] = useState<TrendPoint[]>([])
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([])
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function fetchAll() {
      try {
        const [
          { data: articles },
          { data: pageViews },
          { data: tagRows },
        ] = await Promise.all([
          supabase
            .from("articles")
            .select("id, title, views, status, published_at, category_id, categories(name, slug), article_tags(tags(name, slug))")
            .order("views", { ascending: false }),
          supabase
            .from("page_views")
            .select("article_id, day_of_week, week_number, created_at"),
          supabase
            .from("article_tags")
            .select("article_id, tags(name, slug)"),
        ])

        // ── Summary ────────────────────────────────────────────────────────
        if (articles) {
          const published = articles.filter((a: any) => a.status === "published")
          const totalViews = articles.reduce((s: number, a: any) => s + (a.views || 0), 0)

          const now = new Date()
          const weekAgo = new Date(now.getTime() - 7 * 86400000)
          const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000)

          const viewsThisWeek = (pageViews ?? []).filter((v: any) => {
            if (!v.created_at) return false
            const d = new Date(v.created_at)
            return d >= weekAgo && d <= now
          }).length

          const viewsLastWeek = (pageViews ?? []).filter((v: any) => {
            if (!v.created_at) return false
            const d = new Date(v.created_at)
            return d >= twoWeeksAgo && d < weekAgo
          }).length

          const uniqueCategories = new Set(articles.map((a: any) => a.category_id).filter(Boolean)).size
          const uniqueTags = new Set(
            (tagRows ?? []).map((r: any) => r.tags?.name).filter(Boolean)
          ).size

          setSummary({
            totalViews,
            publishedArticles: published.length,
            totalCategories: uniqueCategories,
            avgViews: published.length > 0 ? Math.round(totalViews / published.length) : 0,
            totalTags: uniqueTags,
            viewsThisWeek,
            viewsLastWeek,
          })

          // ── Top 7 artikel terpopuler ─────────────────────────────────────
          const top7 = published
            .sort((a: any, b: any) => (b.views || 0) - (a.views || 0))
            .slice(0, 7)
            .map((a: any) => ({
              id: a.id,
              title: a.title,
              views: a.views || 0,
              category: (a.categories as any)?.name ?? "—",
              published_at: a.published_at,
            }))
          setPopularArticles(top7)

          // ── Category stats ───────────────────────────────────────────────
          const catMap: Record<string, { articles: number; views: number }> = {}
          articles.forEach((a: any) => {
            const name = (a.categories as any)?.name ?? "Lainnya"
            if (!catMap[name]) catMap[name] = { articles: 0, views: 0 }
            catMap[name].articles += 1
            catMap[name].views += a.views || 0
          })
          const totalArticles = articles.length || 1
          const catStats: CategoryStat[] = Object.entries(catMap)
            .sort((x, y) => y[1].views - x[1].views)
            .slice(0, 5)
            .map(([name, v]) => ({
              name,
              articles: v.articles,
              views: v.views,
              share: Math.round((v.articles / totalArticles) * 100),
            }))
          setCategoryStats(catStats)

          // ── Tag stats ────────────────────────────────────────────────────
          if (tagRows && articles) {
            const articleViewMap: Record<string, number> = {}
            articles.forEach((a: any) => {
              articleViewMap[a.id] = a.views || 0
            })
            const tagMap: Record<string, { articles: number; views: number }> = {}
            tagRows.forEach((r: any) => {
              const name = r.tags?.name
              if (!name) return
              if (!tagMap[name]) tagMap[name] = { articles: 0, views: 0 }
              tagMap[name].articles += 1
              tagMap[name].views += articleViewMap[r.article_id] || 0
            })
            const tStats: TagStat[] = Object.entries(tagMap)
              .sort((x, y) => y[1].views - x[1].views)
              .slice(0, 8)
              .map(([name, v]) => ({ name, articles: v.articles, views: v.views }))
            setTagStats(tStats)
          }
        }

        // ── Trend data dari page_views ─────────────────────────────────────
        if (pageViews) {
          // Daily — count per day_of_week (current week proxy)
          const dayCount: Record<string, number> = {}
          pageViews.forEach((v: any) => {
            if (v.day_of_week) dayCount[v.day_of_week] = (dayCount[v.day_of_week] || 0) + 1
          })
          setDailyTrend(DAYS_ORDER.map(d => ({ label: d, views: dayCount[d] || 0 })))

          // Weekly — count per week_number
          const weekCount: Record<number, number> = {}
          pageViews.forEach((v: any) => {
            if (v.week_number) weekCount[v.week_number] = (weekCount[v.week_number] || 0) + 1
          })
          const allWeeks = [...new Set(pageViews.map((v: any) => v.week_number).filter(Boolean))].sort()
          const lastFourWeeks = allWeeks.slice(-4)
          if (lastFourWeeks.length === 0) {
            setWeeklyTrend([1, 2, 3, 4].map(w => ({ label: `Minggu ${w}`, views: weekCount[w] || 0 })))
          } else {
            setWeeklyTrend(lastFourWeeks.map((w: any, i: number) => ({ label: `Minggu ${i + 1}`, views: weekCount[w] || 0 })))
          }

          // Monthly — from created_at if available, else from published_at via articles
          const monthCount: Record<number, number> = {}
          pageViews.forEach((v: any) => {
            if (v.created_at) {
              const m = new Date(v.created_at).getMonth()
              monthCount[m] = (monthCount[m] || 0) + 1
            }
          })
          const hasMonthData = Object.keys(monthCount).length > 0
          if (hasMonthData) {
            const now = new Date()
            const last6 = Array.from({ length: 6 }, (_, i) => (now.getMonth() - 5 + i + 12) % 12)
            setMonthlyTrend(last6.map(m => ({ label: MONTHS_SHORT[m], views: monthCount[m] || 0 })))
          } else {
            // Fallback: distribute articles' published_at by month
            const pubMap: Record<number, number> = {}
            ;(articles ?? []).forEach((a: any) => {
              if (a.published_at) {
                const m = new Date(a.published_at).getMonth()
                pubMap[m] = (pubMap[m] || 0) + (a.views || 0)
              }
            })
            const now = new Date()
            const last6 = Array.from({ length: 6 }, (_, i) => (now.getMonth() - 5 + i + 12) % 12)
            setMonthlyTrend(last6.map(m => ({ label: MONTHS_SHORT[m], views: pubMap[m] || 0 })))
          }
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchAll()
  }, [])

  // ── Trend chart data by tab ────────────────────────────────────────────────
  const trendData = tab === "daily" ? dailyTrend : tab === "weekly" ? weeklyTrend : monthlyTrend

  const weekTrend = summary.viewsLastWeek > 0
    ? Math.round(((summary.viewsThisWeek - summary.viewsLastWeek) / summary.viewsLastWeek) * 100)
    : summary.viewsThisWeek > 0 ? 100 : 0

  return (
    <div className="p-6 space-y-10">
      {/* ── Header ── */}
      <div>
        <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
          Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pantau performa konten dan tren pembaca secara menyeluruh
        </p>
      </div>

      {isLoading ? (
        <div className="py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm mt-4">Memuat data analytics…</p>
        </div>
      ) : (
        <>
          {/* ── Stat Cards ── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={Eye} label="Total Views" value={summary.totalViews.toLocaleString("id-ID")}
              sub="Semua artikel" trend={weekTrend} />
            <StatCard icon={FileText} label="Artikel Tayang" value={summary.publishedArticles.toLocaleString("id-ID")}
              sub="Status published" />
            <StatCard icon={TrendingUp} label="Rata-rata Views" value={summary.avgViews.toLocaleString("id-ID")}
              sub="Per artikel published" />
            <StatCard icon={LayoutGrid} label="Kategori Aktif" value={summary.totalCategories.toLocaleString("id-ID")}
              sub="Memiliki artikel" />
            <StatCard icon={Tag} label="Tag Digunakan" value={summary.totalTags.toLocaleString("id-ID")}
              sub="Unik di seluruh artikel" />
          </div>

          {/* ── Views Trend ── */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start justify-between mb-6">
              <SectionTitle title="Tren Views" sub="Jumlah page views berdasarkan periode" />
              <div className="flex gap-1 rounded-lg bg-secondary/50 p-1">
                {(["daily", "weekly", "monthly"] as TabKey[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      tab === t ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "daily" ? "Harian" : t === "weekly" ? "Mingguan" : "Bulanan"}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.87 0.29 142)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.87 0.29 142)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" />
                  <XAxis dataKey="label" stroke="oklch(0.55 0 0)" fontSize={11} />
                  <YAxis stroke="oklch(0.55 0 0)" fontSize={11} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("id-ID"), "Views"]} />
                  <Area
                    type="monotone" dataKey="views"
                    stroke="oklch(0.87 0.29 142)" strokeWidth={2}
                    fill="url(#viewsGrad)"
                    dot={{ fill: "oklch(0.87 0.29 142)", strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {trendData.every(d => d.views === 0) && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Belum ada data views. Data muncul saat pengunjung membaca artikel.
              </p>
            )}
          </div>

          {/* ── Artikel Terpopuler ── */}
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionTitle title="Artikel Terpopuler" sub="7 artikel dengan views terbanyak" />
            {popularArticles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Belum ada artikel published.
              </p>
            ) : (
              <div className="space-y-3">
                {popularArticles.map((art, i) => {
                  const max = popularArticles[0]?.views || 1
                  const pct = Math.round((art.views / max) * 100)
                  return (
                    <div key={art.id} className="flex items-center gap-4">
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate leading-tight">{art.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                            {art.category}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: GREEN[Math.min(i, GREEN.length - 1)] }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-sm font-bold text-foreground">{art.views.toLocaleString("id-ID")}</span>
                        <p className="text-[10px] text-muted-foreground">views</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Kategori & Tag Grid ── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Performa per Kategori */}
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionTitle title="Performa per Kategori" sub="Views & jumlah artikel" />
              {categoryStats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data kategori.</p>
              ) : (
                <>
                  <div className="h-52 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryStats} layout="vertical" margin={{ left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" horizontal={false} />
                        <XAxis type="number" stroke="oklch(0.55 0 0)" fontSize={10} />
                        <YAxis dataKey="name" type="category" stroke="oklch(0.55 0 0)" fontSize={10} width={72} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("id-ID"), "Views"]} />
                        <Bar dataKey="views" radius={[0, 4, 4, 0]}>
                          {categoryStats.map((_, i) => (
                            <Cell key={i} fill={GREEN[i % GREEN.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {categoryStats.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: GREEN[i % GREEN.length] }} />
                          <span className="text-foreground font-medium">{c.name}</span>
                        </div>
                        <div className="flex gap-4 text-muted-foreground">
                          <span>{c.articles} artikel</span>
                          <span className="text-foreground font-medium">{c.views.toLocaleString("id-ID")} views</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Performa per Tag */}
            <div className="rounded-xl border border-border bg-card p-6">
              <SectionTitle title="Tag Paling Banyak Dibaca" sub="Berdasarkan total views artikel yang memakai tag" />
              {tagStats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data tag.</p>
              ) : (
                <>
                  <div className="h-52 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tagStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" />
                        <XAxis dataKey="name" stroke="oklch(0.55 0 0)" fontSize={9} interval={0} />
                        <YAxis stroke="oklch(0.55 0 0)" fontSize={10} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("id-ID"), "Views"]} />
                        <Bar dataKey="views" radius={[4, 4, 0, 0]}>
                          {tagStats.map((_, i) => (
                            <Cell key={i} fill={GREEN[i % GREEN.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tagStats.map((t, i) => (
                      <div
                        key={t.name}
                        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GREEN[i % GREEN.length] }} />
                        <span className="text-foreground font-medium">{t.name}</span>
                        <span className="text-muted-foreground">· {t.articles} artikel</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Distribusi Kategori (Pie) ── */}
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionTitle title="Distribusi Konten per Kategori" sub="Persentase jumlah artikel" />
            {categoryStats.length > 0 ? (
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="h-56 w-full md:w-64 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryStats} cx="50%" cy="50%"
                        innerRadius={55} outerRadius={80}
                        paddingAngle={4} dataKey="share"
                      >
                        {categoryStats.map((_, i) => (
                          <Cell key={i} fill={GREEN[i % GREEN.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, "Share"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-3">
                  {categoryStats.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: GREEN[i % GREEN.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-foreground font-medium truncate">{c.name}</span>
                          <span className="text-muted-foreground ml-2">{c.share}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${c.share}%`, backgroundColor: GREEN[i % GREEN.length] }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Belum ada artikel untuk ditampilkan distribusinya.
              </p>
            )}
          </div>

          {/* ── Views Minggu Ini vs Lalu ── */}
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionTitle title="Views: Minggu Ini vs Minggu Lalu" sub="Perbandingan total page views" />
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Minggu Ini", value: summary.viewsThisWeek, color: GREEN[0] },
                { label: "Minggu Lalu", value: summary.viewsLastWeek, color: GREEN[2] },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-secondary/40 p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className="text-3xl font-bold" style={{ color: item.color }}>
                    {item.value.toLocaleString("id-ID")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">page views</p>
                </div>
              ))}
              {summary.viewsLastWeek === 0 && summary.viewsThisWeek === 0 && (
                <div className="col-span-2 text-center text-xs text-muted-foreground mt-2">
                  Data perbandingan muncul setelah ada views yang tercatat dengan timestamp.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
