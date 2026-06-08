import type { Metadata } from "next"
import { NavbarStandalone } from "@/components/navbar-standalone"
import { FooterStandalone } from "@/components/footer-standalone"
import { InfiniteArticleList } from "@/components/infinite-article-list"

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title       = "Sejarah Sepak Bola | HalfSpace"
  const description = "Kisah-kisah bersejarah dan momen ikonik dalam dunia sepak bola."
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/sejarah` },
    openGraph: {
      title, description, type: "website",
      url: `${BASE_URL}/sejarah`, siteName: "HalfSpace",
      images: [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630, alt: "HalfSpace" }],
    },
    twitter: {
      card: "summary_large_image", title, description,
      images: [`${BASE_URL}/og-default.jpg`],
    },
  }
}

export default function SejarahPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavbarStandalone />
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1
            className="mb-4 text-4xl font-black uppercase tracking-tight text-foreground md:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            Sejarah
          </h1>
          <div
            className="h-1 w-20 bg-primary"
            style={{ boxShadow: "0 0 10px oklch(0.87 0.29 142 / 0.6)" }}
          />
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Kisah-kisah bersejarah dan momen ikonik dalam dunia sepak bola.
          </p>
        </div>

        {/* Articles — infinite scroll + load more */}
        <InfiniteArticleList categorySlug="sejarah" title="Sejarah" />
      </main>
      <FooterStandalone />
    </div>
  )
}
