"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Check, Trash2, MessageSquare, Filter, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────
type CommentStatus = "pending" | "approved" | "all"

// Supabase join many-to-one bisa return object tunggal atau array —
// definisikan keduanya agar TypeScript tidak complain
type ArticleJoin = { title: string } | { title: string }[] | null

interface Comment {
  id: string
  article_id: string
  name: string
  text: string
  status: "pending" | "approved"
  created_at: string
  articles: ArticleJoin
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 15

const STATUS_LABEL: Record<CommentStatus, string> = {
  all: "Semua",
  pending: "Menunggu",
  approved: "Disetujui",
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  approved: "bg-green-500/15 text-green-400 border-green-500/30",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// Normalise hasil join Supabase: bisa object, array, atau null
function getArticleTitle(articles: ArticleJoin): string | null {
  if (!articles) return null
  if (Array.isArray(articles)) return articles[0]?.title ?? null
  return (articles as { title: string }).title ?? null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function CommentsView() {
  const supabase = createClient()

  const [comments, setComments] = useState<Comment[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [statusFilter, setStatusFilter] = useState<CommentStatus>("pending")
  const [page, setPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    setIsLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let countQuery = supabase.from("comments").select("id", { count: "exact", head: true })
    let dataQuery = supabase
      .from("comments")
      .select("id, article_id, name, text, status, created_at, articles(title)")
      .order("created_at", { ascending: false })
      .range(from, to)

    if (statusFilter !== "all") {
      countQuery = countQuery.eq("status", statusFilter)
      dataQuery = dataQuery.eq("status", statusFilter)
    }

    const [{ count }, { data }] = await Promise.all([countQuery, dataQuery])
    setTotalCount(count ?? 0)
    setComments((data as unknown as Comment[]) ?? [])
    setIsLoading(false)
  }, [supabase, statusFilter, page])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Reset ke page 0 saat filter berubah
  useEffect(() => {
    setPage(0)
  }, [statusFilter])

  // ── Actions ────────────────────────────────────────────────────────────────
  const showToast = (msg: string, type: "ok" | "err") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleApprove = async (id: string) => {
    setActionLoading(id + "-approve")
    const { error } = await supabase
      .from("comments")
      .update({ status: "approved" })
      .eq("id", id)
    if (error) {
      showToast("Gagal menyetujui komentar.", "err")
    } else {
      showToast("Komentar disetujui.", "ok")
      fetchComments()
    }
    setActionLoading(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus komentar ini secara permanen?")) return
    setActionLoading(id + "-delete")
    const { error } = await supabase.from("comments").delete().eq("id", id)
    if (error) {
      showToast("Gagal menghapus komentar.", "err")
    } else {
      showToast("Komentar dihapus.", "ok")
      fetchComments()
    }
    setActionLoading(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const pendingCount = statusFilter === "pending" ? totalCount : undefined

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ fontFamily: "var(--font-oswald)" }}
        >
          Moderasi Komentar
        </h1>
        <p className="text-sm text-muted-foreground">
          Review, setujui, atau hapus komentar dari pembaca
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-1">
          <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
          {(["pending", "approved", "all"] as CommentStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`relative px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {STATUS_LABEL[s]}
              {s === "pending" && pendingCount !== undefined && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={fetchComments}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            toast.type === "ok"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex gap-3">
                <div className="h-3 w-28 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
              </div>
              <div className="h-3 w-full rounded bg-muted mb-2" />
              <div className="h-3 w-3/4 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === "pending"
              ? "Tidak ada komentar yang menunggu persetujuan."
              : statusFilter === "approved"
              ? "Belum ada komentar yang disetujui."
              : "Belum ada komentar sama sekali."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => {
            const articleTitle = getArticleTitle(c.articles)
            return (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-border/80"
              >
                {/* Meta row */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{c.name}</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLORS[c.status]}`}
                    >
                      {c.status === "pending" ? "Menunggu" : "Disetujui"}
                    </span>
                    <time className="text-xs text-muted-foreground">{formatDate(c.created_at)}</time>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {c.status === "pending" && (
                      <button
                        onClick={() => handleApprove(c.id)}
                        disabled={actionLoading === c.id + "-approve"}
                        className="flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                      >
                        {actionLoading === c.id + "-approve" ? (
                          <div className="h-3 w-3 animate-spin rounded-full border border-green-400 border-t-transparent" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Setujui
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={actionLoading === c.id + "-delete"}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {actionLoading === c.id + "-delete" ? (
                        <div className="h-3 w-3 animate-spin rounded-full border border-red-400 border-t-transparent" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Hapus
                    </button>
                  </div>
                </div>

                {/* Article reference */}
                {articleTitle && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Di artikel:{" "}
                    <span className="font-medium text-foreground/70 line-clamp-1">
                      {articleTitle}
                    </span>
                  </p>
                )}

                {/* Comment text */}
                <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
                  {c.text}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} dari{" "}
            {totalCount} komentar
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
