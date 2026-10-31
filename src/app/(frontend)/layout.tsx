import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './styles.css'
import 'leaflet/dist/leaflet.css'

// page title and sharing details
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'TickWatch UK',
  description: 'Explore and report tick sightings across the UK.',
  openGraph: {
    title: 'TickWatch UK',
    description: 'Explore and report tick sightings across the UK.',
  },
}

// set up the shared frontend page layout
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#101917] text-[#f5f8f6] antialiased">
        <div id="root" tabIndex={-1}>{children}</div>
      </body>
    </html>
  )
}
