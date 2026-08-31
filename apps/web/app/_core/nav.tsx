'use client'

import { usePathname } from 'next/navigation'

/**
 * Six destinations, with AVA first.
 *
 * Workstreams stay in the list and stop being the entry point: they remain a
 * real context boundary, and they are no longer the product's mental model.
 */
const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/live', label: 'Live' },
  { href: '/today', label: 'Today' },
  { href: '/ask', label: 'Ask AVA' },
  { href: '/workstreams', label: 'Workstreams' },
  { href: '/memory', label: 'Memory' },
] as const

export function Nav() {
  const path = usePathname()
  const active = (href: string): boolean =>
    href === '/' ? path === '/' : path.startsWith(href)

  return (
    <nav aria-label="Primary">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined}>
          {l.label}
        </a>
      ))}
    </nav>
  )
}
