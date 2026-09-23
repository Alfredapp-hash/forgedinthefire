'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, Search, ExternalLink, AlertTriangle } from 'lucide-react';
import {
  GUIDE_GROUPS,
  GUIDE_META,
  GUIDE_SECTIONS,
  URGENT_CONTACTS,
  type GuideEntry,
  type GuideFlag,
  type GuideSection,
} from '@/lib/advocate-resource-guide';

const FLAG_LABEL: Record<GuideFlag, string> = {
  waitlist: 'Waiting list',
  closed: 'Not accepting applications',
  future: 'Not open yet',
  confirm: 'Confirm before referral',
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function telHref(value: string) {
  const digits = digitsOnly(value);
  if (digits.length <= 3) return `tel:${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${digits}`;
}

function entryText(entry: GuideEntry) {
  const rows =
    entry.rows?.map((row) => [row.place, row.detail, row.contact].filter(Boolean).join(' ')) ?? [];
  return [
    entry.name,
    entry.summary,
    entry.service,
    entry.eligibility,
    entry.intake,
    entry.confirm,
    ...(entry.phones ?? []),
    ...rows,
    ...entry.sources.map((source) => source.label),
  ]
    .join(' ')
    .toLowerCase();
}

function sectionText(section: GuideSection) {
  return [section.title, section.intro, ...(section.notes ?? [])].join(' ').toLowerCase();
}

export function AdvocateResourceDirectory() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const normalized = query.trim().toLowerCase();

  const entryTotal = useMemo(
    () => GUIDE_SECTIONS.reduce((count, section) => count + section.entries.length, 0),
    []
  );

  const visible = useMemo(() => {
    return GUIDE_SECTIONS.filter((section) => group === 'All' || section.group === group)
      .map((section) => {
        const matchesSection = !normalized || sectionText(section).includes(normalized);
        const matchingEntries = section.entries.filter((entry) =>
          entryText(entry).includes(normalized)
        );
        const entries = !normalized
          ? section.entries
          : matchingEntries.length > 0
            ? matchingEntries
            : matchesSection
              ? section.entries
              : [];
        const show = !normalized || matchingEntries.length > 0 || matchesSection;
        return { section, entries, show };
      })
      .filter((item) => item.show);
  }, [group, normalized]);

  const visibleCount = visible.reduce((count, item) => count + item.entries.length, 0);

  return (
    <div id="advocate-guide" className="scroll-mt-28">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 font-medium text-ember">
          {GUIDE_META.version} · Reviewed {GUIDE_META.reviewed}
        </p>
        <h2 className="mb-4 font-serif text-4xl font-bold text-cream-100 sm:text-5xl">
          {GUIDE_META.title}
        </h2>
        <p className="mb-4 text-lg leading-relaxed text-cream-300/80">{GUIDE_META.purpose}</p>
        <p className="mb-8 text-sm leading-relaxed text-silver-label">{GUIDE_META.researchNote}</p>

        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {URGENT_CONTACTS.map((contact) => (
            <a
              key={contact.label}
              href={contact.href}
              className="rounded-xl border border-ember/30 bg-ember/10 p-4 transition-colors hover:border-ember/60"
            >
              <p className="mb-1 text-xs uppercase tracking-wide text-ember">{contact.label}</p>
              <p className="font-serif text-2xl font-bold text-cream-100">{contact.value}</p>
              <p className="mt-2 text-sm text-cream-300/80">{contact.detail}</p>
            </a>
          ))}
        </div>

        <ol className="mb-10 grid gap-4 md:grid-cols-3">
          {GUIDE_META.howToUse.map((step, index) => (
            <li key={step} className="rounded-xl border border-steel-700 bg-charcoal-800/50 p-5">
              <p className="mb-2 font-semibold text-ember">0{index + 1}</p>
              <p className="text-sm leading-relaxed text-cream-300/80">{step}</p>
            </li>
          ))}
        </ol>

        <div className="sticky top-20 z-20 -mx-4 mb-8 border-y border-steel-700 bg-charcoal/95 px-4 py-3 backdrop-blur">
          <label htmlFor="resource-search" className="sr-only">
            Search the advocate resource guide
          </label>
          <div className="relative mb-3">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-label"
              aria-hidden
            />
            <input
              id="resource-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by need, provider, city, or phone"
              className="flex h-11 w-full rounded-md border border-steel-700 bg-surface-card pl-10 pr-3 text-sm text-cream-100 placeholder:text-steel-400 focus:border-forged focus:outline-none focus:ring-2 focus:ring-ice-300"
            />
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="toolbar"
            aria-label="Filter by category"
          >
            {['All', ...GUIDE_GROUPS].map((item) => {
              const selected = group === item;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setGroup(item)}
                  className={
                    selected
                      ? 'shrink-0 rounded-full border border-ember bg-ember/15 px-3 py-1.5 text-sm text-cream-100'
                      : 'shrink-0 rounded-full border border-steel-700 px-3 py-1.5 text-sm text-cream-300/80 hover:border-ember/40'
                  }
                >
                  {item}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-silver-label" aria-live="polite">
            {normalized || group !== 'All'
              ? `${visibleCount} matching listings`
              : `${entryTotal} listings across ${GUIDE_SECTIONS.length} sections`}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-steel-700 bg-charcoal-800/50 p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-ember" aria-hidden />
            <p className="mb-2 font-semibold text-cream-100">No listings match that search.</p>
            <p className="text-sm text-cream-300/80">
              Call{' '}
              <a className="text-ember underline" href="tel:211">
                211
              </a>{' '}
              and give the ZIP code and the need, or try a broader word such as shelter, food, or
              mental health.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {visible.map(({ section, entries }) => (
              <section key={section.id} id={section.id} className="scroll-mt-64">
                <h3 className="mb-2 font-serif text-2xl font-semibold text-cream-100">
                  {section.title}
                </h3>
                {section.intro ? (
                  <p className="mb-4 leading-relaxed text-cream-300/80">{section.intro}</p>
                ) : null}
                {section.notes?.length ? (
                  <ul className="mb-4 list-disc space-y-2 rounded-xl border border-steel-700 bg-charcoal-800/40 p-5 pl-9">
                    {section.notes.map((note) => (
                      <li key={note} className="text-sm leading-relaxed text-cream-300/80">
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <ResourceCard
                      key={entry.name}
                      entry={entry}
                      forceOpen={normalized.length > 0}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceCard({ entry, forceOpen }: { entry: GuideEntry; forceOpen: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (forceOpen && detailsRef.current) detailsRef.current.open = true;
  }, [forceOpen]);

  return (
    <details
      ref={detailsRef}
      className="group rounded-xl border border-steel-700 bg-charcoal-800/50 open:border-ember/30"
    >
      <summary className="cursor-pointer list-none p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-cream-100">{entry.name}</h4>
              {entry.flag ? (
                <span className="rounded-full border border-ember/40 px-2 py-0.5 text-xs text-ember">
                  {FLAG_LABEL[entry.flag]}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-cream-300/80">{entry.summary}</p>
          </div>
          <span className="mt-1 shrink-0 text-xs text-ember group-open:hidden">Details</span>
        </div>
        {entry.phones?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {entry.phones.map((phone) => (
              <a
                key={phone}
                href={telHref(phone)}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded-full border border-steel-700 px-3 py-1 text-sm text-cream-100 hover:border-ember/50"
              >
                <Phone className="h-3.5 w-3.5 text-ember" aria-hidden />
                {phone}
              </a>
            ))}
          </div>
        ) : null}
      </summary>
      <div className="space-y-4 px-5 pb-5 text-sm leading-relaxed">
        <Field label="Service" text={entry.service} />
        <Field label="Eligibility" text={entry.eligibility} />
        <Field label="Intake" text={entry.intake} />
        <div className="rounded-lg border border-ember/30 bg-ember/5 p-3">
          <Field label="Confirm before you send someone" text={entry.confirm} />
        </div>
        {entry.rows?.length ? (
          <div className="overflow-x-auto rounded-lg border border-steel-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-charcoal-900/60 text-silver-label">
                <tr>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody>
                {entry.rows.map((row) => (
                  <tr
                    key={`${row.place}-${row.detail}`}
                    className="border-t border-steel-700 align-top"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-cream-100">{row.place}</td>
                    <td className="px-3 py-2 text-cream-300/80">{row.detail}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.contact ? (
                        <a className="text-ember hover:underline" href={telHref(row.contact)}>
                          {row.contact}
                        </a>
                      ) : (
                        <span className="text-silver-label">Ask the central line</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {entry.sources.map((source) => (
            <a
              key={source.href}
              href={source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-ember hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {source.label}
            </a>
          ))}
        </div>
      </div>
    </details>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-silver-label">{label}</p>
      <p className="text-cream-300/80">{text}</p>
    </div>
  );
}
