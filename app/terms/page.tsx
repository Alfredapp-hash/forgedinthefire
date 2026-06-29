import { Metadata } from 'next';
import { generateMetaTags } from '@/lib/utils';
import { ORG } from '@/lib/constants';

export const metadata: Metadata = generateMetaTags({
  title: 'Terms of Use',
  description:
    'Terms of use for the Forged in the Fire website. Information about accessing human trafficking survivor resources and victim advocacy services in Lorain County, Ohio.',
});

export default function TermsPage() {
  return (
    <div className="min-h-screen pt-32 pb-20">
      <div className="container-wide section-padding">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-serif text-4xl font-bold text-cream-100 mb-6">Terms of Use</h1>
          <div className="prose prose-invert max-w-none">
            <p className="text-cream-300/80 mb-6">
              By accessing and using this website, you accept and agree to be bound by the terms 
              and provision of this agreement.
            </p>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Use of the Website</h2>
            <p className="text-cream-300/80 mb-4">
              This website is provided for informational purposes and to connect survivors with 
              support services. You agree to use this site only for lawful purposes.
            </p>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Disclaimer</h2>
            <p className="text-cream-300/80 mb-4">
              The information provided on this website is for general informational purposes only. 
              In case of emergency, please call 911 or the National Human Trafficking Hotline at 
              1-888-373-7888.
            </p>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Contact</h2>
            <p className="text-cream-300/80">
              For questions about these terms, contact {ORG.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
