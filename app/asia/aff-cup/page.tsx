import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "AFF Cup - HalfSpace",
  description: "Berita dan update terbaru AFF Cup.",
}

export default function AffCupPage() {
  return (
    <LeaguePage
      title="AFF Cup"
      description="Kejuaraan sepak bola Asia Tenggara. Berita dan analisis Piala AFF, tempat Timnas Indonesia berjuang."
      categorySlug="aff-cup"
      badgeLabel="Asia"
    />
  )
}
