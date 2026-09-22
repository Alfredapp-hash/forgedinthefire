'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DONATION_TIERS } from '@/lib/constants';
import { ZEFFY_DONATE_URL } from '@/lib/fundraising/types';
import { formatCurrency } from '@/lib/utils';
import { Heart, Shield, Check, ChevronRight, Lock, Receipt } from 'lucide-react';

export default function DonatePageContent() {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(100);
  const [customAmount, setCustomAmount] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  const handleDonate = () => {
    const amount = selectedAmount || Number(customAmount);
    const url = amount ? `${ZEFFY_DONATE_URL}?amount=${amount}` : ZEFFY_DONATE_URL;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-[#53D6FF]/10 to-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 text-sm font-medium text-ember bg-ember/10 rounded-full border border-ember/20">
              <Heart className="h-4 w-4 text-heart fill-heart" />
              100% of donations support survivor services
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-cream-100 mb-6">
              Support Human Trafficking Survivors in Lorain County, Ohio
            </h1>
            <p className="text-xl text-cream-300/80 leading-relaxed max-w-2xl mx-auto">
              Your generosity directly empowers survivors in Lorain County and Northeast Ohio 
              on their journey to healing, independence, and hope. Every dollar creates 
              real impact in our local community.
            </p>
          </div>
        </div>
      </section>

      {/* Impact Stats */}
      <section className="py-16 bg-charcoal-900 border-y border-steel-800">
        <div className="container-wide section-padding">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              { value: '$25', label: 'Emergency supplies' },
              { value: '$100', label: 'Counseling session' },
              { value: '$250', label: 'Week of safe housing' },
              { value: '$500', label: 'Month of services' },
            ].map((stat, index) => (
              <div key={index}>
                <div className="text-3xl font-serif font-bold text-ember mb-1">{stat.value}</div>
                <div className="text-sm text-silver-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Donation Tiers */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-serif text-3xl font-bold text-cream-100 mb-4">
                Choose Your Impact
              </h2>
              <p className="text-cream-300/80">
                Select an amount that works for you, or enter a custom donation.
              </p>
            </div>

            {/* Recurring Toggle */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <span className={`text-sm ${!isRecurring ? 'text-cream-100' : 'text-silver-label'}`}>One-time</span>
              <button
                onClick={() => setIsRecurring(!isRecurring)}
                className={`relative w-14 h-7 rounded-full transition-colors ${isRecurring ? 'bg-ember' : 'bg-steel-700'}`}
              >
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-cream-100 transition-transform ${isRecurring ? 'translate-x-8' : 'translate-x-1'}`} />
              </button>
              <span className={`text-sm ${isRecurring ? 'text-cream-100' : 'text-silver-label'}`}>Monthly</span>
            </div>

            {/* Amount Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {DONATION_TIERS.map((tier) => (
                <Card
                  key={tier.amount}
                  className={`cursor-pointer transition-all ${
                    selectedAmount === tier.amount
                      ? 'border-ember bg-ember/5'
                      : 'border-steel-700 hover:border-ember/30'
                  }`}
                  onClick={() => {
                    setSelectedAmount(tier.amount);
                    setCustomAmount('');
                  }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-3xl font-serif font-bold text-cream-100">
                        {formatCurrency(tier.amount)}
                      </span>
                      {selectedAmount === tier.amount && (
                        <div className="w-6 h-6 rounded-full bg-ember flex items-center justify-center">
                          <Check className="h-4 w-4 text-cream-100" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-cream-100 mb-2">{tier.label}</h3>
                    <p className="text-sm text-silver-label mb-3">{tier.description}</p>
                    <p className="text-xs text-ember">{tier.impact}</p>
                  </CardContent>
                </Card>
              ))}

              {/* Custom Amount */}
              <Card
                className={`cursor-pointer transition-all ${
                  customAmount
                    ? 'border-ember bg-ember/5'
                    : 'border-steel-700 hover:border-ember/30'
                }`}
              >
                <CardContent className="p-6">
                  <label className="block text-sm text-silver-label mb-2">Custom Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-300">$</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Other"
                      value={customAmount}
                      onChange={(e) => {
                        setCustomAmount(e.target.value);
                        setSelectedAmount(null);
                      }}
                      className="w-full pl-8 pr-4 py-3 bg-charcoal-800 border border-steel-700 rounded-lg text-cream-100 focus:border-ember focus:outline-none"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Donate Button */}
            <div className="text-center">
              <Button
                size="lg"
                className="px-12"
                onClick={handleDonate}
                disabled={!selectedAmount && !customAmount}
              >
                {isRecurring ? 'Donate Monthly' : 'Donate Now'}
                <Heart className="ml-2 h-4 w-4" />
              </Button>
              <p className="text-sm text-silver-label mt-4">
                Secure donation processed by Zeffy — 0% platform fees. Tax-deductible receipt provided.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-24 bg-charcoal-900">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-serif text-3xl font-bold text-cream-100 mb-4">
                Your Trust Matters
              </h2>
              <p className="text-cream-300/80">
                We are committed to transparency and responsible stewardship of your donation.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-charcoal-800/50 border-steel-700 text-center">
                <CardContent className="p-6">
                  <Shield className="h-10 w-10 text-healing mx-auto mb-4" />
                  <h3 className="font-semibold text-cream-100 mb-2">501(c)(3) Nonprofit</h3>
                  <p className="text-sm text-silver-label">All donations are tax-deductible</p>
                </CardContent>
              </Card>
              <Card className="bg-charcoal-800/50 border-steel-700 text-center">
                <CardContent className="p-6">
                  <Lock className="h-10 w-10 text-healing mx-auto mb-4" />
                  <h3 className="font-semibold text-cream-100 mb-2">0% Platform Fees</h3>
                  <p className="text-sm text-silver-label">Powered by Zeffy — every dollar reaches survivors</p>
                </CardContent>
              </Card>
              <Card className="bg-charcoal-800/50 border-steel-700 text-center">
                <CardContent className="p-6">
                  <Receipt className="h-10 w-10 text-healing mx-auto mb-4" />
                  <h3 className="font-semibold text-cream-100 mb-2">Annual Reports</h3>
                  <p className="text-sm text-silver-label">Full financial transparency available</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Other Ways to Give */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="font-serif text-3xl font-bold text-cream-100 mb-8">
              Other Ways to Give
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { title: 'Corporate Giving', desc: 'Partner with us for CSR initiatives' },
                { title: 'Planned Giving', desc: 'Include us in your estate planning' },
                { title: 'In-Kind Donations', desc: 'Donate goods or professional services' },
              ].map((item, index) => (
                <div key={index} className="p-6 bg-charcoal-800/50 rounded-lg border border-steel-700">
                  <h3 className="font-semibold text-cream-100 mb-2">{item.title}</h3>
                  <p className="text-sm text-silver-label mb-4">{item.desc}</p>
                  <Link href="/contact" className="text-ember hover:underline text-sm">
                    Learn more <ChevronRight className="inline h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
