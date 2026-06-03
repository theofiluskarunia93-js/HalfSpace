import type { Metadata, Viewport } from 'next'
import { Inter, Oswald } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
})

const oswald = Oswald({ 
  subsets: ["latin"],
  variable: '--font-oswald',
})

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://halfspace.id'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'HalfSpace - Home to Sport Enthusiast',
    template: '%s | HalfSpace',
  },
  description: 'Your ultimate destination for sports news, live scores, and league standings. From fans to fans.',
  keywords: ['sports', 'football', 'soccer', 'live scores', 'league standings', 'transfers'],
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: BASE_URL,
    siteName: 'HalfSpace',
    title: 'HalfSpace - Home to Sport Enthusiast',
    description: 'Your ultimate destination for sports news, live scores, and league standings. From fans to fans.',
    images: [
      {
        url: `${BASE_URL}/og-default.jpg`,
        width: 1200,
        height: 630,
        alt: 'HalfSpace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@halfspaceid',
    creator: '@halfspaceid',
    title: 'HalfSpace - Home to Sport Enthusiast',
    description: 'Your ultimate destination for sports news, live scores, and league standings.',
    images: [`${BASE_URL}/og-default.jpg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
}

// ─── JSON-LD: WebSite + Organization schema ─────────────────────────────────
// Memberitahu Google: nama situs, URL, social profiles, dan sitelinks searchbox.
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "HalfSpace",
  url: BASE_URL,
  description: "Your ultimate destination for sports news, live scores, and league standings.",
  inLanguage: "id-ID",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
}

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "HalfSpace",
  url: BASE_URL,
  logo: {
    "@type": "ImageObject",
    url: `${BASE_URL}/og-default.jpg`,
    width: 1200,
    height: 630,
  },
  sameAs: [
    "https://twitter.com/halfspaceid",
    "https://instagram.com/halfspaceid",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "editorial",
    email: "redaksi@halfspace.id",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className="dark bg-background">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className={`${inter.variable} ${oswald.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
