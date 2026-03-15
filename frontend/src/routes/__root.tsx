/// <reference types="vite/client" />
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { getViewer, logoutViewer } from '../lib/session'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  loader: () => getViewer(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: 'Oscar Trading Bot',
      },
      {
        name: 'description',
        content: 'LINE-authenticated trading bot dashboard for paper trading, backtesting, and strategy metrics.',
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
  const viewer = Route.useLoaderData()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      await logoutViewer()
      window.location.assign('/')
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <RootDocument>
      <div className="app-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <div className="ambient ambient-c" />
        <header className="topbar">
          <Link className="brand" to="/">
            <span className="brand-mark">O</span>
            <div>
              <p className="eyebrow">Oscar Trading Bot</p>
              <h1>LINE-authenticated control room</h1>
            </div>
          </Link>
          <nav className="nav">
            <Link to="/" activeProps={{ className: 'active' }} activeOptions={{ exact: true }}>
              Home
            </Link>
            <Link to="/dashboard" activeProps={{ className: 'active' }}>
              Dashboard
            </Link>
            <Link to="/onboarding" activeProps={{ className: 'active' }}>
              Setup
            </Link>
            <Link to="/bots" activeProps={{ className: 'active' }}>
              Strategies
            </Link>
            <Link to="/ai" activeProps={{ className: 'active' }}>
              Research
            </Link>
          </nav>
          <div className="topbar-actions">
            <div className="status-pill">
              <span className="status-dot" aria-hidden="true" />
              {viewer.authenticated
                ? `Signed in as ${viewer.user?.displayName}`
                : viewer.lineConfigured
                  ? 'LINE Login ready'
                  : 'Demo login mode'}
            </div>
            {viewer.authenticated ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  void handleLogout()
                }}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Logging out...' : 'Log out'}
              </button>
            ) : (
              <Link className="secondary-link" to="/">
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
        <div className="bottom-note">
          <p className="eyebrow">Live focus</p>
          <strong>LINE sign-in, paper-trading controls, backtests, and bot health in one place.</strong>
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
