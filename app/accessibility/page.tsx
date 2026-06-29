import { Metadata } from 'next';
import { generateMetaTags } from '@/lib/utils';
import { ORG } from '@/lib/constants';

export const metadata: Metadata = generateMetaTags({
  title: 'Accessibility',
  description:
    'Forged in the Fire is committed to digital accessibility for all users accessing human trafficking resources and survivor support in Lorain County and Northeast Ohio.',
});

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen pt-32 pb-20">
      <div className="container-wide section-padding">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-serif text-4xl font-bold text-cream-100 mb-6">Accessibility Statement</h1>
          <div className="prose prose-invert max-w-none">
            <p className="text-cream-300/80 mb-6">
              Forged in the Fire is committed to ensuring digital accessibility for people with 
              disabilities. We are continually improving the user experience for everyone and 
              applying the relevant accessibility standards.
            </p>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Our Commitment</h2>
            <ul className="list-disc list-inside text-cream-300/80 mb-4 space-y-2">
              <li>WCAG 2.1 Level AA compliance</li>
              <li>Keyboard navigation support</li>
              <li>Screen reader compatibility</li>
              <li>Reduced motion preferences respected</li>
              <li>High contrast text</li>
            </ul>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Quick Exit Feature</h2>
            <p className="text-cream-300/80 mb-4">
              For survivor safety, we provide a Quick Exit button that immediately redirects to 
              weather.com. You can also press Ctrl+Escape to quickly leave the site.
            </p>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Feedback</h2>
            <p className="text-cream-300/80">
              We welcome your feedback on accessibility. Contact us at 
              {ORG.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
