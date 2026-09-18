'use client'

import { Button } from '@/components/ui/button'
import { downloadCsv } from '@/components/safecase/ui'

export function ReportsExport() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => downloadCsv('clients')}>Clients CSV</Button>
      <Button variant="secondary" onClick={() => downloadCsv('tasks')}>Tasks CSV</Button>
      <Button variant="secondary" onClick={() => downloadCsv('safety')}>Safety CSV</Button>
      <Button variant="secondary" onClick={() => downloadCsv('referrals')}>Referrals CSV</Button>
      <Button variant="secondary" onClick={() => downloadCsv('enrollments')}>Enrollments CSV</Button>
    </div>
  )
}
