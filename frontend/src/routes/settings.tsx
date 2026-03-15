import { createFileRoute } from '@tanstack/react-router'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { ProtectedMenuButton, ProtectedShell } from '../components/protected-shell'
import { requireAuthenticatedViewer, type ProtectedNavId } from '../lib/protected-route'
import { useTheme } from '../lib/theme'
import { getViewer } from '../lib/session'

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    await requireAuthenticatedViewer()
  },
  loader: () => getViewer(),
  component: SettingsPage,
})

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const timezones = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
]

const languages = [
  { value: 'en', label: 'English' },
  { value: 'th', label: 'ไทย' },
]

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/60 bg-zinc-950/30 p-6">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-900">
          <Icon icon={icon} width={24} height={24} className="text-zinc-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
          {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function ThemeCard({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex flex-col items-center gap-3 rounded-xl border p-4 transition-all',
        active
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900'
      )}
    >
      <div
        className={cx(
          'flex h-14 w-14 items-center justify-center rounded-full',
          active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
        )}
      >
        <Icon icon={icon} width={28} height={28} />
      </div>
      <span className={cx('text-sm font-medium', active ? 'text-indigo-300' : 'text-zinc-400')}>
        {label}
      </span>
      {active && (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500">
          <Icon icon="solar:check-linear" width={12} height={12} className="text-white" />
        </div>
      )}
    </button>
  )
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-7 w-12 rounded-full transition-colors',
        checked ? 'bg-indigo-500' : 'bg-zinc-700'
      )}
    >
      <span
        className={cx(
          'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
          checked ? 'left-[calc(100%-1.5rem)]' : 'left-1'
        )}
      />
    </button>
  )
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 pr-10 text-sm text-zinc-300 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon
        icon="solar:alt-arrow-down-linear"
        width={16}
        height={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
      />
    </div>
  )
}

function SettingsPage() {
  const viewer = Route.useLoaderData()
  const { settings, setTheme, setNotifications, setLanguage, setTimezone } = useTheme()
  const { t, i18n } = useTranslation()

  const handleLanguageChange = (value: string) => {
    setLanguage(value as 'en' | 'th')
    i18n.changeLanguage(value)
  }

  return (
    <ProtectedShell
      activeNavId={'settings' as ProtectedNavId}
      viewer={viewer.user!}
      header={({ openMenu }) => (
        <div className="flex items-center gap-4">
          <ProtectedMenuButton onClick={openMenu} />
          <h1 className="text-xl font-semibold text-zinc-100">{t('settings.title')}</h1>
        </div>
      )}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">{t('settings.title')}</h1>
          <p className="mt-2 text-zinc-500">{t('settings.description')}</p>
        </div>

        {/* Theme Section */}
        <SettingsSection
          icon="solar:palette-linear"
          title={t('appearance.title')}
          description={t('appearance.description')}
        >
          <div className="grid grid-cols-3 gap-4">
            <ThemeCard
              active={settings.theme === 'system'}
              icon="solar:monitor-linear"
              label={t('appearance.system')}
              onClick={() => setTheme('system')}
            />
            <ThemeCard
              active={settings.theme === 'light'}
              icon="solar:sun-linear"
              label={t('appearance.light')}
              onClick={() => setTheme('light')}
            />
            <ThemeCard
              active={settings.theme === 'dark'}
              icon="solar:moon-linear"
              label={t('appearance.dark')}
              onClick={() => setTheme('dark')}
            />
          </div>
          <p className="mt-4 text-xs text-zinc-600">{t('appearance.systemNote')}</p>
        </SettingsSection>

        {/* Notifications Section */}
        <SettingsSection
          icon="solar:bell-linear"
          title={t('notifications.title')}
          description={t('notifications.description')}
        >
          <div className="flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4">
            <div className="flex items-center gap-3">
              <Icon
                icon={settings.notifications ? 'solar:bell-linear' : 'solar:bell-off-linear'}
                width={20}
                height={20}
                className="text-zinc-500"
              />
              <div>
                <p className="font-medium text-zinc-300">{t('notifications.pushNotifications')}</p>
                <p className="text-sm text-zinc-600">{t('notifications.pushDescription')}</p>
              </div>
            </div>
            <ToggleSwitch
              checked={settings.notifications}
              onChange={setNotifications}
            />
          </div>
        </SettingsSection>

        {/* Regional Settings */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Language Section */}
          <SettingsSection
            icon="solar:globe-linear"
            title={t('language.title')}
            description={t('language.description')}
          >
            <SelectField
              value={settings.language}
              onChange={handleLanguageChange}
              options={languages}
            />
          </SettingsSection>

          {/* Timezone Section */}
          <SettingsSection
            icon="solar:clock-circle-linear"
            title={t('timezone.title')}
            description={t('timezone.description')}
          >
            <SelectField
              value={settings.timezone}
              onChange={setTimezone}
              options={timezones}
            />
          </SettingsSection>
        </div>

        {/* Current Settings Summary */}
        <section className="rounded-2xl border border-zinc-800/60 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            <Icon icon="solar:info-circle-linear" width={16} height={16} />
            {t('currentConfig.title')}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-600">{t('currentConfig.theme')}</p>
              <p className="mt-1 font-medium capitalize text-zinc-300">{t(`appearance.${settings.theme}`)}</p>
            </div>
            <div className="rounded-lg bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-600">{t('currentConfig.notifications')}</p>
              <p className="mt-1 font-medium text-zinc-300">
                {settings.notifications ? t('notifications.enabled') : t('notifications.disabled')}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-600">{t('currentConfig.language')}</p>
              <p className="mt-1 font-medium text-zinc-300">
                {t(`languages.${settings.language}`)}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-950/50 p-3">
              <p className="text-xs text-zinc-600">{t('currentConfig.timezone')}</p>
              <p className="mt-1 font-medium text-zinc-300">{settings.timezone}</p>
            </div>
          </div>
        </section>

        {/* Version Info */}
        <div className="border-t border-zinc-800/60 pt-6 text-center">
          <p className="text-sm text-zinc-600">
            {t('version.title')} <span className="text-zinc-500">v2.4</span>
          </p>
          <p className="mt-1 text-xs text-zinc-700">
            {t('version.autoSave')}
          </p>
        </div>
      </div>
    </ProtectedShell>
  )
}
