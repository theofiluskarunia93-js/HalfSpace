"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Instagram } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}

const footerLinks = {
  "Europe": [
    { label: "Champions League", href: "/europe/champions-league" },
    { label: "Premier League", href: "/europe/premier-league" },
    { label: "La Liga", href: "/europe/la-liga" },
    { label: "Bundesliga", href: "/europe/bundesliga" },
    { label: "Serie A", href: "/europe/serie-a" },
  ],
  "International": [
    { label: "World Cup", href: "/international/world-cup" },
    { label: "Euro", href: "/international/euro" },
    { label: "Copa America", href: "/international/copa-america" },
    { label: "AFCON", href: "/international/afcon" },
  ],
  "Asia": [
    { label: "AFC Cup", href: "/asia/afc-cup" },
    { label: "AFF Cup", href: "/asia/aff-cup" },
  ],
  "More": [
    { label: "Transfer", href: "/transfer" },
    { label: "About Us", href: "/about-us" },
    { label: "Contact Us", href: "/contact-us" },
    { label: "Privacy Policy", href: "/privacy-policy" },
  ],
}

export function FooterStandalone() {
  const router = useRouter()
  const supabase = createClient()

  const [instagramUrl, setInstagramUrl] = useState<string>("")
  const [tiktokUrl, setTiktokUrl] = useState<string>("")

  useEffect(() => {
    async function loadSocialLinks() {
      const { data } = await supabase
        .from("site_settings")
        .select("instagram_handle, tiktok_handle")
        .single()

      if (data) {
        setInstagramUrl(data.instagram_handle || "")
        setTiktokUrl(data.tiktok_handle || "")
      }
    }
    loadSocialLinks()
  }, [])

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <button onClick={() => router.push("/")} className="mb-4 block">
              <h2
                className="text-2xl font-bold text-primary neon-glow-subtle"
                style={{ fontFamily: "var(--font-oswald)" }}
              >
                HalfSpace
              </h2>
            </button>
            <p className="mb-6 text-sm text-muted-foreground">
              Your ultimate destination for sports news, live scores, and comprehensive coverage.
            </p>
            <div className="flex gap-4">
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label="Instagram"
                >
                  <Instagram className="h-6 w-6" />
                </a>
              )}
              {tiktokUrl && (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label="TikTok"
                >
                  <TikTokIcon className="h-6 w-6" />
                </a>
              )}
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
                {category}
              </h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <button
                      onClick={() => router.push(link.href)}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
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
