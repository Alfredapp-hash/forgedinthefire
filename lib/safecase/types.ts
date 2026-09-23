export type ClientStatus = 'active' | 'inactive' | 'closed'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type NoteType = 'intake' | 'progress' | 'safety' | 'contact' | 'supervision'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type ReferralStatus = 'open' | 'accepted' | 'declined' | 'closed'

export type SafeCaseClient = {
  id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  contact_email: string | null
  contact_phone: string | null
  status: ClientStatus
  risk_level: RiskLevel
  veteran_status: boolean
  confidential_address: boolean
  date_of_birth: string | null
  last_contact_at: string | null
  case_number: string | null
  pronouns: string | null
  assigned_to: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  intake_date: string | null
  intake?: Record<string, boolean>
  biography?: string | null
  gender?: string | null
  ethnicity?: string | null
  housing_status?: string | null
  employment_status?: string | null
  transportation_status?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  legal_needs?: string[]
  medical_needs?: string[]
  mental_health_needs?: string[]
  recovery_needs?: string[]
  safety_concerns?: string[]
  safe_contact_rules?: string[]
  household_members?: string[]
  dependents?: string[]
  created_by: string | null
  created_at: string
  updated_at: string
  active_flags?: number
  open_tasks?: number
}

export type SafeCaseNote = {
  id: string
  client_id: string
  note_type: NoteType
  narrative: string
  visibility_level: string
  follow_up_date?: string | null
  supervisor_review?: boolean
  reviewed_at?: string | null
  reviewed_by?: string | null
  created_by: string
  created_at: string
}

export type SafeCaseTask = {
  id: string
  client_id: string | null
  task_name: string
  details: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  assigned_to: string | null
  completed_at: string | null
  task_type?: string | null
  auto_created?: boolean
  created_by: string | null
  created_at: string
  client?: { first_name: string; last_name: string } | null
}

export type SafeCaseSafetyFlag = {
  id: string
  client_id: string
  flag_type: string
  description_text: string
  severity: RiskLevel
  is_active: boolean
  created_by: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  client?: { first_name: string; last_name: string } | null
}

export type SafeCaseProgram = {
  id: string
  name: string
  program_type: string
  capacity: number
  current_enrollment: number
  status: 'active' | 'paused' | 'closed'
  description: string | null
  created_at: string
}

export type SafeCaseReferral = {
  id: string
  client_id: string | null
  partner_name: string
  service_type: string | null
  status: ReferralStatus
  notes: string | null
  contact_name: string | null
  contact_phone: string | null
  follow_up_date: string | null
  consent_confirmed?: boolean
  referral_source?: string | null
  outcome?: string | null
  created_by: string | null
  created_at: string
  client?: { first_name: string; last_name: string } | null
}

export type SafeCaseVolunteer = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  status: 'active' | 'inactive'
  role: string | null
  notes: string | null
  created_at: string
}

export type SafeCaseHouse = {
  id: string
  name: string
  code_name?: string | null
  capacity: number
  current_occupancy: number
  status: 'open' | 'full' | 'offline'
  notes: string | null
  placement_restrictions?: string[]
  safety_rules?: string[]
  created_at: string
}

export type SafeCaseCommunication = {
  id: string
  client_id: string
  communication_type: string
  direction: string
  subject: string | null
  content: string | null
  duration_minutes: number | null
  outcome: string | null
  safe_contact_respected: boolean
  created_by: string | null
  created_at: string
}

export type SafeCaseProgramOutcome = {
  id: string
  enrollment_id: string
  outcome_type: string | null
  outcome_value: string | null
  measurement_date: string | null
  achieved: boolean
  notes: string | null
  created_by: string | null
  created_at: string
}

export type SafeCaseEnrollment = {
  id: string
  client_id: string
  program_id: string
  status: 'active' | 'completed' | 'withdrawn' | 'waitlist'
  enrolled_at: string
  completed_at: string | null
  created_by: string | null
  program?: { name: string; program_type: string } | null
  client?: { first_name: string; last_name: string; preferred_name?: string | null; status?: string } | null
}

export type SafeCasePlacement = {
  id: string
  client_id: string
  house_id: string
  status: 'active' | 'exited'
  moved_in_at: string
  moved_out_at: string | null
  created_by: string | null
  client?: { first_name: string; last_name: string } | null
  house?: { name: string; status: string; capacity: number; current_occupancy: number } | null
}

export type SafeCaseAppointment = {
  id: string
  client_id: string | null
  title: string
  starts_on: string
  start_time: string | null
  end_time?: string | null
  appointment_type?: string | null
  status?: string | null
  location: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  client?: { first_name: string; last_name: string } | null
}

export type SafeCaseDocument = {
  id: string
  client_id: string
  filename: string
  url: string
  mime_type: string | null
  size_bytes: number | null
  created_by: string | null
  created_at: string
}

export type GrantStatus = 'draft' | 'active' | 'submitted' | 'closed'

export type GrantTargets = {
  clients_served?: number
  new_intakes?: number
  veterans_served?: number
  high_risk_served?: number
  program_enrollments?: number
  program_completions?: number
  housed?: number
  bed_nights?: number
  referrals?: number
  contacts?: number
  safety_resolved?: number
}

export type SafeCaseGrant = {
  id: string
  name: string
  funder: string
  award_amount: number | string | null
  period_start: string
  period_end: string
  report_due_on: string | null
  status: GrantStatus
  program_ids: string[]
  targets: GrantTargets
  narrative: string | null
  notes: string | null
  snapshot: GrantPacket | null
  snapshot_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GrantProgramRow = {
  id: string
  name: string
  program_type: string
  enrollments: number
  completions: number
  waitlist: number
}

export type GrantPacket = {
  from: string
  to: string
  generated_at: string
  grant_id?: string | null
  grant_name?: string | null
  funder?: string | null
  clients_served: number
  new_intakes: number
  veterans_served: number
  high_risk_served: number
  program_enrollments: number
  program_completions: number
  completion_rate: number
  housed: number
  bed_nights: number
  referrals: number
  contacts: number
  safety_opened: number
  safety_resolved: number
  tasks_completed: number
  referrals_by_service: Array<{ service: string; count: number }>
  programs: GrantProgramRow[]
  targets?: GrantTargets
}

export const GRANT_METRIC_KEYS = [
  { key: 'clients_served', label: 'Unique clients served' },
  { key: 'new_intakes', label: 'New intakes' },
  { key: 'veterans_served', label: 'Veteran survivors served' },
  { key: 'high_risk_served', label: 'High / critical risk served' },
  { key: 'program_enrollments', label: 'Program enrollments' },
  { key: 'program_completions', label: 'Program completions' },
  { key: 'housed', label: 'Housing placements' },
  { key: 'bed_nights', label: 'Bed nights' },
  { key: 'referrals', label: 'Partner referrals' },
  { key: 'contacts', label: 'Logged contacts' },
  { key: 'safety_resolved', label: 'Safety flags resolved' },
] as const

export function clientFullName(c: { first_name: string; last_name: string; preferred_name?: string | null }) {
  if (c.preferred_name) return `${c.preferred_name} (${c.first_name} ${c.last_name})`
  return `${c.first_name} ${c.last_name}`
}

export function clientInitials(c: { first_name: string; last_name: string }) {
  return `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase() || '?'
}

export function formatWhen(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function daysSince(value: string | null | undefined) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}
