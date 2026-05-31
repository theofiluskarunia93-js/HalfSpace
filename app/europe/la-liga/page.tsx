import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title = "La Liga | HalfSpace"
  const description = "Berita dan update terbaru La Liga Spanyol."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/europe/la-liga`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/europe/la-liga`,
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
      title="La Liga"
      description="Sepak bola Spanyol di level tertinggi. Berita terbaru dari liga yang melahirkan pemain-pemain terbaik dunia."
      categorySlug="la-liga"
      badgeLabel="Europe"
    />
  )
}
