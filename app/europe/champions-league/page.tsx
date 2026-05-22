import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "UEFA Champions League - HalfSpace",
  description: "Berita, analisis, dan update terbaru UEFA Champions League.",
}

export default function ChampionsLeaguePage() {
  return (
    <LeaguePage
      title="UEFA Champions League"
      description="Kompetisi klub paling bergengsi di Eropa. Berita, hasil pertandingan, dan analisis terbaru."
      categorySlug="champions-league"
      badgeLabel="Europe"
    />
  )
}
