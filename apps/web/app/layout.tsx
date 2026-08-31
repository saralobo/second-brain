import './globals.css'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'AVA V0',
  description: 'Capture and change loop - Batch 1',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="wrap">
            <strong>AVA</strong>
            <nav>
              <a href="/">Workstreams</a>
              <a href="/capture">Capture</a>
            </nav>
            <span className="meta" style={{ marginLeft: 'auto' }}>V0 · Batch 1 · local only</span>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  )
}
