import type { Metadata } from "next"
import { LeaguePage } from "@/components/league-page"

export async function generateMetadata(): Promise<Metadata> {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://halfspace.id"
  const title = "Liga 1 Indonesia | HalfSpace"
  const description = "Berita dan update terbaru Liga 1 Indonesia."

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/liga1`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/liga1`,
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
      title="Liga 1 Indonesia"
      description="Liga sepak bola profesional tertinggi di Indonesia. Berita, hasil, dan analisis klub-klub Liga 1."
      categorySlug="liga1"
      
    />
  )
}
