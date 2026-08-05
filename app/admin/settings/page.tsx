'use client'

import { useState, useEffect } from 'react'
import {
  Save,
  Globe,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  BarChart3,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { settingsToUi, uiToSettings, SITE_SETTINGS_DEFAULTS, type SiteSettingsMap } from '@/lib/site-settings-shared'

type UiSettings = ReturnType<typeof settingsToUi>

const defaultUi = settingsToUi(SITE_SETTINGS_DEFAULTS)

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<UiSettings>(defaultUi)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data: { settings?: SiteSettingsMap; error?: string }) => {
        if (data.settings) {
          setSettings(settingsToUi(data.settings))
        } else if (data.error) {
          setError(data.error)
        }
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: uiToSettings(settings) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-[#A9B8C6]">
        Loading settings...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#F6FAFC]">Site Settings</h1>
        <p className="text-sm text-[#A9B8C6]">
          Manage organization information, analytics, and contact details.
        </p>
      </div>

      {error && (
        <div className="bg-[#8DEBFF]/15 border border-[#8DEBFF]/35 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#8DEBFF] shrink-0 mt-0.5" />
          <p className="text-sm text-[#8DEBFF]">{error}</p>
        </div>
      )}

      {saved && (
        <div className="bg-[#8DEBFF]/15 border border-[#8DEBFF]/30 rounded-xl p-4 mb-6 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-[#8DEBFF]" />
          <p className="text-sm text-[#8DEBFF] font-medium">Settings saved successfully.</p>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
          <h2 className="text-lg font-semibold text-[#F6FAFC] mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#53D6FF]" />
            General Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                Organization Name
              </label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                Site Description
              </label>
              <textarea
                value={settings.siteDescription}
                onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                rows={3}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF] resize-y"
              />
            </div>
          </div>
        </div>

        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
          <h2 className="text-lg font-semibold text-[#F6FAFC] mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#53D6FF]" />
            Contact Information
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-[#A9B8C6]" />
                  Contact Email
                </label>
                <input
                  type="email"
                  value={settings.contactEmail}
                  onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-[#A9B8C6]" />
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={settings.contactPhone}
                  onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                Physical Address
              </label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                  Primary City
                </label>
                <input
                  type="text"
                  value={settings.primaryCity}
                  onChange={(e) => setSettings({ ...settings, primaryCity: e.target.value })}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                  Service Area
                </label>
                <input
                  type="text"
                  value={settings.serviceArea}
                  onChange={(e) => setSettings({ ...settings, serviceArea: e.target.value })}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
          <h2 className="text-lg font-semibold text-[#F6FAFC] mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#53D6FF]" />
            Analytics
          </h2>
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              Google Analytics 4 Measurement ID
            </label>
            <input
              type="text"
              value={settings.googleAnalyticsId}
              onChange={(e) => setSettings({ ...settings, googleAnalyticsId: e.target.value })}
              placeholder="G-XXXXXXXXXX"
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF] font-mono text-sm"
            />
            <p className="text-xs text-[#A9B8C6] mt-1">
              Enables GA4 tracking with cookie consent on the public site.
            </p>
          </div>
        </div>

        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
          <h2 className="text-lg font-semibold text-[#F6FAFC] mb-4">Social Media</h2>
          <div className="space-y-4">
            {(
              [
                ['socialFacebook', 'Facebook URL', 'https://facebook.com/forgedinthefire'],
                ['socialInstagram', 'Instagram URL', 'https://instagram.com/forgedinthefire'],
                ['socialTwitter', 'Twitter/X URL', 'https://twitter.com/forgedinthefire'],
              ] as const
            ).map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">{label}</label>
                <input
                  type="url"
                  value={settings[key]}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
