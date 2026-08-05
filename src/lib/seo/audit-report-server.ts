import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import type { SEOAuditReport } from './audit-report-shared'

export type LoadedSEOAuditReport = {
  report: SEOAuditReport
  fileModifiedAt: string
}

const REPORT_PATH = join(process.cwd(), 'generated', 'seo-audit-report.json')

export async function loadSEOAuditReport(): Promise<LoadedSEOAuditReport | null> {
  try {
    const [data, stats] = await Promise.all([
      readFile(REPORT_PATH, 'utf-8'),
      stat(REPORT_PATH),
    ])
    return {
      report: JSON.parse(data) as SEOAuditReport,
      fileModifiedAt: stats.mtime.toISOString(),
    }
  } catch {
    return null
  }
}

export {
  calculateSEOScore,
  getRouteHealth,
  getSEOSummaryFromAuditReport,
  getMockSEOSummary,
  SEO_CRAWL_CLI,
  SEO_CRAWL_SITE_URL_HINT,
  type SEOAuditReport,
  type SEODashboardSummary,
} from './audit-report-shared'
