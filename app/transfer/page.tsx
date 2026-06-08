import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title       = "Transfer News | HalfSpace"
  const description = "Rumor dan berita transfer pemain terkini dari seluruh dunia."
  return {
    title, description,
    alternates: { canonical: `${BASE_URL}/transfer` },
    openGraph: { title, description, type: "website", url: `${BASE_URL}/transfer`, siteName: "HalfSpace", images: [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630, alt: "HalfSpace" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${BASE_URL}/og-default.jpg`] },
  }
}

export default function Page() {
  return (
    <LeaguePage
      title="Transfer News"
      description="Rumor, negosiasi, dan transfer resmi terbaru dari bursa transfer sepak bola dunia."
      categorySlug="transfer"
    />
  )
}
