#!/usr/bin/env node
/**
 * Third pass: retire every stock Tailwind warm/semantic hue.
 *
 * Rule: the heart (#FF5B73) is the only warm colour on the site. Warnings and
 * success states become blue; genuine error states become ink in the heart's
 * desaturated tint (#FF8C9E) and are never a filled surface, so nothing
 * competes with the heart for attention.
 *
 * Not part of any build. Run with --dry to preview.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

const EXCLUDED = [
  'components/hero-animation.tsx',
  'components/hero-ambient-field.tsx',
  'lib/hero/',
  'scripts/',
  'src/features/social/types.ts',
  'src/lib/email/',
];

const ERROR_INK = '#FF8C9E';
const BLUE = '#53D6FF';
const ICE = '#8DEBFF';

const P = '(?:[a-z-]+:)*'; // optional variant chain, e.g. "hover:" / "group-hover:focus:"

const RULES = [
  // ---- red: error ink only, never a fill ------------------------------
  [new RegExp(`\\b(${P})text-red-\\d{2,3}(\\/\\d+)?`, 'g'), `$1text-[${ERROR_INK}]$2`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-red-\\d{2,3}\\/\\d+`, 'g'), `$1$2-[${ERROR_INK}]/10`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-red-\\d{2,3}`, 'g'), `$1$2-[${ERROR_INK}]/15`],
  [new RegExp(`\\b(${P})(border|ring|divide|outline)-red-\\d{2,3}(\\/\\d+)?`, 'g'), `$1$2-[${ERROR_INK}]/35`],

  // ---- amber / yellow / orange: warnings become forged blue -----------
  [new RegExp(`\\b(${P})text-(?:amber|yellow|orange)-\\d{2,3}(\\/\\d+)?`, 'g'), `$1text-[${ICE}]$2`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-(?:amber|yellow|orange)-\\d{2,3}\\/\\d+`, 'g'), `$1$2-[${BLUE}]/10`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-(?:amber|yellow|orange)-(?:[5-9]\\d{2})`, 'g'), `$1$2-[${BLUE}]/20`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-(?:amber|yellow|orange)-\\d{2,3}`, 'g'), `$1$2-[${BLUE}]/10`],
  [new RegExp(`\\b(${P})(border|ring|divide|outline)-(?:amber|yellow|orange)-\\d{2,3}(\\/\\d+)?`, 'g'), `$1$2-[${BLUE}]/30`],

  // ---- green / emerald / teal-ish success: ice blue -------------------
  [new RegExp(`\\b(${P})text-(?:green|emerald|lime)-\\d{2,3}(\\/\\d+)?`, 'g'), `$1text-[${ICE}]$2`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-(?:green|emerald|lime)-\\d{2,3}\\/\\d+`, 'g'), `$1$2-[${ICE}]/10`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-(?:green|emerald|lime)-\\d{2,3}`, 'g'), `$1$2-[${ICE}]/15`],
  [new RegExp(`\\b(${P})(border|ring|divide|outline)-(?:green|emerald|lime)-\\d{2,3}(\\/\\d+)?`, 'g'), `$1$2-[${ICE}]/30`],

  // ---- pink / rose: reserved for the heart, so retire them ------------
  [new RegExp(`\\b(${P})text-(?:pink|rose|fuchsia)-\\d{2,3}(\\/\\d+)?`, 'g'), `$1text-[${ICE}]$2`],
  [new RegExp(`\\b(${P})(bg|from|via|to)-(?:pink|rose|fuchsia)-\\d{2,3}(?:\\/\\d+)?`, 'g'), `$1$2-[${ICE}]/10`],
  [new RegExp(`\\b(${P})(border|ring|divide|outline)-(?:pink|rose|fuchsia)-\\d{2,3}(\\/\\d+)?`, 'g'), `$1$2-[${ICE}]/30`],

  // ---- ink on a solid forged-blue fill must be near-black -------------
  [/bg-\[#53D6FF\] hover:bg-\[#53D6FF\]/g, 'bg-[#53D6FF] hover:bg-[#82E8FF]'],
];

const files = execSync(
  `git ls-files -co --exclude-standard "app/*.tsx" "app/**/*.tsx" "app/**/*.ts" "components/*.tsx" "components/**/*.tsx" "src/**/*.tsx" "src/**/*.ts"`,
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
)
  .split('\n')
  .filter(Boolean)
  .filter((f) => !EXCLUDED.some((ex) => f.startsWith(ex) || f === ex));

let changed = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let src;
  try {
    src = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  const original = src;
  for (const [re, to] of RULES) src = src.replace(re, to);
  if (src !== original) {
    changed += 1;
    if (!DRY) writeFileSync(abs, src);
    console.log(`${DRY ? 'would update' : 'updated'} ${rel}`);
  }
}
console.log(`\n${DRY ? 'Would change' : 'Changed'} ${changed} files.`);
