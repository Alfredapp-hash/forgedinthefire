import { SafeCaseSubnav } from '@/components/admin/safecase-subnav'
import { requireSafeCaseAccess } from '@/lib/safecase/access'

export default async function SafeCaseLayout({ children }: { children: React.ReactNode }) {
  await requireSafeCaseAccess()

  return (
    <div className="max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl border border-[#27313B] bg-[#0B1014] mb-5 print:hidden">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-[#53D6FF]" />
        <div className="px-5 py-4 pl-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8DEBFF]">
              FITF-SC · Confidential · Admin casework
            </p>
            <h1 className="text-2xl font-bold text-[#F6FAFC] mt-1">SafeCase</h1>
            <p className="text-sm text-[#A9B8C6] mt-1 max-w-2xl">
              Survivor case files, safety flags, and staff work — native SafeCase substance on the web.
              Phone 2FA will be the only SafeCase login; currently uses admin login.
            </p>
          </div>
          <p className="text-[11px] uppercase tracking-widest text-[#A9B8C6] border border-[#27313B] rounded-full px-3 py-1">
            Live file
          </p>
        </div>
      </div>
      <SafeCaseSubnav />
      {children}
    </div>
  )
}
