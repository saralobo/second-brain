import './globals.css'
import type { ReactNode } from 'react'
import { Nav } from './_core/nav'

export const metadata = {
  title: 'AVA',
  description: 'A personal cognitive system.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="wrap">
            <span className="brand">AVA</span>
            <Nav />
            <span className="scope-badge">V0 · local only</span>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  )
}
