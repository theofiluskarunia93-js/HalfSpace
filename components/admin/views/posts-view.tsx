"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Edit, Trash2, Filter, Tag, Share2, Link2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

interface PostsViewProps {
  onCreateArticle: () => void
  onEditArticle: (id: string) => void
  onOpenSocialMedia: (id: string) => void
}

const categories = [
  "All",
  "Champions League",
  "Premier League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "World Cup",
  "Euro",
  "Copa America",
  "AFCON",
  "AFC Cup",
  "AFF Cup",
  "Liga 1",
  "Transfer",
]

export function PostsView({ onCreateArticle, onEditArticle, onOpenSocialMedia }: PostsViewProps) {
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [posts, setPosts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Internal Link Building — id artikel yang sedang diproses ("__bulk__" untuk jalankan semua)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchPosts()
  }, [])

  async function fetchPosts() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("articles")
      .select("*, categories(name), article_tags(tags(name, slug))")
      .order("created_at", { ascending: false })

    if (!error && data) setPosts(data)
    setIsLoading(false)
  }

  const handleDelete = async (id: string) => {
    const confirm = window.confirm("Yakin ingin menghapus artikel ini?")
    if (!confirm) return

    // Delete article_tags first (if no cascade)
    await supabase.from("article_tags").delete().eq("article_id", id)
    const { error } = await supabase.from("articles").delete().eq("id", id)
    if (!error) setPosts(posts.filter((post) => post.id !== id))
  }

  // ── Internal Link Building (retroaktif) ──────────────────────────────────
  // Memanggil API yang menyisipkan internal link ke konten artikel yang SUDAH
  // publish. Artikel baru sudah otomatis ditautkan saat disimpan dari
  // create-article-view.tsx — tombol ini khusus untuk "menyusulkan" link ke
  // artikel lama yang sudah ada di database.
  const handleBuildInternalLinks = async (articleId?: string) => {
    const isBulk = !articleId
    if (isBulk) {
      const confirm = window.confirm(
        "Jalankan Internal Link Building untuk SEMUA artikel published? Proses ini akan mengubah konten artikel yang sudah ada."
      )
      if (!confirm) return
    }

    setLinkingId(isBulk ? "__bulk__" : articleId!)
    try {
      const res = await fetch("/api/internal-linking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(articleId ? { articleId } : {}),
      })
      const result = await res.json()

      if (!res.ok) {
        window.alert(result.error || "Internal Link Building gagal.")
        return
      }

      window.alert(
        `Internal Link Building selesai.\nDiproses: ${result.processed} artikel.\nDiperbarui (ada link baru): ${result.updated} artikel.`
      )
      fetchPosts() // refresh agar daftar tetap sinkron (mis. updated_at)
    } catch (e) {
      window.alert("Internal Link Building gagal — cek koneksi/server.")
    } finally {
      setLinkingId(null)
    }
  }

  const filteredPosts = posts.filter((post) => {
    const categoryName = post.categories?.name || ""
    const matchesCategory = selectedCategory === "All" || categoryName === selectedCategory
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            Posts
          </h1>
          <p className="text-muted-foreground">Manage your articles and content</p>
        </div>
        <Button onClick={onCreateArticle} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Create Article
        </Button>
      </div>

      {/* Internal Link Building — bulk run untuk artikel yang sudah publish */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Internal Link Building Otomatis</p>
          <p className="text-xs text-muted-foreground">
            Sisipkan internal link ke artikel published lain berdasarkan judul/tag. Artikel baru sudah otomatis ditautkan saat disimpan.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={linkingId !== null}
          onClick={() => handleBuildInternalLinks()}
        >
          {linkingId === "__bulk__" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="mr-2 h-4 w-4" />
          )}
          Jalankan untuk Semua Artikel Published
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search posts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-border bg-secondary/50 pl-10 text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Posts Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading posts...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Title</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tags</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Author</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Views</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPosts.map((post) => {
                  const postTags = post.article_tags
                    ?.map((at: any) => at.tags)
                    .filter(Boolean) || []

                  return (
                    <tr key={post.id} className="transition-colors hover:bg-secondary/30">
                      <td className="px-6 py-4">
                        <span className="line-clamp-1 font-medium text-foreground">{post.title}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          {post.categories?.name || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {postTags.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            postTags.slice(0, 3).map((tag: any) => (
                              <span
                                key={tag.slug}
                                className="flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                              >
                                <Tag className="h-2.5 w-2.5" />
                                {tag.name}
                              </span>
                            ))
                          )}
                          {postTags.length > 3 && (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                              +{postTags.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{post.author}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded px-2 py-1 text-xs font-medium ${
                          post.status === "published"
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {post.status === "published" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{post.views?.toLocaleString() || 0}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title="Internal Link Building"
                            disabled={linkingId !== null || post.status !== "published"}
                            onClick={() => handleBuildInternalLinks(post.id)}
                          >
                            {linkingId === post.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title="Social Media"
                            onClick={() => onOpenSocialMedia(post.id)}
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => onEditArticle(post.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(post.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && filteredPosts.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            No posts found matching your criteria.
          </div>
        )}
      </div>
    </div>
  )
}
