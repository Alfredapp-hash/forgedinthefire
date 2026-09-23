import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrantPacket, GrantTargets, SafeCaseGrant } from './types'

function isoDay(value: string | Date) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = new Date(value)
  return d.toISOString().slice(0, 10)
}

function inRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false
  const day = isoDay(value)
  return day >= from && day <= to
}

function nightsOverlap(start: string, end: string | null | undefined, from: string, to: string) {
  const startDay = isoDay(start)
  const endDay = end ? isoDay(end) : to
  const a = startDay > from ? startDay : from
  const b = endDay < to ? endDay : to
  if (b < a) return 0
  const ms = +new Date(`${b}T00:00:00`) - +new Date(`${a}T00:00:00`)
  return Math.max(0, Math.round(ms / 86_400_000) + 1)
}

function draftNarrative(packet: GrantPacket) {
  const rate = packet.completion_rate
  return [
    `During ${packet.from} through ${packet.to}, Forged in the Fire served ${packet.clients_served} unique survivors in SafeCase.`,
    `Staff opened ${packet.new_intakes} new intakes, started ${packet.program_enrollments} program enrollments, and recorded ${packet.program_completions} completions (${rate}% completion rate).`,
    `${packet.veterans_served} veteran survivors were served, and ${packet.high_risk_served} files were high or critical risk.`,
    `Confidential housing covered ${packet.housed} placements and ${packet.bed_nights} bed nights.`,
    `Staff logged ${packet.contacts} contacts, made ${packet.referrals} partner referrals, completed ${packet.tasks_completed} tasks, and resolved ${packet.safety_resolved} safety flags.`,
  ].join(' ')
}

export async function buildGrantPacket(
  admin: SupabaseClient,
  from: string,
  to: string,
  grant?: Pick<SafeCaseGrant, 'id' | 'name' | 'funder' | 'program_ids' | 'targets'> | null,
): Promise<GrantPacket> {
  const programFilter = (grant?.program_ids || []).filter(Boolean)

  const [
    { data: clients },
    { data: notes },
    { data: enrollments },
    { data: programs },
    { data: placements },
    { data: referrals },
    { data: flags },
    { data: tasks },
  ] = await Promise.all([
    admin.from('safecase_clients').select('id, status, veteran_status, risk_level, intake_date, created_at, last_contact_at'),
    admin.from('safecase_notes').select('client_id, note_type, created_at'),
    admin.from('safecase_enrollments').select('id, client_id, program_id, status, enrolled_at, completed_at'),
    admin.from('safecase_programs').select('id, name, program_type'),
    admin.from('safecase_placements').select('id, client_id, status, moved_in_at, moved_out_at'),
    admin.from('safecase_referrals').select('id, client_id, service_type, created_at'),
    admin.from('safecase_safety_flags').select('id, client_id, created_at, resolved_at'),
    admin.from('safecase_tasks').select('id, client_id, status, completed_at, created_at'),
  ])

  const scopedEnrollments = (enrollments ?? []).filter((e) => {
    if (programFilter.length && !programFilter.includes(e.program_id)) return false
    const start = isoDay(e.enrolled_at)
    const end = e.completed_at ? isoDay(e.completed_at) : to
    return start <= to && end >= from
  })

  const served = new Set<string>()
  for (const c of clients ?? []) {
    if (inRange(c.intake_date, from, to) || inRange(c.created_at, from, to) || inRange(c.last_contact_at, from, to)) {
      served.add(c.id)
    }
  }
  for (const n of notes ?? []) if (inRange(n.created_at, from, to)) served.add(n.client_id)
  for (const e of scopedEnrollments) served.add(e.client_id)
  for (const p of placements ?? []) {
    if (nightsOverlap(p.moved_in_at, p.moved_out_at, from, to) > 0) served.add(p.client_id)
  }
  for (const r of referrals ?? []) if (inRange(r.created_at, from, to) && r.client_id) served.add(r.client_id)
  for (const f of flags ?? []) {
    if (inRange(f.created_at, from, to) || inRange(f.resolved_at, from, to)) served.add(f.client_id)
  }

  if (programFilter.length) {
    const allowed = new Set(scopedEnrollments.map((e) => e.client_id))
    for (const id of [...served]) if (!allowed.has(id)) served.delete(id)
  }

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]))
  const servedClients = [...served].map((id) => clientById.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c))

  const enrollmentsStarted = (enrollments ?? []).filter((e) => {
    if (programFilter.length && !programFilter.includes(e.program_id)) return false
    return inRange(e.enrolled_at, from, to)
  })
  const completions = (enrollments ?? []).filter((e) => {
    if (programFilter.length && !programFilter.includes(e.program_id)) return false
    return e.status === 'completed' && inRange(e.completed_at, from, to)
  })
  const waitlist = (enrollments ?? []).filter((e) => {
    if (programFilter.length && !programFilter.includes(e.program_id)) return false
    return e.status === 'waitlist'
  })

  const programRows: GrantPacket['programs'] = (programs ?? [])
    .filter((p) => !programFilter.length || programFilter.includes(p.id))
    .map((p) => {
      const enrollmentsCount = enrollmentsStarted.filter((e) => e.program_id === p.id).length
      const completionsCount = completions.filter((e) => e.program_id === p.id).length
      const waitlistCount = waitlist.filter((e) => e.program_id === p.id).length
      return {
        id: p.id,
        name: p.name,
        program_type: p.program_type,
        enrollments: enrollmentsCount,
        completions: completionsCount,
        waitlist: waitlistCount,
      }
    })

  const housed = (placements ?? []).filter((p) => inRange(p.moved_in_at, from, to)).length
  const bedNights = (placements ?? []).reduce((sum, p) => sum + nightsOverlap(p.moved_in_at, p.moved_out_at, from, to), 0)
  const refs = (referrals ?? []).filter((r) => inRange(r.created_at, from, to))
  const byService = new Map<string, number>()
  for (const r of refs) {
    const key = r.service_type || 'Other'
    byService.set(key, (byService.get(key) ?? 0) + 1)
  }

  // Counts only — never include client names, case numbers, or contact fields.
  const packet: GrantPacket = {
    from,
    to,
    generated_at: new Date().toISOString(),
    grant_id: grant?.id ?? null,
    grant_name: grant?.name ?? null,
    funder: grant?.funder ?? null,
    clients_served: servedClients.length,
    new_intakes: (clients ?? []).filter((c) => inRange(c.intake_date || c.created_at, from, to)).length,
    veterans_served: servedClients.filter((c) => c.veteran_status).length,
    high_risk_served: servedClients.filter((c) => c.risk_level === 'high' || c.risk_level === 'critical').length,
    program_enrollments: enrollmentsStarted.length,
    program_completions: completions.length,
    completion_rate: enrollmentsStarted.length
      ? Math.round((completions.length / enrollmentsStarted.length) * 100)
      : 0,
    housed,
    bed_nights: bedNights,
    referrals: refs.length,
    contacts: (notes ?? []).filter((n) => n.note_type === 'contact' && inRange(n.created_at, from, to)).length,
    safety_opened: (flags ?? []).filter((f) => inRange(f.created_at, from, to)).length,
    safety_resolved: (flags ?? []).filter((f) => inRange(f.resolved_at, from, to)).length,
    tasks_completed: (tasks ?? []).filter((t) => t.status === 'completed' && inRange(t.completed_at || t.created_at, from, to)).length,
    referrals_by_service: [...byService.entries()].map(([service, count]) => ({ service, count })).sort((a, b) => b.count - a.count),
    programs: programRows,
    targets: grant?.targets,
  }

  return packet
}

export function grantNarrativeFromPacket(packet: GrantPacket) {
  return draftNarrative(packet)
}

export function packetToCsvRows(packet: GrantPacket, targets: GrantTargets = {}) {
  const rows: Array<Record<string, unknown>> = [
    { metric: 'Unique clients served', actual: packet.clients_served, target: targets.clients_served ?? '' },
    { metric: 'New intakes', actual: packet.new_intakes, target: targets.new_intakes ?? '' },
    { metric: 'Veteran survivors served', actual: packet.veterans_served, target: targets.veterans_served ?? '' },
    { metric: 'High / critical risk served', actual: packet.high_risk_served, target: targets.high_risk_served ?? '' },
    { metric: 'Program enrollments', actual: packet.program_enrollments, target: targets.program_enrollments ?? '' },
    { metric: 'Program completions', actual: packet.program_completions, target: targets.program_completions ?? '' },
    { metric: 'Completion rate %', actual: packet.completion_rate, target: '' },
    { metric: 'Housing placements', actual: packet.housed, target: targets.housed ?? '' },
    { metric: 'Bed nights', actual: packet.bed_nights, target: targets.bed_nights ?? '' },
    { metric: 'Partner referrals', actual: packet.referrals, target: targets.referrals ?? '' },
    { metric: 'Logged contacts', actual: packet.contacts, target: targets.contacts ?? '' },
    { metric: 'Safety flags opened', actual: packet.safety_opened, target: '' },
    { metric: 'Safety flags resolved', actual: packet.safety_resolved, target: targets.safety_resolved ?? '' },
    { metric: 'Tasks completed', actual: packet.tasks_completed, target: '' },
  ]
  for (const row of packet.programs) {
    rows.push({ metric: `Program · ${row.name} enrollments`, actual: row.enrollments, target: '' })
    rows.push({ metric: `Program · ${row.name} completions`, actual: row.completions, target: '' })
  }
  for (const row of packet.referrals_by_service) {
    rows.push({ metric: `Referral · ${row.service}`, actual: row.count, target: '' })
  }
  return rows
}
