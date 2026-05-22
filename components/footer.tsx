"use client"

import { useRouter } from "next/navigation"
import { PublicPage } from "@/app/page"
import { Instagram } from "lucide-react"

interface FooterProps {
  onGoToAdmin: () => void
  onPageChange: (page: PublicPage) => void
}

// Map SPA pages ke route (sama seperti di navbar)
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

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  )
}

export function Footer({ onGoToAdmin, onPageChange }: FooterProps) {
  const router = useRouter()

  const handlePageClick = (page: PublicPage) => {
    const route = PAGE_TO_ROUTE[page]
    if (route) {
      router.push(route)
    } else {
      onPageChange(page)
    }
  }

  const footerLinks = {
    "Europe": [
      { label: "Champions League", page: "champions-league" as PublicPage },
      { label: "Premier League", page: "premier-league" as PublicPage },
      { label: "La Liga", page: "la-liga" as PublicPage },
      { label: "Bundesliga", page: "bundesliga" as PublicPage },
      { label: "Serie A", page: "serie-a" as PublicPage },
    ],
    "International": [
      { label: "World Cup", page: "world-cup" as PublicPage },
      { label: "Euro", page: "euro" as PublicPage },
      { label: "Copa America", page: "copa-america" as PublicPage },
      { label: "AFCON", page: "afcon" as PublicPage },
    ],
    "Asia": [
      { label: "AFC Cup", page: "afc-cup" as PublicPage },
      { label: "AFF Cup", page: "aff-cup" as PublicPage },
    ],
    "More": [
      { label: "Transfer", page: "transfer" as PublicPage },
      { label: "About Us", page: "about" as PublicPage },
    ],
  }

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <button onClick={() => onPageChange("home")} className="mb-4 block">
              <h2 className="text-2xl font-bold text-primary neon-glow-subtle" style={{ fontFamily: "var(--font-oswald)" }}>
                HalfSpace
              </h2>
            </button>
            <p className="mb-6 text-sm text-muted-foreground">
              Your ultimate destination for sports news, live scores, and comprehensive coverage.
            </p>
            <div className="flex gap-4">
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-primary">
                <Instagram className="h-6 w-6" />
              </a>
              <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-primary">
                <TikTokIcon className="h-6 w-6" />
              </a>
            </div>
          </div>
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">{category}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.page}>
                    <button onClick={() => handlePageClick(link.page)} className="text-sm text-muted-foreground transition-colors hover:text-primary">
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} HalfSpace. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
