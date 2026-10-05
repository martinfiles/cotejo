import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: 'cotejo' }

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <nav>
          <strong>cotejo</strong>
          <Link href="/">Cola</Link>
          <Link href="/metricas">Métricas</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
