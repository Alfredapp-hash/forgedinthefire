export function ContentAdvisory({ warning }: { warning?: string | null }) {
  const text = warning?.trim()
  if (!text) return null
  return (
    <aside
      className="mb-8 rounded-xl border border-[#53D6FF]/35 bg-[#151B22] px-4 py-3 text-sm text-[#F6FAFC]"
      role="note"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8DEBFF] mb-1">
        Content advisory
      </p>
      <p className="leading-relaxed text-[#B8C4CF]">{text}</p>
    </aside>
  )
}
