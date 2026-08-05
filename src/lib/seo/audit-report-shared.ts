export type SEOIssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export type SEODashboardSummary = {
  overallHealth: number
  greenCount: number
  yellowCount: number
  redCount: number
  missingMetadataCount: number
  indexingIssuesCount: number
  brokenLinksCount: number
  needsUpdateCount: number
}

export type SEOAuditReport = {
  timestamp: string
  baseUrl: string
  totalRoutes: number
  crawled: number
  errors: number
  summary: {
    avgLoadTime: number
    missingTitles: string[]
    missingDescriptions: string[]
    missingH1: string[]
    multipleH1: string[]
    missingAltText: Array<{ route: string; count: number; images: string[] }>
    missingCanonical: string[]
    missingOgImage: string[]
    brokenPages: string[]
  }
  issues: Array<{ severity: SEOIssueSeverity; route: string; issue: string }>
  recommendations: string[]
  routes: Array<{
    route: string
    url: string
    status: number
    loadTime: number
    title: string | null
    metaDescription: string | null
    canonical: string | null
    hasH1: boolean
    h1Count: number
    images: Array<{ src: string; alt: string | null; hasAlt: boolean }>
    ogTags: Record<string, string>
  }>
}

export const SEO_CRAWL_CLI = 'npm run seo:crawl'
export const SEO_CRAWL_SITE_URL_HINT =
  'SITE_URL=http://localhost:3000 npm run seo:crawl'

export function calculateSEOScore(issues: SEOAuditReport['issues']): number {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length
  const highCount = issues.filter((i) => i.severity === 'high').length
  const mediumCount = issues.filter((i) => i.severity === 'medium').length
  const lowCount = issues.filter((i) => i.severity === 'low').length
  return Math.max(0, 100 - criticalCount * 15 - highCount * 10 - mediumCount * 5 - lowCount * 2)
}

export function getRouteHealth(
  route: string,
  issues: SEOAuditReport['issues']
): 'green' | 'yellow' | 'red' {
  const routeIssues = issues.filter((i) => i.route === route)
  if (routeIssues.some((i) => i.severity === 'critical' || i.severity === 'high')) return 'red'
  if (routeIssues.some((i) => i.severity === 'medium')) return 'yellow'
  return 'green'
}

export function getSEOSummaryFromAuditReport(report: SEOAuditReport): SEODashboardSummary {
  let green = 0
  let yellow = 0
  let red = 0
  for (const route of report.routes) {
    const health = getRouteHealth(route.route, report.issues)
    if (health === 'green') green++
    else if (health === 'yellow') yellow++
    else red++
  }
  return {
    overallHealth: calculateSEOScore(report.issues),
    greenCount: green,
    yellowCount: yellow,
    redCount: red,
    missingMetadataCount:
      report.summary.missingTitles.length + report.summary.missingDescriptions.length,
    indexingIssuesCount: report.summary.brokenPages.length + report.errors,
    brokenLinksCount: report.summary.brokenPages.length,
    needsUpdateCount: 0,
  }
}

export function getMockSEOSummary(): SEODashboardSummary {
  return {
    overallHealth: 85,
    greenCount: 8,
    yellowCount: 2,
    redCount: 0,
    missingMetadataCount: 1,
    indexingIssuesCount: 0,
    brokenLinksCount: 0,
    needsUpdateCount: 0,
  }
}
