'use client'

import {
  EMPLOYMENT_STATUSES,
  HOUSING_STATUSES,
  NEED_PRESETS,
  SAFE_CONTACT_RULES,
  TRANSPORTATION_STATUSES,
} from '@/lib/safecase/constants'
import type { SafeCaseClient } from '@/lib/safecase/types'
import { Field, Toggle, inputClass } from '@/components/safecase/ui'
import { Button } from '@/components/ui/button'

function ChipSet({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A9B8C6]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== opt) : [...selected, opt])}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                on ? 'border-[#53D6FF]/50 bg-[#53D6FF]/15 text-[#8DEBFF]' : 'border-[#27313B] text-[#A9B8C6]'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ClientSubstanceForms({
  client,
  setClient,
  onSave,
  saving,
}: {
  client: SafeCaseClient
  setClient: (c: SafeCaseClient) => void
  onSave: (patch: Partial<SafeCaseClient>) => Promise<void>
  saving: boolean
}) {
  const rules = client.safe_contact_rules ?? []
  const legal = client.legal_needs ?? []
  const medical = client.medical_needs ?? []
  const mh = client.mental_health_needs ?? []
  const recovery = client.recovery_needs ?? []
  const safety = client.safety_concerns ?? []

  return (
    <div className="space-y-4">
      <form
        className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          await onSave({
            biography: client.biography,
            gender: client.gender,
            ethnicity: client.ethnicity,
            housing_status: client.housing_status,
            employment_status: client.employment_status,
            transportation_status: client.transportation_status,
            address_line1: client.address_line1,
            address_line2: client.address_line2,
            city: client.city,
            state: client.state,
            zip: client.zip,
          })
        }}
      >
        <h3 className="text-sm font-semibold text-[#F6FAFC]">Situation (native SafeCase profile)</h3>
        <Field label="Biography / context">
          <textarea
            className={inputClass}
            rows={3}
            value={client.biography ?? ''}
            onChange={(e) => setClient({ ...client, biography: e.target.value })}
          />
        </Field>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Gender">
            <input className={inputClass} value={client.gender ?? ''} onChange={(e) => setClient({ ...client, gender: e.target.value })} />
          </Field>
          <Field label="Ethnicity">
            <input className={inputClass} value={client.ethnicity ?? ''} onChange={(e) => setClient({ ...client, ethnicity: e.target.value })} />
          </Field>
          <Field label="Housing">
            <select
              className={inputClass}
              value={client.housing_status ?? ''}
              onChange={(e) => setClient({ ...client, housing_status: e.target.value })}
            >
              <option value="">—</option>
              {HOUSING_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Employment">
            <select
              className={inputClass}
              value={client.employment_status ?? ''}
              onChange={(e) => setClient({ ...client, employment_status: e.target.value })}
            >
              <option value="">—</option>
              {EMPLOYMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Transportation">
            <select
              className={inputClass}
              value={client.transportation_status ?? ''}
              onChange={(e) => setClient({ ...client, transportation_status: e.target.value })}
            >
              <option value="">—</option>
              {TRANSPORTATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        {client.confidential_address ? (
          <p className="text-xs text-[#F6C98A]">Address hidden while confidential address is on.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Address line 1">
              <input className={inputClass} value={client.address_line1 ?? ''} onChange={(e) => setClient({ ...client, address_line1: e.target.value })} />
            </Field>
            <Field label="Address line 2">
              <input className={inputClass} value={client.address_line2 ?? ''} onChange={(e) => setClient({ ...client, address_line2: e.target.value })} />
            </Field>
            <Field label="City">
              <input className={inputClass} value={client.city ?? ''} onChange={(e) => setClient({ ...client, city: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <input className={inputClass} value={client.state ?? ''} onChange={(e) => setClient({ ...client, state: e.target.value })} />
              </Field>
              <Field label="ZIP">
                <input className={inputClass} value={client.zip ?? ''} onChange={(e) => setClient({ ...client, zip: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save situation'}</Button>
      </form>

      <form
        className="bg-[#151B22] border border-[#27313B] rounded-2xl p-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          await onSave({
            legal_needs: legal,
            medical_needs: medical,
            mental_health_needs: mh,
            recovery_needs: recovery,
            safety_concerns: safety,
            safe_contact_rules: rules,
          })
        }}
      >
        <h3 className="text-sm font-semibold text-[#F6FAFC]">Needs & safe contact</h3>
        <ChipSet label="Legal needs" options={NEED_PRESETS.legal} selected={legal} onChange={(next) => setClient({ ...client, legal_needs: next })} />
        <ChipSet label="Medical needs" options={NEED_PRESETS.medical} selected={medical} onChange={(next) => setClient({ ...client, medical_needs: next })} />
        <ChipSet label="Mental health" options={NEED_PRESETS.mental_health} selected={mh} onChange={(next) => setClient({ ...client, mental_health_needs: next })} />
        <ChipSet label="Recovery" options={NEED_PRESETS.recovery} selected={recovery} onChange={(next) => setClient({ ...client, recovery_needs: next })} />
        <ChipSet label="Safety concerns" options={NEED_PRESETS.safety} selected={safety} onChange={(next) => setClient({ ...client, safety_concerns: next })} />
        <ChipSet label="Safe contact rules" options={SAFE_CONTACT_RULES} selected={rules} onChange={(next) => setClient({ ...client, safe_contact_rules: next })} />
        {rules.length > 0 && (
          <p className="text-xs text-[#F6C98A]">
            Before dialing or texting, respect: {rules.join(' · ')}
          </p>
        )}
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save needs & contact rules'}</Button>
      </form>
    </div>
  )
}

export function SafeContactBanner({ rules }: { rules?: string[] | null }) {
  if (!rules?.length) return null
  return (
    <div className="rounded-xl border border-[#F6C98A]/30 bg-[#F6C98A]/10 px-4 py-3 text-sm text-[#F6C98A]">
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-1">Safe contact</p>
      {rules.join(' · ')}
    </div>
  )
}

export function NeedToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return <Toggle label={label} checked={checked} onChange={onChange} />
}
