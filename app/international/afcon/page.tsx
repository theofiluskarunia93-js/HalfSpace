import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "AFCON - HalfSpace",
  description: "Berita dan update terbaru Africa Cup of Nations.",
}

export default function AfconPage() {
  return (
    <LeaguePage
      title="Africa Cup of Nations"
      description="Kompetisi timnas paling bergengsi di Afrika. Berita dan analisis dari AFCON."
      categorySlug="afcon"
      badgeLabel="International"
    />
  )
}
