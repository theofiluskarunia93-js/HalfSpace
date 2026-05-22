import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "La Liga - HalfSpace",
  description: "Berita dan update terbaru La Liga Spanyol.",
}

export default function LaLigaPage() {
  return (
    <LeaguePage
      title="La Liga"
      description="Sepak bola Spanyol di level tertinggi. Berita terbaru dari liga yang melahirkan pemain-pemain terbaik dunia."
      categorySlug="la-liga"
      badgeLabel="Europe"
    />
  )
}
