import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "AFC Cup - HalfSpace",
  description: "Berita dan update terbaru AFC Cup.",
}

export default function AfcCupPage() {
  return (
    <LeaguePage
      title="AFC Cup"
      description="Kompetisi klub Asia. Berita dan analisis dari gelaran AFC Cup."
      categorySlug="afc-cup"
      badgeLabel="Asia"
    />
  )
}
