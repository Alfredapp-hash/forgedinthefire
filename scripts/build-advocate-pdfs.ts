import { createRequire } from 'node:module';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GUIDE_META,
  GUIDE_SECTIONS,
  URGENT_CONTACTS,
  type GuideSection,
} from '../lib/advocate-resource-guide.ts';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

const FLAG_LABEL = {
  waitlist: 'Waiting list',
  closed: 'Not accepting applications',
  future: 'Not open yet',
  confirm: 'Confirm before referral',
} as const;

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/resources/advocate');

function plain(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, ' - ')
    .replace(/\u2013/g, '-')
    .replace(/\u2022/g, '-');
}

function writePdf(filename: string, title: string, sections: GuideSection[]) {
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54, bufferPages: true });
    const stream = createWriteStream(path.join(outDir, filename));
    doc.pipe(stream);
    const width = doc.page.width - 108;

    doc.font('Helvetica').fontSize(10).fillColor('#555555').text('Forged in the Fire', { width });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(plain(title), { width });
    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#333333')
      .text(plain(`${GUIDE_META.version}  |  Reviewed ${GUIDE_META.reviewed}`), { width });
    doc.moveDown(0.6);
    doc.fontSize(11).text(plain(GUIDE_META.purpose), { width });
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#555555').text(plain(GUIDE_META.researchNote), { width });
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Urgent contacts', { width });
    doc.moveDown(0.3);
    for (const contact of URGENT_CONTACTS) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#222222')
        .text(plain(`${contact.label}: ${contact.value}. ${contact.detail}`), { width });
    }

    for (const section of sections) {
      doc.addPage();
      doc.font('Helvetica').fontSize(9).fillColor('#777777').text(plain(section.group), { width });
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#111111').text(plain(section.title), { width });
      if (section.intro) {
        doc.moveDown(0.4);
        doc.font('Helvetica').fontSize(11).fillColor('#222222').text(plain(section.intro), { width });
      }
      if (section.notes?.length) {
        doc.moveDown(0.4);
        for (const note of section.notes) {
          doc.font('Helvetica').fontSize(10).fillColor('#222222').text(plain(`- ${note}`), { width });
          doc.moveDown(0.25);
        }
      }
      for (const entry of section.entries) {
        doc.moveDown(0.7);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(plain(entry.name), { width });
        if (entry.flag) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#8a3b00').text(FLAG_LABEL[entry.flag], { width });
        }
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(10).fillColor('#222222').text(plain(entry.summary), { width });
        if (entry.phones?.length) {
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold').text(plain(`Phone: ${entry.phones.join(', ')}`), { width });
        }
        const fields = [
          ['Service', entry.service],
          ['Eligibility', entry.eligibility],
          ['Intake', entry.intake],
          ['Confirm before you send someone', entry.confirm],
        ] as const;
        for (const [label, text] of fields) {
          doc.moveDown(0.25);
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(label, { width });
          doc.font('Helvetica').fillColor('#222222').text(plain(text), { width });
        }
        if (entry.rows?.length) {
          doc.moveDown(0.3);
          for (const row of entry.rows) {
            const phone = row.contact ? `  ${row.contact}` : '';
            doc
              .font('Helvetica')
              .fontSize(10)
              .text(plain(`${row.place}${phone}. ${row.detail}`), { width });
            doc.moveDown(0.15);
          }
        }
        if (entry.sources.length) {
          doc.moveDown(0.2);
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#333333')
            .text(plain(`Sources: ${entry.sources.map((source) => source.href).join('  ')}`), {
              width,
            });
        }
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text(
          plain(`${GUIDE_META.title}  |  Page ${i + 1} of ${range.count}`),
          54,
          doc.page.height - 36,
          { width, lineBreak: false }
        );
    }

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

mkdirSync(outDir, { recursive: true });

const jobs: Array<Promise<void>> = [
  writePdf('cuyahoga-county-adult-advocate-resource-guide.pdf', GUIDE_META.title, GUIDE_SECTIONS),
  ...GUIDE_SECTIONS.map((section) => writePdf(`${section.id}.pdf`, section.title, [section])),
];

await Promise.all(jobs);
console.log(`Wrote ${jobs.length} advocate guide PDFs to ${outDir}`);
