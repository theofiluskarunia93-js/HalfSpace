import { LeaguePage } from "@/components/league-page"

export const metadata = {
  title: "UEFA Euro - HalfSpace",
  description: "Berita dan update terbaru UEFA European Championship.",
}

export default function EuroPage() {
  return (
    <LeaguePage
      title="UEFA Euro"
      description="Kejuaraan Eropa — timnas terbaik benua biru bersaing memperebutkan mahkota Eropa."
      categorySlug="euro"
      badgeLabel="International"
    />
  )
}
