import { ORG, GEO } from '@/lib/constants'

export type SiteSettingsMap = Record<string, string>

export const SITE_SETTING_KEYS = [
  'site_name',
  'site_description',
  'contact_email',
  'contact_phone',
  'address',
  'primary_city',
  'service_area',
  'social_facebook',
  'social_instagram',
  'social_twitter',
  'google_analytics_id',
  'facebook_app_id',
  'facebook_app_secret',
  'linkedin_client_id',
  'linkedin_client_secret',
] as const

export const SITE_SETTINGS_DEFAULTS: SiteSettingsMap = {
  site_name: ORG.name,
  site_description: ORG.description,
  contact_email: ORG.email,
  contact_phone: ORG.phone,
  address: ORG.address,
  primary_city: GEO.county,
  service_area: GEO.serviceArea,
  social_facebook: '',
  social_instagram: '',
  social_twitter: '',
  google_analytics_id: '',
  facebook_app_id: '',
  facebook_app_secret: '',
  linkedin_client_id: '',
  linkedin_client_secret: '',
}

export function settingsToUi(map: SiteSettingsMap) {
  const d = SITE_SETTINGS_DEFAULTS
  return {
    siteName: map.site_name ?? d.site_name,
    siteDescription: map.site_description ?? d.site_description,
    contactEmail: map.contact_email ?? d.contact_email,
    contactPhone: map.contact_phone ?? d.contact_phone,
    address: map.address ?? d.address,
    primaryCity: map.primary_city ?? GEO.county,
    serviceArea: map.service_area ?? d.service_area,
    socialFacebook: map.social_facebook ?? '',
    socialInstagram: map.social_instagram ?? '',
    socialTwitter: map.social_twitter ?? '',
    googleAnalyticsId: map.google_analytics_id ?? '',
    facebookAppId: map.facebook_app_id ?? '',
    facebookAppSecret: map.facebook_app_secret ?? '',
    linkedinClientId: map.linkedin_client_id ?? '',
    linkedinClientSecret: map.linkedin_client_secret ?? '',
  }
}

export function uiToSettings(ui: ReturnType<typeof settingsToUi>): SiteSettingsMap {
  return {
    site_name: ui.siteName,
    site_description: ui.siteDescription,
    contact_email: ui.contactEmail,
    contact_phone: ui.contactPhone,
    address: ui.address,
    primary_city: ui.primaryCity,
    service_area: ui.serviceArea,
    social_facebook: ui.socialFacebook,
    social_instagram: ui.socialInstagram,
    social_twitter: ui.socialTwitter,
    google_analytics_id: ui.googleAnalyticsId,
    facebook_app_id: ui.facebookAppId,
    facebook_app_secret: ui.facebookAppSecret,
    linkedin_client_id: ui.linkedinClientId,
    linkedin_client_secret: ui.linkedinClientSecret,
  }
}

export type UiSettings = ReturnType<typeof settingsToUi>
