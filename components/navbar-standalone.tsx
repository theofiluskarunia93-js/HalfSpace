"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { ChevronDown, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const europeLeagues = [
  { href: "/europe/champions-league", label: "Champions League" },
  { href: "/europe/premier-league", label: "Premier League" },
  { href: "/europe/la-liga", label: "La Liga" },
  { href: "/europe/bundesliga", label: "Bundesliga" },
  { href: "/europe/serie-a", label: "Serie A" },
] as const

const internationalComps = [
  { href: "/international/world-cup", label: "World Cup" },
  { href: "/international/euro", label: "Euro" },
  { href: "/international/copa-america", label: "Copa America" },
  { href: "/international/afcon", label: "AFCON" },
] as const

const asiaComps = [
  { href: "/asia/afc-cup", label: "AFC Cup" },
  { href: "/asia/aff-cup", label: "AFF Cup" },
] as const

export function NavbarStandalone() {
  const router = useRouter()
  const pathname = usePathname()
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

  const navigate = (href: string) => {
    router.push(href)
    setIsMenuOpen(false)
    setOpenDropdown(null)
    setOpenSubmenu(null)
  }

  const isActive = (href: string) => pathname === href

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4">

        {/* Main navbar row */}
        <div className="flex h-16 items-center">

          {/* Logo */}
          <div className="w-[120px] md:w-[200px]">
            <button onClick={() => navigate("/")} className="flex items-center">
              {logoUrl ? (
                <Image src={logoUrl} alt="Logo" width={200} height={32} className="h-8 w-auto object-contain" />
              ) : (
                <span
                  className="text-2xl font-bold tracking-tight text-primary neon-glow-subtle"
                  style={{ fontFamily: "var(--font-oswald)" }}
                >
                  HalfSpace
                </span>
              )}
            </button>
          </div>

          {/* Center spacer */}
          <div className="flex flex-1 items-center justify-center" />

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
                  <div className="relative" onMouseLeave={() => setOpenSubmenu(null)}>
                    <button
                      onMouseEnter={() => setOpenSubmenu("europe")}
                      onClick={() => navigate("/europe")}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      Europe
                      <ChevronDown className="h-4 w-4 -rotate-90 transition-transform" />
                    </button>
                    {openSubmenu === "europe" && (
                      <div className="absolute left-full top-0 ml-1 w-48 rounded-lg border border-border bg-card p-2 shadow-xl">
                        {europeLeagues.map((league) => (
                          <button
                            key={league.href}
                            onClick={() => navigate(league.href)}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary hover:text-primary ${isActive(league.href) ? "text-primary" : "text-foreground"}`}
                          >
                            {league.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* International */}
                  <div className="relative" onMouseLeave={() => setOpenSubmenu(null)}>
                    <button
                      onMouseEnter={() => setOpenSubmenu("international")}
                      onClick={() => navigate("/international")}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      International
                      <ChevronDown className="h-4 w-4 -rotate-90 transition-transform" />
                    </button>
                    {openSubmenu === "international" && (
                      <div className="absolute left-full top-0 ml-1 w-48 rounded-lg border border-border bg-card p-2 shadow-xl">
                        {internationalComps.map((comp) => (
                          <button
                            key={comp.href}
                            onClick={() => navigate(comp.href)}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary hover:text-primary ${isActive(comp.href) ? "text-primary" : "text-foreground"}`}
                          >
                            {comp.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Asia */}
                  <div className="relative" onMouseLeave={() => setOpenSubmenu(null)}>
                    <button
                      onMouseEnter={() => setOpenSubmenu("asia")}
                      onClick={() => navigate("/asia")}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      Asia
                      <ChevronDown className="h-4 w-4 -rotate-90 transition-transform" />
                    </button>
                    {openSubmenu === "asia" && (
                      <div className="absolute left-full top-0 ml-1 w-48 rounded-lg border border-border bg-card p-2 shadow-xl">
                        {asiaComps.map((comp) => (
                          <button
                            key={comp.href}
                            onClick={() => navigate(comp.href)}
                            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary hover:text-primary ${isActive(comp.href) ? "text-primary" : "text-foreground"}`}
                          >
                            {comp.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={() => navigate("/liga1")} className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary hover:text-primary ${isActive("/liga1") ? "text-primary" : "text-foreground"}`}>Liga 1</button>
                  <button onClick={() => navigate("/transfer")} className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary hover:text-primary ${isActive("/transfer") ? "text-primary" : "text-foreground"}`}>Transfer</button>
                  <button onClick={() => navigate("/about-us")} className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary hover:text-primary ${isActive("/about-us") ? "text-primary" : "text-foreground"}`}>About Us</button>
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
        <div
          className="md:hidden overflow-hidden"
          style={{
            maxHeight: isMenuOpen ? "calc(100vh - 64px)" : "0px",
            opacity: isMenuOpen ? 1 : 0,
            transition: "max-height 0.35s ease-in-out, opacity 0.25s ease-in-out",
            borderTop: isMenuOpen ? "1px solid hsl(var(--border))" : "none",
          }}
        >
          <div className="flex flex-col py-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 64px)" }}>
            <button onClick={() => navigate("/europe")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Europe</button>
            {europeLeagues.map((league, i) => (
              <button key={league.href} onClick={() => navigate(league.href)} style={{ transitionDelay: `${60 + i * 20}ms` }}
                className={`rounded-md px-3 py-2 pl-6 text-left text-sm transition-all hover:bg-secondary hover:text-primary hover:pl-8 ${isActive(league.href) ? "text-primary" : "text-muted-foreground"}`}>
                {league.label}
              </button>
            ))}
            <button onClick={() => navigate("/international")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">International</button>
            {internationalComps.map((comp, i) => (
              <button key={comp.href} onClick={() => navigate(comp.href)} style={{ transitionDelay: `${200 + i * 20}ms` }}
                className={`rounded-md px-3 py-2 pl-6 text-left text-sm transition-all hover:bg-secondary hover:text-primary hover:pl-8 ${isActive(comp.href) ? "text-primary" : "text-muted-foreground"}`}>
                {comp.label}
              </button>
            ))}
            <button onClick={() => navigate("/asia")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Asia</button>
            {asiaComps.map((comp, i) => (
              <button key={comp.href} onClick={() => navigate(comp.href)} style={{ transitionDelay: `${310 + i * 20}ms` }}
                className={`rounded-md px-3 py-2 pl-6 text-left text-sm transition-all hover:bg-secondary hover:text-primary hover:pl-8 ${isActive(comp.href) ? "text-primary" : "text-muted-foreground"}`}>
                {comp.label}
              </button>
            ))}
            <button onClick={() => navigate("/liga1")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Liga 1</button>
            <button onClick={() => navigate("/transfer")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">Transfer</button>
            <button onClick={() => navigate("/about-us")} className="rounded-md px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:bg-secondary hover:text-primary hover:pl-5">About Us</button>
          </div>
        </div>

      </div>
    </nav>
  )
}
