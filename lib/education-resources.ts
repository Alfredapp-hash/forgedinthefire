export type EducationResource = {
  slug: string;
  title: string;
  description: string;
  href: string;
};

export const EDUCATION_SECTIONS: {
  category: string;
  items: Array<EducationResource | { title: string; description: string; href: null }>;
}[] = [
  {
    category: 'Awareness',
    items: [
      {
        slug: 'human-trafficking-101',
        title: 'Human Trafficking 101',
        description: 'Understanding the basics of human trafficking',
        href: '/resources/human-trafficking-101.pdf',
      },
      {
        slug: 'recognizing-the-signs',
        title: 'Recognizing the Signs',
        description: 'How to identify potential trafficking situations',
        href: '/resources/recognizing-the-signs.pdf',
      },
      {
        slug: 'myths-vs-facts',
        title: 'Myths vs Facts',
        description: 'Common misconceptions about trafficking',
        href: '/resources/myths-vs-facts-human-trafficking.pdf',
      },
    ],
  },
  {
    category: 'For Survivors',
    items: [
      {
        slug: 'safety-planning-guide',
        title: 'Safety Planning Guide',
        description: 'Creating a personalized safety plan',
        href: '/resources/safety-planning-guide.pdf',
      },
      {
        slug: 'know-your-rights',
        title: 'Know Your Rights',
        description: 'Legal rights and protections for survivors',
        href: '/resources/know-your-rights-human-trafficking-survivors.pdf',
      },
      {
        slug: 'healing-resources',
        title: 'Healing Resources',
        description: 'Self-care and trauma recovery tools',
        href: '/resources/healing-after-trafficking.pdf',
      },
    ],
  },
  {
    category: 'For Professionals',
    items: [
      {
        title: 'Trauma-Informed Care Guide',
        description: 'Best practices for service providers',
        href: null,
      },
      {
        slug: 'screening-toolkit',
        title: 'Screening Toolkit',
        description: 'Identifying trafficking in healthcare settings',
        href: '/resources/human-trafficking-screening-toolkit.pdf',
      },
      {
        slug: 'multi-disciplinary-team-guide',
        title: 'Multi-Disciplinary Team Guide',
        description: 'Coordinating comprehensive response',
        href: '/resources/multi-disciplinary-anti-trafficking-response.pdf',
      },
    ],
  },
];

export function educationGuides() {
  return EDUCATION_SECTIONS.flatMap((section) => section.items).filter(
    (item): item is EducationResource => item.href !== null && 'slug' in item
  );
}

export function getEducationGuide(slug: string) {
  return educationGuides().find((item) => item.slug === slug);
}
