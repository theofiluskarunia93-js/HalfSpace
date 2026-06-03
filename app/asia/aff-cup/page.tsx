import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspacesport.com"
  const title = "AFF Cup | HalfSpace"
  const description = "Berita dan update terbaru AFF Cup."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/asia/aff-cup`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/asia/aff-cup`,
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
      title="AFF Cup"
      description="Kejuaraan sepak bola Asia Tenggara. Berita terbaru dari turnamen ASEAN Football Federation."
      categorySlug="aff-cup"
      badgeLabel="Asia"
    />
  )
}
