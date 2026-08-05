import 'server-only'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { SITE_SETTINGS_DEFAULTS, type SiteSettingsMap } from '@/lib/site-settings-shared'

export type { SiteSettingsMap } from '@/lib/site-settings-shared'
export { settingsToUi, uiToSettings, SITE_SETTINGS_DEFAULTS } from '@/lib/site-settings-shared'

const DEFAULTS = {
  ...SITE_SETTINGS_DEFAULTS,
  google_analytics_id:
    SITE_SETTINGS_DEFAULTS.google_analytics_id || process.env.NEXT_PUBLIC_GA_ID || '',
}

export async function getSiteSettings(): Promise<SiteSettingsMap> {
  try {
    const supabase = await createClient()
    if (!supabase) return { ...DEFAULTS }
    const { data, error } = await supabase.from('site_settings').select('key, value')
    if (error || !data?.length) return { ...DEFAULTS }
    const map: SiteSettingsMap = { ...DEFAULTS }
    for (const row of data as { key: string; value: string | null }[]) {
      if (row.key && row.value != null) map[row.key] = row.value
    }
    return map
  } catch {
    return { ...DEFAULTS }
  }
}

export async function getSiteSettingsAdmin(): Promise<SiteSettingsMap> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from('site_settings').select('key, value')
  if (error) throw new Error(error.message)
  const map: SiteSettingsMap = { ...DEFAULTS }
  for (const row of (data ?? []) as { key: string; value: string | null }[]) {
    if (row.key) map[row.key] = row.value ?? ''
  }
  return map
}

export async function upsertSiteSettings(entries: SiteSettingsMap): Promise<void> {
  const admin = await createAdminClient()
  const rows = Object.entries(entries).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await admin.from('site_settings').upsert(rows, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}
