"use client"

import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import { GroupArticleGrid } from "@/components/group-article-grid"
import { useRouter } from "next/navigation"

const asiaComps = [
  { id: "afc-cup", label: "AFC Cup", description: "Asian club football competition", href: "/asia/afc-cup" },
  { id: "aff-cup", label: "AFF Cup", description: "Southeast Asian championship", href: "/asia/aff-cup" },
] as const

export default function AsiaPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <NavbarStandalone />
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="mb-4 text-4xl font-bold uppercase tracking-tight text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            Asia
          </h1>
          <div className="h-1 w-16 bg-primary" />
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Latest news from Asian football.
          </p>
        </div>

        {/* Latest News — DI ATAS */}
        <div className="mb-12">
          <h2
            className="mb-6 text-2xl font-bold uppercase tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            Latest Asia News
          </h2>
          <GroupArticleGrid groupKey="asia" title="Asia" />
        </div>

        {/* Competition Cards — DI BAWAH */}
        <div>
          <h2
            className="mb-6 text-2xl font-bold uppercase tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            Competitions
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {asiaComps.map((comp) => (
              <button
                key={comp.id}
                onClick={() => router.push(comp.href)}
                className="group overflow-hidden rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:bg-card/80"
              >
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                  <svg className="h-8 w-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                </div>
                <h3 className="mb-2 text-xl font-bold text-foreground transition-colors group-hover:text-primary">
                  {comp.label}
                </h3>
                <p className="text-sm text-muted-foreground">{comp.description}</p>
                <div className="mt-4 flex items-center text-sm font-medium text-primary">
                  View Coverage
                  <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
      <FooterStandalone />
    </div>
  )
}
