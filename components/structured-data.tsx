import { GEO, ORG } from '@/lib/constants';

const AREA_SERVED = {
  '@type': 'Place' as const,
  name: GEO.serviceArea,
  containsPlace: [
    { '@type': 'AdministrativeArea', name: GEO.county },
    { '@type': 'City', name: GEO.largestCity },
    { '@type': 'City', name: GEO.countySeat },
    { '@type': 'AdministrativeArea', name: GEO.region },
    { '@type': 'State', name: GEO.state },
  ],
};

export function OrganizationStructuredData() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: ORG.name,
    description: ORG.description,
    url: 'https://forgedinthefireohio.org',
    logo: 'https://forgedinthefireohio.org/brand/fitf-lockup.png',
    email: ORG.email,
    telephone: ORG.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '15728 Lorain Ave, Unit 146',
      addressLocality: GEO.county,
      addressRegion: GEO.stateAbbr,
      postalCode: '44111-5542',
      addressCountry: 'US',
    },
    areaServed: AREA_SERVED,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: ORG.phone,
      email: ORG.email,
      contactType: 'Victim Advocacy and Support',
      availableLanguage: 'English',
    },
    sameAs: [
      'https://facebook.com/forgedinthefireohio',
      'https://instagram.com/forgedinthefireohio',
      'https://twitter.com/forgedinthefireohio',
      'https://linkedin.com/company/forgedinthefireohio',
    ],
    nonprofitStatus: 'Nonprofit501c3',
    taxID: ORG.ein,
    cause: [
      'Human Trafficking Support',
      'Survivor Services',
      'Trauma-Informed Care',
      'Victim Advocacy',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function WebsiteStructuredData() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ORG.name,
    url: 'https://forgedinthefireohio.org',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://forgedinthefireohio.org/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

export function BreadcrumbStructuredData({ items }: { items: BreadcrumbItem[] }) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `https://forgedinthefireohio.org${item.url}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

interface ServiceSchemaProps {
  name: string;
  description: string;
  url: string;
}

export function ServiceStructuredData({ name, description, url }: ServiceSchemaProps) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    url: `https://forgedinthefireohio.org${url}`,
    provider: {
      '@type': 'NGO',
      name: ORG.name,
      url: 'https://forgedinthefireohio.org',
    },
    areaServed: {
      '@type': 'Place',
      name: GEO.serviceArea,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
