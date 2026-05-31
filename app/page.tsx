// Server Component — tidak ada "use client" di sini.
// Hanya render HomeClient yang mengandung logika interaktif.
import { HomeClient } from "@/components/home-client"

export default function Home() {
  return <HomeClient />
}
