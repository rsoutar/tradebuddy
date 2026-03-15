import { redirect } from '@tanstack/react-router'
import { getViewer, type LineUserProfile } from './session'

export type ProtectedNavId = 'dashboard' | 'bots' | 'backtest' | 'history' | 'ai'

export const protectedNavigationItems: Array<{
  id: ProtectedNavId
  label: string
  icon: string
  to?: string
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'solar:widget-5-linear', to: '/dashboard' },
  { id: 'bots', label: 'Active Bots', icon: 'solar:cpu-linear', to: '/bots' },
  { id: 'backtest', label: 'Backtesting', icon: 'solar:chart-square-linear', to: '/backtest' },
  { id: 'history', label: 'Trade History', icon: 'solar:history-linear', to: '/history' },
  { id: 'ai', label: 'AI Research', icon: 'solar:stars-line-duotone', to: '/ai' },
]

export const protectedConnectionItems = [
  { id: 'exchanges', label: 'Exchanges', icon: 'solar:wallet-money-linear' },
  { id: 'api', label: 'API Keys', icon: 'solar:key-square-linear' },
]

export const protectedSystemItems = [
  { id: 'logs', label: 'System Logs', icon: 'solar:document-text-linear' },
  { id: 'settings', label: 'Settings', icon: 'solar:settings-linear', to: '/onboarding' },
]

const protectedRoutePaths = new Set(['/dashboard', '/backtest', '/history', '/bots', '/ai'])

export function isProtectedPathname(pathname: string) {
  return protectedRoutePaths.has(pathname)
}

export function getViewerSubtitle(viewer: LineUserProfile) {
  return viewer.statusMessage || `@${viewer.userId.slice(0, 10)}`
}

export async function requireAuthenticatedViewer() {
  const viewer = await getViewer()

  if (!viewer.authenticated || !viewer.user) {
    // @ts-expect-error - Router type issue
    throw redirect({ to: '/' })
  }

  return viewer.user
}
