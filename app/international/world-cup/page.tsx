import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title = "FIFA World Cup | HalfSpace"
  const description = "Berita dan update terbaru FIFA World Cup."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/international/world-cup`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/international/world-cup`,
      siteName: "HalfSpace",
      images: [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630, alt: "HalfSpace" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/og-default.jpg`],
    },
  }
}

export default function Page() {
  return (
    <LeaguePage
      title="FIFA World Cup"
      description="Event olahraga terbesar di dunia. Berita, analisis, dan semua yang perlu kamu tahu tentang Piala Dunia."
      categorySlug="world-cup"
      badgeLabel="International"
    />
  )
}
