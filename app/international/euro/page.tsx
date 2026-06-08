import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title       = "UEFA Euro | HalfSpace"
  const description = "Berita dan update terbaru UEFA European Championship."
  return {
    title, description,
    alternates: { canonical: `${BASE_URL}/international/euro` },
    openGraph: { title, description, type: "website", url: `${BASE_URL}/international/euro`, siteName: "HalfSpace", images: [{ url: `${BASE_URL}/og-default.jpg`, width: 1200, height: 630, alt: "HalfSpace" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${BASE_URL}/og-default.jpg`] },
  }
}

export default function Page() {
  return (
    <LeaguePage
      title="UEFA Euro"
      description="Kejuaraan tim nasional Eropa terbaik. Berita, hasil pertandingan, dan analisis Euro."
      categorySlug="euro"
      badgeLabel="International"
    />
  )
}
