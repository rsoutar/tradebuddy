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
        content: 'Phase 1 foundation for a BTC/USDT trading bot with strategy and AI tooling.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">O</span>
            <div>
              <p className="eyebrow">Oscar</p>
              <h1>Trading Bot</h1>
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
          <div className="sidebar-card">
            <p className="eyebrow">Phase 1</p>
            <strong>Architecture + prototypes</strong>
            <p>Backend and frontend foundations are ready for live API and execution work.</p>
          </div>
        </aside>
        <main className="main-content">
          <Outlet />
        </main>
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
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

