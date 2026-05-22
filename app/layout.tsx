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

export const metadata: Metadata = {
  title: 'HalfSpace - Home to Sport Enthusiast',
  description: 'Your ultimate destination for sports news, live scores, and league standings. From fans to fans.',
  keywords: ['sports', 'football', 'soccer', 'live scores', 'league standings', 'transfers'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${inter.variable} ${oswald.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
