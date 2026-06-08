"use client"

import { useRouter } from "next/navigation"
import { PublicPage } from "@/types/pages"
import { HorizontalArticleScroll } from "@/components/horizontal-article-scroll"
import { InfiniteArticleList } from "@/components/infinite-article-list"

// ─── Route map (sub-categories navigasi ke Next.js route) ─────────────────
const COMP_TO_ROUTE: Record<string, string> = {
  "champions-league": "/europe/champions-league",
  "premier-league":   "/europe/premier-league",
  "la-liga":          "/europe/la-liga",
  "bundesliga":       "/europe/bundesliga",
  "serie-a":          "/europe/serie-a",
  "world-cup":        "/international/world-cup",
  "euro":             "/international/euro",
  "copa-america":     "/international/copa-america",
  "afcon":            "/international/afcon",
  "afc-cup":          "/asia/afc-cup",
  "aff-cup":          "/asia/aff-cup",
}

interface PageContentProps {
  currentPage: PublicPage
  onPageChange: (page: PublicPage) => void
}

// ─── Competition lists ─────────────────────────────────────────────────────
const europeLeagues = [
  { id: "champions-league", label: "Champions League", description: "Europe's premier club competition" },
  { id: "premier-league",   label: "Premier League",   description: "England's top-flight football" },
  { id: "la-liga",          label: "La Liga",           description: "Spanish football at its finest" },
  { id: "bundesliga",       label: "Bundesliga",        description: "German football excellence" },
  { id: "serie-a",          label: "Serie A",           description: "Italian football drama" },
] as const

const internationalComps = [
  { id: "world-cup",    label: "World Cup",    description: "The biggest sporting event on the planet" },
  { id: "euro",         label: "Euro",         description: "The best of European national teams" },
  { id: "copa-america", label: "Copa America", description: "South American football passion" },
  { id: "afcon",        label: "AFCON",        description: "Africa's premier national team competition" },
] as const

const asiaComps = [
  { id: "afc-cup", label: "AFC Cup", description: "Asian club football competition" },
  { id: "aff-cup", label: "AFF Cup", description: "Southeast Asian championship" },
] as const

// ─── Page metadata ─────────────────────────────────────────────────────────
const pageData: Record<PublicPage, { title: string; description: string; categorySlug?: string }> = {
  home:              { title: "Home",              description: "" },
  trending:          { title: "Trending",          description: "The hottest stories in sports right now." },
  standings:         { title: "League Standings",  description: "Complete standings from leagues around the world." },
  europe:            { title: "Europe",            description: "Comprehensive coverage of European football." },
  international:     { title: "International",     description: "Coverage of major international tournaments." },
  asia:              { title: "Asia",              description: "Latest news from Asian football." },
  sejarah:           { title: "Sejarah",           description: "Kisah-kisah bersejarah dan momen ikonik dalam dunia sepak bola.", categorySlug: "sejarah" },
  liga1:             { title: "Liga 1 Indonesia",  description: "Indonesia's top-tier professional football league.", categorySlug: "liga1" },
  "champions-league":{ title: "UEFA Champions League", description: "Europe's premier club competition.", categorySlug: "champions-league" },
  "premier-league":  { title: "Premier League",   description: "The world's most watched football league.", categorySlug: "premier-league" },
  "la-liga":         { title: "La Liga",           description: "Spanish football at its finest.", categorySlug: "la-liga" },
  bundesliga:        { title: "Bundesliga",        description: "German football excellence.", categorySlug: "bundesliga" },
  "serie-a":         { title: "Serie A",           description: "Italian football drama.", categorySlug: "serie-a" },
  "world-cup":       { title: "FIFA World Cup",    description: "The biggest sporting event.", categorySlug: "world-cup" },
  euro:              { title: "UEFA European Championship", description: "Best of European national team football.", categorySlug: "euro" },
  "copa-america":    { title: "Copa America",      description: "South American football.", categorySlug: "copa-america" },
  afcon:             { title: "Africa Cup of Nations", description: "Africa's premier competition.", categorySlug: "afcon" },
  "afc-cup":         { title: "AFC Cup",           description: "Asian club football.", categorySlug: "afc-cup" },
  "aff-cup":         { title: "AFF Cup",           description: "Southeast Asian championship.", categorySlug: "aff-cup" },
  transfer:          { title: "Transfer News",     description: "Latest transfer rumors and confirmed deals.", categorySlug: "transfer" },
  about:             { title: "About Us",          description: "HalfSpace is your ultimate sports destination." },
  contact:           { title: "Contact Us",        description: "Get in touch with the HalfSpace team." },
  privacy:           { title: "Privacy Policy",    description: "How HalfSpace handles your data." },
}

// ─── Reusable section header ───────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <h2
        className="text-2xl font-bold uppercase tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-oswald)" }}
      >
        {title}
      </h2>
      <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
    </div>
  )
}

// ─── Competition card (for parent category pages) ──────────────────────────
function CompCard({
  id, label, description, onClick,
}: {
  id: string; label: string; description: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:bg-card/80"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
        <svg className="h-8 w-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      </div>
      <h3 className="mb-2 text-xl font-bold text-foreground transition-colors group-hover:text-primary">
        {label}
      </h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex items-center text-sm font-medium text-primary">
        View Coverage
        <svg
          className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

// ─── Page header block ─────────────────────────────────────────────────────
function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-10">
      <h1
        className="mb-4 text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl"
        style={{ fontFamily: "var(--font-oswald)" }}
      >
        {title}
      </h1>
      <div className="h-1 w-16 bg-primary" style={{ boxShadow: "0 0 10px oklch(0.87 0.29 142 / 0.6)" }} />
      {description && (
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────
export function PageContent({ currentPage, onPageChange }: PageContentProps) {
  const router = useRouter()
  const data = pageData[currentPage]

  // Helper: navigate to sub-category (SPA pages stay in SPA; route pages use router.push)
  const handleCompClick = (id: string) => {
    const route = COMP_TO_ROUTE[id]
    if (route) {
      router.push(route)
    } else {
      onPageChange(id as PublicPage)
    }
  }

  // ── Europe / International / Asia: horizontal scroll + competition cards ──
  if (currentPage === "europe" || currentPage === "international" || currentPage === "asia") {
    const competitions =
      currentPage === "europe"         ? europeLeagues :
      currentPage === "international"  ? internationalComps :
                                         asiaComps

    return (
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
        <PageHeader title={data.title} description={data.description} />

        {/* Latest news — horizontal scroll */}
        <section className="mb-14">
          <SectionHeader title={`Latest ${data.title} News`} />
          <HorizontalArticleScroll groupKey={currentPage} title={data.title} />
        </section>

        {/* Competitions */}
        <section>
          <SectionHeader title="Competitions" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {competitions.map((comp) => (
              <CompCard
                key={comp.id}
                id={comp.id}
                label={comp.label}
                description={comp.description}
                onClick={() => handleCompClick(comp.id)}
              />
            ))}
          </div>
        </section>
      </main>
    )
  }

  // ── Sub-categories & standalone pages: vertical infinite scroll ────────────
  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
      <PageHeader title={data.title} description={data.description} />
      {data.categorySlug && (
        <InfiniteArticleList categorySlug={data.categorySlug} title={data.title} />
      )}
    </main>
  )
}
