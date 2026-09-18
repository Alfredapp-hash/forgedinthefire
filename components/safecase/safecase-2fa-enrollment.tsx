'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, Phone, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SAFECASE_2FA, isValidDob, isValidPin, normalizePhoneE164 } from '@/lib/safecase/auth-2fa'

type EnrollmentState = {
  email?: string
  phone_masked?: string
  has_dob?: boolean
  has_pin?: boolean
  enrolled_at?: string | null
  live?: boolean
  status?: string
  migration_pending?: boolean
  error?: string
}

export function SafeCase2faEnrollmentPanel() {
  const [state, setState] = useState<EnrollmentState | null>(null)
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/admin/safecase/2fa/enrollment')
    const data = await res.json()
    setState(data)
  }

  useEffect(() => { void load() }, [])

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    if (phone && !normalizePhoneE164(phone)) {
      setError('Enter a valid phone (10-digit US or +E.164)')
      setSaving(false)
      return
    }
    if (dob && !isValidDob(dob)) {
      setError('DOB must be YYYY-MM-DD')
      setSaving(false)
      return
    }
    if (pin && !isValidPin(pin)) {
      setError('PIN must be exactly 6 digits')
      setSaving(false)
      return
    }
    if (pin && pin !== confirmPin) {
      setError('PIN confirmation does not match')
      setSaving(false)
      return
    }
    try {
      const res = await fetch('/api/admin/safecase/2fa/enrollment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone || undefined,
          dob: dob || undefined,
          pin: pin || undefined,
          confirm_pin: confirmPin || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok && !data.preview && data.code !== 'SAFECASE_2FA_DISABLED') {
        throw new Error(data.error || 'Save failed')
      }
      setMessage(data.message || data.detail || data.warning || 'Saved')
      setPin('')
      setConfirmPin('')
      setDob('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const live = state?.live === true

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#8DEBFF] mb-1">SafeCase</p>
        <h1 className="text-2xl font-bold text-[#F6FAFC] flex items-center gap-2">
          <ShieldCheck size={22} className="text-[#53D6FF]" />
          {SAFECASE_2FA.productName}
        </h1>
        <p className="text-sm text-[#A9B8C6] mt-1">
          When approved: date of birth + 6-digit PIN, then a one-time code texted to the registered phone.
          Admin password login stays interim until this gate goes live.
        </p>
      </header>

      <div className={`rounded-xl border p-4 flex gap-3 ${
        live ? 'border-[#53D6FF]/40 bg-[#53D6FF]/5' : 'border-[#8DEBFF]/30 bg-[#8DEBFF]/5'
      }`}>
        <AlertTriangle className={live ? 'text-[#53D6FF] shrink-0' : 'text-[#8DEBFF] shrink-0'} size={18} />
        <div className="text-sm text-[#B8C4CF]">
          {live ? (
            <p>Live mode is ON — SMS and login gate are active.</p>
          ) : (
            <p>
              <span className="text-[#F6FAFC] font-medium">Scaffold only — not live.</span>{' '}
              Fill DOB, PIN, and phone for client review. No SMS is sent and SafeCase is not gated
              ({`SAFECASE_2FA_LIVE = false`}).
            </p>
          )}
          {state?.migration_pending && (
            <p className="mt-2 text-xs text-[#A9B8C6]">
              Migration not applied yet — drafts will not persist until{' '}
              <code className="text-[#8DEBFF]">20260918_safecase_2fa_scaffold.sql</code> runs.
            </p>
          )}
        </div>
      </div>

      {state?.error && !state.email && (
        <p className="text-sm text-red-300">{state.error}</p>
      )}

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm text-[#F6FAFC]">
          <Phone size={16} className="text-[#8DEBFF]" />
          Registered phone
        </div>
        <p className="text-xs text-[#A9B8C6]">
          Current: {state?.phone_masked || '—'}
          {state?.has_dob ? ' · DOB on file' : ' · DOB not set'}
          {state?.has_pin ? ' · PIN on file' : ' · PIN not set'}
          {state?.email ? ` · ${state.email}` : ''}
        </p>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="216-555-1212 or +12165551212"
            className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-[#27313B] bg-[#151B22] p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm text-[#F6FAFC]">
          <KeyRound size={16} className="text-[#8DEBFF]" />
          Identity factors
        </div>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">Date of birth</span>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          />
        </label>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">PIN (6 digits)</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC] tracking-[0.3em]"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">Confirm PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC] tracking-[0.3em]"
            />
          </label>
        </div>
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {message && <p className="text-sm text-[#8DEBFF]">{message}</p>}

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? 'Saving…' : 'Save enrollment draft'}
      </Button>

      <SafeCase2faLoginPreview />
    </div>
  )
}

/** Preview of future login challenge — does not create a session. */
function SafeCase2faLoginPreview() {
  const [dob, setDob] = useState('')
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [out, setOut] = useState<string | null>(null)

  async function startChallenge() {
    const res = await fetch('/api/auth/safecase-2fa/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dob, pin }),
    })
    const data = await res.json()
    setToken(data.preview?.challenge_token || null)
    setOut(JSON.stringify(data, null, 2))
  }

  async function verify() {
    const res = await fetch('/api/auth/safecase-2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge_token: token, code }),
    })
    const data = await res.json()
    setOut(JSON.stringify(data, null, 2))
  }

  return (
    <section className="rounded-2xl border border-dashed border-[#27313B] bg-[#0C141C] p-5 space-y-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Login preview (not live)</p>
      <p className="text-xs text-[#A9B8C6]">
        Future SafeCase login on this tab: DOB + PIN → SMS code → access. Buttons only hit stub APIs.
      </p>
      <div className="grid md:grid-cols-2 gap-2">
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
        />
        <input
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6-digit PIN"
          className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
        />
      </div>
      <button type="button" onClick={() => void startChallenge()} className="text-sm text-[#53D6FF]">
        1. Request SMS code (stub)
      </button>
      {token && (
        <div className="flex gap-2 items-center">
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="SMS code"
            className="rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC]"
          />
          <button type="button" onClick={() => void verify()} className="text-sm text-[#53D6FF]">
            2. Verify (stub)
          </button>
        </div>
      )}
      {out && (
        <pre className="text-[10px] text-[#A9B8C6] overflow-auto max-h-40 rounded-lg border border-[#27313B] bg-[#05070A] p-3">
          {out}
        </pre>
      )}
    </section>
  )
}
