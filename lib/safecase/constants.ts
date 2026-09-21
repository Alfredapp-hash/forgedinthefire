export const FLAG_TYPES = [
  'Restraining order',
  'Unsafe location',
  'Known abuser',
  'Medical risk',
  'Location restriction',
  'Confidential contact only',
  'Other',
] as const

export const PROGRAM_TYPES = [
  { value: 'housing', label: 'Housing' },
  { value: 'advocacy', label: 'Advocacy' },
  { value: 'employment', label: 'Employment' },
  { value: 'counseling', label: 'Counseling' },
  { value: 'support', label: 'Support' },
  { value: 'legal', label: 'Legal' },
] as const

export const SERVICE_TYPES = [
  'Housing',
  'Legal aid',
  'Counseling',
  'Medical',
  'Employment',
  'Childcare',
  'Transportation',
  'Benefits',
  'Other',
]

export const VOLUNTEER_ROLES = [
  'Case support',
  'Driver',
  'Mentor',
  'Front desk',
  'Event',
  'Other',
]

export const INTAKE_ITEMS = [
  { key: 'consent_on_file', label: 'Consent on file' },
  { key: 'safety_screened', label: 'Safety screened' },
  { key: 'emergency_contact_complete', label: 'Emergency contact complete' },
  { key: 'needs_housing', label: 'Needs housing' },
  { key: 'needs_advocacy', label: 'Needs advocacy' },
  { key: 'needs_counseling', label: 'Needs counseling' },
  { key: 'needs_legal', label: 'Needs legal aid' },
  { key: 'id_on_file', label: 'ID / documents on file' },
] as const

/** Native SafeCase substance — situational fields */
export const HOUSING_STATUSES = [
  'Stable',
  'Temporary',
  'Shelter',
  'Unhoused',
  'Safe house',
  'Unknown',
] as const

export const EMPLOYMENT_STATUSES = [
  'Employed',
  'Unemployed',
  'Underemployed',
  'Student',
  'Disabled / unable to work',
  'Unknown',
] as const

export const TRANSPORTATION_STATUSES = [
  'Own vehicle',
  'Public transit',
  'Rides from others',
  'None reliable',
  'Unknown',
] as const

export const SAFE_CONTACT_RULES = [
  'Do not leave voicemail',
  'Text only',
  'Call only from blocked / private number',
  'Use code word before discussing case',
  'No contact at home address',
  'No contact at workplace',
  'Email only',
  'Approved contacts only',
] as const

export const NEED_PRESETS = {
  legal: ['Protection order', 'Custody', 'Immigration', 'Criminal defense', 'Benefits appeal'],
  medical: ['Primary care', 'Injury follow-up', 'Medication access', 'Reproductive health'],
  mental_health: ['Counseling', 'Crisis support', 'Trauma therapy', 'Psychiatric care'],
  recovery: ['Substance treatment', 'Peer support', 'Sober housing'],
  safety: ['Safe housing', 'Relocation', 'Safety plan', 'Device security'],
} as const

export const COMM_TYPES = ['call', 'text', 'email', 'in_person', 'video', 'other'] as const
export const COMM_DIRECTIONS = ['outbound', 'inbound'] as const

export const OUTCOME_TYPES = [
  'housing_secured',
  'employment',
  'safety_plan',
  'legal_outcome',
  'program_completion',
  'other',
] as const
