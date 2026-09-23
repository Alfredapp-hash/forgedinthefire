import { GUIDE_SECTIONS, type GuideFlag } from '@/lib/advocate-resource-guide';

export const FULL_GUIDE_PDF = '/resources/advocate/cuyahoga-county-adult-advocate-resource-guide.pdf';

export const FLAG_LABEL: Record<GuideFlag, string> = {
  waitlist: 'Waiting list',
  closed: 'Not accepting applications',
  future: 'Not open yet',
  confirm: 'Confirm before referral',
};

export function guidePagePath(id: string) {
  return `/resources/advocate/${id}`;
}

export function guidePdfPath(id: string) {
  return `/resources/advocate/${id}.pdf`;
}

export function getGuideSection(slug: string) {
  return GUIDE_SECTIONS.find((section) => section.id === slug);
}

export function telHref(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return `tel:${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${digits}`;
}
