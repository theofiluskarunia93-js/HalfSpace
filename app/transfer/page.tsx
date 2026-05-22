import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "Transfer News - HalfSpace",
  description: "Rumor dan berita transfer pemain terkini dari seluruh dunia.",
}

export default function TransferPage() {
  return (
    <LeaguePage
      title="Transfer News"
      description="Rumor, negosiasi, dan transfer resmi terbaru dari bursa transfer sepak bola dunia."
      categorySlug="transfer"
    />
  )
}
