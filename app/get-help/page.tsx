import { Metadata } from 'next';
import { generateMetaTags } from '@/lib/utils';
import GetHelpPageContent from './page-content';

export const metadata: Metadata = generateMetaTags({
  title: 'Get Help for Human Trafficking in Lorain County Ohio',
  description:
    'Need help for human trafficking in Lorain County or Northeast Ohio? Find crisis hotlines, survivor resources, and victim advocacy support. If in immediate danger, call 911.',
});

export default function GetHelpPage() {
  return <GetHelpPageContent />;
}
