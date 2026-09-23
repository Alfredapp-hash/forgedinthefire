export type GuideFlag = 'waitlist' | 'closed' | 'future' | 'confirm';

export type GuideSource = {
  label: string;
  href: string;
};

export type GuideRow = {
  place: string;
  detail: string;
  contact?: string;
};

export type GuideEntry = {
  name: string;
  summary: string;
  service: string;
  eligibility: string;
  intake: string;
  confirm: string;
  phones?: string[];
  sources: GuideSource[];
  flag?: GuideFlag;
  rows?: GuideRow[];
};

export type GuideSection = {
  id: string;
  group: string;
  title: string;
  intro?: string;
  notes?: string[];
  entries: GuideEntry[];
};

export const GUIDE_META = {
  title: 'Cuyahoga County Adult Advocate Resource Guide',
  version: 'Version 3',
  reviewed: 'September 16, 2026',
  coverage:
    'Housing, food, medical care, pregnancy, substance use, mental health, and practical supports',
  purpose:
    'A practical referral guide for advocates serving adults age 18 and older in Cuyahoga County, Ohio. Family and maternity programs are included for adult clients with dependents. Programs with a narrower age range are identified. An out-of-county treatment link is labeled when it matters.',
  howToUse: [
    'Read service, eligibility, and intake together. “Assessment required” is not a finished eligibility decision.',
    'The confirm line is what you still have to check with the provider: beds, fees, documents, hours, and whether the client actually fits.',
    'This is a referral directory, not a claim that every local program is listed. Extend a search with 211, the ADAMHS provider directory, food-network maps, and the state recovery-housing directory.',
  ],
  researchNote:
    'Provider, government, and community webpages were reviewed for service descriptions, contact details, and published intake criteria. No provider was called, and bed availability, funding, and appointment capacity were not confirmed in real time.',
} as const;

export const URGENT_CONTACTS = [
  {
    label: 'Immediate danger',
    value: '911',
    href: 'tel:911',
    detail: 'Life-threatening emergency. Do not wait for routine intake.',
  },
  {
    label: 'Behavioral health crisis',
    value: '988',
    href: 'tel:988',
    detail: 'Call or text 988. FrontLine local crisis line: 216-623-6888.',
  },
  {
    label: 'Homeless shelter intake',
    value: '216-674-6700',
    href: 'tel:+12166746700',
    detail: 'Coordinated Intake, Monday–Friday, 8 a.m.–6 p.m. Phone only.',
  },
  {
    label: 'After hours',
    value: '211',
    href: 'tel:211',
    detail: 'Evenings, weekends, and when the first referral cannot help.',
  },
] as const;

export const GUIDE_GROUPS = [
  'Start here',
  'Shelter',
  'Housing',
  'Food',
  'Essentials',
  'Medical care',
  'Pregnancy',
  'Substance use',
  'Mental health',
  'Advocacy',
  'Money and legal',
  'Aging and rides',
  'Check first',
] as const;

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'urgent-help',
    group: 'Start here',
    title: 'Urgent help and referral entry points',
    intro:
      'Start with the immediate need. Get the client’s consent for a warm handoff and a safe callback method.',
    entries: [
      {
        name: 'United Way 211 Greater Cleveland',
        summary: 'Free, confidential, 24-hour navigation for community services.',
        service:
          'Navigation for shelter, food, utilities, benefits, transportation, and other community services.',
        eligibility:
          'Adults and households seeking services in Cuyahoga County. Each program applies its own rules.',
        intake:
          'Dial 211, 24 hours a day, or use the website chat. Give ZIP code, household composition, and the urgent need.',
        confirm:
          'Ask the specialist to confirm the service area, the current intake route, and an alternative if the first referral cannot help.',
        phones: ['211'],
        sources: [{ label: '211oh.org', href: 'https://www.211oh.org/' }],
      },
      {
        name: 'FrontLine Service and 988',
        summary: 'Mental health, suicide, and addiction crisis support.',
        service:
          'Crisis support, local crisis assessment, and connection to appropriate care. This is not routine therapy or a guaranteed hospital admission.',
        eligibility:
          'Adults in a behavioral health crisis, and people seeking help for someone in crisis.',
        intake:
          'Call FrontLine at 216-623-6888 or call or text 988. Describe immediate safety concerns and ask whether mobile crisis assessment is appropriate.',
        confirm: 'For immediate physical danger, use 911.',
        phones: ['216-623-6888', '988'],
        sources: [
          { label: 'frontlineservice.org', href: 'https://www.frontlineservice.org/' },
          { label: 'recres.org', href: 'https://recres.org/' },
        ],
      },
      {
        name: 'FrontLine Coordinated Intake',
        summary: 'Main entry point for emergency homeless shelter placement.',
        service:
          'County entry point for emergency shelter placement and assessment. Intake is phone-only.',
        eligibility:
          'Adults and families experiencing homelessness and seeking shelter in Cuyahoga County. Household needs determine the route.',
        intake:
          'Call 216-674-6700, Monday–Friday, 8 a.m.–6 p.m. The call may take 20–45 minutes. After 6 p.m. and on weekends, call 211.',
        confirm:
          'Do not send clients to the old Cosgrove intake office. Ask about accessible placement, pregnancy, dependents, and safe transportation.',
        phones: ['216-674-6700', '211'],
        sources: [
          {
            label: 'Coordinated Intake',
            href: 'https://www.frontlineservice.org/coordinated-intake',
          },
        ],
      },
    ],
  },
  {
    id: 'individual-shelters',
    group: 'Shelter',
    title: 'Emergency shelters for individual adults',
    intro:
      'Shelter access and treatment access are separate. For every placement, confirm accessibility, medication storage, service-animal accommodation, household fit, and arrival instructions.',
    entries: [
      {
        name: 'Lutheran Metropolitan Ministry Men’s Shelter',
        summary: 'Emergency shelter at 2100 Lakeside Avenue. Direct arrival is allowed.',
        service: 'Emergency shelter at 2100 Lakeside Avenue, Cleveland.',
        eligibility:
          'Adults who wish to be served in the single-sex men’s shelter. This is not a family shelter.',
        intake:
          'Adults seeking the men’s shelter may come directly to 2100 Lakeside without an appointment. Call 211 or Coordinated Intake for routing and other needs.',
        confirm:
          'The provider permits direct shelter access even though Coordinated Intake itself is phone-only. Confirm support for personal-care or mobility needs before transport.',
        phones: ['211', '216-674-6700'],
        sources: [
          {
            label: 'lutheranmetro.org',
            href: 'https://www.lutheranmetro.org/what-we-do/programs/housing-and-shelter/',
          },
        ],
      },
      {
        name: 'YWCA Norma Herr Center',
        summary: 'Low-barrier emergency shelter for women. Published ages 18–80.',
        service: 'Low-barrier emergency shelter for women experiencing homelessness.',
        eligibility:
          'Women seeking individual shelter. The published description specifies ages 18–80. Request case-specific guidance for anyone outside that range.',
        intake:
          'Use Coordinated Intake at 216-674-6700. After hours, use 211. Ask for the current arrival location and placement instructions.',
        confirm:
          'Pages use both Norma Herr Center and Norma Herr Women’s Center. Confirm placement suitability and the current entrance during facility changes.',
        phones: ['216-674-6700', '211'],
        sources: [
          { label: 'ywcaofcleveland.org', href: 'https://www.ywcaofcleveland.org/' },
          {
            label: 'Coordinated Intake',
            href: 'https://www.frontlineservice.org/coordinated-intake',
          },
        ],
      },
      {
        name: 'The City Mission Crossroads Men’s Crisis Center',
        summary: 'Christ-centered residential crisis programming for men. Call about bed space.',
        service:
          'Christ-centered residential crisis and stabilization programming for men, with practical support toward housing.',
        eligibility:
          'Adult men seeking this program model. Admission screening and available space govern acceptance.',
        intake:
          'Call 216-431-3515 to discuss the program and available bed space. Use the provider’s Get Help page for current instructions.',
        confirm:
          'Ask about length of stay, required programming, work schedules, medications, and clinical needs. Call 211 when same-night placement is needed.',
        phones: ['216-431-3515', '211'],
        sources: [{ label: 'thecitymission.org', href: 'https://thecitymission.org/get-help/' }],
      },
    ],
  },
  {
    id: 'family-shelters',
    group: 'Shelter',
    title: 'Shelters for adults with families',
    intro:
      'These programs are listed because the client is an adult parent or caregiver. Children may accompany the adult. Child-only placement programs are not listed as adult shelters.',
    entries: [
      {
        name: 'Salvation Army Zelma George Family Shelter',
        summary: 'Emergency family shelter at Harbor Light, 1710 Prospect Avenue East.',
        service:
          'Emergency family shelter within Harbor Light Complex, 1710 Prospect Avenue East, Cleveland.',
        eligibility:
          'Families experiencing homelessness. Confirm accepted family composition and children’s ages during county intake.',
        intake:
          'Call Coordinated Intake at 216-674-6700 or 211 after hours. Harbor Light’s general information number is 216-781-3773.',
        confirm:
          'Request family placement rather than detox, men’s transitional housing, or the community-corrections program. Each has a different admission route.',
        phones: ['216-674-6700', '211', '216-781-3773'],
        sources: [
          {
            label: 'Harbor Light',
            href: 'https://easternusa.salvationarmy.org/northeast-ohio/clevelandharborlight/who-we-are/',
          },
          {
            label: 'Harbor Light contact',
            href: 'https://easternusa.salvationarmy.org/northeast-ohio/clevelandharborlight/contact-us/',
          },
        ],
      },
      {
        name: 'Family Promise of Greater Cleveland',
        summary: 'Temporary shelter and case management for homeless families.',
        service:
          'Temporary shelter and case management helping families obtain housing, employment, and needed services.',
        eligibility:
          'Homeless families of any composition, according to the provider. Shelter is free. Confirm dependent-child and household requirements.',
        intake:
          'Begin with Coordinated Intake at 216-674-6700 or 211. Use Family Promise’s How to Access Shelter and Support link for program guidance.',
        confirm:
          'Do not assume an adult couple without dependents qualifies. Confirm family configuration, capacity, and assignment before traveling.',
        phones: ['216-674-6700', '211'],
        sources: [
          { label: 'familypromisecle.org', href: 'https://familypromisecle.org/' },
          {
            label: 'Coordinated Intake',
            href: 'https://www.frontlineservice.org/coordinated-intake',
          },
        ],
      },
      {
        name: 'West Side Catholic Center Moriah House',
        summary: 'Family shelter, plus a separate pathway for female veterans.',
        service:
          'Family shelter with meals, basic supplies, housing navigation, and case management. The provider also lists beds for female veterans.',
        eligibility:
          'Families experiencing homelessness. The female-veteran pathway has its own screening.',
        intake:
          'County placement: 216-674-6700. Housing-program information: 216-631-4741. Female veterans: extension 108.',
        confirm:
          '3135 Lorain Avenue is the center’s public contact address. Obtain actual shelter arrival instructions. Ask about household composition and housing-assistance eligibility.',
        phones: ['216-674-6700', '216-631-4741'],
        sources: [{ label: 'wsccenter.org', href: 'https://www.wsccenter.org/housingsupport' }],
      },
    ],
  },
  {
    id: 'specialized-shelter',
    group: 'Shelter',
    title: 'Specialized shelter and medical respite',
    entries: [
      {
        name: 'The City Mission Laura’s Home',
        summary:
          'Crisis housing for single women and mothers with children. Currently a waiting list.',
        service: 'Christ-centered crisis housing for single women and mothers with children.',
        eligibility:
          'Adult women, including adult mothers accompanied by children. Program screening applies.',
        intake:
          'Call 216-472-5500. The Get Help page reports a full program with a waiting list. Women must call to join it. Website inquiries do not add someone to the list.',
        confirm:
          'Treat this as a waitlist referral, not an available bed. Use Coordinated Intake or 211 for an urgent shelter need.',
        phones: ['216-472-5500', '216-674-6700', '211'],
        flag: 'waitlist',
        sources: [{ label: 'thecitymission.org', href: 'https://thecitymission.org/get-help/' }],
      },
      {
        name: 'Journey Center for Safety and Healing',
        summary: 'Confidential emergency shelter for people escaping domestic violence.',
        service:
          'Confidential emergency shelter and advocacy for people escaping domestic violence.',
        eligibility:
          'Adult survivors seeking safety, with or without accompanying children. The helpline assesses household and safety needs.',
        intake:
          'Call the 24-hour helpline at 216-391-4357. Ask for emergency shelter screening and a safe plan for arrival.',
        confirm:
          'Confirm arrangements for men, transgender, or nonbinary survivors and accompanying dependents directly. Do not disclose a shelter address or leave an unsafe voicemail.',
        phones: ['216-391-4357'],
        sources: [
          { label: 'journeyneo.org', href: 'https://www.journeyneo.org/emergency-shelter' },
        ],
      },
      {
        name: 'Joseph and Mary’s Home',
        summary: 'Medical respite after hospital care. Not general overnight shelter.',
        service:
          'Medical respite for adults experiencing homelessness who are ready to leave hospital care but cannot safely recover on the street or in a standard shelter.',
        eligibility:
          'Adults with acute, short-term medical recovery needs. Clinical review determines fit. This is not general overnight shelter or an inpatient hospital.',
        intake:
          'Call 216-685-1551 and request the current medical referral process. Ask the discharge planner or treating clinician to coordinate records. Public address: 2302 Community College Avenue.',
        confirm:
          'Confirm nursing needs, functional independence, medications, equipment, and bed acceptance before discharge.',
        phones: ['216-685-1551'],
        sources: [{ label: 'jmhome.org', href: 'https://jmhome.org/' }],
      },
    ],
  },
  {
    id: 'maternity-housing',
    group: 'Shelter',
    title: 'Maternity homes and pregnancy-related housing',
    intro:
      'Prioritize a same-day shelter route if the client has nowhere safe to stay. Maternity homes and recovery residences usually require screening and may not offer immediate placement.',
    entries: [
      {
        name: 'The Haven Home',
        summary: 'Transitional maternity housing at 2971 East 61st Street.',
        service: 'Transitional maternity housing and support at 2971 East 61st Street, Cleveland.',
        eligibility:
          'Pregnant and parenting women experiencing homelessness, with up to two children under age five, according to its Get Help page.',
        intake:
          'Complete the online intake form or call 216-785-9218 extension 102. Intake staff arrange an appointment. Messages are normally returned within one business day.',
        confirm:
          'This is transitional housing, not the former emergency overflow model. Confirm adult age criteria, fees, length of stay, and clinical accommodations. Emergencies: 211.',
        phones: ['216-785-9218', '211'],
        sources: [{ label: 'thehavenhome.org', href: 'https://www.thehavenhome.org/get-help' }],
      },
      {
        name: 'Zelie’s Home',
        summary: 'Supportive housing for unhoused pregnant and parenting women and families.',
        service:
          'Supportive housing and phased programming for unhoused pregnant and parenting women and families.',
        eligibility:
          'Adult pregnant or parenting applicants should request a household-specific eligibility screen. Public pages do not supply a complete admission checklist.',
        intake:
          'Call the Get Help line at 216-282-8053. General information: 440-886-2620. Ask for intake and current housing options.',
        confirm:
          'Confirm pregnancy or postpartum limits, accompanying children, sobriety or medication policies, fees, and vacancies. The mailing address is not an arrival instruction.',
        phones: ['216-282-8053', '440-886-2620'],
        sources: [
          { label: 'zelieshome.org', href: 'https://www.zelieshome.org/' },
          { label: 'Phase program', href: 'https://www.zelieshome.org/phase-program' },
        ],
      },
      {
        name: 'MetroHealth The Moms House',
        summary: 'Small recovery residence tied to the Mother and Child Dependency Program.',
        service:
          'Supportive recovery housing connected to MetroHealth’s Mother and Child Dependency Program.',
        eligibility:
          'Women with substance-use-related needs during or after pregnancy, and their infants. Program participation and screening apply.',
        intake:
          'Ask MetroHealth’s Mother and Child Dependency team about The Moms House through maternal-fetal medicine. If unsure where to start, call MetroHealth information at 216-778-7800.',
        confirm:
          'The published program describes a small residence, not general maternity shelter. Confirm admission criteria, clinical referral, and bed availability.',
        phones: ['216-778-7800'],
        sources: [
          {
            label: 'Program funding note',
            href: 'https://www.metrohealth.org/en/newsroom/2025/metroHealth-awarded-funding-to-expand-mother-and-child-dependency-program/',
          },
          {
            label: 'Maternal-fetal medicine',
            href: 'https://www.metrohealth.org/en/medical-services/obstetrics-gynecology/pregnancy-care/maternal-fetal-medicine/',
          },
        ],
      },
    ],
  },
  {
    id: 'housing-assistance',
    group: 'Housing',
    title: 'Housing assistance and permanent housing',
    entries: [
      {
        name: 'Cuyahoga Metropolitan Housing Authority',
        summary: 'Public housing, Housing Choice Vouchers, and project-based housing.',
        service: 'Public housing, Housing Choice Vouchers, and project-based housing pathways.',
        eligibility:
          'Households meeting the selected program’s income, household, and other admission requirements. Preferences and screening differ.',
        intake:
          'Use CMHA’s Applicants and Applicant Portals at cmha.net. Apply to the specific program and keep the confirmation and account details.',
        confirm:
          'Verify the current waiting-list notice before applying. An application is not immediate housing. Use Cuyahoga CMHA, not similarly named Columbus or Clermont agencies.',
        sources: [{ label: 'cmha.net', href: 'https://www.cmha.net/' }],
      },
      {
        name: 'EDEN',
        summary: 'Rental assistance and supportive housing. Some programs need a referral.',
        service:
          'Housing solutions and rental assistance for people experiencing housing insecurity or homelessness, including specialized supportive housing.',
        eligibility:
          'Program-specific. Disability, homelessness, income, and referral requirements may apply. Not every EDEN program accepts direct self-applications.',
        intake:
          'Call 216-961-9690 or use EDEN’s program and application information. Ask whether an approved case manager or coordinated-entry referral is required.',
        confirm:
          'Confirm which list is open, required documentation, and the referral agency. Do not assume an old voucher-opening announcement still applies.',
        phones: ['216-961-9690'],
        sources: [
          { label: 'edencle.org', href: 'https://www.edencle.org/' },
          {
            label: 'ADAMHS listing',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider/eden',
          },
        ],
      },
      {
        name: 'CHN Housing Partners renter supports',
        summary: 'Online-only rental-stability help. Once every 24 months if funded.',
        service: 'Rental-stability assistance and housing support.',
        eligibility:
          'Program-specific income and housing criteria. Applicants must show the ability to maintain rent after assistance. Financial assistance is available once every 24 months per household.',
        intake:
          'Apply using the online Renter Supports application. Paper applications are not accepted. Questions: 216-574-7100.',
        confirm:
          'Check funding, geographic coverage, and application status. Assistance is not guaranteed. Bring the lease, arrears or eviction information, and requested income records.',
        phones: ['216-574-7100'],
        sources: [
          {
            label: 'Renter supports',
            href: 'https://chnhousingpartners.org/renter-resources/renter-supports/',
          },
        ],
      },
    ],
  },
  {
    id: 'eviction',
    group: 'Housing',
    title: 'Eviction prevention and fair housing',
    intro:
      'Use this alongside rent assistance. Applying for aid or legal help does not itself stop a court deadline.',
    entries: [
      {
        name: 'Legal Aid and Free Eviction Help',
        summary: 'Eviction screening, advice, and Cleveland Right to Counsel screening.',
        service:
          'Eviction legal screening, advice, and possible representation, including Cleveland Right to Counsel screening.',
        eligibility:
          'Cuyahoga County tenants facing eviction. Representation depends on financial and case screening. Cleveland Right to Counsel has additional criteria. Request current screening rather than relying on older summaries.',
        intake:
          'Call 216-861-5835 or 888-817-3777, or apply at Free Eviction Help. Have the court summons, case number, hearing date, lease, and notices ready if available.',
        confirm:
          'Ask about urgent hearing deadlines, representation acceptance, and documents still needed. Legal help is not a rent grant.',
        phones: ['216-861-5835', '888-817-3777'],
        sources: [{ label: 'freeevictionhelp.org', href: 'https://freeevictionhelp.org/' }],
      },
      {
        name: 'Fair Housing Center for Rights and Research',
        summary: 'Housing discrimination help, including disability-related housing concerns.',
        service:
          'Housing discrimination assistance and fair-housing advocacy, including disability-related housing concerns.',
        eligibility:
          'People experiencing potential housing discrimination. The reviewed page does not publish a universal income threshold. Staff screen the issue.',
        intake:
          'Call 216-361-9240 or select Report Discrimination on the website. Office: 2800 Euclid Avenue, Suite 401, Cleveland. Describe what happened, dates, and the property.',
        confirm:
          'Ask whether the issue is within its service scope and what documentation is useful. This is not emergency shelter or a general rent fund.',
        phones: ['216-361-9240'],
        sources: [{ label: 'thehousingcenter.org', href: 'https://thehousingcenter.org/' }],
      },
    ],
  },
  {
    id: 'supportive-housing',
    group: 'Housing',
    title: 'Supportive housing and outreach',
    entries: [
      {
        name: 'Rising Well, formerly Front Steps',
        summary: 'Integrated mental health, recovery, and supportive housing.',
        service: 'Integrated mental health, recovery, and supportive housing services.',
        eligibility:
          'Adults seeking help with behavioral health and housing instability. Eligibility is specific to the service and housing program.',
        intake:
          'Call 216-781-2250 for information or referral. Public contact: 2554 West 25th Street, Cleveland.',
        confirm:
          'Request a clinical screen and a housing screen separately. Ask whether a referral, documented disability, or homelessness history is needed. Do not treat the office as an emergency shelter.',
        phones: ['216-781-2250'],
        sources: [
          { label: 'risingwell.org', href: 'https://risingwell.org/' },
          { label: 'Contact', href: 'https://risingwell.org/contact/' },
        ],
      },
      {
        name: 'YWCA Cogswell Hall and Independence Place',
        summary: 'Permanent supportive housing. Independence Place is ages 18–24.',
        service: 'Permanent supportive housing and associated case management.',
        eligibility:
          'Cogswell Hall serves adults who have experienced homelessness. Independence Place serves young adults ages 18–24 with homelessness and other challenges.',
        intake:
          'Contact YWCA at 216-881-6878 and ask about the particular housing program’s referral route.',
        confirm:
          'Confirm income, disability, homelessness, vacancy, and referral criteria. These programs are not interchangeable with Norma Herr emergency shelter.',
        phones: ['216-881-6878'],
        sources: [{ label: 'ywcaofcleveland.org', href: 'https://www.ywcaofcleveland.org/' }],
      },
      {
        name: 'Metanoia Project',
        summary: 'Seasonal low-barrier shelter plus year-round resource navigation.',
        service: 'Low-barrier seasonal emergency shelter plus year-round resource navigation.',
        eligibility:
          'Adults experiencing homelessness, especially those facing barriers to other services. Seasonal operation determines overnight access.',
        intake:
          'Use Metanoia’s Services page and call 211 to verify the current season, site, and transport instructions.',
        confirm:
          'Do not treat winter 2025–26 locations or hours as confirmation for a later season. Ask 211 about NEOCH seasonal options as well.',
        phones: ['211'],
        sources: [
          { label: 'metanoiaproject.org', href: 'https://www.metanoiaproject.org/' },
          { label: 'Services', href: 'https://www.metanoiaproject.org/services' },
          {
            label: '2025 seasonal shelter announcement',
            href: 'https://cuyahogacounty.gov/executive/news/press-releases-archive/2025-press-releases/2025/11/18/cuyahoga-county-announces-seasonal-shelter-program-providers',
          },
        ],
      },
    ],
  },
  {
    id: 'food-benefits',
    group: 'Food',
    title: 'Food, groceries, and nutrition benefits',
    entries: [
      {
        name: 'Greater Cleveland Food Bank',
        summary: 'Pantry locator, meal sites, and SNAP application help. Help Center 216-738-2067.',
        service:
          'Pantry and meal-site locator, Community Resource Center, and SNAP application assistance.',
        eligibility:
          'Adults and households needing food. Individual pantry programs may have income, service-area, or appointment requirements.',
        intake:
          'Call 216-738-2067 for a nearby open pantry, meal site, or benefits application help. Ask about food available today, not only the next scheduled distribution.',
        confirm:
          'Ask about ID, household registration, appointments, mobility access, and delivery. The distribution warehouse is not a substitute for a confirmed client food site.',
        phones: ['216-738-2067'],
        sources: [
          {
            label: 'Help Center',
            href: 'https://www.greaterclevelandfoodbank.org/get-help/help-center',
          },
          {
            label: 'Find Food',
            href: 'https://www.greaterclevelandfoodbank.org/get-help/find-food',
          },
        ],
      },
      {
        name: 'Hunger Network',
        summary: 'Map of food pantries and hot-meal sites.',
        service:
          'Network of food pantries and hot-meal sites, including a searchable map and schedule changes.',
        eligibility: 'People needing food. Each location sets its service area and intake details.',
        intake:
          'Use Find Food to locate a nearby program, then contact that site before arrival. If online access is a barrier, ask 211 to help identify the location.',
        confirm:
          'Verify ZIP-code eligibility, current hours, and visit frequency. Check the schedule-change notice as well as the map.',
        phones: ['211'],
        sources: [{ label: 'Find Food', href: 'https://hungernetwork.org/find-help/find-food/' }],
      },
      {
        name: 'Ohio SNAP',
        summary:
          'Ongoing food benefits. Ask about expedited processing when food and money are critically low.',
        service: 'Ongoing food-purchasing benefits for eligible households.',
        eligibility:
          'Income and household rules apply. The county evaluates all applicable conditions. Ask for screening even if eligibility is uncertain.',
        intake:
          'Apply through Ohio Benefits online, by phone through county assistance, or in person at county JFS. Application questions: 1-844-640-6446. Food Bank staff can assist by phone.',
        confirm:
          'Ask about expedited processing when food and money are critically low. Submit requested verification, complete the interview, and keep proof of submission.',
        phones: ['844-640-6446', '216-738-2067'],
        sources: [
          { label: 'SNAP', href: 'https://benefits.ohio.gov/SNAP' },
          {
            label: 'Ohio Benefits help desk',
            href: 'https://ssp.benefits.ohio.gov/apspssp/ssp.portal/informationLinks/helpDesk',
          },
        ],
      },
    ],
  },
  {
    id: 'food-follow-through',
    group: 'Food',
    title: 'Food referral follow-through',
    intro:
      'Use this worksheet with the provider entries that follow. It is an advocate record, not a program application.',
    notes: [
      'Household: adult client name or initials, ZIP or address, household size, safe callback, kitchen or refrigerator, mobility and transport, and language.',
      'Confirm the referral: provider and staff contact, appointment or day and last arrival, eligibility documents or alternatives, and proxy or delivery arrangement.',
      'Plan the next week: next permitted pantry visit, prepared-meal backup, SNAP or WIC application or follow-up, and outstanding household essentials.',
      'Close the loop: was food received, follow-up date, and if declined, the reason and the next referral.',
    ],
    entries: [],
  },
  {
    id: 'food-choice',
    group: 'Food',
    title: 'Choose a food referral the client can use',
    intro:
      'Start with what the client can actually use today. These questions are practice notes, not extra program rules. Confirm today’s hours, last arrival, household or ZIP eligibility, documents, appointment, walk-in capacity, proxy form, accessibility, and quantity before anyone travels.',
    notes: [
      'No kitchen or refrigeration: choose a prepared meal or request ready-to-eat items. Ask about dietary restrictions, chewing or swallowing needs, and a safe way to store food.',
      'No transportation or cannot carry groceries: screen for delivery, an authorized proxy, a nearby meal site, or a pantry reachable by transit. May Dugan publishes proxy pickup. Lakewood Community Services Center and Benjamin Rose have distinct delivery programs.',
      'No ID or permanent address: ask about alternatives before ruling out help. St. Vincent de Paul publishes no-ID access but also lists service boundaries. May Dugan’s no-ID policy applies to its clothing room. Do not assume it applies to food.',
      'Food plus household essentials: ask separately about toilet paper, soap, menstrual products, diapers, adult incontinence supplies, laundry, bedding, and cleaning products.',
      'A need today and an ongoing need: arrange today’s meal while helping the client pursue SNAP, WIC if eligible, or recurring pantry or delivery enrollment.',
    ],
    entries: [],
  },
  {
    id: 'groceries-frequent',
    group: 'Food',
    title: 'Groceries: frequent pickup and neighborhood access',
    entries: [
      {
        name: 'May Dugan Center',
        summary:
          'Weekly prepacked groceries and a clothing room. Reserve ahead; no same-day appointments.',
        service:
          'Prepacked groceries and produce, with meat when available. Clothing room offers up to 10 items per person weekly.',
        eligibility:
          'Community members in need. Food: one household visit weekly. Ask about food registration and documents. Clothing: no ID required; sign-out required.',
        intake:
          'Food: Wednesday 11:30 a.m.–6 p.m.; Friday 11:30 a.m.–3:30 p.m. Walk-ins while supplies last. Reserve ahead at 216-631-5800 ext. 300 or online. No same-day appointments. Front desk: ext. 100.',
        confirm:
          'Proxy form permits pickup for up to four households. Clothing: Monday, Wednesday, and Friday 9:30 a.m.–2:30 p.m. Call first because an attendant must be present. Confirm the arrival address and food eligibility.',
        phones: ['216-631-5800'],
        sources: [{ label: 'maydugancenter.org', href: 'https://www.maydugancenter.org/food' }],
      },
      {
        name: 'Food Bank Community Resource Center',
        summary:
          'Food market at 15500 South Waterloo Road. Building hours are not the market schedule.',
        service:
          'Food market and connections to onsite community partners. Client location: 15500 South Waterloo Road, Cleveland.',
        eligibility:
          'Adults and households meeting applicable food-program criteria. Partner programs have separate eligibility. Ask about market registration and income screening.',
        intake:
          'Call the Food Bank Help Center, 216-738-2067, for market intake. Open the current monthly calendar before choosing a visit.',
        confirm:
          'Building hours are not the market schedule. Confirm appointment-only periods, senior shopping hours, household visit limits, and documents. Diaper or partner events have separate dates and stock limits.',
        phones: ['216-738-2067'],
        sources: [
          {
            label: 'Community Resource Center',
            href: 'https://www.greaterclevelandfoodbank.org/get-help/community-resource-center',
          },
          { label: 'FAQs', href: 'https://www.greaterclevelandfoodbank.org/get-help/faqs' },
        ],
      },
      {
        name: 'Cuyahoga County Public Library mobile pantries',
        summary: 'Drive-through distributions with the Food Bank. First come, first served.',
        service:
          'Drive-through food distributions with the Food Bank at participating library branches.',
        eligibility:
          'Households needing food. Registration occurs onsite. First come, first served while supplies last.',
        intake:
          'Use the library’s Mobile Pantry calendar. Posted distribution window: 1:30–3 p.m. September 2026 examples on the calendar included Brook Park on September 16 and Garfield Heights on September 22.',
        confirm:
          'Recheck dates, weather cancellations, and the branch address. Ask the branch about access without a car. Dated examples are not a permanent monthly schedule.',
        sources: [{ label: 'Mobile pantry', href: 'https://cuyahogalibrary.org/mobile-pantry' }],
      },
    ],
  },
  {
    id: 'groceries-heights',
    group: 'Food',
    title: 'Groceries: Heights, Euclid, and southeast communities',
    entries: [
      {
        name: 'Heights Emergency Food Center',
        summary:
          'Monthly pantry at 3663 Mayfield Road for four listed cities. Income at or below 200% FPL.',
        service: 'Monthly pantry at 3663 Mayfield Road, Cleveland Heights. Phone 216-381-0707.',
        eligibility:
          'Cleveland Heights, University Heights, South Euclid, and Lyndhurst residents. Provider posts income at or below 200% of the federal poverty level. Once per calendar month.',
        intake:
          'Monday 4–6 p.m.; Tuesday and Friday 9–11:30 a.m.; Thursday 9 a.m.–2:30 p.m. New clients: photo ID, current address proof beyond a driver’s license, household birthdates, and contact details. Returning clients bring photo ID. Address verification is annual.',
        confirm:
          'Additional fourth-Thursday evening hours are usually 4:30–6 p.m. Holiday exceptions apply, and the website’s holiday dates contain inconsistencies. Call before holiday travel or if documents are missing.',
        phones: ['216-381-0707'],
        sources: [{ label: 'heightsfoodcenter.org', href: 'https://www.heightsfoodcenter.org/' }],
      },
      {
        name: 'Euclid Hunger Center',
        summary: 'Wednesday and Saturday distributions at Shore Cultural Centre, rear Door 8.',
        service:
          'Food assistance at Shore Cultural Centre, 291 East 222nd Street, Euclid, entrance through rear Door 8.',
        eligibility:
          'People seeking emergency food. The public landing page does not fully state residency, income, or document rules. Call for household screening.',
        intake:
          '216-731-3329. Posted distribution: Wednesday and Saturday, 10 a.m.–1 p.m. Ask about first-visit registration and permitted visit frequency.',
        confirm:
          'Confirm service area, household documentation, accessibility at the entrance, and holiday closures. Do not infer that every county resident qualifies from the program name.',
        phones: ['216-731-3329'],
        sources: [{ label: 'euclidhungercenter.com', href: 'https://www.euclidhungercenter.com/' }],
      },
      {
        name: 'South East Clergy Hunger Center',
        summary: 'Thursday pantry through a separate parking-lot entrance at South Haven UCC.',
        service: 'Pantry accessed through a separate parking-lot entrance to the church basement.',
        eligibility:
          'Provider lists Bedford, Bedford Heights, Warrensville Heights, Oakwood, Solon, Garfield Heights, and Highland Heights. Proof of address, income, household members, and photo ID requested.',
        intake:
          'Call 440-232-5115. Posted hours: Thursday 9–11:45 a.m. Ask for the exact arrival address, registration, and visit limit.',
        confirm:
          'Verify the listed municipality and any boundary exceptions before travel. Ask about stairs, accommodation, and alternatives to missing documents.',
        phones: ['440-232-5115'],
        sources: [
          { label: 'southhavenucc.org', href: 'https://www.southhavenucc.org/hungercenter' },
        ],
      },
    ],
  },
  {
    id: 'groceries-west',
    group: 'Food',
    title: 'Groceries: Parma, Lakewood, and kosher food',
    entries: [
      {
        name: 'Parma Hunger Center',
        summary:
          'Monthly groceries for Parma residents. Call first; the page conflicts on appointments.',
        service:
          'Emergency groceries and hygiene items as available. 5280 Broadview Road, rear entrance on the Tuxedo side.',
        eligibility:
          'Parma residents meeting federal income guidelines. ID showing address requested. Monthly food assistance.',
        intake:
          '216-316-5772. Tuesday 2–4 p.m.; Friday 10 a.m.–noon. Arrive at least 15 minutes before closing.',
        confirm:
          'The same page says no appointment is needed and also says to call to register before every visit. Call first and ask about ID alternatives.',
        phones: ['216-316-5772'],
        flag: 'confirm',
        sources: [{ label: 'plcparma.org', href: 'https://www.plcparma.org/parma-hunger-center' }],
      },
      {
        name: 'Lakewood Community Services Center grocery delivery',
        summary: 'Twice-monthly grocery delivery for registered Lakewood households.',
        service:
          'Registered Lakewood households can receive grocery delivery twice monthly. Separate senior deliveries serve participating subsidized apartment buildings.',
        eligibility:
          'Home-delivery program is described for Lakewood residents. Other LCSC services also serve Rocky River and Westlake. Do not assume those cities qualify for this delivery route.',
        intake:
          '216-226-6466. Use the Home Delivery Application or request staff assistance. Office: 12900 Madison Avenue, Lakewood.',
        confirm:
          'Confirm enrollment documents, income criteria, delivery days, building access, and someone to receive food. Call if the online form does not display.',
        phones: ['216-226-6466'],
        sources: [
          {
            label: 'Home delivery',
            href: 'https://www.lcsclakewood.org/services/food-services/home-delivery/',
          },
          {
            label: 'Application',
            href: 'https://www.lcsclakewood.org/apply-for-assistance/home-delivery-application/',
          },
        ],
      },
      {
        name: 'Cleveland Kosher Food Pantry',
        summary: 'Registered drive-through kosher groceries. Confirm the active pickup site.',
        service:
          'Kosher groceries through registered drive-through distributions, with separate deliveries to participating senior buildings.',
        eligibility:
          'Adults and households experiencing food insecurity. Ask about service area, financial criteria, and available delivery buildings.',
        intake:
          '216-382-7202. Register through the Services page. The site lists 2004 South Green Road. Confirm the current distribution address.',
        confirm:
          'A future facility at 4090 Mayfield Road is announced, so verify the active pickup site. Ask about access without a car, current distribution dates, and dietary needs.',
        phones: ['216-382-7202'],
        flag: 'confirm',
        sources: [
          { label: 'Services', href: 'https://kosherfp.org/services/' },
          { label: 'kosherfp.org', href: 'https://kosherfp.org/' },
        ],
      },
    ],
  },
  {
    id: 'salvation-army-food',
    group: 'Food',
    title: 'Salvation Army neighborhood food contacts',
    intro:
      'Adults and families can ask these corps about pantry intake. Call the location serving the household’s address for hours, ZIP boundaries, documents, frequency, and available food. These are pantry contacts. Harbor Light shelter and detox have separate intake. Do not reuse an old produce calendar: a West Park announcement located during review specifies 2025 dates and does not verify a later distribution.',
    entries: [
      {
        name: 'Salvation Army corps pantries',
        summary: 'Five neighborhood pantry contacts. Ask which food program is operating today.',
        service:
          'Pantry groceries, prepared meals, and produce events may have different schedules and enrollment.',
        eligibility:
          'Call the corps that serves the household’s address. Coverage is not countywide from every site.',
        intake:
          'Ask what is operating today and whether the client’s address is covered. If this location cannot help, request the correct corps or call the Food Bank Help Center at 216-738-2067.',
        confirm:
          'Record the worker’s name, appointment, documents or permitted substitutes, entrance, and last arrival time.',
        phones: ['216-738-2067'],
        rows: [
          {
            place: 'East Cleveland',
            detail: '1507 Doan Avenue, East Cleveland',
            contact: '216-249-4334',
          },
          {
            place: 'Miles Park',
            detail: '4139 East 93rd Street, Cleveland',
            contact: '216-341-1640',
          },
          { place: 'Ohio City', detail: '4402 Clark Avenue, Cleveland', contact: '216-631-1515' },
          { place: 'Temple', detail: '17625 Grovewood Avenue, Cleveland', contact: '216-692-1388' },
          { place: 'West Park', detail: '12645 Lorain Avenue, Cleveland', contact: '216-252-3593' },
        ],
        sources: [
          {
            label: 'Greater Cleveland',
            href: 'https://easternusa.salvationarmy.org/greater-cleveland/',
          },
        ],
      },
    ],
  },
  {
    id: 'svdp-pantries',
    group: 'Food',
    title: 'St. Vincent de Paul pantry locations',
    intro:
      'Published walk-in pantries. No ID or income proof is listed, and service boundaries also apply. Call to reconcile those two facts. Central office: 216-696-6525 ext. 3150. Ask about visit limits. Brookside’s geographic description and listed ZIP codes do not align clearly.',
    entries: [
      {
        name: 'St. Vincent de Paul walk-in pantries',
        summary: 'Six local pantry sites. Confirm the client’s address before travel.',
        service: 'Walk-in pantry groceries at the published sites below.',
        eligibility:
          'The published no-ID statement is useful for a client without documents. It is not proof of countywide eligibility at every site.',
        intake:
          'Call 216-696-6525 ext. 3150, or the site contact, and ask staff to check the client’s actual address.',
        confirm:
          'Recheck pantry hours around holidays. Use this guide’s current shelter and utility sections rather than older external referrals on the source page.',
        phones: ['216-696-6525'],
        rows: [
          {
            place: 'John Paul II Ozanam',
            detail: '8328 Broadway. Saturday 9 a.m.–noon. ZIP codes 44105, 44125, 44127.',
          },
          {
            place: 'Fr. Michael Wittman',
            detail: '14305 Shaw, East Cleveland. Saturday 10 a.m.–noon. Confirm ZIP.',
            contact: '216-541-1431',
          },
          {
            place: 'Southwest Ozanam',
            detail:
              '2145 Broadview. Tuesday, Thursday, and Saturday 10 a.m.–1 p.m. ZIP codes 44109, 44129, 44130, 44134, 44142, 44144.',
          },
          {
            place: 'St. Patrick / St. Malachi',
            detail:
              '3606 Bridge. First and third Wednesday, 9:30 a.m.–noon. ZIP codes 44102 and 44113.',
            contact: '216-541-1444',
          },
          {
            place: 'Brookside',
            detail:
              '3764 Pearl. Monday and Friday 9:30 a.m.–12:30 p.m. Boundaries conflict with listed ZIP codes.',
            contact: '216-541-1444',
          },
          {
            place: 'Community Corner',
            detail:
              '8300 Detroit. Monday 1:30–4:30 p.m.; Thursday 9:30 a.m.–noon. Confirm address.',
            contact: '216-541-1444',
          },
        ],
        sources: [{ label: 'svdpcle.org', href: 'https://svdpcle.org/get-help/' }],
      },
    ],
  },
  {
    id: 'prepared-meals',
    group: 'Food',
    title: 'Prepared meals and food without a kitchen',
    entries: [
      {
        name: 'St. Herman House FOCUS Cleveland',
        summary:
          'Daily meals. Grocery bags in the last five weekdays are for households with dependents.',
        service:
          'Daily meals: breakfast 7:30–9 a.m.; lunch 11:30 a.m.–noon; dinner 5:30–6 p.m. Breakfast is generally coffee and pastries, sometimes hot food.',
        eligibility:
          'People in need of meals. Grocery distribution during the last five weekdays of the month is specifically for households with children or dependents.',
        intake:
          '216-961-3806. Request meal arrival instructions. Produce: Thursday 8:30–10 a.m. Grocery bags: last five weekdays, 2–3 p.m.',
        confirm:
          'Sandwiches when available: noon–12:30 p.m. and 6–6:30 p.m. Hygiene is also listed at those times and Monday and Friday 1–2 p.m. Men’s clothing Monday and Friday 1–2 p.m. Confirm holiday or stock changes.',
        phones: ['216-961-3806'],
        sources: [{ label: 'sainthermans.org', href: 'https://sainthermans.org/our-work/' }],
      },
      {
        name: 'St. Augustine Hunger Center',
        summary: 'Free weekday meals at 2346 West 14th Street. Confirm weekends directly.',
        service: 'Free prepared meals at 2346 West 14th Street, Cleveland.',
        eligibility: 'People needing a meal. Catholic Charities welcomes all.',
        intake:
          '216-415-5101. Catholic Charities’ current county meal page lists Monday–Friday breakfast 8–9:30 a.m. and lunch noon–1:30 p.m.',
        confirm:
          'Ask directly about weekend meals, takeaway options, and dietary needs. A networkwide statement about seven-day meal service is not proof of this site’s weekend schedule.',
        phones: ['216-415-5101'],
        sources: [
          {
            label: 'County meals',
            href: 'https://www.ccdocle.org/programs/community-hot-meals/cuyahoga-county-meals',
          },
        ],
      },
      {
        name: 'West Side Catholic Center meals and choice pantry',
        summary:
          'Weekday breakfast and lunch, Saturday breakfast and dinner, plus a choice pantry.',
        service:
          'Breakfast and lunch Monday–Friday. Breakfast and dinner Saturday. Also a choice pantry, monthly mobile produce, and daytime respite.',
        eligibility:
          'People needing meals or food support. Pantry intake may differ from meal access.',
        intake:
          '3135 Lorain Avenue. 216-631-4741. Call or visit the Resource Center for meal times and pantry arrangements.',
        confirm:
          'The reviewed page specifies meal days but not exact serving times. Ask about today’s meal, emergency groceries, pantry appointment or registration, and the monthly produce date.',
        phones: ['216-631-4741'],
        sources: [{ label: 'Meals', href: 'https://www.wsccenter.org/meals' }],
      },
    ],
  },
  {
    id: 'home-meals',
    group: 'Food',
    title: 'Home-delivered meals and senior food boxes',
    entries: [
      {
        name: 'Benjamin Rose Meals on Wheels',
        summary:
          'Weekday home-delivered meal. Age 60+ may receive meals free. Someone must receive the delivery.',
        service:
          'One daily meal Monday–Friday, normally delivered 10 a.m.–2 p.m. Medically tailored options may be available.',
        eligibility:
          'Cuyahoga residents unable to shop for or prepare meals independently. Age 60+ may receive meals free. Younger adults may ask about self-pay.',
        intake:
          'Program line 216-373-1994, or complete the online intake form. Describe functional needs, address, and dietary restrictions.',
        confirm:
          'The client or a family member must receive delivery. Perishables are not left outside. Confirm enrollment timing, special diets, younger-adult price, and holiday or weather coverage.',
        phones: ['216-373-1994'],
        sources: [
          {
            label: 'Home-delivered meals',
            href: 'https://www.benrose.org/programs-and-services/health-wellness-services/home-delivered-meals/',
          },
        ],
      },
      {
        name: 'Southeast Clergy Meals on Wheels',
        summary:
          'Paid or low-cost meal delivery for ZIP 44146. Current fee was not established from the public page.',
        service:
          'Volunteer meal delivery operating five days weekly from South Haven’s Fellowship Hall.',
        eligibility:
          'People in ZIP 44146 — Bedford, Bedford Heights, Oakwood Village, and Walton Hills — who are unable to shop for or prepare adequate meals. This is a paid or low-cost program.',
        intake:
          'Use the Meals on Wheels link from South Haven’s page and request client enrollment. Ask about delivery eligibility, current cost, and start date.',
        confirm:
          'An exact current fee and enrollment telephone were not established from the accessible primary page. Use 211 for assisted contact if the program site does not load.',
        phones: ['211'],
        flag: 'confirm',
        sources: [
          { label: 'Meals on Wheels', href: 'https://www.southhavenucc.org/meals-on-wheels' },
        ],
      },
      {
        name: 'Library senior food boxes',
        summary:
          'Monthly box for adults 60+ who are approved in advance. A supplement, not daily meals.',
        service:
          'Monthly senior food-box distribution at participating Cuyahoga County Public Library branches.',
        eligibility:
          'Adults age 60+ meeting income guidelines. Advance application required. Separate from open mobile-pantry registration.',
        intake:
          'See the library Mobile Pantry page and ask a participating branch for a Senior Food Box application. Listed branches include Bedford, Brooklyn, Maple Heights, and South Euclid-Lyndhurst.',
        confirm:
          'Confirm application approval, pickup appointment, identification, and proxy rules. A senior box does not replace daily meals.',
        sources: [{ label: 'Mobile pantry', href: 'https://cuyahogalibrary.org/mobile-pantry' }],
      },
    ],
  },
  {
    id: 'hygiene',
    group: 'Essentials',
    title: 'Hygiene, showers, laundry, and adult clothing',
    entries: [
      {
        name: 'Malachi Center',
        summary: 'Walk-in showers, hygiene supplies, laundry, and grab-and-go breakfast.',
        service: 'Walk-in showers, hygiene supplies, clothes washing, and grab-and-go breakfast.',
        eligibility: 'Any adult in need.',
        intake:
          '2416 Superior Viaduct, Cleveland. 216-771-3036. Showers Monday–Friday 9:30 a.m.–2 p.m. The shower page lists free onsite laundry 9:30 a.m.–noon.',
        confirm:
          'Confirm laundry load limits, last check-in, available machines, and whether laundry follows the same weekdays. Ask about clothing through PEARLS Closet separately.',
        phones: ['216-771-3036'],
        sources: [
          {
            label: 'Shower program',
            href: 'https://www.malachicenter.org/programs-services/programs/shower-program',
          },
        ],
      },
      {
        name: 'West Side Catholic Center clothing and survival services',
        summary: 'Clothes, toiletries, appointment-based showers, mailboxes, and ID voucher help.',
        service:
          'Free clothes, shoes, toiletries, and household goods. Appointment-based showers, phone access, mailboxes, barber services, and ID or birth-certificate voucher help.',
        eligibility:
          'Adults and households needing basic-needs support. Confirm eligibility and limits for each service.',
        intake:
          '216-631-4741. 3135 Lorain Avenue. Request a clothing or basic-needs appointment, or name the specific service needed.',
        confirm:
          'Ask about sizes, supply limits, documents, wait time, and mailbox rules. Healthcare and legal sessions have separate schedules.',
        phones: ['216-631-4741'],
        sources: [{ label: 'Clothing', href: 'https://www.wsccenter.org/clothing' }],
      },
      {
        name: 'The Centers Basic Needs Resource Center',
        summary: 'Food, baby clothing, household items, and connections to other supports.',
        service:
          'Food, baby clothing, household and personal-care items, and connections to housing, transportation, healthcare, and employment supports.',
        eligibility:
          'Families and individuals whose needs match available programs. The public page does not supply a complete income, ZIP, or enrollment rule.',
        intake:
          'Call 216-325-WELL (216-325-9355) or use the BNRC inquiry route. Ask for a basic-needs assessment and the appropriate site.',
        confirm:
          'Ask whether agency enrollment or a referral is needed, what is stocked, and appointment limits. Quick Packs, markets, and perinatal supports are separate options.',
        phones: ['216-325-9355'],
        sources: [
          {
            label: 'Basic Needs Resource Center',
            href: 'https://thecentersohio.org/early-learning/bnrc/',
          },
        ],
      },
    ],
  },
  {
    id: 'family-essentials',
    group: 'Essentials',
    title: 'Diapers, menstrual products, and family essentials',
    intro:
      'Included for adult parents and caregivers. Infant supplies, adult incontinence products, and menstrual supplies have different routes. Name the exact item, size, and urgency.',
    entries: [
      {
        name: 'Diaper Bank of Greater Cleveland',
        summary:
          'Free infant and toddler diapers through partner agencies, not at the bank’s office.',
        service: 'Free infant and toddler diaper support distributed through partner agencies.',
        eligibility: 'Families needing diapers. Partner registration and household rules apply.',
        intake:
          'Use Our Partners to select a distribution agency and register the child. General questions: 216-706-3407. Ask the selected partner about monthly pickup.',
        confirm:
          'The bank does not distribute directly to individuals. Do not arrive at its office expecting supplies. Confirm sizes, quantity, wipes, and documents with the partner.',
        phones: ['216-706-3407'],
        sources: [
          { label: 'Partners', href: 'https://diaperbankgc.org/our-partners/' },
          { label: 'diaperbankgc.org', href: 'https://diaperbankgc.org/' },
        ],
      },
      {
        name: 'Beech Brook Family Needs Store',
        summary:
          'Appointment shopping for detergent, toiletries, menstrual products, diapers, formula, and bedding.',
        service:
          'Appointment-based access to basic items including detergent, toiletries, menstrual products, diapers, formula, bedding, and baby equipment, subject to stock.',
        eligibility:
          'Families struggling to afford essentials. Confirm family-service enrollment, geographic or income criteria, item limits, and any cost.',
        intake:
          'Ask Beech Brook Family Center for a Family Needs Store shopping appointment: 216-391-4069. Family Center: Carl B. Stokes Social Service Mall, 6001 Woodland Avenue, Cleveland.',
        confirm:
          'Confirm the needed item and size before travel. The website’s donation contact is not client appointment intake. This is family support, not adult clinical treatment.',
        phones: ['216-391-4069'],
        sources: [
          {
            label: 'Family Needs Store',
            href: 'https://www.beechbrook.org/support-us/family-needs-store',
          },
          {
            label: 'Family Center',
            href: 'https://www.beechbrook.org/family-center-overview',
          },
        ],
      },
      {
        name: 'MedWish MedWorks adult supplies',
        summary:
          'Adult diapers and donated medical equipment through an approved nonprofit partner.',
        service:
          'Free donated medical equipment and supplies, including adult diapers, bed pads, hygiene items, walkers, wheelchairs, and shower chairs when available.',
        eligibility:
          'Individuals must obtain supplies through an approved nonprofit partner. There is no direct individual aid intake.',
        intake:
          'Ask the client’s social-service agency to request Domestic Aid. Agencies can apply online. Existing partners contact domesticaid@medwish.org. General phone: 216-692-1685.',
        confirm:
          'New agency applications normally receive follow-up within 3–5 business days. Stock is first come, first served. Confirm sizes, quantity, pickup, and clinician guidance for equipment.',
        phones: ['216-692-1685'],
        sources: [{ label: 'Local aid', href: 'https://www.medwish.org/local-aid' }],
      },
    ],
  },
  {
    id: 'furniture-pets',
    group: 'Essentials',
    title: 'Furniture, household setup, and pet food',
    entries: [
      {
        name: 'Cleveland Furniture Bank',
        summary:
          'Furniture through an agency voucher. Posted fees apply. Do not pay before the referral is accepted.',
        service:
          'Furniture assistance through agency vouchers. Curbside delivery has a separate charge.',
        eligibility:
          'Clients referred by participating agencies. Posted identification rules include an Ohio photo ID. Beds for dependents require additional documentation.',
        intake:
          'Furniture for Families: 216-342-7071. Have the caseworker submit the voucher, then confirm payment and appointment instructions. Partner enrollment: 216-459-2265 ext. 107.',
        confirm:
          'Posted charges: $100 administration; $180 total with Cuyahoga curbside delivery. Do not pay before the referral is accepted. Arrange help carrying furniture inside. Older location instructions and the current footer differ, so confirm the site.',
        phones: ['216-342-7071', '216-459-2265'],
        sources: [
          {
            label: 'Voucher instructions',
            href: 'https://clevelandfurniturebank.org/client-instructions-for-voucher-redemption/',
          },
          { label: 'Payment', href: 'https://clevelandfurniturebank.org/voucher-payment/' },
          { label: 'Partners', href: 'https://clevelandfurniturebank.org/partners/' },
        ],
      },
      {
        name: 'St. Vincent de Paul parish assistance',
        summary: 'Local parish groups may help with rent, utilities, food, clothing, or furniture.',
        service:
          'Local parish groups may help with rent, utilities, food, clothing, or furniture according to need and resources.',
        eligibility:
          'Households screened by the appropriate local parish group. Location and available funds matter.',
        intake:
          'Use View Parish Groups from Get Help, or ask the central office to identify the correct group. Describe the specific expense or item and the deadline.',
        confirm:
          'Not a guaranteed cash grant or furniture delivery. Ask whether payment goes to a vendor, what documents are needed, and whether assistance can meet the deadline.',
        phones: ['216-696-6525'],
        sources: [{ label: 'svdpcle.org', href: 'https://svdpcle.org/' }],
      },
      {
        name: 'Cleveland APL Project CARE',
        summary:
          'Supplemental pet food for City of Cleveland residents. Not countywide veterinary care.',
        service:
          'Supplemental pet food and other pet-retention assistance for households experiencing hardship.',
        eligibility:
          'Pet owners residing in the City of Cleveland. Veterinary support has additional restrictions. This is not countywide eligibility.',
        intake:
          '216-377-1633 or projectCARE@clevelandapl.org. Ask for pet-food assistance and the current pickup instructions.',
        confirm:
          'Confirm supply, quantity, location, and documents. Pet food is supplemental. Do not assume a recurring full supply or free veterinary care.',
        phones: ['216-377-1633'],
        sources: [
          { label: 'Project CARE', href: 'https://clevelandapl.org/programs/project-care/' },
        ],
      },
    ],
  },
  {
    id: 'id-phone-internet',
    group: 'Essentials',
    title: 'Identification, phone, and internet access',
    entries: [
      {
        name: 'NEOCH Identification Crisis Collaborative',
        summary: 'Help getting birth certificates and Ohio identification through community sites.',
        service:
          'Help obtaining identity documents and replacement or renewal of Ohio identification through a network of community sites.',
        eligibility:
          'Low-income and unhoused people in Cuyahoga County. Document and site-specific criteria apply.',
        intake:
          '216-432-0540. Ask for a current ID Crisis Collaborative site and whether it can address a birth certificate, Ohio ID, or another needed document.',
        confirm:
          'Confirm the appointment, document costs or vouchers, acceptable identity evidence, and a safe mailing address. The office number is a referral contact, not proof of walk-in document issuance.',
        phones: ['216-432-0540'],
        sources: [{ label: 'neoch.org', href: 'https://www.neoch.org/' }],
      },
      {
        name: 'Lifeline phone or internet discount',
        summary:
          'Federal monthly discount, standard benefit up to $9.25. Not a guaranteed free phone.',
        service:
          'Federal monthly service discount through participating providers. Standard benefit up to $9.25.',
        eligibility:
          'Qualifying program participation such as SNAP or Medicaid, or household income at or below 135% of federal poverty guidelines, subject to verification.',
        intake:
          'Apply through LifelineSupport.org. After approval, choose a participating provider. Application help: 800-234-9473, daily 9 a.m.–9 p.m. Eastern.',
        confirm:
          'Confirm provider coverage, remaining monthly cost, device cost, and recertification. Eligibility does not guarantee a free smartphone or unlimited service.',
        phones: ['800-234-9473'],
        sources: [{ label: 'lifelinesupport.org', href: 'https://www.lifelinesupport.org/' }],
      },
      {
        name: 'DigitalC Canopy',
        summary:
          'Residential internet advertised from $18 a month where the address is covered, plus digital-skills training.',
        service:
          'Residential internet advertised from $18 a month. Click digital-skills training for Cleveland residents.',
        eligibility:
          'Internet service requires a covered address. Availability is not countywide. Training eligibility and scheduling are separate.',
        intake:
          'Check the home address on DigitalC’s website or call Canopy customer service at 216-777-3859. Ask about signup, installation, and current price.',
        confirm:
          'Confirm apartment or landlord access, equipment, and service terms. Ask about training or help completing online applications if that is the immediate need.',
        phones: ['216-777-3859'],
        sources: [{ label: 'digitalc.org', href: 'https://digitalc.org/' }],
      },
    ],
  },
  {
    id: 'medical-primary',
    group: 'Medical care',
    title: 'Medical, dental, and pharmacy care',
    entries: [
      {
        name: 'Care Alliance Health Center',
        summary:
          'Primary care, dental, behavioral health, and pharmacy, including for people experiencing homelessness.',
        service:
          'Primary medical, dental, behavioral health, and pharmacy services. Also lists OB/GYN, optometry, and outreach.',
        eligibility:
          'Adults, including people experiencing homelessness or living in public housing. Sliding fees support access regardless of ability to pay.',
        intake:
          'Call 216-535-9100 or request an appointment online. Clinics include St. Clair, Central, and Stokes. Ask which offers the needed adult service.',
        confirm:
          'Confirm insurance or sliding-fee documents, medication needs, transportation support, and the exact clinic.',
        phones: ['216-535-9100'],
        sources: [{ label: 'carealliance.org', href: 'https://carealliance.org/' }],
      },
      {
        name: 'Neighborhood Family Practice',
        summary: 'Primary care and midwifery on Cleveland’s west side and in Lakewood.',
        service:
          'Primary care, midwifery, and other community health services across Cleveland’s west side and Lakewood.',
        eligibility:
          'Adult new patients, including Medicaid, Medicare, and other insurance. Uninsured applicants should ask about discounted care.',
        intake:
          'Call 216-281-0872 or use new-patient scheduling online. State whether the need is primary care, pregnancy care, or another service.',
        confirm:
          'Confirm site, insurance and income documents, language access, and the earliest appointment. Acute symptoms may require same-day assessment elsewhere.',
        phones: ['216-281-0872'],
        sources: [{ label: 'nfpmedcenter.org', href: 'https://www.nfpmedcenter.org/' }],
      },
      {
        name: 'The Centers and Circle Health Services',
        summary:
          'Integrated primary, dental, and behavioral health care, pharmacy, and recovery support.',
        service:
          'Integrated primary, dental, and behavioral healthcare, pharmacy, and recovery support.',
        eligibility:
          'Adults needing care, including uninsured patients. Medicaid, Medicare, and many private plans are accepted. Sliding fees are available.',
        intake:
          'Appointments: 216-325-9355. Established-care concerns after office hours: 216-721-4010. Request the nearest appropriate adult service.',
        confirm:
          'Ask which clinic provides the needed care and whether same-day access is available. The future Glick campus is listed separately under changes that need a fresh check.',
        phones: ['216-325-9355', '216-721-4010'],
        sources: [{ label: 'thecentersohio.org', href: 'https://thecentersohio.org/' }],
      },
    ],
  },
  {
    id: 'medical-more',
    group: 'Medical care',
    title: 'Additional medical access and benefits',
    entries: [
      {
        name: 'MetroHealth primary care and financial assistance',
        summary:
          'Primary, specialty, pregnancy, and hospital care. Ask for insurance or financial-assistance screening.',
        service:
          'Primary and specialty care, pregnancy services, and hospital care across the county.',
        eligibility:
          'Adults needing medical care. Coverage and financial-assistance eligibility require screening.',
        intake:
          'Primary care: 216-696-3876. General information: 216-778-7800. Request an appointment and ask for help with insurance enrollment or financial assistance.',
        confirm:
          'Ask about required income and residency documents and medication continuity. Behavioral health uses a separate scheduling number in this guide.',
        phones: ['216-696-3876', '216-778-7800'],
        sources: [{ label: 'metrohealth.org', href: 'https://www.metrohealth.org/' }],
      },
      {
        name: 'ASIA International Community Health Center',
        summary:
          'Primary and behavioral care with language access. Social services use a different number.',
        service:
          'Primary and behavioral healthcare with culturally and linguistically appropriate services.',
        eligibility:
          'Community members, especially people facing language or financial barriers. Sliding-scale care is offered.',
        intake:
          'Cleveland health clinic: 216-361-1223, 2999 Payne Avenue, Suite 140. Use Become a Patient online or call for intake and interpretation.',
        confirm:
          'Confirm adult service availability, interpreter language, coverage, and income documentation. Social-service intake is separate at 216-881-0330.',
        phones: ['216-361-1223', '216-881-0330'],
        sources: [{ label: 'asiaohio.org', href: 'https://www.asiaohio.org/' }],
      },
      {
        name: 'MedWish MedWorks clinics',
        summary: 'Free medical, dental, and vision clinic events. Register before traveling.',
        service: 'Free medical, dental, and vision clinics and healthcare navigation.',
        eligibility:
          'People needing access to care. Each clinic event has its own registration and service limits.',
        intake:
          'Use Upcoming Clinics or Find Help on the provider website to register or request navigation.',
        confirm:
          'This is event-based care, not a daily walk-in clinic. Confirm the date, venue, adult services, and registration before traveling.',
        sources: [{ label: 'medwish.org', href: 'https://www.medwish.org/' }],
      },
      {
        name: 'Ohio Medicaid and public benefits',
        summary: 'Health coverage plus screening for cash and other public assistance.',
        service: 'Health coverage application plus screening for cash and other public assistance.',
        eligibility:
          'Eligibility depends on income, household, and the coverage category. Pregnancy, disability, and age may affect the route.',
        intake:
          'Apply through Ohio Benefits. Call 1-844-640-6446 for application questions, or ask a health-center enrollment worker for help.',
        confirm:
          'Use current agency screening rather than old income charts. Confirm renewal deadlines, requested evidence, and the assigned managed-care plan.',
        phones: ['844-640-6446'],
        sources: [
          { label: 'benefits.ohio.gov', href: 'https://benefits.ohio.gov/' },
          { label: 'Ohio Benefits portal', href: 'https://ssp.benefits.ohio.gov/' },
        ],
      },
    ],
  },
  {
    id: 'dental-hearing-vision',
    group: 'Medical care',
    title: 'Adult dental, hearing, and vision',
    intro:
      'These services address needs that a general medical referral can miss. Costs and clinical acceptance differ by program.',
    entries: [
      {
        name: 'Case Western Reserve University School of Dental Medicine',
        summary:
          'Supervised student dental clinics. Screening is not automatically free, and visits can take half a day.',
        service:
          'Supervised student dental clinics with an initial screening for prospective patients.',
        eligibility:
          'Adults may request screening. Acceptance for continuing treatment depends on health, teaching needs, and clinic availability. Care is not automatically free.',
        intake:
          'New patient appointments: 216-368-8730 or DentalClinic@case.edu. Ask specifically for the student clinic and initial screening.',
        confirm:
          'Confirm the screening charge, treatment estimate, insurance acceptance, and financial options. Visits may require an entire morning or afternoon and multiple appointments.',
        phones: ['216-368-8730'],
        sources: [
          { label: 'Patients and clinics', href: 'https://case.edu/dental/patients-clinics' },
        ],
      },
      {
        name: 'Cleveland Hearing and Speech Center',
        summary:
          'Adult hearing, speech, Deaf support, and interpreting. Hearing aids are not universally free.',
        service:
          'Adult hearing and communication services, Deaf support and advocacy, and interpreting services.',
        eligibility:
          'Adults with hearing, speech, or communication needs. Clinical services and community support have different funding and intake arrangements.',
        intake:
          'Call 216-231-8787 or use Request an Appointment. Main office: 6001 Euclid Avenue, Suite 100, Cleveland. Community Center for the Deaf and Hard of Hearing: 6284 Pearl Road, Parma Heights.',
        confirm:
          'Specify communication preferences and needed accommodations. Ask about insurance, fees, and assistance. Hearing aids are not universally free.',
        phones: ['216-231-8787'],
        sources: [{ label: 'chsc.org', href: 'https://www.chsc.org/' }],
      },
      {
        name: 'Cleveland Sight Center',
        summary:
          'Low-vision care and vision rehabilitation. Not a universal free-eyeglasses program.',
        service:
          'Low-vision care, vision rehabilitation, assistive technology, and support for daily living and employment.',
        eligibility: 'Adults with blindness or vision loss. Staff assess needs and program fit.',
        intake:
          'Use Refer a Patient or Register for Services, or call 216-791-8118. Located at 1909 East 101st Street, Cleveland. Self and professional referrals are invited.',
        confirm:
          'Confirm evaluation requirements, funding, equipment costs, and appointment location. This is not a universal free-eyeglasses program.',
        phones: ['216-791-8118'],
        sources: [
          { label: 'clevelandsightcenter.org', href: 'https://www.clevelandsightcenter.org/' },
          {
            label: 'Register for services',
            href: 'https://www.clevelandsightcenter.org/content/refer-patientregister-services',
          },
        ],
      },
    ],
  },
  {
    id: 'pregnancy-clinical',
    group: 'Pregnancy',
    title: 'Pregnancy, prenatal care, and nutrition',
    entries: [
      {
        name: 'Cuyahoga County WIC through MetroHealth',
        summary:
          'Nutrition benefits and breastfeeding support. Published income at or below 185% FPL.',
        service: 'Nutrition benefits, breastfeeding support, and healthcare referrals.',
        eligibility:
          'Ohio residents who are pregnant, postpartum, or breastfeeding and meet income and nutritional-risk criteria. Published income standard: at or below 185% of federal poverty guidelines. The clinic assesses qualifying benefits.',
        intake:
          'Call 216-957-9421 or use the online signup to locate a county WIC clinic and complete screening.',
        confirm:
          'For adults, postpartum eligibility generally extends six months if not breastfeeding and up to the infant’s first birthday if breastfeeding. Ask what proof of pregnancy, income, and residence to bring.',
        phones: ['216-957-9421'],
        sources: [
          {
            label: 'MetroHealth WIC',
            href: 'https://www.metrohealth.org/en/community/public-health-programs/nutrition-program-women-infants-children/',
          },
        ],
      },
      {
        name: 'Womankind',
        summary: 'Free prenatal care and personal support during pregnancy and beyond.',
        service:
          'Free prenatal care, personal support, and social services during pregnancy and beyond.',
        eligibility:
          'Pregnant adults seeking the services offered. Confirm the current clinical scope and intake criteria.',
        intake: 'Call 216-662-5700 or use the provider’s contact page to arrange care.',
        confirm:
          'Ask which visits, testing, and supplies are available, how care transfers for delivery, and whether high-risk needs require a specialist referral.',
        phones: ['216-662-5700'],
        sources: [{ label: 'womankind-cleveland.org', href: 'https://womankind-cleveland.org/' }],
      },
      {
        name: 'MetroHealth Mother and Child Dependency Program',
        summary:
          'Pregnancy care integrated with addiction-related care. A residential bed is not included automatically.',
        service:
          'Integrated pregnancy and addiction-related care, with links to maternal-fetal medicine and recovery support.',
        eligibility:
          'Pregnant or postpartum adults with substance use needs. Individualized clinical evaluation determines services.',
        intake:
          'Request the Mother and Child Dependency Program through MetroHealth maternal-fetal medicine. General information can route the call at 216-778-7800.',
        confirm:
          'Ask about medications for opioid use disorder, prenatal follow-up, postpartum care, and housing referral. Do not assume a residential bed is included with clinical enrollment.',
        phones: ['216-778-7800'],
        sources: [
          {
            label: 'Maternal-fetal medicine',
            href: 'https://www.metrohealth.org/en/medical-services/obstetrics-gynecology/pregnancy-care/maternal-fetal-medicine/',
          },
          {
            label: 'Program note',
            href: 'https://www.metrohealth.org/en/newsroom/2025/metroHealth-awarded-funding-to-expand-mother-and-child-dependency-program/',
          },
        ],
      },
    ],
  },
  {
    id: 'pregnancy-support',
    group: 'Pregnancy',
    title: 'Pregnancy support and home visiting',
    entries: [
      {
        name: 'MomsFirst',
        summary:
          'Cleveland pregnancy and parenting home visiting. Suburban residents should ask for Help Me Grow.',
        service:
          'Pregnancy and parenting support through community-based home visiting and service connections.',
        eligibility:
          'Cleveland residents who are pregnant. The city describes the program as serving new and experienced moms and dads. This is a city-specific route, not automatic countywide eligibility.',
        intake:
          'County instructions direct applicants to momsfirst.org or 216-664-4194. Ask for the provider assigned to the client’s neighborhood.',
        confirm:
          'Confirm enrollment timing, geographic coverage, and adult-parent services. For suburban residents, request a Help Me Grow alternative.',
        phones: ['216-664-4194'],
        sources: [
          { label: 'County HHS', href: 'https://hhs.cuyahogacounty.gov/' },
          { label: 'clevelandohio.gov', href: 'https://www.clevelandohio.gov/' },
          { label: 'momsfirst.org', href: 'https://www.momsfirst.org/' },
        ],
      },
      {
        name: 'MetroHealth pregnancy home visiting and Help Me Grow',
        summary:
          'Home visiting for pregnant Cuyahoga residents who are low-income or enrolled in WIC or Medicaid.',
        service:
          'Home-visiting support, education, and connections to health and community services.',
        eligibility:
          'The MetroHealth page lists pregnant Cuyahoga County residents at any gestational age who are low-income or enrolled in WIC, Medicaid, or a similar program.',
        intake: 'Call MetroHealth at 440-592-3837 or Cuyahoga Help Me Grow at 216-930-3322.',
        confirm:
          'Confirm the specific home-visiting program, eligibility, and available visits. This is not shelter or a substitute for obstetric care.',
        phones: ['440-592-3837', '216-930-3322'],
        sources: [
          {
            label: 'Preparing for birth',
            href: 'https://www.metrohealth.org/en/medical-services/obstetrics-gynecology/pregnancy-care/preparing-for-birth/',
          },
        ],
      },
      {
        name: 'Birthing Beautiful Communities',
        summary:
          'Perinatal education, advocacy, and community support. Confirm doula availability and cost.',
        service:
          'Pregnancy support addressing birth outcomes through education, advocacy, and community support.',
        eligibility:
          'Pregnant adults seeking perinatal support. The agency screens for its current service area and program criteria.',
        intake:
          'Use the provider’s contact or enrollment route and request perinatal-support intake. An advocate can help complete the inquiry and arrange a safe callback.',
        confirm:
          'Confirm doula availability, gestational enrollment limits, cost, transportation support, and postpartum duration. Do not assume a birth-center appointment is included.',
        sources: [{ label: 'birthingbeautiful.org', href: 'https://www.birthingbeautiful.org/' }],
      },
      {
        name: 'Planned Parenthood care navigation',
        summary: 'Reproductive-health appointments and pregnancy-related service navigation.',
        service:
          'Reproductive-health appointments, pregnancy-related information, and service navigation.',
        eligibility:
          'Adults seeking reproductive healthcare. Services, cost, and coverage vary by health center.',
        intake: 'Call 1-800-230-7526 or use Find a Health Center and select a Cuyahoga-area site.',
        confirm:
          'Confirm the requested service at that location, appointment requirements, payment assistance, and language access. A pregnancy-support agency may offer a different scope of care.',
        phones: ['800-230-7526'],
        sources: [{ label: 'plannedparenthood.org', href: 'https://www.plannedparenthood.org/' }],
      },
    ],
  },
  {
    id: 'behavioral-health-navigation',
    group: 'Substance use',
    title: 'Choosing a behavioral health referral',
    intro:
      'A clinician determines the level of care. Inpatient care is hospital-level, 24-hour treatment. Residential treatment is live-in structured care and is not automatically a hospital. PHP, partial hospitalization, is usually intensive day treatment without an overnight stay. IOP, intensive outpatient, is multiple structured sessions each week. OP is routine outpatient treatment. Withdrawal management or detox addresses withdrawal. Recovery housing is a living environment and is not itself clinical treatment. MAT or MOUD is medication treatment, not a residential level of care.',
    entries: [
      {
        name: 'Choosing the right treatment referral',
        summary:
          'Ask for an assessment that covers substance use, mental health, medical needs, and daily functioning.',
        service:
          'An assessment covering substance use, mental health, medical needs, and daily functioning.',
        eligibility:
          'Adults with a possible substance use disorder, mental health condition, or both. Pregnancy, withdrawal risk, and medical instability affect the setting.',
        intake:
          'Call the selected provider, describe the need, and request an adult assessment and the exact program and site. Ask about dual-diagnosis capability if both conditions are present.',
        confirm:
          'Confirm transportation, attendance expectations, language and access needs, medication continuity, payer authorization, and the first appointment. Do not label a program PHP or IOP unless that level is explicitly listed.',
        sources: [
          {
            label: 'SAMHSA helpline',
            href: 'https://www.samhsa.gov/find-help/helplines/national-helpline',
          },
          {
            label: 'ADAMHS by provider',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider',
          },
        ],
      },
      {
        name: 'ADAMHS Board provider directory',
        summary:
          'County directory by provider, service, and age. Call 216-241-3400 for navigation.',
        service:
          'County behavioral health directory organized by provider, service, and age group.',
        eligibility:
          'Adults seeking county mental health or addiction treatment and recovery supports. Funding eligibility varies by service.',
        intake:
          'Use By Service and Adults filters, or call 216-241-3400. Contact the resulting provider for clinical intake.',
        confirm:
          'Ask providers about ADAMHS-funded access if the client is uninsured. Directory inclusion does not guarantee a funded slot, a bed, or coverage for every service.',
        phones: ['216-241-3400'],
        sources: [
          {
            label: 'By provider',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider',
          },
        ],
      },
      {
        name: 'SAMHSA treatment navigation',
        summary:
          '24/7 national treatment-referral helpline. Then confirm intake with the facility itself.',
        service:
          'Confidential national treatment-referral helpline and navigation to local treatment.',
        eligibility:
          'Adults and families seeking mental health or substance-use treatment information.',
        intake:
          'Call 1-800-662-4357, available 24/7. Ask specifically for adult programs serving Cuyahoga County and the desired level of care.',
        confirm:
          'Use the provider’s own contact to confirm intake. Do not confuse a commercial referral hotline with the facility itself.',
        phones: ['800-662-4357'],
        sources: [
          {
            label: 'National Helpline',
            href: 'https://www.samhsa.gov/find-help/helplines/national-helpline',
          },
        ],
      },
    ],
  },
  {
    id: 'sud-residential',
    group: 'Substance use',
    title: 'Withdrawal management and residential care',
    entries: [
      {
        name: 'Stella Maris',
        summary:
          'Withdrawal management, residential treatment, PHP, IOP, and supportive housing. Ages 18+.',
        service:
          'Publishes withdrawal management, residential treatment, PHP, IOP, and supportive housing on its Cleveland campus.',
        eligibility:
          'Adults age 18 or older seeking substance use treatment. Screening determines clinical appropriateness and placement.',
        intake:
          'Call 216-781-0550 or complete the confidential Get Help Now intake form. Staff complete screening and identify the level of care.',
        confirm:
          'Confirm availability, payer or subsidized access, medical clearance, pregnancy accommodations, and medications. Housing and treatment placements may have separate requirements.',
        phones: ['216-781-0550'],
        sources: [
          { label: 'stellamariscleveland.com', href: 'https://www.stellamariscleveland.com/' },
          { label: 'Get help', href: 'https://www.stellamariscleveland.com/help' },
        ],
      },
      {
        name: 'Salvation Army Harbor Light treatment',
        summary:
          'Medically supervised substance-use treatment and intensive outpatient care. Detox line 216-781-2121.',
        service:
          'Medically supervised substance-use treatment and intensive outpatient treatment. A detox inquiry line is published.',
        eligibility:
          'Adults seeking substance use services. Clinical screening determines whether detox or another program is appropriate.',
        intake:
          'Detox information: 216-781-2121. General Harbor Light information: 216-781-3773. Ask specifically for treatment intake.',
        confirm:
          'Confirm accepted withdrawal needs, insurance or funding, medical clearance, and the IOP schedule. Do not use family-shelter or corrections eligibility as treatment eligibility.',
        phones: ['216-781-2121', '216-781-3773'],
        sources: [
          {
            label: 'Harbor Light',
            href: 'https://easternusa.salvationarmy.org/northeast-ohio/clevelandharborlight/',
          },
          {
            label: 'Who we are',
            href: 'https://easternusa.salvationarmy.org/northeast-ohio/clevelandharborlight/who-we-are/',
          },
        ],
      },
      {
        name: 'Community Assessment and Treatment Services',
        summary:
          'Adult residential, IOP, and outpatient addiction treatment, plus medication treatment.',
        service:
          'Adult residential, IOP, and outpatient addiction treatment. Also lists medication treatment and mental health services.',
        eligibility:
          'Adults whose assessment supports the requested service. Self-referral and justice-related referral questions can be addressed at intake.',
        intake:
          'Main: 216-441-0200. Outpatient: 216-938-6829. Published after-hours intake: 216-206-5206. Main site: 8411 Broadway Avenue.',
        confirm:
          'Confirm the site, payer or funding, and acceptance of co-occurring needs. Residential care is not hospital inpatient care. Ask about required referral records.',
        phones: ['216-441-0200', '216-938-6829', '216-206-5206'],
        sources: [
          {
            label: 'ADAMHS listing',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider/community-assessment-treatment-services',
          },
        ],
      },
    ],
  },
  {
    id: 'sud-women',
    group: 'Substance use',
    title: 'Substance use care for women and parents',
    entries: [
      {
        name: 'Hitchcock Center for Women',
        summary:
          'Residential and outpatient care for women, including pregnant women. Children up to age 12 may be screened.',
        service:
          'Residential substance use treatment, outpatient care, aftercare, and recovery housing.',
        eligibility:
          'Women with a substance use disorder, including pregnant women and those with co-occurring mental health needs. The county listing accepts women receiving medication treatment elsewhere and allows accompanying children up to age 12.',
        intake:
          'Call 216-421-0662 to request assessment and admissions. Confirm the current treatment location before travel.',
        confirm:
          'Ask about child placements, childcare, clinical stability, medication coordination, payer, and bed availability. Residence with children is subject to individual screening.',
        phones: ['216-421-0662'],
        sources: [
          {
            label: 'ADAMHS listing',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider/hitchcock-center-for-women',
          },
        ],
      },
      {
        name: 'Jordan Community Resource Center',
        summary:
          'Recovery housing and peer support for women. Do not advertise confirmed onsite IOP. Counseling is described in Willoughby.',
        service:
          'Recovery housing, peer support, life skills, employment help, and transportation for housing participants. Its treatment page describes women’s and adult dual-diagnosis IOP.',
        eligibility:
          'Women recovering from substance use, trafficking, or reentry-related challenges. Housing and clinical-program criteria require separate screening.',
        intake: 'Call 216-441-2496 or use the separate recovery-housing or counseling application.',
        confirm:
          'Confirm the clinical provider and location. The counseling page names Phoenix Counseling Solutions in Willoughby, outside Cuyahoga County, and that page’s schedule differs from the application. Do not advertise confirmed onsite IOP, PHP, hospital care, or detox.',
        phones: ['216-441-2496'],
        flag: 'confirm',
        sources: [
          { label: 'Recovery housing', href: 'https://www.jordan4change.org/recovery-housing' },
          { label: 'Counseling', href: 'https://www.jordan4change.org/counseling-treatment' },
          {
            label: 'Counseling application',
            href: 'https://www.jordan4change.org/counseling-treatment-application',
          },
        ],
      },
      {
        name: 'Women’s Recovery Center, now linked to Riveon',
        summary:
          'Women-focused outpatient IOP and relapse prevention. Confirm the current program name before referral.',
        service: 'Women-focused substance use IOP, outpatient relapse prevention, and aftercare.',
        eligibility:
          'Women affected by substance use and trauma. Assessment determines program fit. Self-referrals are welcomed.',
        intake:
          'Call 216-651-1450. The website welcomes walk-ins during listed center hours, 9 a.m.–5 p.m., at 6209 Storer Avenue. Confirm operating days.',
        confirm:
          'The site now directs users to Riveon. Confirm the current program name, schedule, payer or funding, and supports. This is outpatient care, not a maternity residence.',
        phones: ['216-651-1450'],
        flag: 'confirm',
        sources: [{ label: 'womensctr.org', href: 'https://www.womensctr.org/' }],
      },
    ],
  },
  {
    id: 'sud-outpatient',
    group: 'Substance use',
    title: 'Outpatient treatment and medication services',
    entries: [
      {
        name: 'Cleveland Treatment Center',
        summary: 'Outpatient treatment, primarily methadone, at 1127 Carnegie Avenue.',
        service:
          'Outpatient substance use treatment, primarily methadone maintenance, plus peer and recovery supports.',
        eligibility:
          'Adults seeking opioid or other substance-use treatment. Medical and program assessment governs admission.',
        intake:
          'Intake: 216-861-4246. Main address: 1127 Carnegie Avenue. Ask for the initial assessment, required records, and medication intake instructions.',
        confirm:
          'Do not confuse this nonprofit with similarly named commercial treatment centers. Hattie House housing questions use 216-202-1990 and require separate screening.',
        phones: ['216-861-4246', '216-202-1990'],
        sources: [
          {
            label: 'ADAMHS listing',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider/cleveland-treatment-center',
          },
        ],
      },
      {
        name: 'Moore Counseling and Mediation Services',
        summary:
          'Assessments, IOP, outpatient treatment, and women-focused services in Euclid and at Prospect.',
        service:
          'Substance use assessments, IOP and non-intensive outpatient treatment, mental health care, and women-focused services.',
        eligibility:
          'Adults seeking substance use or behavioral health treatment. Program fit and payer requirements are assessed.',
        intake:
          'Call Euclid at 216-404-1900 or the Prospect office at 216-431-4600. Request adult intake and the appropriate site or telehealth option.',
        confirm:
          'Confirm the exact address, availability, insurance or funding, and any court paperwork. An employee-assistance benefit does not automatically cover all ongoing treatment.',
        phones: ['216-404-1900', '216-431-4600'],
        sources: [{ label: 'moorecounseling.com', href: 'https://moorecounseling.com/' }],
      },
      {
        name: 'Signature Health',
        summary:
          'Outpatient addiction counseling and medication treatment, plus psychiatry and primary care.',
        service:
          'Outpatient addiction counseling and medication-assisted treatment, alongside psychiatry, primary care, and pharmacy.',
        eligibility:
          'Adults with addiction or mental health needs. Medicaid, traditional Medicare, and some Medicare Advantage plans are accepted. Uninsured patients may use sliding fees.',
        intake:
          'Call 440-578-8200 or use new-patient online or in-person drop-in options. Cuyahoga sites include Lakewood, Maple Heights, and Beachwood.',
        confirm:
          'Confirm the desired service at the selected clinic. Beachwood moved to 24755 Chagrin Boulevard. Avoid outdated addresses. Residential programs elsewhere in the system are not automatically local options.',
        phones: ['440-578-8200'],
        sources: [{ label: 'signaturehealthinc.org', href: 'https://www.signaturehealthinc.org/' }],
      },
    ],
  },
  {
    id: 'sud-day-housing',
    group: 'Substance use',
    title: 'Day treatment and recovery housing',
    entries: [
      {
        name: 'University Hospitals Addiction Recovery Services',
        summary:
          'Ambulatory detox, medication treatment, PHP, and morning or evening IOP. No overnight bed.',
        service:
          'Ambulatory detox, medication treatment, PHP, morning and evening IOP, individual therapy, and dual-diagnosis treatment.',
        eligibility:
          'Adults needing addiction treatment after clinical assessment. Higher medical acuity may require another setting.',
        intake:
          'Call 216-844-5566 for assessment, referral, and scheduling. Ask which Cleveland-area site offers the recommended program.',
        confirm:
          'Confirm insurance, prior authorization, transport, and attendance requirements. Ambulatory detox does not supply an overnight bed.',
        phones: ['216-844-5566'],
        sources: [
          {
            label: 'Addiction recovery',
            href: 'https://www.uhhospitals.org/services/addiction-services/addiction-recovery',
          },
        ],
      },
      {
        name: 'YMCA Y Haven',
        summary:
          'Residential recovery for single adults age 21 or older who can live semi-independently.',
        service:
          'Residential substance use treatment and recovery supports, with linked housing and mental health services.',
        eligibility:
          'Single adults age 21 or older seeking recovery, able to function in semi-independent living. People with physical or mental diagnoses must be engaged in appropriate care and following treatment. Serves regardless of ability to pay.',
        intake:
          'Call 216-431-2018 extension 3452 or email intake@clevelandymca.org. Self-referrals are accepted.',
        confirm:
          'Confirm the assigned program, current admission day, medication arrangements, and functional support. This is not a general shelter for adults ages 18–20.',
        phones: ['216-431-2018'],
        sources: [
          { label: 'Y Haven', href: 'https://www.clevelandymca.org/y-haven/' },
          {
            label: 'Accessing services',
            href: 'https://www.clevelandymca.org/y-haven/accessing-services/',
          },
        ],
      },
      {
        name: 'Ohio recovery housing search',
        summary: 'State directory of additional recovery residences. A listing is not an open bed.',
        service:
          'State directory for finding additional recovery residences by location and population.',
        eligibility:
          'Adults seeking recovery housing. Each operator has its own admission requirements, costs, and level of support.',
        intake:
          'Search Cuyahoga County in the state recovery-housing directory, then contact the operator directly.',
        confirm:
          'Confirm certification status, fees, refund and discharge rules, accessibility, medication acceptance, and vacancies. Listings are not proof of a current opening or clinical treatment licensure.',
        sources: [{ label: 'Recovery housing search', href: 'https://rhsearch.mha.ohio.gov/' }],
      },
    ],
  },
  {
    id: 'sud-more',
    group: 'Substance use',
    title: 'Additional addiction and recovery programs',
    entries: [
      {
        name: 'Community Action Against Addiction',
        summary:
          'Outpatient methadone and counseling at 5209 Euclid Avenue. Posted restrictions need a fresh check.',
        service:
          'Outpatient medication-assisted treatment, including methadone, with counseling and social supports.',
        eligibility:
          'Published intake criteria: age 18 or older, Cuyahoga residency, no current benzodiazepine prescription, and no positive drug test other than opiates. Confirm whether these posted restrictions remain the current policy.',
        intake:
          'Call 216-881-0765 for a phone screen. Site: 5209 Euclid Avenue. The intake page lists a $45 application fee and identification at the first visit.',
        confirm:
          'Ask about fee assistance, accepted coverage, and transfer records. Do not advise stopping prescribed medicine to qualify. Ask the treating clinician and intake team to coordinate an appropriate alternative.',
        phones: ['216-881-0765'],
        flag: 'confirm',
        sources: [
          { label: 'Intake', href: 'https://www.caaaddiction.org/intake' },
          { label: 'Medical', href: 'https://www.caaaddiction.org/medical' },
        ],
      },
      {
        name: 'Ed Keating Center and Jean Marie House',
        summary:
          'Men’s transitional housing and women’s sober living. “Rehab” here is not hospital detox.',
        service:
          'Three-month in-house sober-living program with recovery-peer leadership, men’s transitional housing, and women’s sober living.',
        eligibility:
          'Adults seeking sober living. Men’s and women’s facilities are separate. Detailed age, medication, financial, and clinical criteria require direct screening.',
        intake:
          'Use Contact Us and request admissions for the appropriate residence. Administrative offices are at 1980 Brookpark Road. Do not arrive expecting immediate placement.',
        confirm:
          'The provider’s use of “rehab” does not establish hospital inpatient or medically managed detox. Confirm fees, medication policies, and medical stability. Jean Marie House is the women’s program.',
        sources: [
          { label: 'edkeatingcenter.org', href: 'https://www.edkeatingcenter.org/' },
          { label: 'Locations', href: 'https://www.edkeatingcenter.org/locactions/' },
        ],
      },
      {
        name: 'Salvation Army Harbor Light PASS',
        summary: 'Transitional, alcohol- and drug-free housing for men. Not emergency shelter.',
        service:
          'Transitional housing and goal-oriented support toward income and permanent housing.',
        eligibility:
          'Men experiencing homelessness who fit the program’s alcohol- and drug-free living requirements. Admission screening applies.',
        intake:
          'Call 216-781-3773 and ask specifically about PASS admission or referral. For emergency shelter use Coordinated Intake or 211.',
        confirm:
          'Confirm employment expectations, fees, medication policies, and length of stay. PASS is distinct from Harbor Light detox, family shelter, and justice-system placements.',
        phones: ['216-781-3773', '216-674-6700', '211'],
        sources: [
          {
            label: 'Provide housing',
            href: 'https://easternusa.salvationarmy.org/northeast-ohio/clevelandharborlight/provide-housing/',
          },
        ],
      },
    ],
  },
  {
    id: 'harm-reduction',
    group: 'Substance use',
    title: 'Harm reduction and HIV-related support',
    intro:
      'Community prevention and practical support can accompany treatment, recovery housing, or other services.',
    entries: [
      {
        name: 'MetroHealth Project DAWN',
        summary:
          'Free naloxone and related supplies at the mobile unit. Call first; published closing times conflict.',
        service:
          'Free confidential naloxone. Syringe exchange, fentanyl test strips, safer-sex supplies, HIV and hepatitis C testing, and benefit connections are listed.',
        eligibility:
          'Naloxone access includes people at risk of opioid overdose, people in recovery, and people who know someone at risk. Other services have their own screening.',
        intake:
          'Mobile unit at 3370 West 25th Street, Cleveland. Call 216-387-6290. Naloxone visits are listed as walk-in, without an appointment, taking about 15 minutes.',
        confirm:
          'The page lists conflicting weekday closing times. Call before travel for the day’s location, hours, and requested services. Office of Opioid Safety: 216-778-5677.',
        phones: ['216-387-6290', '216-778-5677'],
        flag: 'confirm',
        sources: [
          {
            label: 'Project DAWN mobile unit',
            href: 'https://www.metrohealth.org/en/community/office-of-opioid-safety/project-dawn-expanded-mobile-unit/',
          },
        ],
      },
      {
        name: 'AIDS Taskforce of Greater Cleveland',
        summary:
          'HIV case management and possible help with nutrition, medical rides, housing, or utilities.',
        service:
          'HIV case management and access to nutrition, medical transportation, and housing or utility support, subject to the specific program and funding.',
        eligibility:
          'People with documented HIV in its service area, including Cuyahoga County. Income, insurance, and residency screening apply.',
        intake:
          'Call intake at 216-621-0766 extension 2911. The page describes caseworker assignment within 48–72 hours. Gather residency, income, and insurance records. Staff can help obtain diagnosis documentation with consent.',
        confirm:
          'Request current income limits. The website includes a 2019 dollar chart and inconsistent threshold wording. Do not use that chart to deny a referral. Ask which practical-assistance funds are accepting requests.',
        phones: ['216-621-0766'],
        flag: 'confirm',
        sources: [
          { label: 'Services', href: 'https://clevelandtaskforce.org/access/services-v2/' },
        ],
      },
    ],
  },
  {
    id: 'mh-hospital',
    group: 'Mental health',
    title: 'Hospital and day programs',
    entries: [
      {
        name: 'MetroHealth behavioral health',
        summary:
          'Adult inpatient, PHP, IOP, and outpatient care. Recovery Resources clinical services now route here.',
        service:
          'Adult inpatient, PHP, IOP, and outpatient behavioral health services. Recovery Resources clinical services now route to MetroHealth.',
        eligibility:
          'Adults with mental health needs. Clinical assessment determines level, medical suitability, and admission.',
        intake:
          'Outpatient and clinical scheduling: 216-778-4428. Inpatient inquiries: 216-778-7800. For urgent safety concerns use crisis assessment or an emergency department.',
        confirm:
          'Confirm the exact program location, age criteria, coverage, referral records, and bed availability. Do not send patients to an old Recovery Resources intake route.',
        phones: ['216-778-4428', '216-778-7800', '988'],
        sources: [
          {
            label: 'Behavioral health',
            href: 'https://www.metrohealth.org/en/medical-services/behavioral-mental-health/',
          },
          { label: 'recres.org', href: 'https://recres.org/' },
        ],
      },
      {
        name: 'Highland Springs',
        summary:
          'Adult inpatient mental health and substance use treatment, detox, PHP, and IOP. Call 216-302-3070.',
        service:
          'Inpatient mental health and substance use treatment, detox, PHP, and IOP. Program offerings vary by location.',
        eligibility:
          'Adults whose assessment supports the selected program. Use the adult track rather than child or adolescent services.',
        intake:
          'Call 216-302-3070, available 24/7, for an initial assessment. Main campus: 4199 Millpond Drive, Highland Hills.',
        confirm:
          'Confirm the specific adult service, treatment site, insurance or authorization, and admission instructions. A program listing does not confirm a bed.',
        phones: ['216-302-3070'],
        sources: [
          { label: 'highlandspringshealth.com', href: 'https://www.highlandspringshealth.com/' },
          { label: 'Programs', href: 'https://www.highlandspringshealth.com/programs' },
        ],
      },
      {
        name: 'Southwest General Oakview',
        summary:
          'Adult inpatient mental health care and outpatient behavioral health and addiction programs. Ages 18+.',
        service:
          'Adult inpatient mental health care and outpatient behavioral health and addiction programs.',
        eligibility:
          'Adult programs are for ages 18 and older. Assessment determines treatment fit.',
        intake:
          'General behavioral-health information: 440-816-6944. Outpatient programs: 440-816-8200. Adult inpatient unit: 440-816-5755.',
        confirm:
          'Request the current adult PHP, IOP, or routine outpatient option appropriate to the assessment. The unit phone is not a guarantee of direct admission.',
        phones: ['440-816-6944', '440-816-8200', '440-816-5755'],
        sources: [
          {
            label: 'Oakview',
            href: 'https://www.swgeneral.com/services/behavioral-health/oakview-behavioral-health-services/',
          },
          {
            label: 'Phone directory',
            href: 'https://www.swgeneral.com/patients-visitors/phone-directory/',
          },
        ],
      },
    ],
  },
  {
    id: 'mh-outpatient',
    group: 'Mental health',
    title: 'Outpatient and intensive programs',
    entries: [
      {
        name: 'University Hospitals adult psychiatry and psychology',
        summary:
          'Adult inpatient and outpatient psychiatric care, plus a behavioral-health IOP after assessment.',
        service:
          'Adult inpatient and outpatient psychiatric care. A specific behavioral-health IOP requires a comprehensive assessment.',
        eligibility:
          'Adults needing psychiatric evaluation or ongoing care. IOP eligibility is determined by assessment.',
        intake:
          'Adult psychiatry: 216-844-2400. Behavioral-health IOP: 216-844-2874 or MDPIOP@UHHospitals.org.',
        confirm:
          'Confirm which conditions the IOP treats, age limits, coverage, and location. Email only the minimum referral information until a secure record-transfer route is arranged.',
        phones: ['216-844-2400', '216-844-2874'],
        sources: [
          {
            label: 'Psychiatry and psychology',
            href: 'https://www.uhhospitals.org/services/adult-psychiatry-psychology',
          },
          {
            label: 'Intensive outpatient',
            href: 'https://www.uhhospitals.org/services/adult-psychiatry-psychology/conditions-treatments/intensive-outpatient-therapy',
          },
        ],
      },
      {
        name: 'Pasadena Villa Outpatient Cleveland',
        summary:
          'Adult mental health PHP and IOP, including virtual IOP, in the Cleveland and Independence area.',
        service:
          'Adult mental health PHP, daytime IOP, and virtual IOP in the Cleveland and Independence area.',
        eligibility:
          'Adults age 18 or older with mental health needs appropriate for an intensive outpatient setting. An admission evaluation is required.',
        intake:
          'Call the Cleveland admissions number, 888-324-3531, or complete the admissions inquiry for assessment and insurance verification.',
        confirm:
          'Confirm insurance, cost, schedule, site, and the program’s ability to manage co-occurring substance use or acute risk. This is not overnight shelter or inpatient treatment.',
        phones: ['888-324-3531'],
        sources: [
          { label: 'pasadenavillaoutpatient.com', href: 'https://pasadenavillaoutpatient.com/' },
        ],
      },
      {
        name: 'OhioGuidestone Cuyahoga outpatient services',
        summary:
          'Community outpatient counseling and psychiatry, with telehealth. Local sites include Lakewood, Euclid, and Cleveland.',
        service:
          'Community outpatient counseling and psychiatry. Telehealth options are available across Ohio.',
        eligibility:
          'Adults seeking mental health or addiction-related services. Program and payer screening applies.',
        intake:
          'Call Cuyahoga outpatient intake at 440-260-8300 and request an adult service. Local sites include Lakewood, Euclid, and Cleveland.',
        confirm:
          'Confirm the exact adult program and site. A listed residential campus is not evidence of adult residential eligibility. Youth programs are outside this guide’s scope.',
        phones: ['440-260-8300'],
        sources: [{ label: 'ohioguidestone.org', href: 'https://ohioguidestone.org/' }],
      },
    ],
  },
  {
    id: 'mh-verify',
    group: 'Mental health',
    title: 'Additional clinical care and verification leads',
    intro:
      'The Cleveland Clinic entry is a treatment resource. NORA is a referral lead whose current adult program menu was not clear enough to assign a treatment level.',
    entries: [
      {
        name: 'Cleveland Clinic adult psychiatry and psychology',
        summary: 'Hospital psychiatric care, IOP, and outpatient psychiatry and psychology.',
        service:
          'Adult hospital psychiatric care, intensive outpatient programs, and outpatient psychiatry and psychology. The department links IOP options at Lutheran and Marymount hospitals.',
        eligibility:
          'Adults whose clinical assessment supports the requested service. Specific programs may focus on particular diagnoses.',
        intake:
          'Adult psychiatry: 216-444-5812. Psychology: 216-541-1819. Intake and admissions: 216-363-2122. Ask which adult program and site fits the referral.',
        confirm:
          'Confirm IOP eligibility, schedule, insurance, referral requirements, and availability. A general scheduling line does not confirm an inpatient bed.',
        phones: ['216-444-5812', '216-541-1819', '216-363-2122'],
        sources: [
          {
            label: 'Psychiatry and psychology',
            href: 'https://my.clevelandclinic.org/departments/neurological/depts/psychiatry-psychology',
          },
        ],
      },
      {
        name: 'Northern Ohio Recovery Association',
        summary:
          'Call 216-391-6672 and confirm the current adult program before treating this as a completed referral.',
        service:
          'Local recovery-service referral lead. This review did not establish a clear current adult program menu, so residential, PHP, or IOP status is not assigned.',
        eligibility:
          'Request adult eligibility and current program criteria directly. Do not assume every advertised service accepts all adults.',
        intake:
          'Published contact: 216-391-6672, 1400 East 55th Street, Cleveland. Ask for adult intake and current treatment or housing options.',
        confirm:
          'Confirm the service level, location, licensure, insurance, and intake route before treating this as a completed referral.',
        phones: ['216-391-6672'],
        flag: 'confirm',
        sources: [{ label: 'norainc.org', href: 'https://norainc.org/contact/' }],
      },
      {
        name: 'ADAMHS directory for a wider treatment search',
        summary: 'Use the county directory when the programs above do not fit.',
        service:
          'County directory for additional funded behavioral health and recovery providers beyond this guide.',
        eligibility:
          'Adults seeking mental health or substance use services. Individual providers determine clinical and funding eligibility.',
        intake:
          'Use the directory’s service and provider search, or call 216-241-3400. Request adult options at the assessed treatment level.',
        confirm:
          'Cross-check each provider’s current admissions page. Directory inclusion alone does not prove a program is operating, a bed is open, or the client qualifies.',
        phones: ['216-241-3400'],
        sources: [
          {
            label: 'By provider',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider',
          },
        ],
      },
    ],
  },
  {
    id: 'mh-community',
    group: 'Mental health',
    title: 'Community mental health and ongoing support',
    entries: [
      {
        name: 'Murtis Taylor Human Services System',
        summary: 'Adult behavioral health and substance use services, with sliding fees.',
        service:
          'Adult behavioral health and substance use services, with other family and senior supports.',
        eligibility:
          'Adults needing community behavioral health care. Service-specific clinical criteria apply. Sliding fees are based on household size and income.',
        intake:
          'Call 216-283-4400 and ask for adult behavioral-health intake or a substance use assessment.',
        confirm:
          'Confirm outpatient intensity, psychiatry and case-management availability, clinic address, payer, and required documents. No inpatient or PHP level is inferred here.',
        phones: ['216-283-4400'],
        sources: [{ label: 'murtistaylor.org', href: 'https://www.murtistaylor.org/' }],
      },
      {
        name: 'Far West Center',
        summary:
          'Community mental health in Westlake. The Amherst site is outside Cuyahoga County.',
        service:
          'Community mental health care delivered by psychiatry, psychology, nursing, counseling, and case-management staff.',
        eligibility:
          'Adults seeking care appropriate to the center’s programs. The access office assesses fit.',
        intake: 'For the Cuyahoga County Westlake service, call 440-835-6212 to request care.',
        confirm:
          'Confirm the adult program, insurance or sliding fees, referral documents, and visit format. Amherst is outside Cuyahoga County. Do not assume PHP availability from older directories.',
        phones: ['440-835-6212'],
        sources: [{ label: 'farwestcenter.com', href: 'https://www.farwestcenter.com/' }],
      },
      {
        name: 'NAMI Greater Cleveland',
        summary:
          'Peer and family support, education, and referrals. Not crisis care or clinical treatment.',
        service: 'Peer and family support groups, education, information, and referrals.',
        eligibility:
          'Adults living with mental health conditions and adult family members or support people. Choose the appropriate group.',
        intake:
          'Helpline: 216-875-7776. Published hours: Monday–Thursday 9 a.m.–9 p.m.; Friday 9 a.m.–5 p.m. Register for groups through the calendar.',
        confirm:
          'Peer support is not clinical treatment, medication management, or emergency response. Use 988 or FrontLine for a crisis. Confirm each group’s registration and meeting format.',
        phones: ['216-875-7776', '988'],
        sources: [
          {
            label: 'Helpline',
            href: 'https://namigreatercleveland.org/resources/nami-greater-cleveland-helpline/',
          },
          {
            label: 'Support groups',
            href: 'https://namigreatercleveland.org/support-and-education/support-groups/',
          },
        ],
      },
    ],
  },
  {
    id: 'survivor-advocacy',
    group: 'Advocacy',
    title: 'Survivor advocacy and culturally responsive support',
    entries: [
      {
        name: 'Cleveland Rape Crisis Center',
        summary:
          '24-hour support for sexual-violence survivors, plus trafficking-specific services and a drop-in center.',
        service:
          'Confidential support, counseling, and advocacy for sexual-violence survivors, trafficking-specific services, and a drop-in center.',
        eligibility:
          'Adult survivors and people seeking information or support. Ask about the appropriate service without requiring unnecessary disclosure.',
        intake:
          '24-hour support: call or text 216-619-6192 or 440-423-2020. Trafficking hotline: 855-431-7827. Drop-in center: 10450 Superior Avenue.',
        confirm:
          'Confirm drop-in hours and access needs. This is not a guaranteed residential shelter. Advocates can discuss safety and housing referrals.',
        phones: ['216-619-6192', '440-423-2020', '855-431-7827'],
        sources: [
          { label: 'Contact', href: 'https://clevelandrapecrisis.org/contact/' },
          {
            label: 'Trafficking services',
            href: 'https://clevelandrapecrisis.org/services/trafficking/',
          },
        ],
      },
      {
        name: 'Journey Center nonresidential services',
        summary:
          'Domestic-violence advocacy, trauma therapy, support groups, and justice-system help.',
        service:
          'Domestic-violence advocacy, trauma therapy, support groups, justice-system assistance, and housing-related support.',
        eligibility:
          'Adult survivors of domestic violence. Program-specific eligibility and screening apply.',
        intake:
          'Call 216-391-4357 to request the needed service and establish a safe way to communicate.',
        confirm:
          'Ask whether shelter residence is required for the requested service and whether interpretation or the Latina Domestic Violence Project would be helpful.',
        phones: ['216-391-4357'],
        sources: [{ label: 'journeyneo.org', href: 'https://www.journeyneo.org/' }],
      },
      {
        name: 'ASIA social services and Ahimsa',
        summary: 'Multilingual social services, survivor support, and legal-service navigation.',
        service:
          'Multilingual social services, survivor support, interpretation, and legal-service navigation.',
        eligibility:
          'Immigrant, refugee, and native-born community members. Program-specific geographic, income, or legal-case criteria may apply.',
        intake:
          'Cleveland social services: 216-881-0330. Explain the need and preferred language. Ask for Ahimsa for survivor support or legal-service intake.',
        confirm:
          'Confirm scope, cost, and appointment requirements. Health-clinic appointments use 216-361-1223.',
        phones: ['216-881-0330'],
        sources: [{ label: 'asiaohio.org', href: 'https://www.asiaohio.org/' }],
      },
    ],
  },
  {
    id: 'lgbtq',
    group: 'Advocacy',
    title: 'LGBTQ adults and community connection',
    intro:
      'Ask the client what setting and communication method feel comfortable. For a shelter or treatment referral, confirm the receiving program’s placement arrangements, name use, medication access, and accommodations directly with that program. Record the specific answer rather than assuming every site operates alike.',
    entries: [
      {
        name: 'LGBT Community Center of Greater Cleveland',
        summary:
          'Community programs and resource connections. Not listed here as a shelter or a clinic.',
        service:
          'Community programs and resource connections for LGBTQ people. Use the center to identify adult groups and appropriate local referrals.',
        eligibility:
          'LGBTQ adults seeking community support. Age limits and enrollment depend on the activity. This listing does not imply eligibility for every program.',
        intake:
          'Call 216-651-5428 or visit current program listings. Address: 6705 Detroit Avenue, Cleveland, OH 44102.',
        confirm:
          'Confirm the adult program, meeting date, and registration process. Detailed program-page access was inconsistent during review. The center is not listed here as a shelter or a clinical treatment provider.',
        phones: ['216-651-5428'],
        sources: [{ label: 'lgbtcleveland.org', href: 'https://lgbtcleveland.org/' }],
      },
    ],
  },
  {
    id: 'utilities',
    group: 'Money and legal',
    title: 'Utilities, income, and practical assistance',
    entries: [
      {
        name: 'Step Forward HEAP and PIPP',
        summary: 'Current Cuyahoga energy-assistance administrator. Walk-ins need confirmation.',
        service:
          'Energy-assistance screening and applications. CHN identifies Step Forward as the current Cuyahoga HEAP and PIPP administrator.',
        eligibility:
          'Households meeting the current program’s income, utility-account, and residency requirements. Seasonal crisis programs have separate rules.',
        intake:
          'Call 216-480-4327 for the current application or appointment route. CHN lists walk-ins Monday–Thursday, 8 a.m.–noon, at 2203 Superior Avenue. Confirm before travel.',
        confirm:
          'Bring current bills, a shutoff notice if applicable, and the income and household documents Step Forward requests. Verify funding and season. Do not use old CHN intake instructions.',
        phones: ['216-480-4327'],
        sources: [
          { label: 'stepforwardtoday.org', href: 'https://www.stepforwardtoday.org/' },
          {
            label: 'CHN utility assistance',
            href: 'https://chnhousingpartners.org/housing-services/utility-assistance/',
          },
        ],
      },
      {
        name: 'CHN water, sewer, and energy savings',
        summary:
          'Separate water and sewer help, plus energy-efficiency programs. Renter rules differ.',
        service: 'Separate water and sewer assistance and energy-efficiency programs.',
        eligibility:
          'Water-program criteria vary. The published water application includes income limits and owner-occupancy requirements for Cleveland Water customers. Energy savings has separate rules.',
        intake:
          'Call 216-574-7100 or use CHN’s relevant program application. Identify the exact utility and whether the client rents or owns.',
        confirm:
          'Confirm the current form, covered service, income period, and required bills or ID. Do not assume renter eligibility for an owner-occupied program.',
        phones: ['216-574-7100'],
        sources: [
          {
            label: 'Water and sewer application',
            href: 'https://chnhousingpartners.org/media/5zmnm2sn/water-and-sewer-program-application-2025.pdf',
          },
          {
            label: 'Energy savings',
            href: 'https://chnhousingpartners.org/housing-services/energy-savings/',
          },
        ],
      },
      {
        name: 'Catholic Charities emergency assistance navigation',
        summary: 'Central intake for local emergency assistance. Confirm the active location.',
        service: 'Connection to local emergency-assistance and other social-service programs.',
        eligibility:
          'Adults and households in need. Assistance depends on location, program rules, and funding.',
        intake:
          'Call central intake at 1-800-860-7373, Monday–Friday, 8 a.m.–4 p.m., and request the appropriate Cuyahoga program.',
        confirm:
          'Ask about utilities, basic needs, and document or ID support. Confirm the active location. Cosgrove’s historical listings require the additional check in the changes section.',
        phones: ['800-860-7373'],
        sources: [{ label: 'ccdocle.org', href: 'https://www.ccdocle.org/' }],
      },
    ],
  },
  {
    id: 'cash-benefits',
    group: 'Money and legal',
    title: 'Emergency financial assistance and cash benefits',
    intro:
      'These programs sit between a resource referral and the money needed to stabilize a household.',
    entries: [
      {
        name: 'Prevention, Retention, and Contingency',
        summary:
          'Short-term crisis help paid to vendors. Posted maximum $1,500 per year. Not same-day cash.',
        service:
          'Short-term crisis assistance for approved needs, including qualifying housing, utility, and employment expenses. Posted maximum is $1,500 per year. Payments go to vendors.',
        eligibility:
          'County households with a minor child, a pregnancy, or a qualifying noncustodial parent. Citizenship or qualified-noncitizen rules, income at or below 200% of the federal poverty level, limited assets, and a qualifying crisis apply.',
        intake:
          'Submit the signed application and supporting records through the county page. Email Cuy-PRC-Application@jfs.ohio.gov, fax 216-987-8655, or use a Neighborhood Family Service Center drop box. Application and status line: 216-987-7392.',
        confirm:
          'Confirm the expense category, pregnancy-specific criteria, prior assistance, and vendor paperwork. The county describes decisions within 10 calendar days after all verification is received. This is not guaranteed same-day assistance.',
        phones: ['216-987-7392'],
        sources: [
          {
            label: 'PRC program',
            href: 'https://hhs.cuyahogacounty.gov/programs/prevention-retention-and-contingency-program',
          },
        ],
      },
      {
        name: 'Ohio Works First',
        summary:
          'Time-limited cash assistance for eligible families. The county describes a 36-month adult limit.',
        service:
          'Time-limited cash assistance through Ohio’s TANF program. The county describes a 36-month limit for adult family assistance.',
        eligibility:
          'Financially eligible families with a child under 18, or 19 if still in high school, and women at least six months pregnant. Participation requirements and exclusions apply.',
        intake:
          'Apply at benefits.ohio.gov, call 844-640-6446 Monday–Friday 8 a.m.–4 p.m., or apply at a Neighborhood Family Service Center. A caseworker schedules eligibility and participation interviews.',
        confirm:
          'Confirm the income calculation, work requirements and exemptions, child-support implications, and any prior months used. Child-only cases can follow different rules.',
        phones: ['844-640-6446'],
        sources: [
          {
            label: 'Ohio Works First',
            href: 'https://hhs.cuyahogacounty.gov/programs/ohio-works-first',
          },
        ],
      },
      {
        name: 'Public Benefits Library Navigator Program',
        summary:
          'In-person help applying for food, medical, and cash assistance. The library does not approve benefits.',
        service:
          'Help applying for food, medical, and cash assistance when online access or forms are a barrier.',
        eligibility:
          'People seeking benefits application help. The benefits agency determines program eligibility.',
        intake:
          'Ask at a Cuyahoga County Public Library, Cleveland Public Library, or Shaker Heights Public Library branch about navigator assistance.',
        confirm:
          'Confirm branch hours, available assistance, and what records to bring. Library help does not itself approve benefits.',
        sources: [
          {
            label: 'Navigator program',
            href: 'https://hhs.cuyahogacounty.gov/programs/navigator-program',
          },
        ],
      },
    ],
  },
  {
    id: 'child-care',
    group: 'Money and legal',
    title: 'Child care support for adult parents',
    intro:
      'Child care can determine whether an adult client can work or attend school. Use the Ohio child-care search linked on the county page to find participating providers. Confirm openings, hours, and transportation with the provider before treating care as arranged. Keep a submission receipt. Do not assume care used before an approval is covered.',
    entries: [
      {
        name: 'Cuyahoga County child care assistance',
        summary:
          'Publicly Funded Child Care and the Child Care Choice Program for eligible working or student families.',
        service:
          'Publicly Funded Child Care and the Child Care Choice Program help eligible families pay for care tied to qualifying activities.',
        eligibility:
          'Publicly Funded Child Care screens household income and work, school, or another qualifying activity. The Choice program is described for families at 146–200% of the federal poverty level who were denied Publicly Funded Child Care only for income, with full-time qualifying activities for all caregivers.',
        intake:
          'Complete the signed JFS 07200 application with income, child-status, and activity documentation, plus the selected provider’s name and address. Submit at a Neighborhood Family Service Center or mail to 1641 Payne Avenue, Suite 200, Cleveland, OH 44114.',
        confirm:
          'Ask which program applies, the copay, approval dates, and whether the chosen provider participates and has space. Request interpreter or disability-related application help if needed.',
        sources: [
          {
            label: 'Child care assistance',
            href: 'https://hhs.cuyahogacounty.gov/programs/child-care-assistance-programs',
          },
        ],
      },
    ],
  },
  {
    id: 'legal-employment',
    group: 'Money and legal',
    title: 'Legal help, employment, and reentry',
    entries: [
      {
        name: 'Legal Aid Society of Cleveland',
        summary:
          'Civil legal help for housing, benefits, and other problems. Intake is not a promise of representation.',
        service:
          'Civil legal assistance, including screening for housing, benefits, and other civil problems.',
        eligibility:
          'Adults with qualifying civil legal needs and applicable income and geographic eligibility. Case acceptance is assessed.',
        intake:
          'Apply online at lasclev.org/apply or call 888-817-3777. State any hearing, eviction, or benefits deadline immediately.',
        confirm:
          'Eligibility for intake is not a promise of representation. Bring notices and court papers. Request an interpreter or disability accommodation if needed.',
        phones: ['888-817-3777'],
        sources: [
          { label: 'Apply', href: 'https://lasclev.org/apply' },
          { label: 'Cleveland Metropolitan Bar', href: 'https://clemetrobar.org/' },
        ],
      },
      {
        name: 'Towards Employment',
        summary:
          'Career preparation and job connection, including for people with justice-system involvement.',
        service:
          'Career preparation, job connection, advancement, and community and reentry supports.',
        eligibility:
          'Adults facing employment barriers, including justice-system involvement. Training tracks have their own criteria.',
        intake:
          'Call 216-696-5750 or contact the agency online. Current headquarters: 3301 Saint Clair Avenue, Cleveland.',
        confirm:
          'Ask about orientation, eligibility, identification, transportation, work clothing, and legal barriers. Do not use the older Euclid Avenue office address without checking.',
        phones: ['216-696-5750'],
        sources: [{ label: 'towardsemployment.org', href: 'https://www.towardsemployment.org/' }],
      },
      {
        name: 'Salvation Army Harbor Light community corrections',
        summary:
          'Halfway-house and monitoring programs through a justice or correctional referral.',
        service:
          'Structured reentry services, including halfway-house, community-residential, and monitoring programs.',
        eligibility:
          'People referred through the relevant justice or correctional system. The provider describes services for men and women.',
        intake:
          'Discuss the referral with the supervising authority and call Harbor Light at 216-781-3773 for program routing.',
        confirm:
          'This is not a self-selected emergency shelter. Confirm legal authorization, placement terms, treatment needs, and reporting obligations.',
        phones: ['216-781-3773'],
        sources: [
          {
            label: 'Community corrections',
            href: 'https://easternusa.salvationarmy.org/northeast-ohio/clevelandharborlight/community-corrections-program/',
          },
          {
            label: 'Contact',
            href: 'https://easternusa.salvationarmy.org/northeast-ohio/clevelandharborlight/contact-us/',
          },
        ],
      },
    ],
  },
  {
    id: 'reentry',
    group: 'Money and legal',
    title: 'Reentry identification and practical stabilization',
    intro:
      'Distinguish active reentry support from a housing fund that is no longer accepting applications.',
    entries: [
      {
        name: 'North Star Neighborhood Reentry Resource Center',
        summary:
          'Free practical reentry support: benefits, ID vouchers, clothing, employment, computers, and peer support.',
        service:
          'Free membership and practical reentry support: benefits help, identification and birth-certificate vouchers, clothing, employment and education resources, computer access, and peer support.',
        eligibility:
          'Open to the public, with a focus on Cuyahoga County justice-involved adults and their families or friends. Individual services may have additional requirements.',
        intake:
          'Call 216-881-5440 or visit 1834 East 55th Street, Cleveland, OH 44103. Listed hours: Monday noon–8 p.m.; Tuesday 8 a.m.–4 p.m.; Wednesday 8 a.m.–8 p.m.; Thursday 9 a.m.–1 p.m.; Friday 8 a.m.–4 p.m.',
        confirm:
          'Ask about membership intake, current classes, and the documents needed for the specific assistance. Voucher and clothing supplies can vary.',
        phones: ['216-881-5440'],
        sources: [
          { label: 'Services', href: 'https://www.northstarreentry.org/services.php' },
          { label: 'Location', href: 'https://www.northstarreentry.org/location.php' },
        ],
      },
      {
        name: 'North Star Rapid Reentry Housing Funds',
        summary: 'Closed. Funds are exhausted and applications are not being accepted.',
        service:
          'Status correction: the program’s public page states that funds are exhausted and applications are not being accepted.',
        eligibility:
          'No current application intake is advertised. Do not present past eligibility rules as an available benefit.',
        intake:
          'For other reentry referrals, contact North Star at 216-881-5440 or NorthStarReentry@orianahouse.org. Use the shelter and housing entries in this guide when housing is the need.',
        confirm:
          'Only treat the fund as reopened after the provider publishes or directly confirms new intake. This closure does not mean North Star’s other services are closed.',
        phones: ['216-881-5440'],
        flag: 'closed',
        sources: [
          {
            label: 'Rapid reentry funds',
            href: 'https://www.northstarreentry.org/rapid-reentry-funds.php',
          },
        ],
      },
    ],
  },
  {
    id: 'disability-aging',
    group: 'Aging and rides',
    title: 'Disability, older adults, and transportation',
    entries: [
      {
        name: 'LEAP',
        summary:
          'Independent living, benefits, employment, peer support, and nursing-home transition.',
        service:
          'Independent-living assistance, benefits help, employment support, peer support, and nursing-home transition services.',
        eligibility:
          'Adults with disabilities. Program-specific eligibility determines available support.',
        intake:
          'Call 216-696-2716 for information and referral. Public office: 2545 Lorain Avenue, Cleveland.',
        confirm:
          'Describe the person’s goals and accommodation needs. Ask about benefit-work interactions, transition criteria, waitlists, and service-area limits.',
        phones: ['216-696-2716'],
        sources: [{ label: 'leapinfo.org', href: 'https://www.leapinfo.org/' }],
      },
      {
        name: 'Western Reserve Area Agency on Aging',
        summary: 'Navigation for older adults, people with disabilities, and caregivers.',
        service:
          'Aging and disability service navigation, including connection to community supports and care options.',
        eligibility:
          'Older adults, people with disabilities, and caregivers. Each funded service has its own age, financial, or functional criteria.',
        intake:
          'Call 216-621-0303 or 800-626-7277 and request information and screening for the identified need.',
        confirm:
          'Ask specifically about home-delivered meals, in-home support, caregiver assistance, and transportation. Do not assume all are available to every caller.',
        phones: ['216-621-0303', '800-626-7277'],
        sources: [
          { label: 'areaagingsolutions.org', href: 'https://www.areaagingsolutions.org/' },
          { label: 'aging.ohio.gov', href: 'https://aging.ohio.gov/' },
        ],
      },
      {
        name: 'Greater Cleveland RTA paratransit',
        summary:
          'Shared-ride service when a disability prevents use of the regular bus. Certification is required.',
        service:
          'Shared-ride transportation for people whose disability prevents use of the fixed-route system.',
        eligibility:
          'Functional eligibility under the paratransit process. Diagnosis or age alone does not establish eligibility. Service boundaries and operating times apply.',
        intake:
          'Obtain an application online or call 216-566-5124, weekdays 8 a.m.–4:30 p.m. Request an accessible format or completion help if needed.',
        confirm:
          'Complete certification and confirm trip booking, fare, equipment, and attendant arrangements. A disability reduced-fare card and paratransit approval are separate.',
        phones: ['216-566-5124'],
        sources: [
          { label: 'Certification', href: 'https://www.riderta.com/paratransit/certification' },
          { label: 'Paratransit', href: 'https://www.riderta.com/paratransit-tabbed' },
        ],
      },
    ],
  },
  {
    id: 'in-home',
    group: 'Aging and rides',
    title: 'In-home support, disability intake, and adult protection',
    intro:
      'These programs address daily living needs that a food or medical referral alone may not resolve.',
    entries: [
      {
        name: 'Options for Independent Living',
        summary:
          'Assessed in-home support for adults 60+, or ages 18–59 with disabilities, living in a private home.',
        service:
          'Assessed support may include personal care, homemaking, meals, medical transportation, safety equipment, chores, and case management.',
        eligibility:
          'Cuyahoga residents age 60 or older, or adults 18–59 with disabilities, living in a private home or apartment. Need for daily-living help, financial circumstances, and ineligibility for Medicaid waiver services are considered. Licensed facilities are excluded.',
        intake:
          'Call the Cuyahoga County Division of Senior and Adult Services at 216-420-6700 to request an assessment.',
        confirm:
          'Ask about income-based fees, current service capacity, and which supports the assessment authorizes. This is not uniformly free care.',
        phones: ['216-420-6700'],
        sources: [
          {
            label: 'Options for Independent Living',
            href: 'https://hhs.cuyahogacounty.gov/programs/options-for-independent-living',
          },
        ],
      },
      {
        name: 'Cuyahoga County Board of Developmental Disabilities',
        summary:
          'Eligibility assessment for adult home, employment, day, and assistive-technology supports.',
        service:
          'Eligibility assessment and access to adult home, employment, day, communication, and assistive-technology supports.',
        eligibility:
          'Adults with developmental disabilities who meet the board’s eligibility assessment. A diagnosis alone does not establish eligibility for every service or funding source.',
        intake:
          'Call intake at 216-736-2673 or use Apply on the eligibility webpage. Ask what developmental, medical, and functional records are needed.',
        confirm:
          'Confirm the eligibility decision, service planning, and any waiting or funding limitations.',
        phones: ['216-736-2673'],
        sources: [{ label: 'Eligibility', href: 'https://www.cuyahogadd.org/eligibility' }],
      },
      {
        name: 'Cuyahoga County Adult Protective Services',
        summary:
          '24/7 reports of abuse, neglect, self-neglect, and exploitation. Immediate danger is still 911.',
        service:
          'Reports and assessment of abuse, neglect, self-neglect, and exploitation of vulnerable adults in the community.',
        eligibility:
          'Primarily impaired or disabled adults age 60 or older. The county also accepts adults 18–59 with disabilities on a voluntary-participation basis. Licensed-facility situations may require a different reporting route.',
        intake:
          'Call 216-420-6700, available 24/7 for confidential reports, or follow the county page to Ohio’s reporting portal. For immediate danger call 911.',
        confirm:
          'Provide the person’s location and the specific concern. Ask where to report concerns involving a licensed facility. Adult Protective Services is not emergency medical transport.',
        phones: ['216-420-6700', '911'],
        sources: [
          {
            label: 'Adult Protective Services',
            href: 'https://hhs.cuyahogacounty.gov/programs/adult-protective-services',
          },
        ],
      },
    ],
  },
  {
    id: 'rides',
    group: 'Aging and rides',
    title: 'Transportation beyond the regular bus',
    intro:
      'Match the ride to the client’s municipality, mobility needs, and trip purpose before scheduling. For an insured client, use the transportation or member-services contact on the current plan card. Ask whether the trip is covered, who books it, how much notice is required, and whether wheelchair transport or an attendant is authorized. Get a trip number and return-ride instructions. A medical ride benefit should not be assumed to cover grocery trips. Also review RTA paratransit, Options for Independent Living, and aging-service entries.',
    entries: [
      {
        name: 'Senior Transportation Connection',
        summary: 'Rides through a local partner. No same-day or next-day rides are listed.',
        service:
          'Transportation through participating municipalities and organizations. Permitted trips and fares depend on the sponsoring partner.',
        eligibility:
          'Primarily adults 60 or older. Some partners include younger adults with disabilities. Residents of assisted-living or nursing facilities are excluded by the published enrollment guidance.',
        intake:
          'Enroll through the local partner. Cleveland: 216-664-2833. Lakewood: 216-521-1515. Maple Heights: 216-587-9602. Shaker Heights: 216-491-1360. Solon: 440-349-6363. Other communities: use the enrollment list or call 216-265-1489.',
        confirm:
          'No same-day or next-day rides are listed. Booking can open three weeks ahead. Confirm partner eligibility, fare, allowed destinations, wheelchair needs, and any personal-care-attendant registration.',
        phones: ['216-265-1489', '216-664-2833', '216-521-1515'],
        sources: [{ label: 'How to enroll', href: 'https://www.ridestc.org/how-to-enroll' }],
      },
    ],
  },
  {
    id: 'veterans-young-adults',
    group: 'Aging and rides',
    title: 'Veterans, young adults, and a wider search',
    entries: [
      {
        name: 'VA homeless veteran access',
        summary: 'National line connecting veterans at risk of homelessness to local VA resources.',
        service:
          'National entry point connecting veterans at risk of or experiencing homelessness to local VA resources.',
        eligibility:
          'Veterans and people assisting them. Specific housing and healthcare programs apply separate eligibility rules.',
        intake:
          'Call the National Call Center for Homeless Veterans at 877-424-3838 and request Cleveland-area assistance. Local 211 also offers veteran-resource navigation.',
        confirm:
          'Ask about emergency housing, SSVF, and HUD-VASH screening as appropriate. A referral is not immediate enrollment or guaranteed placement.',
        phones: ['877-424-3838', '211'],
        sources: [
          {
            label: 'National Call Center',
            href: 'https://www.va.gov/homeless/nationalcallcenter.asp',
          },
          { label: '211 Ohio', href: 'https://www.211oh.org/' },
        ],
      },
      {
        name: 'Youth Opportunities Unlimited',
        summary: 'Employment preparation for eligible ages 18–24.',
        service: 'Employment preparation, training, and work opportunities for young people.',
        eligibility:
          'For this adult guide, restrict referrals to eligible ages 18–24. Particular tracks have geographic, school-status, or income criteria.',
        intake:
          'Call 216-566-5445 or use the current program inquiry links. Public office: 1457 East 40th Street, Suite 200, Cleveland.',
        confirm:
          'Ask for an adult or young-adult employment track and confirm application dates, compensation, documents, and transportation.',
        phones: ['216-566-5445'],
        sources: [{ label: 'youcle.org', href: 'https://www.youcle.org/' }],
      },
      {
        name: '211 for needs this guide does not match',
        summary: 'Ask 211 to search by ZIP code when the first referral does not fit.',
        service: 'A route to neighborhood and specialty resources beyond a fixed directory.',
        eligibility:
          'Adults whose need is not resolved by the first referral, or whose eligibility excludes the listed options.',
        intake:
          'Ask 211 to search by ZIP code and need: LGBTQ-affirming support, immigrant assistance, HIV care, disability services, clothing or furniture, IDs, phone or internet, legal help, or reentry.',
        confirm:
          'Request the agency’s direct intake details, not just a name. For treatment use ADAMHS adult and service filters. For food use both food-network maps. For housing use coordinated entry.',
        phones: ['211'],
        sources: [
          { label: '211 Ohio', href: 'https://www.211oh.org/' },
          {
            label: 'ADAMHS by provider',
            href: 'https://www.adamhscc.org/resources/finding-help/by-provider',
          },
        ],
      },
      {
        name: 'Cuyahoga County Veterans Service Commission',
        summary:
          'Temporary vendor-paid help with rent, utilities, food, and hygiene for qualifying veterans.',
        service:
          'Temporary help with eligible rent, mortgage, utilities, deposits, food, clothing, and hygiene needs. Payments are made to vendors. Staff also assist with veterans’ benefits.',
        eligibility:
          'Qualifying veterans and certain dependents or survivors who demonstrate need and have lived in Cuyahoga County at least three months. Military service and discharge criteria apply. The site identifies honorable or general discharges for financial help.',
        intake:
          'Call 216-698-2600 or use the financial-assistance application. Main office is listed at 3950 Chester Avenue, Cleveland, OH 44114. Have service and discharge, residence, income, and expense records ready.',
        confirm:
          'Ask for the current document checklist, appointment process, qualifying service determination, and funded expense categories. Older web references to the Prospect Avenue address should not be used for travel without confirmation.',
        phones: ['216-698-2600'],
        sources: [{ label: 'Services', href: 'https://cuyahogavets.org/services/' }],
      },
    ],
  },
  {
    id: 'fresh-check',
    group: 'Check first',
    title: 'Changes that need a fresh check',
    intro:
      'Do not use the items below as proof of currently available walk-in care. They are listed so an outdated referral is not reused. Version 3 was reviewed online on September 16, 2026. Before each referral, reopen the linked source. Review phone numbers, closures, and intake at least quarterly.',
    notes: [
      'Recovery Resources clinical care routes to MetroHealth at 216-778-4428.',
      'Front Steps is now Rising Well at 216-781-2250.',
      'CHN directs HEAP and PIPP inquiries to Step Forward at 216-480-4327.',
      'Jordan 4 Change’s treatment location and schedule need direct confirmation.',
      'For each completed referral, record the provider, program, eligibility basis, contact person, date checked, application route, documents, appointment or waitlist outcome, transportation, and the next follow-up. “The website lists the service” is different from “the provider accepted this client.”',
    ],
    entries: [
      {
        name: 'Glick Center and Rosary Hall',
        summary: 'Not open as of the September 16, 2026 review. Do not refer clients there yet.',
        service:
          'The Centers announces the Glick Center opening September 28, 2026. Its Rosary Hall withdrawal-management unit is announced for January 2027.',
        eligibility:
          'Not yet open as of this guide’s September 16, 2026 review. Future eligibility and admission arrangements must be confirmed after launch.',
        intake:
          'Use FrontLine crisis support at 216-623-6888 or 988 for a present crisis, and the currently listed substance use providers for treatment assessment.',
        confirm:
          'Do not refer clients to a future facility or assume an old crisis-center address still accepts walk-ins. Recheck the provider announcement after the planned dates.',
        phones: ['216-623-6888', '988'],
        flag: 'future',
        sources: [{ label: 'thecentersohio.org', href: 'https://thecentersohio.org/grc/' }],
      },
      {
        name: 'Bishop William M. Cosgrove Center',
        summary: 'Onsite service is unconfirmed. Do not use this address for Coordinated Intake.',
        service:
          'Historical listings describe meals, a pantry, and other basic-needs services. An official 2025 notice reported a temporary service pause for renovation.',
        eligibility:
          'This review did not establish a clear reopening notice. Treat current onsite service as unconfirmed.',
        intake:
          'Call 216-781-8262 or Catholic Charities central intake at 1-800-860-7373 before any referral or travel. Use 211 and food-network maps for alternatives.',
        confirm:
          'The historical address is 1736 Superior Avenue. Do not use this address for FrontLine Coordinated Intake, which is now phone-only.',
        phones: ['216-781-8262', '800-860-7373', '211'],
        flag: 'confirm',
        sources: [
          {
            label: 'Cosgrove Center',
            href: 'https://www.ccdocle.org/locations/bishop-william-m-cosgrove-center',
          },
          { label: 'Diocese of Cleveland', href: 'https://www.dioceseofcleveland.org/' },
        ],
      },
    ],
  },
  {
    id: 'checklist',
    group: 'Check first',
    title: 'Advocate intake checklist',
    intro:
      'Use this during a warm handoff. These are suggested questions, not universal eligibility requirements.',
    notes: [
      'Match the household: adult age, ZIP code, pregnancy or postpartum status, family composition, dependents’ ages, disability and access needs, and preferred language. Ask about gender-appropriate placement without assuming a provider’s policy.',
      'Confirm the actual service: Are you accepting new clients today? Is there a bed, appointment, or waitlist? What is the treatment level? Is medical clearance required? Who can make the referral? Get the intake worker’s name and a direct callback.',
      'Confirm costs and documents: coverage, uninsured funding, fees or deposit, ID alternatives, proof of residence or income, clinical records, a release of information, and court documents. Do not delay urgent screening only because a client lacks paperwork.',
      'Make placement workable: transportation, mobility or personal-care support, interpretation, service animals, dietary needs, belongings, medication storage, and continuation of prescribed medications, including medications for opioid use disorder. Ask about childcare and pregnancy care coordination.',
      'Close the loop: with consent, make a warm transfer. Record the service, date, contact, eligibility decision, next step, arrival instructions, and a backup referral. Use a safe callback method and share only necessary information.',
    ],
    entries: [],
  },
];
