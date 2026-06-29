import { Metadata } from 'next';
import { HomeContent } from '@/components/home-content';
import { ORG } from '@/lib/constants';
import { generateMetaTags } from '@/lib/utils';

export const metadata: Metadata = generateMetaTags({
  title: 'Human Trafficking Victim Advocacy Lorain County Ohio',
  description:
    'Forged in the Fire provides survivor centered human trafficking victim advocacy and support services in Lorain County, Ohio and Northeast Ohio. Get help, find resources, or support the mission.',
});

export default function HomePage() {
  return <HomeContent />;
}
