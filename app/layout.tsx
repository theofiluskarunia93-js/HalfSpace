import type { Metadata } from 'next'
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className="dark bg-background">
      <body className={`${inter.variable} ${oswald.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
