import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "Bundesliga - HalfSpace",
  description: "Berita dan update terbaru Bundesliga Jerman.",
}

export default function BundesligaPage() {
  return (
    <LeaguePage
      title="Bundesliga"
      description="Keunggulan sepak bola Jerman. Berita, transfer, dan analisis dari liga yang terkenal dengan atmosfer stadionnya."
      categorySlug="bundesliga"
      badgeLabel="Europe"
    />
  )
}
