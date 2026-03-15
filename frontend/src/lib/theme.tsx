import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import i18n from './i18n'

type ThemeMode = 'system' | 'light' | 'dark'
type Language = 'en' | 'th'

interface Settings {
  theme: ThemeMode
  notifications: boolean
  language: Language
  timezone: string
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  notifications: true,
  language: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

const STORAGE_KEY = 'nexus-settings'

interface ThemeContextValue {
  settings: Settings
  effectiveTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
  setNotifications: (enabled: boolean) => void
  setLanguage: (language: Language) => void
  setTimezone: (timezone: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [mounted, setMounted] = useState(false)

  // Load settings on mount
  useEffect(() => {
    const loadedSettings = loadSettings()
    setSettings(loadedSettings)
    // Sync i18n language with loaded settings
    if (loadedSettings.language && i18n.language !== loadedSettings.language) {
      i18n.changeLanguage(loadedSettings.language)
    }
    setMounted(true)
  }, [])

  // Calculate effective theme
  const effectiveTheme: 'light' | 'dark' =
    settings.theme === 'system' ? getSystemTheme() : settings.theme

  // Apply theme class to document
  useEffect(() => {
    if (!mounted) return

    const body = document.body
    body.classList.remove('dark-dashboard-body', 'light-dashboard-body')
    body.classList.add(`${effectiveTheme}-dashboard-body`)
  }, [effectiveTheme, mounted])

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted || settings.theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      // Force re-render to update effectiveTheme
      setSettings((s) => ({ ...s }))
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [settings.theme, mounted])

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...updates }
      saveSettings(next)
      return next
    })
  }, [])

  const setTheme = useCallback((theme: ThemeMode) => {
    updateSettings({ theme })
  }, [updateSettings])

  const setNotifications = useCallback((notifications: boolean) => {
    updateSettings({ notifications })
  }, [updateSettings])

  const setLanguage = useCallback((language: Language) => {
    updateSettings({ language })
    // Sync i18n language
    if (i18n.language !== language) {
      i18n.changeLanguage(language)
    }
  }, [updateSettings])

  const setTimezone = useCallback((timezone: string) => {
    updateSettings({ timezone })
  }, [updateSettings])

  const value: ThemeContextValue = {
    settings,
    effectiveTheme,
    setTheme,
    setNotifications,
    setLanguage,
    setTimezone,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

// Hook for components that need to know if theme is ready (to prevent hydration mismatch)
export function useThemeMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}
