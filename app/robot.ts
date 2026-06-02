import type { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://halfspacesport.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Semua crawler boleh akses halaman publik
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/admin/dashboard",
          "/api/",
        ],
      },
      {
        // Blokir GPTBot (OpenAI) dari crawl konten
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        // Blokir Google-Extended (Gemini training data)
        userAgent: "Google-Extended",
        disallow: "/",
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
