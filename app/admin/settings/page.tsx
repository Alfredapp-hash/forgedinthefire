'use client'

import { useState } from 'react'
import { 
  Save, 
  Globe, 
  Mail, 
  Phone, 
  MapPin,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    siteName: 'Forged in the Fire',
    siteDescription: 'A survivor-centered nonprofit organization supporting survivors of commercial sex trafficking through safe housing, trauma-informed care, and holistic support services.',
    contactEmail: 'tracys@forgedinthefireohio.org',
    contactPhone: '1 216-202-0786',
    address: '15728 Lorain Ave, Unit 146, Lorain County, OH 44111-5542',
    primaryCity: 'Lorain County',
    serviceArea: 'Lorain County and Northeast Ohio',
    socialFacebook: '',
    socialInstagram: '',
    socialTwitter: '',
  })

  const handleSave = async () => {
    setSaving(true)
    // In production, this would save to Supabase
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSaving(false)
    alert('Settings saved successfully!')
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1E1714]">Site Settings</h1>
        <p className="text-sm text-[#8B5E3C]">Manage organization information and contact details.</p>
      </div>

      <div className="space-y-6">
        {/* General Settings */}
        <div className="bg-white rounded-xl border border-[#3A2A24]/20 p-6">
          <h2 className="text-lg font-semibold text-[#1E1714] mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#1E6B73]" />
            General Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                Organization Name
              </label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                Site Description
              </label>
              <textarea
                value={settings.siteDescription}
                onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                rows={3}
                className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73] resize-y"
              />
              <p className="text-xs text-[#8B5E3C] mt-1">
                Used in meta descriptions and search results.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Settings */}
        <div className="bg-white rounded-xl border border-[#3A2A24]/20 p-6">
          <h2 className="text-lg font-semibold text-[#1E1714] mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#1E6B73]" />
            Contact Information
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1E1714] mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-[#8B5E3C]" />
                  Contact Email
                </label>
                <input
                  type="email"
                  value={settings.contactEmail}
                  onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                  className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E1714] mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-[#8B5E3C]" />
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={settings.contactPhone}
                  onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                  className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                Physical Address
              </label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                  Primary City
                </label>
                <input
                  type="text"
                  value={settings.primaryCity}
                  onChange={(e) => setSettings({ ...settings, primaryCity: e.target.value })}
                  className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
                />
                <p className="text-xs text-[#8B5E3C] mt-1">
                  Used for local SEO.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                  Service Area
                </label>
                <input
                  type="text"
                  value={settings.serviceArea}
                  onChange={(e) => setSettings({ ...settings, serviceArea: e.target.value })}
                  className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Social Media */}
        <div className="bg-white rounded-xl border border-[#3A2A24]/20 p-6">
          <h2 className="text-lg font-semibold text-[#1E1714] mb-4">Social Media</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                Facebook URL
              </label>
              <input
                type="url"
                value={settings.socialFacebook}
                onChange={(e) => setSettings({ ...settings, socialFacebook: e.target.value })}
                placeholder="https://facebook.com/forgedinthefire"
                className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                Instagram URL
              </label>
              <input
                type="url"
                value={settings.socialInstagram}
                onChange={(e) => setSettings({ ...settings, socialInstagram: e.target.value })}
                placeholder="https://instagram.com/forgedinthefire"
                className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E1714] mb-1.5">
                Twitter/X URL
              </label>
              <input
                type="url"
                value={settings.socialTwitter}
                onChange={(e) => setSettings({ ...settings, socialTwitter: e.target.value })}
                placeholder="https://twitter.com/forgedinthefire"
                className="w-full border border-[#3A2A24]/20 rounded-lg px-3 py-2 text-[#1E1714] focus:outline-none focus:border-[#1E6B73]"
              />
            </div>
          </div>
        </div>

        {/* Alert */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Database Setup Required</p>
            <p className="text-sm text-amber-700 mt-1">
              These settings require a Supabase database connection. Make sure you have set up the 
              <code className="px-1 py-0.5 bg-amber-100 rounded text-amber-800 mx-1">NEXT_PUBLIC_SUPABASE_URL</code> and 
              <code className="px-1 py-0.5 bg-amber-100 rounded text-amber-800 mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 
              environment variables.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1E6B73] hover:bg-[#4C9AA3] text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
