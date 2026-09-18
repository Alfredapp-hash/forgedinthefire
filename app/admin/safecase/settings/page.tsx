'use client'

import { useEffect, useState } from 'react'
import { Banner, Field, PageHeader, downloadCsv, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'
import { safecaseFetch } from '@/lib/safecase/client'

export default function SafeCaseSettingsPage() {
  const [phone, setPhone] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [staff, setStaff] = useState<Array<{ email: string; role: string }>>([])

  useEffect(() => {
    fetch('/api/admin/safecase/phone').then((r) => r.json()).then((d) => {
      if (typeof d.mfa_phone === 'string') setPhone(d.mfa_phone)
    })
    fetch('/api/admin/users').then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setStaff(d)
    })
  }, [])

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="SafeCase settings" sub="Phone 2FA stays off for now. Everything else is live for daily casework." />
      <form
        className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          try {
            await safecaseFetch('/api/admin/safecase/phone', {
              method: 'POST',
              body: JSON.stringify({ mfa_phone: phone }),
            })
            setSaved(true)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save')
          }
        }}
      >
        <Field label="Admin phone for later 2FA">
          <input className={inputClass} value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} placeholder="+1 216…" />
        </Field>
        <Button type="submit">Save phone</Button>
        <Banner error={error} ok={saved ? 'Saved. 2FA is not required yet.' : null} />
      </form>

      <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#F6FAFC]">Exports</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadCsv('clients')}>Clients</Button>
          <Button variant="secondary" onClick={() => downloadCsv('tasks')}>Tasks</Button>
          <Button variant="secondary" onClick={() => downloadCsv('safety')}>Safety</Button>
          <Button variant="secondary" onClick={() => downloadCsv('referrals')}>Referrals</Button>
          <Button variant="secondary" onClick={() => downloadCsv('enrollments')}>Enrollments</Button>
        </div>
      </section>

      <section className="bg-[#151B22] border border-[#27313B] rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-[#F6FAFC] mb-3">Staff with admin access</h3>
        {staff.length === 0 ? <p className="text-sm text-[#A9B8C6]">No staff listed.</p> : staff.map((s) => (
          <p key={s.email} className="text-sm text-[#F6FAFC] py-1 border-b border-[#27313B] last:border-0">{s.email} · {s.role}</p>
        ))}
      </section>
    </div>
  )
}
