import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "Serie A - HalfSpace",
  description: "Berita dan update terbaru Serie A Italia.",
}

export default function SerieAPage() {
  return (
    <LeaguePage
      title="Serie A"
      description="Drama sepak bola Italia yang khas. Berita, analisis taktik, dan update terbaru dari liga Calcio."
      categorySlug="serie-a"
      badgeLabel="Europe"
    />
  )
}
