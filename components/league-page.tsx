// Server Component — tidak ada "use client".
// Data artikel di-fetch di server saat build/revalidate, bukan di browser.
// Googlebot mendapat konten penuh, bukan shell kosong.
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import { GroupArticleGridServer } from "@/components/group-article-grid-server"

interface LeaguePageProps {
  title: string
  description: string
  categorySlug: string
  badgeLabel?: string
}

export async function LeaguePage({ title, description, categorySlug, badgeLabel }: LeaguePageProps) {
  return (
    <div className="min-h-screen bg-background">
      <NavbarStandalone />
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          {badgeLabel && (
            <span className="mb-4 inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              {badgeLabel}
            </span>
          )}
          <h1
            className="mb-4 text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            {title}
          </h1>
          <div className="h-1 w-20 bg-primary" style={{ boxShadow: "0 0 10px oklch(0.87 0.29 142 / 0.6)" }} />
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{description}</p>
        </div>

        {/* Articles — server-fetched, ISR */}
        <GroupArticleGridServer groupKey={categorySlug} title={title} />
      </main>
      <FooterStandalone />
    </div>
  )
}
