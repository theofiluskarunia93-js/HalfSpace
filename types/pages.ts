// Sumber tunggal untuk tipe navigasi SPA.
// Diimport oleh: navbar.tsx, footer.tsx, public-website.tsx,
//               page-content.tsx, home-client.tsx

export type AppView = "public" | "admin"

export type PublicPage =
  | "home"
  | "trending"
  | "standings"
  | "europe"
  | "international"
  | "asia"
  | "liga1"
  | "champions-league"
  | "premier-league"
  | "la-liga"
  | "bundesliga"
  | "serie-a"
  | "world-cup"
  | "euro"
  | "copa-america"
  | "afcon"
  | "afc-cup"
  | "aff-cup"
  | "transfer"
  | "about"
  | "contact"
