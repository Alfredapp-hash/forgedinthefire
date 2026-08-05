import { loadSEOAuditReport } from '@/src/lib/seo/audit-report-server'
import SEOCenterClient from './SEOCenterClient'

export default async function SEOPage() {
  const loaded = await loadSEOAuditReport()

  return (
    <SEOCenterClient
      report={loaded?.report ?? null}
      isLiveCrawl={loaded != null}
      lastUpdated={loaded?.fileModifiedAt}
    />
  )
}
