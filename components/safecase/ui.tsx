export function riskClass(level: string) {
  switch (level) {
    case 'critical':
      return 'text-[#F6A5A5] bg-[#F6A5A5]/10 border-[#F6A5A5]/30'
    case 'high':
      return 'text-[#F6C98A] bg-[#F6C98A]/10 border-[#F6C98A]/30'
    case 'medium':
      return 'text-[#8DEBFF] bg-[#53D6FF]/10 border-[#53D6FF]/30'
    default:
      return 'text-[#A9B8C6] bg-[#1A232C] border-[#27313B]'
  }
}

export function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const map = {
    ok: 'text-[#8DEBFF] bg-[#53D6FF]/10 border-[#53D6FF]/30',
    warn: 'text-[#F6C98A] bg-[#F6C98A]/10 border-[#F6C98A]/30',
    danger: 'text-[#F6A5A5] bg-[#F6A5A5]/10 border-[#F6A5A5]/30',
    neutral: 'text-[#A9B8C6] bg-[#1A232C] border-[#27313B]',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[tone]}`}>
      {children}
    </span>
  )
}

export function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-[#A9B8C6]">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-[#27313B] bg-[#0B1014] px-3 py-2 text-sm text-[#F6FAFC] placeholder:text-[#A9B8C6]/50 focus:outline-none focus:ring-2 focus:ring-[#8DEBFF]'

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#27313B] bg-[#0B1014] px-6 py-10 text-center">
      <p className="font-semibold text-[#F6FAFC]">{title}</p>
      <p className="text-sm text-[#A9B8C6] mt-1">{body}</p>
    </div>
  )
}

export function Banner({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (!error && !ok) return null
  return (
    <p className={`text-sm ${error ? 'text-[#F6A5A5]' : 'text-[#8DEBFF]'}`}>{error || ok}</p>
  )
}

export function PageHeader({
  title, sub, children,
}: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-[#F6FAFC]">{title}</h2>
        {sub && <p className="text-sm text-[#A9B8C6]">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

export function downloadCsv(resource: string) {
  window.location.href = `/api/admin/safecase/export?resource=${resource}`
}

export function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm w-full ${
        checked ? 'border-[#53D6FF]/50 bg-[#53D6FF]/10 text-[#8DEBFF]' : 'border-[#27313B] text-[#B8C4CF]'
      }`}
    >
      <span>{label}</span>
      <span className="text-[11px] uppercase tracking-widest">{checked ? 'Yes' : 'No'}</span>
    </button>
  )
}
