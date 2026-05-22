"use client"

import { useState, useEffect } from "react"
import { Search, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export function UsersView() {
  const [searchQuery, setSearchQuery] = useState("")
  const [users, setUsers] = useState<any[]>([])
  const [articleCounts, setArticleCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUsers() {
      // Fetch users dari auth.users via admin API tidak tersedia di client
      // Kita fetch artikel dan group by author sebagai gantinya
      const { data: articles } = await supabase
        .from("articles")
        .select("author")

      if (articles) {
        const counts: Record<string, number> = {}
        articles.forEach((a) => {
          if (a.author) counts[a.author] = (counts[a.author] || 0) + 1
        })
        setArticleCounts(counts)

        // Buat list unik author sebagai "users"
        const uniqueAuthors = [...new Set(articles.map((a) => a.author).filter(Boolean))]
        setUsers(uniqueAuthors.map((name, i) => ({
          id: i,
          name,
          email: `${name.toLowerCase().replace(/\s/g, ".")}@halfspace.com`,
          role: name === "Admin" ? "Admin" : "Author",
          status: "Active",
          avatar: name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
        })))
      }

      setIsLoading(false)
    }

    fetchUsers()
  }, [])

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-oswald)" }}>
            Users
          </h1>
          <p className="text-muted-foreground">Manage authors and editors</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-border bg-secondary/50 pl-10 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading users...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredUsers.map((user) => (
            <div key={user.id} className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
                  {user.avatar}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>

              <h3 className="font-semibold text-foreground">{user.name}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{user.email}</p>

              <div className="mb-4 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                  user.role === "Admin" ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
                }`}>
                  {user.role}
                </span>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {user.status}
                </span>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{articleCounts[user.name] || 0}</span> articles published
                </p>
              </div>
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No users found. Mulai buat artikel untuk melihat author di sini.
            </div>
          )}
        </div>
      )}
    </div>
  )
}