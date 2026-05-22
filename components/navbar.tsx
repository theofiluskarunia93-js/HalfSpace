"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PublicPage } from "@/app/page"
import { ChevronDown, Menu, X } from "lucide-react"
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

export function Navbar({ currentPage, onPageChange, onScrollToSection }: NavbarProps) {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
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

        {/* Main navbar row */}
        <div className="flex h-16 items-center">

          {/* Logo */}
          <div className="w-[120px] md:w-[200px]">
            <button onClick={() => handlePageClick("home")} className="flex items-center">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
              ) : (
                <span className="text-2xl font-bold tracking-tight text-primary neon-glow-subtle" style={{ fontFamily: "var(--font-oswald)" }}>
                  HalfSpace
                </span>
              )}
            </button>
          </div>

          {/* Center links */}
          <div className="flex flex-1 items-center justify-center gap-4 md:gap-6">
            <button
              onClick={() => handleScrollToSection("trending-section")}
              className="neon-nav-btn text-sm font-medium text-foreground transition-colors hover:text-primary active:text-primary"
            >
              Trending
            </button>
            <button
              onClick={() => handleScrollToSection("standings-section")}
              className="neon-nav-btn text-sm font-medium text-foreground transition-colors hover:text-primary active:text-primary"
            >
              League Standings
            </button>
          </div>

          {/* Desktop hamburger */}
          <div className="hidden w-[200px] items-center justify-end gap-6 md:flex">
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

          {/* Mobile hamburger */}
          <div className="flex w-[120px] justify-end md:hidden">
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
