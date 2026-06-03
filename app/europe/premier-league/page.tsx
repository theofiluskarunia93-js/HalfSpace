import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspacesport.com"
  const title = "Premier League | HalfSpace"
  const description = "Berita dan update terbaru Premier League Inggris."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/europe/premier-league`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/europe/premier-league`,
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
      title="Premier League"
      description="Liga paling ditonton di dunia. Berita, klasemen, dan analisis terbaru dari liga Inggris."
      categorySlug="premier-league"
      badgeLabel="Europe"
    />
  )
}
