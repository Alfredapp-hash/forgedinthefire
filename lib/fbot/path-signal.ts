export const ADMIN_PATH_EVENT = 'fitf-admin-path'

export function currentAdminPath() {
  if (typeof window === 'undefined') return '/admin'
  return `${window.location.pathname}${window.location.search}`
}

export function notifyAdminPath() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ADMIN_PATH_EVENT, { detail: currentAdminPath() }))
}

export function setAdminPath(url: string) {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', url)
  notifyAdminPath()
}
