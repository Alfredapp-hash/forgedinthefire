import { Metadata } from 'next';
import { generateMetaTags } from '@/lib/utils';
import ContactPageContent from './page-content';

export const metadata: Metadata = generateMetaTags({
  title: 'Contact Forged in the Fire | Human Trafficking Advocates Lorain County Ohio',
  description:
    'Contact Forged in the Fire in Lorain County, Ohio. For immediate danger call 911. For trafficking crisis support, use the National Human Trafficking Hotline.',
});

export default function ContactPage() {
  return <ContactPageContent />;
}
