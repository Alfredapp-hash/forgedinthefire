// Geographic / local SEO constants (Lorain County, Ohio)
export const GEO = {
  county: 'Lorain County',
  state: 'Ohio',
  stateAbbr: 'OH',
  region: 'Northeast Ohio',
  countySeat: 'Elyria',
  largestCity: 'Lorain',
  label: 'Lorain County, Ohio',
  serviceArea: 'Lorain County and Northeast Ohio',
  seoLocality: 'Lorain County Ohio',
  defaultJobLocation: 'Lorain County, OH',
  seoKeywords: ['human trafficking advocacy', 'Lorain County Ohio', 'survivor support'],
} as const;

// Organization Constants
export const ORG = {
  name: 'Forged in the Fire',
  tagline: 'Empowering Survivors, Restoring Hope',
  description:
    'A survivor-centered nonprofit organization supporting survivors of commercial sex trafficking through safe housing, trauma-informed care, and holistic support services.',
  mission:
    'To empower survivors of commercial sex trafficking through safe housing, trauma-informed care, and holistic support services that foster healing, independence, and hope.',
  vision:
    'A world where every survivor of commercial sex trafficking has the opportunity to heal, reclaim their freedom, and live with dignity and purpose.',
  founded: 2020,
  location: GEO.label,
  address: '15728 Lorain Ave, Unit 146, Lorain County, OH 44111-5542',
  email: 'tracys@forgedinthefireohio.org',
  phone: '1 216-202-0786',
} as const;

// Core Values
export const CORE_VALUES = [
  {
    title: 'Survivor-Centered Care',
    description:
      'Every decision prioritizes the safety, autonomy, and dignity of survivors.',
    icon: 'Heart',
  },
  {
    title: 'Compassion',
    description: 'We approach every individual with empathy, understanding, and non-judgment.',
    icon: 'HandHeart',
  },
  {
    title: 'Empowerment',
    description: 'We equip survivors with tools, resources, and support to reclaim their lives.',
    icon: 'Zap',
  },
  {
    title: 'Integrity',
    description: 'We operate with transparency, accountability, and ethical standards.',
    icon: 'Shield',
  },
  {
    title: 'Collaboration',
    description: 'We partner with communities, agencies, and advocates for maximum impact.',
    icon: 'Users',
  },
  {
    title: 'Resilience',
    description: 'We believe in the strength of survivors to overcome and thrive.',
    icon: 'Flame',
  },
] as const;

// Services
export const SERVICES = [
  {
    id: 'victim-advocacy',
    title: 'Trauma-Informed Victim Advocacy',
    shortTitle: 'Victim Advocacy',
    description:
      'Comprehensive advocacy services that center survivor voices and prioritize safety, autonomy, and healing.',
    icon: 'Shield',
    color: 'healing',
    features: [
      'Crisis intervention and safety planning',
      'Court accompaniment and legal advocacy',
      'Law enforcement liaison support',
      'Case management and resource navigation',
    ],
  },
  {
    id: 'workforce-development',
    title: 'Workforce Development Program',
    shortTitle: 'Workforce Development',
    description:
      'Career pathways and skills training designed for survivors seeking economic independence.',
    icon: 'Briefcase',
    color: 'ember',
    features: [
      'Skills assessment and career counseling',
      'Resume building and interview preparation',
      'Job placement assistance',
      'Ongoing employment support',
    ],
  },
  {
    id: 'mentorship',
    title: 'Survivor Mentorship',
    shortTitle: 'Mentorship',
    description:
      'Peer support connecting survivors with mentors who have walked similar paths.',
    icon: 'Users',
    color: 'flame',
    features: [
      'One-on-one peer mentorship',
      'Group support circles',
      'Leadership development',
      'Community building events',
    ],
  },
  {
    id: 'community-education',
    title: 'Community Education',
    shortTitle: 'Education',
    description:
      'Training and workshops to raise awareness and equip communities to recognize and respond to trafficking.',
    icon: 'GraduationCap',
    color: 'healing',
    features: [
      'Trafficking awareness training',
      'Professional development workshops',
      'School and community presentations',
      'Resource library access',
    ],
  },
  {
    id: 'accountability',
    title: 'Offender Accountability Program',
    shortTitle: 'Accountability',
    description:
      'Supporting justice system involvement while prioritizing survivor safety and voice.',
    icon: 'Scale',
    color: 'steel',
    features: [
      'Victim impact statement support',
      'Court preparation and accompaniment',
      'Restitution advocacy',
      'Post-conviction support',
    ],
  },
  {
    id: 'housing',
    title: 'Housing & Reintegration',
    shortTitle: 'Housing',
    description:
      'Safe, stable housing solutions and support for successful community reintegration.',
    icon: 'Home',
    color: 'ember',
    features: [
      'Emergency housing assistance',
      'Transitional housing programs',
      'Permanent housing support',
      'Independent living skills training',
    ],
  },
  {
    id: 'counseling',
    title: 'Counseling & Trauma Recovery',
    shortTitle: 'Counseling',
    description:
      'Professional mental health services specializing in trauma-informed care for survivors.',
    icon: 'Brain',
    color: 'healing',
    features: [
      'Individual trauma therapy',
      'Group counseling sessions',
      'Crisis intervention',
      'Referral network access',
    ],
  },
] as const;

// Emergency Resources
export const HOTLINES = [
  {
    name: 'National Human Trafficking Hotline',
    phone: '1-888-373-7888',
    sms: '233733',
    text: 'BEFREE',
    available: '24/7',
    description: 'Confidential support and resources for trafficking survivors.',
  },
  {
    name: 'Crisis Text Line',
    phone: 'Text HOME to 741741',
    available: '24/7',
    description: 'Free, confidential crisis counseling via text message.',
  },
  {
    name: 'National Domestic Violence Hotline',
    phone: '1-800-799-7233',
    available: '24/7',
    description: 'Support for those experiencing domestic violence.',
  },
  {
    name: 'RAINN National Sexual Assault Hotline',
    phone: '1-800-656-4673',
    available: '24/7',
    description: 'Confidential support for survivors of sexual assault.',
  },
] as const;

// Impact Statistics
export const IMPACT_STATS = [
  { value: '500+', label: 'Survivors Supported', description: 'Since our founding in 2020' },
  { value: '85%', label: 'Housing Success Rate', description: 'Survivors maintaining stable housing' },
  { value: '200+', label: 'Training Sessions', description: 'Community education workshops delivered' },
  { value: '12', label: 'Community Partners', description: 'Collaborating organizations nationwide' },
] as const;

// Donation Tiers
export const DONATION_TIERS = [
  {
    amount: 25,
    label: 'Essential Support',
    description: 'Provides emergency hygiene supplies and basic necessities for one survivor.',
    impact: '1 survivor receives emergency supplies',
  },
  {
    amount: 50,
    label: 'Safety Net',
    description: 'Funds one session of trauma-informed counseling for a survivor in crisis.',
    impact: '1 counseling session funded',
  },
  {
    amount: 100,
    label: 'Path to Stability',
    description: 'Supports job training materials and interview clothing for workforce development.',
    impact: 'Job readiness support for 1 survivor',
  },
  {
    amount: 250,
    label: 'Housing Security',
    description: 'Provides one week of safe transitional housing for a survivor.',
    impact: '1 week of safe housing provided',
  },
  {
    amount: 500,
    label: 'Comprehensive Care',
    description: 'Funds a full month of wraparound services including case management and advocacy.',
    impact: '1 month of comprehensive services',
  },
  {
    amount: 1000,
    label: 'Freedom Sponsor',
    description: 'Sponsors emergency relocation and new beginnings support for one survivor.',
    impact: 'Emergency relocation sponsored',
  },
] as const;

// Volunteer Opportunities
export const VOLUNTEER_ROLES = [
  {
    title: 'Mentor',
    description:
      'Provide one-on-one support and guidance to survivors on their healing journey.',
    timeCommitment: '4-6 hours/month',
    requirements: ['Background check', '40-hour training', '6-month commitment'],
  },
  {
    title: 'Crisis Advocate',
    description: 'Be on-call to provide immediate support to survivors in crisis situations.',
    timeCommitment: 'On-call shifts',
    requirements: ['Crisis training', 'Background check', 'Availability for urgent response'],
  },
  {
    title: 'Event Coordinator',
    description: 'Help plan and execute fundraising and awareness events.',
    timeCommitment: 'Flexible',
    requirements: ['Event planning experience', 'Organizational skills', 'Team collaboration'],
  },
  {
    title: 'Professional Skills Volunteer',
    description: 'Share your professional expertise in legal, medical, housing, or career services.',
    timeCommitment: 'Project-based',
    requirements: ['Professional credentials', 'Background check', 'Subject matter expertise'],
  },
  {
    title: 'Community Educator',
    description: 'Deliver awareness presentations and training in your local community.',
    timeCommitment: '2-4 hours/month',
    requirements: ['Public speaking skills', 'Training certification', 'Background check'],
  },
] as const;

// Navigation Links
export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/blog', label: 'Blog' },
  { href: '/get-help', label: 'Get Help', priority: true },
  { href: '/donate', label: 'Donate' },
  { href: '/volunteer', label: 'Volunteer' },
  { href: '/resources', label: 'Resources' },
  { href: '/contact', label: 'Contact' },
] as const;

// Footer Links
export const FOOTER_LINKS = {
  services: SERVICES.map((s) => ({ href: `/services/${s.id}`, label: s.shortTitle })),
  organization: [
    { href: '/about', label: 'About Us' },
    { href: '/about#team', label: 'Our Team' },
    { href: '/about#partners', label: 'Partners' },
    { href: '/careers', label: 'Join Our Team' },
  ],
  resources: [
    { href: '/resources', label: 'Education Hub' },
    { href: '/resources/faq', label: 'FAQ' },
    { href: '/resources/downloads', label: 'Downloads' },
    { href: '/blog', label: 'Blog' },
  ],
  legal: [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms of Use' },
    { href: '/accessibility', label: 'Accessibility' },
    { href: '/sitemap', label: 'Sitemap' },
  ],
} as const;

// Social Links
export const SOCIAL_LINKS = [
  { name: 'Facebook', href: 'https://facebook.com/forgedinthefire', icon: 'Facebook' },
  { name: 'Instagram', href: 'https://instagram.com/forgedinthefire', icon: 'Instagram' },
  { name: 'Twitter', href: 'https://twitter.com/forgedinthefire', icon: 'Twitter' },
  { name: 'LinkedIn', href: 'https://linkedin.com/company/forgedinthefire', icon: 'LinkedIn' },
  { name: 'YouTube', href: 'https://youtube.com/forgedinthefire', icon: 'Youtube' },
] as const;

// Meta defaults
export const META_DEFAULTS = {
  title: 'Forged in the Fire | Empowering Survivors of Sex Trafficking',
  description:
    'A survivor-centered nonprofit providing safe housing, trauma-informed care, and holistic support services for survivors of commercial sex trafficking.',
  keywords: [
    'sex trafficking survivors',
    'human trafficking support',
    'survivor services',
    'trauma-informed care',
    'victim advocacy',
    'nonprofit',
    'restoration',
    'healing',
    'Lorain County Ohio',
    'human trafficking advocacy Lorain County',
  ],
  authors: ['Forged in the Fire'],
  creator: 'Forged in the Fire',
  publisher: 'Forged in the Fire',
  robots: 'index, follow',
  language: 'en-US',
} as const;
