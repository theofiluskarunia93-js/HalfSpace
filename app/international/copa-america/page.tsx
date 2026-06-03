import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspacesport.com"
  const title = "Copa America | HalfSpace"
  const description = "Berita dan update terbaru Copa America."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/international/copa-america`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/international/copa-america`,
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
      title="Copa America"
      description="Hasrat sepak bola Amerika Selatan. Berita, hasil, dan analisis Copa America."
      categorySlug="copa-america"
      badgeLabel="International"
    />
  )
}
