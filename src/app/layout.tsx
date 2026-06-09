import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './bones/registry'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Faultline',
  description: 'Imported Faultline 3D map feature',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className={outfit.className}>{children}</body>
    </html>
  )
}
