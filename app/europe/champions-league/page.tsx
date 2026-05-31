import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title = "UEFA Champions League | HalfSpace"
  const description = "Berita, analisis, dan update terbaru UEFA Champions League."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/europe/champions-league`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/europe/champions-league`,
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
      title="UEFA Champions League"
      description="Kompetisi klub paling bergengsi di Eropa. Berita, hasil pertandingan, dan analisis terbaru."
      categorySlug="champions-league"
      badgeLabel="Europe"
    />
  )
}
