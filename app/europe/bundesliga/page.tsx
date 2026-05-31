import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title = "Bundesliga | HalfSpace"
  const description = "Berita dan update terbaru Bundesliga Jerman."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/europe/bundesliga`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/europe/bundesliga`,
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
      title="Bundesliga"
      description="Keunggulan sepak bola Jerman. Berita, transfer, dan analisis dari liga yang terkenal dengan atmosfer stadionnya."
      categorySlug="bundesliga"
      badgeLabel="Europe"
    />
  )
}
