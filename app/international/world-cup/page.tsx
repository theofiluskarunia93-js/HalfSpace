import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "FIFA World Cup - HalfSpace",
  description: "Berita dan update terbaru FIFA World Cup.",
}

export default function WorldCupPage() {
  return (
    <LeaguePage
      title="FIFA World Cup"
      description="Event olahraga terbesar di dunia. Berita, analisis, dan semua yang perlu kamu tahu tentang Piala Dunia."
      categorySlug="world-cup"
      badgeLabel="International"
    />
  )
}
