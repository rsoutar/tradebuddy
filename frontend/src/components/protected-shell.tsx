import { useState, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { Link } from '@tanstack/react-router'
import { getViewerSubtitle, protectedConnectionItems, protectedNavigationItems, protectedSystemItems, type ProtectedNavId } from '../lib/protected-route'
import { logoutViewer, type LineUserProfile } from '../lib/session'

type ProtectedShellProps = {
  activeNavId: ProtectedNavId
  children: ReactNode
  contentClassName?: string
  header: (controls: { openMenu: () => void }) => ReactNode
  viewer: LineUserProfile
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function SidebarItem({
  active = false,
  item,
  onClick,
}: {
  active?: boolean
  item: { label: string; icon: string; to?: string; badge?: string }
  onClick?: () => void
}) {
  const content = (
    <>
      <Icon icon={item.icon} width={18} height={18} className="shrink-0" />
      <span>{item.label}</span>
      {item.badge ? (
        <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
          {item.badge}
        </span>
      ) : null}
    </>
  )

  const classes = cx(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    active
      ? 'bg-zinc-800/50 text-zinc-100'
      : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-100',
  )

  if (item.to) {
    return (
      <Link className={classes} to={item.to} onClick={onClick}>
        {content}
      </Link>
    )
  }

  return (
    <button className={cx(classes, 'w-full text-left')} type="button" onClick={onClick}>
      {content}
    </button>
  )
}

export function ProtectedMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="text-zinc-400 transition-colors hover:text-zinc-100 md:hidden"
      type="button"
      onClick={onClick}
    >
      <Icon icon="solar:hamburger-menu-linear" width={22} height={22} />
    </button>
  )
}

export function ProtectedShell({
  activeNavId,
  children,
  contentClassName,
  header,
  viewer,
}: ProtectedShellProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const viewerSubtitle = getViewerSubtitle(viewer)

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
    <div
      className="flex h-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300 antialiased selection:bg-zinc-800 selection:text-zinc-100"
      style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #18181b 0%, #09090b 100%)' }}
    >
      {isMenuOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          type="button"
          onClick={() => setIsMenuOpen(false)}
        />
      ) : null}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-zinc-800/60 bg-zinc-950/50 backdrop-blur-xl transition-transform duration-300 md:static md:z-20 md:translate-x-0',
          isMenuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center border-b border-zinc-800/60 px-6">
          <span className="text-lg font-medium uppercase tracking-tighter text-zinc-100">Nexus</span>
          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-normal text-zinc-400">
            v2.4
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 text-sm font-normal">
          <p className="mb-2 mt-4 px-3 text-xs font-normal uppercase tracking-widest text-zinc-500">
            Platform
          </p>
          {protectedNavigationItems.map((item) => (
            <SidebarItem
              active={item.id === activeNavId}
              item={item}
              key={item.id}
              onClick={() => setIsMenuOpen(false)}
            />
          ))}

          <p className="mb-2 mt-8 px-3 text-xs font-normal uppercase tracking-widest text-zinc-500">
            Connections
          </p>
          {protectedConnectionItems.map((item) => (
            <SidebarItem item={item} key={item.id} onClick={() => setIsMenuOpen(false)} />
          ))}

          <p className="mb-2 mt-8 px-3 text-xs font-normal uppercase tracking-widest text-zinc-500">
            System
          </p>
          {protectedSystemItems.map((item) => (
            <SidebarItem item={item} key={item.id} onClick={() => setIsMenuOpen(false)} />
          ))}
        </nav>

        <div className="relative border-t border-zinc-800/60 p-4">
          {isProfileMenuOpen ? (
            <button
              aria-label="Close profile menu"
              className="fixed inset-0 z-20"
              type="button"
              onClick={() => setIsProfileMenuOpen(false)}
            />
          ) : null}

          {isProfileMenuOpen ? (
            <div className="absolute bottom-[calc(100%-0.5rem)] left-4 right-4 z-30 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50">
              <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-4">
                {viewer.pictureUrl ? (
                  <img
                    alt={`${viewer.displayName} avatar`}
                    className="h-11 w-11 rounded-xl object-cover ring-1 ring-zinc-700/70"
                    src={viewer.pictureUrl}
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-100 ring-1 ring-zinc-700/70">
                    {viewer.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{viewer.displayName}</p>
                  <p className="truncate text-xs text-zinc-500">{viewerSubtitle}</p>
                </div>
              </div>

              <div className="p-2">
                {[
                  { label: 'Account', icon: 'solar:user-circle-linear' },
                  { label: 'Billing', icon: 'solar:wallet-money-linear' },
                  { label: 'Notifications', icon: 'solar:bell-linear' },
                ].map((item) => (
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-100"
                    key={item.label}
                    type="button"
                    onClick={() => setIsProfileMenuOpen(false)}
                  >
                    <Icon icon={item.icon} width={17} height={17} className="text-zinc-500" />
                    <span>{item.label}</span>
                  </button>
                ))}

                <div className="my-2 border-t border-zinc-800/80" />

                <button
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:bg-rose-500/10 hover:text-rose-200"
                  disabled={isLoggingOut}
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false)
                    void handleLogout()
                  }}
                >
                  <Icon icon="solar:logout-2-linear" width={17} height={17} className="text-zinc-500" />
                  <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
                </button>
              </div>
            </div>
          ) : null}

          <button
            aria-expanded={isProfileMenuOpen}
            className="relative z-30 flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
            disabled={isLoggingOut}
            type="button"
            onClick={() => {
              setIsProfileMenuOpen((current) => !current)
            }}
          >
            {viewer.pictureUrl ? (
              <img
                alt={`${viewer.displayName} avatar`}
                className="h-10 w-10 rounded-xl object-cover ring-1 ring-zinc-700/70"
                src={viewer.pictureUrl}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-100 ring-1 ring-zinc-700/70">
                {viewer.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-zinc-100">{viewer.displayName}</p>
              <p className="truncate text-xs text-zinc-500">{viewerSubtitle}</p>
            </div>
            <Icon
              icon="solar:menu-dots-bold"
              width={18}
              height={18}
              className={cx(
                'shrink-0 text-zinc-500 transition-colors',
                isProfileMenuOpen && 'text-zinc-300',
              )}
            />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-transparent">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-zinc-800/60 bg-zinc-950/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          {header({
            openMenu: () => setIsMenuOpen(true),
          })}
        </header>

        <div className={cx('flex-1 space-y-8 overflow-y-auto p-4 sm:p-6 lg:p-8', contentClassName)}>
          {children}
        </div>
      </main>
    </div>
  )
}
