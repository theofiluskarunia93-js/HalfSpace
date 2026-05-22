import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "Premier League - HalfSpace",
  description: "Berita dan update terbaru Premier League Inggris.",
}

export default function PremierLeaguePage() {
  return (
    <LeaguePage
      title="Premier League"
      description="Liga paling ditonton di dunia. Berita, klasemen, dan analisis terbaru dari liga Inggris."
      categorySlug="premier-league"
      badgeLabel="Europe"
    />
  )
}
