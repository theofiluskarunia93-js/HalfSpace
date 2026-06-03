import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspacesport.com"
  const title = "Serie A | HalfSpace"
  const description = "Berita dan update terbaru Serie A Italia."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/europe/serie-a`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/europe/serie-a`,
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
      title="Serie A"
      description="Drama sepak bola Italia yang khas. Berita, analisis taktik, dan update terbaru dari liga Calcio."
      categorySlug="serie-a"
      badgeLabel="Europe"
    />
  )
}
