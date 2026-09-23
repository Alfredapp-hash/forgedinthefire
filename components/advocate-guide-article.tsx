import Link from 'next/link';
import { Download, ExternalLink, Phone } from 'lucide-react';
import {
  GUIDE_META,
  URGENT_CONTACTS,
  type GuideSection,
} from '@/lib/advocate-resource-guide';
import { FLAG_LABEL, telHref } from '@/lib/advocate-guide-routes';

export function AdvocateGuideArticle({
  title,
  sections,
  pdfHref,
  pdfFilename,
}: {
  title: string;
  sections: GuideSection[];
  pdfHref: string;
  pdfFilename: string;
}) {
  return (
    <article>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <a
          href={pdfHref}
          download={pdfFilename}
          className="inline-flex items-center gap-2 rounded-lg border border-ember bg-ember px-4 py-2 text-sm font-semibold text-[#061016]"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download PDF
        </a>
        <Link href="/resources#advocate-guide" className="text-sm text-ember hover:underline">
          All guides
        </Link>
      </div>

      <p className="mb-6 text-lg leading-relaxed text-cream-300/80">{GUIDE_META.purpose}</p>
      <p className="mb-8 text-sm leading-relaxed text-silver-label">{GUIDE_META.researchNote}</p>

      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {URGENT_CONTACTS.map((contact) => (
          <a
            key={contact.label}
            href={contact.href}
            className="rounded-xl border border-ember/30 bg-ember/10 p-4"
          >
            <p className="mb-1 text-xs uppercase tracking-wide text-ember">{contact.label}</p>
            <p className="font-serif text-2xl font-bold text-cream-100">{contact.value}</p>
            <p className="mt-2 text-sm text-cream-300/80">{contact.detail}</p>
          </a>
        ))}
      </div>

      <h2 className="sr-only">{title}</h2>

      <div className="space-y-12">
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h3 className="mb-2 font-serif text-2xl font-semibold text-cream-100">{section.title}</h3>
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
            <div className="space-y-4">
              {section.entries.map((entry) => (
                <div
                  key={entry.name}
                  className="rounded-xl border border-steel-700 bg-charcoal-800/50 p-5"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-cream-100">{entry.name}</h4>
                    {entry.flag ? (
                      <span className="rounded-full border border-ember/40 px-2 py-0.5 text-xs text-ember">
                        {FLAG_LABEL[entry.flag]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-4 text-sm text-cream-300/80">{entry.summary}</p>
                  {entry.phones?.length ? (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {entry.phones.map((phone) => (
                        <a
                          key={phone}
                          href={telHref(phone)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-steel-700 px-3 py-1 text-sm text-cream-100 hover:border-ember/50"
                        >
                          <Phone className="h-3.5 w-3.5 text-ember" aria-hidden />
                          {phone}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <div className="space-y-3 text-sm leading-relaxed">
                    <Field label="Service" text={entry.service} />
                    <Field label="Eligibility" text={entry.eligibility} />
                    <Field label="Intake" text={entry.intake} />
                    <div className="rounded-lg border border-ember/30 bg-ember/5 p-3">
                      <Field label="Confirm before you send someone" text={entry.confirm} />
                    </div>
                  </div>
                  {entry.rows?.length ? (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-steel-700">
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
                  {entry.sources.length ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {entry.sources.map((source) => (
                        <a
                          key={source.href}
                          href={source.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-ember hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          {source.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
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
