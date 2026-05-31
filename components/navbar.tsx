"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { PublicPage } from "@/types/pages"
import { ChevronDown, Menu, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

// Pages yang tetap di SPA (state change)
const SPA_PAGES: PublicPage[] = ["home", "europe", "international", "asia", "trending", "standings"]

// Map dari PublicPage ke Next.js route (untuk halaman yang punya route sendiri)
const PAGE_TO_ROUTE: Partial<Record<PublicPage, string>> = {
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
  "liga1": "/liga1",
  "transfer": "/transfer",
  "about": "/about-us",
  "contact": "/about-us",
}

interface NavbarProps {
  currentPage: PublicPage
  onPageChange: (page: PublicPage) => void
  onScrollToSection?: (sectionId: string) => void
}

const europeLeagues = [
  { id: "champions-league", label: "Champions League" },
  { id: "premier-league", label: "Premier League" },
  { id: "la-liga", label: "La Liga" },
  { id: "bundesliga", label: "Bundesliga" },
  { id: "serie-a", label: "Serie A" },
] as const

const internationalComps = [
  { id: "world-cup", label: "World Cup" },
  { id: "euro", label: "Euro" },
  { id: "copa-america", label: "Copa America" },
  { id: "afcon", label: "AFCON" },
] as const

const asiaComps = [
  { id: "afc-cup", label: "AFC Cup" },
  { id: "aff-cup", label: "AFF Cup" },
] as const

// ─── Search Types ─────────────────────────────────────────────────────────
interface SearchResult {
  id: string
  slug: string
  title: string
  excerpt: string | null
  categories: { name: string }[] | null
}

// ─── SearchBar ────────────────────────────────────────────────────────────
function SearchBar({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  // Debounced search — 350ms
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    const { data } = await supabase
      .from("articles")
      .select("id, slug, title, excerpt, categories(name)")
      .eq("status", "published")
      .or(`title.ilike.%${trimmed}%,excerpt.ilike.%${trimmed}%`)
      .order("published_at", { ascending: false })
      .limit(6)
    setResults((data as SearchResult[]) || [])
    setIsSearching(false)
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 350)
    return () => clearTimeout(t)
  }, [query, doSearch])

  const handleSelect = (slug: string) => {
    router.push(`/article/${slug}`)
    onClose()
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto">
      {/* Input */}
      <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-card px-4 py-2.5 shadow-lg">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Escape" && onClose()}
          placeholder="Cari artikel..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {isSearching && (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
        )}
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Dropdown results */}
      {query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-50">
          {results.length === 0 && !isSearching ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Tidak ada artikel ditemukan untuk &quot;{query}&quot;
            </p>
          ) : (
            <ul>
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    onClick={() => handleSelect(r.slug)}
                    className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <span className="flex items-center gap-2">
                      {r.categories?.[0]?.name && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {r.categories?.[0]?.name}
                        </span>
                      )}
                      <span className="text-sm font-medium text-foreground line-clamp-1">{r.title}</span>
                    </span>
                    {r.excerpt && (
                      <span className="text-xs text-muted-foreground line-clamp-1 pl-0.5">{r.excerpt}</span>
                    )}
                  </button>
                  {i < results.length - 1 && <div className="mx-4 border-b border-border/50" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Navbar ────────────────────────────────────────────────────────────────
export function Navbar({ currentPage, onPageChange, onScrollToSection }: NavbarProps) {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function fetchLogo() {
      const { data } = await supabase.from("site_settings").select("logo_url").single()
      if (data?.logo_url) setLogoUrl(data.logo_url)
    }
    fetchLogo()
  }, [])

  const handleScrollToSection = (sectionId: string) => {
    if (currentPage !== "home") {
      onPageChange("home")
      setTimeout(() => onScrollToSection?.(sectionId), 100)
    } else {
      onScrollToSection?.(sectionId)
    }
    setIsMenuOpen(false)
    setOpenDropdown(null)
    setOpenSubmenu(null)
  }

  // Smart handler: SPA pages pakai onPageChange, route pages pakai router.push
  const handlePageClick = (page: PublicPage) => {
    const route = PAGE_TO_ROUTE[page]
    if (route) {
      router.push(route)
    } else {
      onPageChange(page)
    }
    setIsMenuOpen(false)
    setOpenDropdown(null)
    setOpenSubmenu(null)
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4">

        {/* Search overlay */}
        {searchOpen && (
          <div className="absolute inset-x-0 top-0 z-50 flex h-16 items-center px-4 bg-background/95 backdrop-blur">
            <SearchBar onClose={() => setSearchOpen(false)} />
          </div>
        )}

        {/* Main navbar row */}
        <div className={`flex h-16 items-center ${searchOpen ? "invisible" : ""}`}>

          {/* Logo */}
          <div className="flex-1 md:flex-none md:w-auto">
            <button onClick={() => handlePageClick("home")} className="flex items-center">
              {logoUrl ? (
                <Image src={logoUrl} alt="Logo" width={240} height={56} className="h-12 md:h-14 w-auto object-contain max-w-[180px] md:max-w-[240px]" />
              ) : (
                <span className="text-3xl md:text-4xl font-bold tracking-tight text-primary neon-glow-subtle" style={{ fontFamily: "var(--font-oswald)" }}>
                  HalfSpace
                </span>
              )}
            </button>
          </div>

          {/* Center spacer (trending & standings removed) */}
          <div className="flex flex-1 items-center justify-center" />

          {/* Desktop: search + hamburger */}
          <div className="hidden w-[200px] items-center justify-end gap-3 md:flex">
            <button
              onClick={() => setSearchOpen(true)}
              className="neon-nav-icon flex items-center text-foreground transition-colors"
              aria-label="Cari artikel"
            >
              <Search className="h-5 w-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === "categories" ? null : "categories")}
                className="neon-nav-icon flex items-center gap-1 text-foreground transition-colors"
                aria-label="Menu"
              >
                {openDropdown === "categories" ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              {openDropdown === "categories" && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-card p-2 shadow-xl">
                  {/* Europe */}
                  <div className="relative">
                    <button
                      onMouseEnter={() => setOpenSubmenu("europe")}
                      onClick={() => handlePageClick("europe")}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      Europe
                      <ChevronDown className="h-4 w-4 -rotate-90 transition-transform" />
                    </button>
                    {openSubmenu === "europe" && (
                      <div className="absolute left-full top-0 ml-1 w-48 rounded-lg border border-border bg-card p-2 shadow-xl">
                        {europeLeagues.map((league) => (
                          <button key={league.id} onClick={() => handlePageClick(league.id as PublicPage)}
                            className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary">
                            {league.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* International */}
                  <div className="relative">
                    <button
                      onMouseEnter={() => setOpenSubmenu("international")}
                      onClick={() => handlePageClick("international")}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      International
                      <ChevronDown className="h-4 w-4 -rotate-90 transition-transform" />
                    </button>
                    {openSubmenu === "international" && (
                      <div className="absolute left-full top-0 ml-1 w-48 rounded-lg border border-border bg-card p-2 shadow-xl">
                        {internationalComps.map((comp) => (
                          <button key={comp.id} onClick={() => handlePageClick(comp.id as PublicPage)}
                            className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary">
                            {comp.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Asia */}
                  <div className="relative">
                    <button
                      onMouseEnter={() => setOpenSubmenu("asia")}
                      onClick={() => handlePageClick("asia")}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      Asia
                      <ChevronDown className="h-4 w-4 -rotate-90 transition-transform" />
                    </button>
                    {openSubmenu === "asia" && (
                      <div className="absolute left-full top-0 ml-1 w-48 rounded-lg border border-border bg-card p-2 shadow-xl">
                        {asiaComps.map((comp) => (
                          <button key={comp.id} onClick={() => handlePageClick(comp.id as PublicPage)}
                            className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary">
                            {comp.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={() => handlePageClick("liga1")} className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary">Liga 1</button>
                  <button onClick={() => handlePageClick("transfer")} className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary">Transfer</button>
                  <button onClick={() => handlePageClick("about")} className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary">About Us</button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile: search + hamburger */}
          <div className="flex w-[120px] items-center justify-end gap-1 md:hidden">
            <Button variant="ghost" size="icon" className="neon-nav-icon text-foreground" onClick={() => setSearchOpen(true)}>
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="neon-nav-icon text-foreground" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

        </div>

        {/* Mobile dropdown */}
        <div className="md:hidden overflow-hidden" style={{
          maxHeight: isMenuOpen ? "calc(100vh - 64px)" : "0px",
          opacity: isMenuOpen ? 1 : 0,
          transition: "max-height 0.35s ease-in-out, opacity 0.25s ease-in-out",
          borderTop: isMenuOpen ? "1px solid hsl(var(--border))" : "none",
        }}>
          <div className="flex flex-col py-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 64px)" }}>
            <button onClick={() => handlePageClick("europe")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Europe</button>
            {europeLeagues.map((league, i) => (
              <button key={league.id} onClick={() => handlePageClick(league.id as PublicPage)} style={{ transitionDelay: `${60 + i * 20}ms` }}
                className="rounded-md px-3 py-2 pl-6 text-left text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-8">
                {league.label}
              </button>
            ))}
            <button onClick={() => handlePageClick("international")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">International</button>
            {internationalComps.map((comp, i) => (
              <button key={comp.id} onClick={() => handlePageClick(comp.id as PublicPage)} style={{ transitionDelay: `${200 + i * 20}ms` }}
                className="rounded-md px-3 py-2 pl-6 text-left text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-8">
                {comp.label}
              </button>
            ))}
            <button onClick={() => handlePageClick("asia")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Asia</button>
            {asiaComps.map((comp, i) => (
              <button key={comp.id} onClick={() => handlePageClick(comp.id as PublicPage)} style={{ transitionDelay: `${310 + i * 20}ms` }}
                className="rounded-md px-3 py-2 pl-6 text-left text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-8">
                {comp.label}
              </button>
            ))}
            <button onClick={() => handlePageClick("liga1")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Liga 1</button>
            <button onClick={() => handlePageClick("transfer")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Transfer</button>
            <button onClick={() => handlePageClick("about")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">About Us</button>
          </div>
        </div>

      </div>
    </nav>
  )
}
