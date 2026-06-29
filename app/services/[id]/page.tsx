import { Metadata } from 'next';
import { SERVICES, ORG } from '@/lib/constants';
import { generateMetaTags } from '@/lib/utils';
import { notFound } from 'next/navigation';
import ServicePageContent from './ServicePageContent';
import { ServiceStructuredData, BreadcrumbStructuredData } from '@/components/structured-data';

interface ServicePageProps {
  params: Promise<{ id: string }>;
}

// Extended service content with full landing page copy
const SERVICE_CONTENT: Record<string, {
  subtitle: string;
  intro: string;
  overview: string[];
  whatWeProvide: { title: string; description: string }[];
  whyItMatters: string[];
  approach: { title: string; description: string }[];
  ctas: { label: string; href: string; variant: 'default' | 'outline' }[];
}> = {
  'victim-advocacy': {
    subtitle: 'Walking Alongside Survivors, Every Step of the Way',
    intro: 'When someone escapes exploitation, they need more than services—they need someone who understands, who listens, and who stays. Our victim advocacy provides immediate, ongoing support that meets survivors where they are and walks with them through crisis, recovery, and renewal.',
    overview: [
      'Survivors of human trafficking and commercial sexual exploitation face extraordinary challenges when seeking safety and stability. Many have experienced repeated trauma, complex legal situations, housing instability, and barriers to basic needs. Navigating these challenges alone can feel overwhelming—and can lead to re-victimization when systems fail to respond with understanding and care.',
      'At Forged in the Fire, we believe that effective advocacy begins with trust. Our trauma-informed victim advocacy program provides immediate and ongoing support for survivors navigating crisis response, legal systems, and recovery services. We understand that healing is not linear, and that survivors may need support at different intensities and different times throughout their journey.',
      'Our advocates bring more than professional training—they bring a commitment to meeting survivors where they are, without judgment. Whether someone needs help accessing emergency housing, understanding their legal rights, or simply having someone present during a difficult court proceeding, our team provides consistent, compassionate presence.',
      'We define success not by how quickly someone moves through services, but by whether they feel safe, supported, and empowered to make choices about their own lives. Our advocacy approach prioritizes trust, choice, collaboration, and survivor leadership at every stage.',
      'Through our work with the Northeast Ohio Human Trafficking Task Force and partnerships with law enforcement, legal professionals, and community organizations, we ensure that survivors have knowledgeable allies who understand the complex realities of trafficking and exploitation.',
      'Our advocacy includes practical support—help with housing applications, court accompaniment, referrals for counseling and medical care—but it also includes something equally important: the message that survivors deserve dignity, that their voices matter, and that healing is possible.',
      'We remain committed to re-victimization prevention, recognizing that survivors often face systems that can inadvertently cause additional harm. Our advocates work to buffer survivors from these harms, providing stability and continuity of care that builds safety and hope.',
    ],
    whatWeProvide: [
      { title: 'Immediate Crisis Support', description: 'When someone reaches out—whether during an emergency or in the early stages of seeking help—our advocates respond with urgency and care. We provide crisis intervention, emotional support, and immediate safety planning that honors the survivor\'s choices and prioritizes their immediate wellbeing.' },
      { title: 'Legal System Navigation', description: 'Navigating the legal system as a trafficking survivor can be confusing, re-traumatizing, and overwhelming. Our advocates provide court accompaniment, legal advocacy, and support during interactions with law enforcement. We help survivors understand their rights, access victim compensation, and move through legal processes with an informed ally at their side.' },
      { title: 'Safety Planning and Stabilization', description: 'Safety looks different for every survivor. We work collaboratively to develop safety plans that account for individual circumstances, including housing instability, substance use, mental health challenges, and fear of retaliation. Our goal is practical stabilization that creates the foundation for longer-term healing.' },
      { title: 'Resource Coordination', description: 'Survivors often need connections to housing, counseling, medical care, and recovery services. We maintain relationships with trusted community partners and help survivors navigate these systems, ensuring they can access the comprehensive support they deserve.' },
      { title: 'Re-Victimization Prevention', description: 'We recognize that systems can inadvertently cause additional harm to survivors. Our advocacy includes buffering survivors from these harms, providing stability, continuity of care, and empowerment planning that reduces vulnerability to further exploitation.' },
    ],
    whyItMatters: [
      'Human trafficking leaves deep wounds—not only from the exploitation itself, but from the systems and circumstances that often fail to protect vulnerable individuals. Survivors frequently face housing instability, economic desperation, substance use challenges, mental health impacts, and complex legal situations. Without informed, compassionate support, these barriers can trap survivors in cycles of vulnerability.',
      'When survivors have access to advocacy that understands trauma, honors their autonomy, and provides practical support, the trajectory of their lives can change. They move from isolation to connection, from confusion to clarity, from surviving to healing.',
      'Our advocacy matters because it provides something every survivor deserves: someone who sees them as a whole person, not a case file. Someone who believes their story, respects their choices, and stays present through the difficult work of rebuilding a life.',
      'This work also matters for our broader community. When survivors stabilize, heal, and thrive, they become leaders, advocates, and voices for change. They help transform systems, educate communities, and create hope for others. Supporting one survivor creates ripple effects that strengthen entire communities.',
    ],
    approach: [
      { title: 'Survivor-Centered Care', description: 'We honor the autonomy, voice, and lived experience of every survivor. This means listening first, following their lead, and recognizing that survivors are the experts on their own lives and needs.' },
      { title: 'Safety and Trust', description: 'We understand that safety encompasses physical, psychological, and emotional wellbeing. We work continuously to build trust through consistency, transparency, and respect for boundaries.' },
      { title: 'Collaboration and Choice', description: 'We never make decisions for survivors—we make decisions with them. Every step of our advocacy prioritizes informed choice and shared power.' },
      { title: 'Empowerment Over Charity', description: 'We believe in equipping survivors with tools for long-term success and independence. Our role is supporting their strength, not creating dependency.' },
      { title: 'Non-Judgmental Support', description: 'We meet survivors where they are, without judgment about their past decisions, current circumstances, or the pace of their healing.' },
    ],
    ctas: [
      { label: 'Request Support', href: '/get-help', variant: 'default' },
      { label: 'Partner With Our Team', href: '/contact', variant: 'outline' },
    ],
  },
  'workforce-development': {
    subtitle: 'Turning Survival Into Leadership',
    intro: 'Survivors possess extraordinary insight, resilience, and understanding of the systems that shape recovery. Our workforce development program creates professional pathways for survivors to become certified victim advocates—transforming lived experience into lived leadership.',
    overview: [
      'Survivors of human trafficking and exploitation carry knowledge that cannot be learned from textbooks. They understand the barriers that systems create, the moments when intervention matters most, and the kind of support that actually helps. When we create pathways for survivors to become professional advocates, we don\'t just help individuals build careers—we transform the entire field of anti-trafficking work.',
      'The Advocate Trainee Workforce Development Program is a survivor-led initiative designed to create sustainable career pathways for survivors of human trafficking and exploitation. This paid training program provides participants with professional skills, certifications, and lived-experience leadership pathways to become certified victim advocates.',
      'We recognize that economic stability is essential for long-term healing. Survivors often face significant barriers to employment, including gaps in work history, criminal records related to their exploitation, and the ongoing challenges of trauma recovery. Traditional workforce programs may not understand these complexities or provide the flexibility and support survivors need to succeed.',
      'Our program addresses these barriers directly. Participants receive compensation during training, removing the economic pressure that often forces survivors to choose between immediate survival and long-term investment in their futures. We provide trauma-informed education that acknowledges the ongoing nature of healing while building professional capacity.',
      'The training curriculum covers victim advocacy fundamentals, trauma-informed communication, crisis response and intervention, professional boundaries and ethics, community outreach and engagement, public speaking and survivor leadership, and comprehensive career readiness preparation. This foundation prepares graduates for meaningful employment in victim services, social work, advocacy organizations, and related fields.',
      'Beyond technical skills, our program fosters the confidence, professional identity, and leadership capacity that survivors need to step into roles where their lived experience becomes an asset. We help participants understand that their survival skills—resilience, problem-solving, understanding complex systems, supporting others through crisis—are exactly the skills that make exceptional advocates.',
      'By creating pathways for survivors to become advocates themselves, we help transform systems, strengthen communities, and create authentic hope for others walking similar paths. Survivor-advocates bring credibility, understanding, and effectiveness to anti-trafficking work that benefits everyone they serve.',
    ],
    whatWeProvide: [
      { title: 'Professional Skills Development', description: 'Participants receive comprehensive training in victim advocacy fundamentals, including crisis intervention, safety planning, legal system navigation, and resource coordination. We build technical competence alongside the soft skills essential for effective advocacy.' },
      { title: 'Trauma-Informed Education', description: 'All training is delivered through a trauma-informed lens that recognizes participants may be in various stages of their own healing. We create learning environments that are safe, flexible, and responsive to the needs of survivors building professional capacity.' },
      { title: 'Crisis Response and Intervention Training', description: 'Participants learn practical skills for responding to individuals in crisis, including de-escalation techniques, safety assessment, and immediate stabilization approaches that honor survivor autonomy.' },
      { title: 'Professional Boundaries and Ethics', description: 'We provide thorough grounding in professional ethics, boundary maintenance, and self-care practices that are essential for sustainable careers in victim services.' },
      { title: 'Community Outreach and Engagement', description: 'Participants develop skills for community education, professional training, and public speaking—preparing them to represent the organization and advocate for systemic change.' },
      { title: 'Career Readiness and Workforce Preparation', description: 'Beyond advocacy skills, we provide resume development, interview preparation, workplace navigation support, and connections to employment opportunities in victim services and related fields.' },
      { title: 'Paid Training Stipend', description: 'Participants receive compensation during training, recognizing that economic stability is essential for healing and that their time and contribution have value from day one.' },
    ],
    whyItMatters: [
      'The anti-trafficking movement needs leaders who truly understand trafficking from the inside out. While professional training is essential, there is no substitute for the insight that comes from lived experience. When survivors become advocates, they bring credibility, deep understanding, and effective intervention skills that transform how organizations serve trafficking victims.',
      'However, survivors face extraordinary barriers to entering professional roles. Traditional education and workforce programs often fail to accommodate the realities of trauma recovery, economic instability, and the practical challenges survivors face. Without targeted support, talented, capable survivors who could excel in advocacy roles may never have the opportunity to develop their potential.',
      'This program matters because it creates a bridge—connecting survivor wisdom to professional opportunity. It recognizes that lived experience is valuable, that survivors deserve compensation for their expertise, and that economic empowerment is inseparable from long-term healing.',
      'When survivors become advocates, the impact extends far beyond individual careers. They become visible proof that healing is possible. They model resilience and transformation for other survivors. They help organizations become more trauma-informed and survivor-centered. And they bring irreplaceable credibility to community education, professional training, and policy advocacy.',
      'This work also matters for prevention. Survivor-leaders are uniquely positioned to identify vulnerabilities, understand trafficking dynamics, and advocate for the systemic changes that prevent exploitation before it occurs. By investing in survivor workforce development, we invest in the future leaders who will shape anti-trafficking work for decades to come.',
    ],
    approach: [
      { title: 'Survivor-Led Design', description: 'This program was designed by survivors, for survivors. We recognize that participants are not merely students—they are emerging professionals bringing valuable expertise to their learning.' },
      { title: 'Economic Justice', description: 'We provide paid training because we believe survivors should not have to choose between immediate needs and long-term investment. Compensation during training honors participants\' time and reduces economic barriers to participation.' },
      { title: 'Healing-Integrated Learning', description: 'We understand that participants may be in various stages of their own recovery. Our program provides flexibility, support, and trauma-informed practices that allow learning and healing to happen simultaneously.' },
      { title: 'Lived Experience as Asset', description: 'We explicitly frame lived experience as valuable professional knowledge. Participants learn to translate their survival skills into professional vocabulary and effective practice.' },
      { title: 'Ongoing Support', description: 'Workforce development doesn\'t end at graduation. We provide continued mentorship, career placement support, and professional development opportunities for program alumni.' },
    ],
    ctas: [
      { label: 'Learn More About Training', href: '/contact', variant: 'default' },
      { label: 'Support Workforce Development', href: '/donate', variant: 'outline' },
    ],
  },
  'mentorship': {
    subtitle: 'Empowerment Through Peer Leadership',
    intro: 'Healing becomes more powerful when survivors know they are not alone. Our mentorship program connects survivors with trained peer mentors who understand the realities of exploitation and recovery—because they have lived similar journeys and emerged as leaders.',
    overview: [
      'The journey from trafficking victim to thriving survivor is rarely straight or simple. Along the way, there are moments when someone needs to hear from another person who truly understands—who has faced similar barriers, felt similar fears, and found pathways through. Our Survivor-to-Advocate Mentorship Program creates these vital connections.',
      'Through guidance, encouragement, and lived-experience leadership, survivors gain support from individuals who have walked similar paths. Our trained peer mentors provide something that professional services, while essential, cannot fully replicate: the credibility that comes from shared experience and the hope that comes from visible recovery.',
      'This program recognizes that healing becomes more powerful within community. Survivors of trafficking often experience profound isolation—separated from family, disconnected from support networks, and struggling to trust after betrayal. Mentorship creates connection that counters isolation and builds the relational foundation for sustainable healing.',
      'Our mentors are not simply volunteers who want to help. They are trained peer advocates who have completed professional development, understand trauma-informed practices, and can balance empathetic connection with appropriate boundaries. They bring both lived experience and professional preparation to their mentorship roles.',
      'The mentorship relationship provides emotional support and encouragement during difficult moments. It offers survivor-centered goal planning that helps mentees envision and move toward futures they choose for themselves. It includes leadership and confidence development, helping survivors discover strengths they may not recognize in themselves.',
      'For survivors interested in becoming advocates themselves, mentorship provides professional guidance and exposure to career pathways. Mentors model healthy relationships and boundaries, demonstrating that trust and connection are possible after exploitation.',
      'Perhaps most importantly, this program helps survivors discover purpose, leadership potential, and sustainable futures within their communities. When someone who has survived trafficking becomes a mentor, the transformation is visible and powerful. It shows other survivors that their past does not define their future—and that their experience can become the foundation for helping others.',
    ],
    whatWeProvide: [
      { title: 'Emotional Support and Encouragement', description: 'Mentors provide consistent, reliable presence during the ups and downs of recovery. They offer understanding, validation, and encouragement that helps survivors maintain hope through difficult seasons.' },
      { title: 'Survivor-Centered Goal Planning', description: 'Mentors work with mentees to identify personal goals—whether related to housing, employment, education, relationships, or healing—and develop practical steps toward achieving them. The mentee\'s priorities always guide the process.' },
      { title: 'Leadership and Confidence Development', description: 'Through ongoing relationship and modeled behavior, mentors help survivors recognize their own strengths, develop confidence, and envision themselves as capable of leadership and contribution.' },
      { title: 'Professional Mentorship for Aspiring Advocates', description: 'For survivors interested in victim advocacy careers, mentors provide guidance about training pathways, professional development, and the practical realities of working in anti-trafficking services.' },
      { title: 'Healthy Relationship and Boundary Support', description: 'Mentors demonstrate and discuss healthy relationships, appropriate boundaries, and trust-building—providing living examples of connection that is safe and mutual.' },
      { title: 'Community Connection and Empowerment', description: 'Mentors help mentees identify and connect with broader community resources, support networks, and opportunities for engagement that extend beyond the mentorship relationship.' },
    ],
    whyItMatters: [
      'Recovery from trafficking is not a solo journey—it requires community, connection, and the presence of people who understand. While professional services provide essential support, there is unique power in peer relationships where both people share lived experience of exploitation and survival.',
      'Many survivors feel profoundly alone in their experiences. They may believe that no one can truly understand what they have been through. They may struggle to trust professional helpers who, however compassionate, have not walked similar paths. Mentorship breaks through this isolation by providing connection with someone who genuinely understands.',
      'The impact of mentorship extends beyond the immediate relationship. When survivors see mentors who have built stable, meaningful lives after trafficking, they see visible proof that healing is possible. This hope is not abstract—it wears a human face and speaks from lived experience.',
      'Mentorship also matters for the mentors themselves. Becoming a mentor is often a significant milestone in a survivor\'s healing journey—a recognition that they have moved from needing support to being able to provide it. This transition contributes to purpose, identity, and post-traumatic growth that sustains long-term wellbeing.',
      'For the broader community, survivor mentorship creates ripple effects of healing. Mentees who stabilize and thrive often go on to mentor others. They become leaders, advocates, and voices for change. The investment in one mentorship relationship can influence dozens of lives over time.',
    ],
    approach: [
      { title: 'Peer Relationship with Professional Boundaries', description: 'Our mentors bring lived experience and professional training. They understand the power of shared experience while maintaining appropriate boundaries that protect both mentor and mentee.' },
      { title: 'Choice and Autonomy', description: 'Mentees choose their goals, set their priorities, and direct the focus of mentorship. We honor survivor leadership at every stage.' },
      { title: 'Safety-Centered Matching', description: 'We carefully match mentors and mentees considering personalities, needs, circumstances, and readiness. Safety and compatibility guide all matching decisions.' },
      { title: 'Trauma-Informed Communication', description: 'Mentors understand trauma impacts and communicate in ways that are validating, non-judgmental, and supportive of healing.' },
      { title: 'Mentor Support and Supervision', description: 'We provide ongoing support, supervision, and resources for mentors—ensuring they have what they need to sustain their own wellbeing while supporting others.' },
    ],
    ctas: [
      { label: 'Find a Mentor', href: '/get-help', variant: 'default' },
      { label: 'Become a Mentor', href: '/volunteer', variant: 'outline' },
    ],
  },
  'community-education': {
    subtitle: 'Education That Prevents Exploitation',
    intro: 'Human trafficking thrives in silence and misunderstanding. Our survivor-led education and prevention training equips communities, professionals, and organizations with the knowledge and tools to identify trafficking, respond appropriately, and prevent exploitation before it occurs.',
    overview: [
      'Prevention is not merely the absence of trafficking—it is the presence of informed communities, prepared professionals, and coordinated response systems that protect vulnerable individuals and hold exploiters accountable. Our Community Education & Prevention Initiatives create this presence through survivor-led training that is practical, trauma-informed, and grounded in real-world experience.',
      'Forged in the Fire provides comprehensive education designed to help individuals and organizations understand human trafficking, recognize warning signs, respond appropriately to potential victims, and prevent exploitation in their spheres of influence. Our trainings are not abstract or theoretical—they are rooted in the actual experiences of survivors and the practical realities of trafficking in our communities.',
      'We recognize that trafficking takes many forms and affects diverse populations. Our education addresses vulnerability factors and grooming tactics used by exploiters, helping participants understand how trafficking happens and who is at risk. We provide specific guidance for recognizing signs of exploitation in various settings, from schools and businesses to online platforms and neighborhood communities.',
      'Our training is survivor-led, meaning that participants hear directly from individuals who have experienced trafficking and emerged as leaders. This survivor voice transforms education from information-delivery to human connection. It makes the issue real, memorable, and actionable in ways that statistics alone cannot achieve.',
      'We provide specialized training for different audiences—educators who need to recognize vulnerable students, business owners who want to ensure their workplaces are not facilitating exploitation, healthcare providers who may encounter trafficking victims in clinical settings, law enforcement officers conducting investigations, and community members who want to be prepared to help.',
      'Beyond awareness, our training emphasizes practical response. We help participants understand appropriate reporting protocols, victim-centered response practices, and the resources available in their communities. Education becomes prevention when equipped individuals take informed action.',
      'Our work in prevention recognizes that reducing vulnerability requires addressing root causes—including economic desperation, housing instability, substance abuse, and lack of community connection. While our direct services address these needs for individual survivors, our prevention work helps communities understand and address these systemic contributors to trafficking.',
    ],
    whatWeProvide: [
      { title: 'Human Trafficking Awareness and Identification', description: 'Comprehensive training on what trafficking is, how it operates, and the various forms it takes in our communities. We address both sex trafficking and labor trafficking, helping participants understand the full scope of exploitation.' },
      { title: 'Vulnerability Factors and Grooming Tactics', description: 'Education about who is at risk for trafficking and how exploiters identify, recruit, and control victims. We discuss family dynamics, economic desperation, substance use, prior abuse, and other factors that increase vulnerability.' },
      { title: 'Trauma-Informed Response Practices', description: 'Training for professionals and community members on how to respond when they encounter potential trafficking situations. We emphasize victim-centered approaches that prioritize safety, avoid re-traumatization, and connect individuals to appropriate resources.' },
      { title: 'Online Exploitation and Recruitment', description: 'Specialized education about how traffickers use social media, dating apps, gaming platforms, and other online spaces to identify and recruit victims. We provide practical guidance for parents, educators, and youth-serving professionals.' },
      { title: 'Commercial Sexual Exploitation of Children (CSEC)', description: 'Focused training on the trafficking of minors, including the unique dynamics of child exploitation, warning signs specific to youth, mandatory reporting obligations, and appropriate intervention approaches.' },
      { title: 'Community Prevention Strategies', description: 'Guidance for communities, businesses, schools, and organizations on policies, practices, and environmental changes that can reduce vulnerability and deter exploitation in their settings.' },
      { title: 'Reporting Protocols and Resources', description: 'Practical information about how and where to report suspected trafficking, what to expect from the reporting process, and how to connect potential victims with immediate help and ongoing support.' },
    ],
    whyItMatters: [
      'Human trafficking is a complex crime that thrives in misunderstanding and silence. Many people hold misconceptions about what trafficking looks like, who it affects, and how to respond. These misconceptions allow trafficking to continue unchecked and prevent victims from receiving help.',
      'When community members—teachers, healthcare workers, business owners, neighbors—can recognize trafficking and respond appropriately, they become the front line of prevention. A teacher who notices warning signs can connect a vulnerable student to support. A hotel manager who understands trafficking indicators can prevent exploitation on their property. A healthcare provider who asks the right questions can identify victims who might otherwise be missed.',
      'Education transforms bystanders into responders. It creates communities where trafficking is harder to hide and where victims are more likely to encounter people who can help. Prevention through education reduces the pool of vulnerable individuals, limits opportunities for exploiters, and creates social environments where exploitation is less tolerated.',
      'Our survivor-led approach to education is particularly powerful. When survivors share their stories and expertise, they transform abstract statistics into human reality. Participants in our trainings don\'t just learn about trafficking—they understand it, remember it, and are moved to action by it.',
      'This work matters for long-term systemic change. As more professionals, community members, and organizations become educated about trafficking, the overall response system becomes more effective. Coordinated, informed communities can address trafficking in ways that isolated individuals cannot.',
    ],
    approach: [
      { title: 'Survivor-Led Delivery', description: 'Our trainings are led by survivors who bring lived experience and professional expertise. This centers survivor voice and creates powerful, memorable learning experiences.' },
      { title: 'Prevention Without Fear', description: 'We educate without sensationalizing or creating paralyzing fear. Our approach empowers participants with practical tools and confidence to take appropriate action.' },
      { title: 'Dignity-Centered Content', description: 'All our training treats trafficking survivors with dignity, avoiding exploitative details or imagery that could re-traumatize participants with lived experience.' },
      { title: 'Practical and Actionable', description: 'We emphasize concrete, realistic steps participants can take rather than overwhelming information that leaves people uncertain how to respond.' },
      { title: 'Ongoing Partnership', description: 'Education is not a one-time event. We build ongoing relationships with organizations and communities, providing updated information, consultation, and support as needs evolve.' },
    ],
    ctas: [
      { label: 'Request Training', href: '/contact', variant: 'default' },
      { label: 'Partner for Prevention', href: '/contact', variant: 'outline' },
    ],
  },
  'accountability': {
    subtitle: 'Reducing Demand. Preventing Future Victimization.',
    intro: 'Human trafficking is driven by demand—the buyers who purchase sex and create the market that fuels exploitation. Our court-aligned Sex Buyers Education programming addresses this demand through accountability, education, and behavioral change that prevents re-offense and protects future potential victims.',
    overview: [
      'Addressing human trafficking requires more than supporting survivors—it requires disrupting the systems that enable exploitation. At its core, trafficking is an economic crime driven by demand. When individuals purchase sex, they create the market that traffickers exploit for profit. Reducing demand is essential to preventing trafficking and protecting vulnerable individuals from exploitation.',
      'Forged in the Fire facilitates offender accountability programming designed to address the demand that fuels commercial sexual exploitation. Our Sex Buyers Education (SBE) programming is court-aligned, trauma-informed, and focused on accountability, behavioral change, and prevention of re-offense.',
      'We deliver this programming with the explicit purpose of disrupting demand for commercial sex. By addressing and reducing the buying of sex, we directly undermine the economic incentive that fuels trafficking and exploitation. When demand is reduced, traffickers lose the financial benefit that drives the coercion and abuse of women and girls in commercial sex.',
      'This program is not designed to shift focus away from victims—it is designed to prevent future victimization. By working with individuals who have purchased sex, we address the root cause of the market that creates trafficking. Our work holds buyers accountable while centering survivors, promoting systemic change, and advancing a community response that prioritizes prevention, justice, and restoration.',
      'Our SBE programming is court-aligned, meaning we work with probation departments, courts, and criminal justice partners to provide education as part of accountability sentences for sex buying offenses. This alignment ensures that our programming reaches individuals who have demonstrated demand and provides structured intervention at a critical moment.',
      'The curriculum covers the impact of exploitation on victims and communities, helping participants understand the real human consequences of commercial sex markets. We address trauma and coercion awareness, ensuring participants understand that many individuals in commercial sex are there through force, fraud, or coercion—not free choice.',
      'We discuss legal and social consequences of sex buying, reinforcing that this behavior carries serious penalties and lasting impacts. We provide behavioral intervention strategies that help participants understand the patterns and choices that led to their offense and develop practical skills for making different choices in the future.',
      'Our approach is fundamentally prevention-focused. We believe that effective rehabilitation is not merely punishment—it is intervention that changes behavior and reduces future harm. When participants complete our programming with genuine understanding and commitment to change, we prevent future victimization of vulnerable individuals.',
      'It is important to state clearly that although Forged in the Fire facilitates Sex Buyers Education programming, we remain a survivor-centered, victim-focused, and trauma-informed organization at our core. Our mission is rooted in the safety, dignity, and long-term healing of individuals harmed by commercial sexual exploitation. This program serves that mission by preventing future harm.',
    ],
    whatWeProvide: [
      { title: 'Accountability-Based Education', description: 'Comprehensive programming that holds sex buyers accountable for their actions while providing education that addresses the attitudes, beliefs, and choices underlying their behavior.' },
      { title: 'Impact of Exploitation on Victims and Communities', description: 'Curriculum content that helps participants understand the real human and community costs of commercial sex markets, moving beyond abstract concepts to understand actual impacts on survivors.' },
      { title: 'Trauma and Coercion Awareness', description: 'Education about the realities of commercial sexual exploitation, including the prevalence of force, fraud, and coercion, the impact of trauma on individuals in commercial sex, and the absence of genuine consent in trafficking situations.' },
      { title: 'Legal and Social Consequences', description: 'Clear information about the legal penalties, social stigma, employment impacts, and other consequences of sex buying behavior—reinforcing accountability and informed decision-making.' },
      { title: 'Behavioral Intervention Strategies', description: 'Practical tools and techniques for recognizing triggers, managing impulses, changing patterns of thought and behavior, and making choices that prevent re-offense.' },
      { title: 'Prevention-Focused Rehabilitation', description: 'An overall approach that prioritizes lasting behavioral change over simple compliance, with the goal of ensuring participants complete programming with genuine understanding and reduced risk of re-offense.' },
      { title: 'Court Alignment and Compliance Reporting', description: 'Structured programming that meets court requirements, provides appropriate documentation of participation and progress, and supports the criminal justice system\'s accountability goals.' },
    ],
    whyItMatters: [
      'Human trafficking exists because there is profit to be made from exploiting vulnerable individuals. That profit comes from buyers. Without demand, trafficking would not be economically viable. Addressing demand is therefore essential to preventing trafficking and protecting potential victims.',
      'Sex buyers often believe their actions are victimless or that they are engaging in consensual transactions. They may not understand the prevalence of trafficking within commercial sex markets or the coercion, trauma, and exploitation that characterize the experiences of many individuals they encounter. Education can change this understanding—and with changed understanding comes the potential for changed behavior.',
      'When sex buyers are held accountable and receive effective intervention, we prevent future victimization. Each person who stops buying sex reduces the demand that fuels trafficking. Each person who gains genuine understanding of exploitation\'s harms becomes less likely to re-offend and more likely to influence others against sex buying.',
      'This work matters for systemic change. As courts, probation departments, and communities increasingly recognize that sex buying drives trafficking, they are implementing stronger accountability and education requirements. Our programming provides a trauma-informed, survivor-centered model for this accountability work that prioritizes prevention and genuine rehabilitation.',
      'The impact extends beyond individual participants. Effective accountability programming creates community awareness that sex buying is not a victimless crime—it is a serious harm with serious consequences. This shifting awareness contributes to the larger cultural change necessary for long-term trafficking prevention.',
    ],
    approach: [
      { title: 'Survivor-Centered Accountability', description: 'While working with offenders, we maintain our core commitment to survivors. Our programming explicitly centers victim impact and survivor dignity, ensuring participants understand who is harmed by their behavior.' },
      { title: 'Prevention Through Understanding', description: 'We believe that lasting behavioral change comes from genuine understanding, not merely punishment. Our education addresses root causes, attitudes, and choices that contribute to sex buying.' },
      { title: 'Non-Judgmental Education', description: 'We provide information and facilitate understanding without dehumanizing participants. Effective rehabilitation requires recognizing the capacity for change in every individual.' },
      { title: 'Professional Boundaries', description: 'Our staff maintain appropriate professional boundaries with program participants while delivering effective education and accountability.' },
      { title: 'Commitment to Safety', description: 'We understand that effective accountability programming must prioritize community safety and victim protection above all other goals.' },
    ],
    ctas: [
      { label: 'Court & Probation Partnerships', href: '/contact', variant: 'default' },
      { label: 'Support Demand Reduction', href: '/donate', variant: 'outline' },
    ],
  },
};

// Generate static params for all services with detail pages
export async function generateStaticParams() {
  const serviceIds = [
    'victim-advocacy',
    'workforce-development', 
    'mentorship',
    'community-education',
    'accountability',
  ];
  
  return serviceIds.map((id) => ({ id }));
}

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const { id } = await params;
  const service = SERVICES.find((s) => s.id === id);

  if (!service) {
    return generateMetaTags({
      title: 'Service Not Found',
      description: 'The requested service could not be found.',
    });
  }

  return generateMetaTags({
    title: `${service.title} in Lorain County Ohio | Forged in the Fire`,
    description: `${service.description} Available in Lorain County, Ohio and Northeast Ohio through Forged in the Fire.`,
  });
}

export default async function ServiceDetailPage({ params }: ServicePageProps) {
  const { id } = await params;
  const service = SERVICES.find((s) => s.id === id);
  const content = SERVICE_CONTENT[id];
  
  if (!service || !content) {
    notFound();
  }

  // Pass minimal data to client component
  const serviceData = {
    id: service.id,
    title: service.title,
    icon: service.icon,
  };

  return (
    <>
      <ServiceStructuredData
        name={service.title}
        description={service.description}
        url={`/services/${service.id}`}
      />
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: '/' },
          { name: 'Services', url: '/services' },
          { name: service.title, url: `/services/${service.id}` },
        ]}
      />
      <ServicePageContent service={serviceData} content={content} />
    </>
  );
}
