import { Metadata } from 'next';
import { generateMetaTags } from '@/lib/utils';
import { ORG } from '@/lib/constants';

export const metadata: Metadata = generateMetaTags({
  title: 'Privacy Policy',
  description:
    'Forged in the Fire privacy policy for Lorain County, Ohio. How we protect survivor information, data security practices, and confidentiality commitments.',
});

export default function PrivacyPage() {
  return (
    <div className="min-h-screen pt-32 pb-20">
      <div className="container-wide section-padding">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-serif text-4xl font-bold text-cream-100 mb-6">Privacy Policy</h1>
          <div className="prose prose-invert max-w-none">
            <p className="text-cream-300/80 mb-6">
              At Forged in the Fire, we take the privacy and safety of survivors extremely seriously. 
              This policy explains how we handle information.
            </p>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Information We Collect</h2>
            <p className="text-cream-300/80 mb-4">
              We only collect information that you voluntarily provide through our contact forms. 
              This may include your name, email address, phone number, and message content.
            </p>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">How We Protect Your Information</h2>
            <ul className="list-disc list-inside text-cream-300/80 mb-4 space-y-2">
              <li>All communications are kept confidential</li>
              <li>We do not share survivor information with third parties</li>
              <li>Our Quick Exit feature allows immediate site departure</li>
              <li>Form submissions are securely processed</li>
            </ul>
            
            <h2 className="text-2xl font-semibold text-cream-100 mt-8 mb-4">Contact Us</h2>
            <p className="text-cream-300/80">
              If you have questions about our privacy practices, please contact us at 
              {ORG.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
