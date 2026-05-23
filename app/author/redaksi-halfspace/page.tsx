import type { Metadata } from "next"
import { AuthorProfilePage } from "@/components/author-profile-page"

export const metadata: Metadata = {
  title: "Redaksi HalfSpace | Penulis & Editor",
  description:
    "Tim jurnalis dan editor HalfSpace yang berdedikasi menghadirkan berita sepak bola terpercaya, mendalam, dan aktual untuk para penggemar di seluruh Indonesia.",
  openGraph: {
    title: "Redaksi HalfSpace | Penulis & Editor",
    description:
      "Tim jurnalis dan editor HalfSpace yang berdedikasi menghadirkan berita sepak bola terpercaya, mendalam, dan aktual untuk para penggemar di seluruh Indonesia.",
    type: "profile",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Logo HalfSpace",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Redaksi HalfSpace",
    description: "Tim jurnalis sepak bola terpercaya.",
  },
  alternates: {
    canonical: "/author/redaksi-halfspace",
  },
}

export default function AuthorPage() {
  return <AuthorProfilePage />
}
