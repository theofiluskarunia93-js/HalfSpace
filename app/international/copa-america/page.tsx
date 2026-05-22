import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "Copa America - HalfSpace",
  description: "Berita dan update terbaru Copa America.",
}

export default function CopaAmericaPage() {
  return (
    <LeaguePage
      title="Copa America"
      description="Turnamen sepak bola tertua di dunia. Berita dan analisis dari kompetisi timnas Amerika Selatan."
      categorySlug="copa-america"
      badgeLabel="International"
    />
  )
}
