import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "Liga 1 Indonesia - HalfSpace",
  description: "Berita dan update terbaru Liga 1 Indonesia.",
}

export default function Liga1Page() {
  return (
    <LeaguePage
      title="Liga 1 Indonesia"
      description="Liga sepak bola profesional tertinggi di Indonesia. Berita, hasil, dan analisis klub-klub Liga 1."
      categorySlug="liga1"
    />
  )
}
