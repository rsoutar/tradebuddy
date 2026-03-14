/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: 'Oscar Trading Bot',
      },
      {
        name: 'description',
        content: 'A premium trading bot dashboard concept for strategy, onboarding, and AI guidance.',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@400;600;700;800&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <div className="app-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <div className="ambient ambient-c" />
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">O</span>
            <div>
              <p className="eyebrow">Oscar Trading Bot</p>
              <h1>Mobile-first exchange concept</h1>
            </div>
          </div>
          <nav className="nav">
            <Link to="/" activeProps={{ className: 'active' }} activeOptions={{ exact: true }}>
              Overview
            </Link>
            <Link to="/onboarding" activeProps={{ className: 'active' }}>
              Onboarding
            </Link>
            <Link to="/bots" activeProps={{ className: 'active' }}>
              Bot Prototypes
            </Link>
            <Link to="/ai" activeProps={{ className: 'active' }}>
              AI Workspace
            </Link>
          </nav>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Soft launch aesthetic
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
        <div className="bottom-note">
          <p className="eyebrow">Reference direction</p>
          <strong>Glossy trading cards, pastel lighting, and stacked mobile layouts.</strong>
        </div>
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="app-body">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
