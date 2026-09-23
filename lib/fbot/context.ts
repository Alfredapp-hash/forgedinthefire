export type AdminContext = {
  path: string
  pathname: string
  tab: string | null
  episode: string | null
  desk: string
}

export function parseAdminPath(path: string): AdminContext {
  const raw = path || '/admin'
  const qIndex = raw.indexOf('?')
  const pathname = (qIndex >= 0 ? raw.slice(0, qIndex) : raw).replace(/\/$/, '') || '/admin'
  const query = qIndex >= 0 ? raw.slice(qIndex + 1) : ''
  const params = new URLSearchParams(query)
  let tab = params.get('tab')
  const episode = params.get('episode')
  let desk = 'dashboard'
  if (/^\/admin\/podcast\/[^/]+$/.test(pathname)) desk = 'episode'
  else if (pathname.startsWith('/admin/podcast')) desk = 'podcast'
  else if (pathname.startsWith('/admin/studio/topics/')) desk = 'topic'
  else if (pathname.startsWith('/admin/studio')) desk = 'studio'
  else if (/^\/admin\/blog\/[^/]+$/.test(pathname) && pathname !== '/admin/blog/new') desk = 'post'
  else if (pathname.startsWith('/admin/blog')) desk = 'blog'
  else if (pathname.startsWith('/admin/campaigns')) desk = 'campaigns'
  else if (pathname.startsWith('/admin/ads')) desk = 'ads'
  else if (pathname.startsWith('/admin/content')) desk = 'content'
  else if (pathname.startsWith('/admin/careers')) desk = 'careers'
  else if (pathname.startsWith('/admin/subscribers')) desk = 'subscribers'
  else if (pathname.startsWith('/admin/newsletters')) desk = 'newsletters'
  else if (pathname.startsWith('/admin/analytics')) desk = 'analytics'
  else if (pathname.startsWith('/admin/seo')) desk = 'seo'
  else if (pathname.startsWith('/admin/social')) desk = 'social'
  else if (pathname.startsWith('/admin/users')) desk = 'users'
  else if (pathname.startsWith('/admin/settings')) desk = 'settings'
  if (!tab && desk === 'podcast') tab = 'studio'
  if (!tab && desk === 'campaigns' && /^\/admin\/campaigns\/[^/]+$/.test(pathname)) tab = 'story'
  return { path: raw, pathname, tab, episode, desk }
}

export function pathHitsRoute(ctx: AdminContext, route: string, tabs?: string[]) {
  const qIndex = route.indexOf('?')
  const routePath = (qIndex >= 0 ? route.slice(0, qIndex) : route).replace(/\/$/, '') || '/admin'
  const routeQuery = qIndex >= 0 ? route.slice(qIndex + 1) : ''
  const routeTab = new URLSearchParams(routeQuery).get('tab') || (tabs?.length ? tabs[0] : null)

  if (routePath === '/admin') return ctx.pathname === '/admin' && !routeTab
  const onPath = ctx.pathname === routePath || ctx.pathname.startsWith(`${routePath}/`)
  if (!onPath) return false
  if (tabs?.length) return Boolean(ctx.tab && tabs.includes(ctx.tab))
  if (routeTab) return ctx.tab === routeTab
  return true
}

export function isVagueQuestion(raw: string, tokens: string[]) {
  const cleaned = raw.trim().replace(/[?!.]+$/, '')
  if (tokens.length === 0) return true
  return /^(this page|this screen|this tab|where am i|what is this|what am i looking at|help|help me|what can i do here|how does this work|what is this for)$/.test(cleaned)
}
