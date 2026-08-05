#!/usr/bin/env node
/**
 * One-shot codemod: old warm brand palette -> "Forged Light".
 *
 * Kept in-repo so the mapping that produced the sweep is auditable, but it is
 * not part of any build. Run with --dry to preview.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

// Owned by the concurrent hero-video work, or a different medium/semantics.
const EXCLUDED = [
  'components/hero-animation.tsx',
  'components/hero-ambient-field.tsx',
  'lib/hero/',
  'scripts/',
  'src/features/social/types.ts',
  'src/lib/email/',
];

/** Prefix-sensitive rules run first; `fallback` applies to every other occurrence. */
const CONTEXTUAL = [
  {
    from: '#8B5E3C', // burnished bronze — overwhelmingly small muted text
    byPrefix: {
      'bg-': '#1A232C',
      'border': '#27313B',
      'from-': '#27313B',
      'via-': '#27313B',
      'to-': '#27313B',
      'ring-': '#27313B',
      'divide-': '#27313B',
    },
    fallback: '#A9B8C6',
  },
  {
    from: '#C8A46B', // soft gold highlight
    byPrefix: { 'bg-': '#53D6FF' },
    fallback: '#8DEBFF',
  },
];

/** Straight substitutions. */
const DIRECT = {
  // --- surfaces -----------------------------------------------------------
  '#1E1714': '#05070A', // main background
  '#181210': '#05070A', // footer / nav
  '#0D0B09': '#05070A',
  '#241B18': '#11161C', // gunmetal
  '#2A1F1A': '#151B22', // card
  '#3A2A24': '#1A232C', // raised steel
  '#4A2F22': '#27313B',
  '#4A3A34': '#27313B',
  '#352722': '#1A232C',
  '#28241E': '#11161C',
  '#3D352C': '#1A232C',
  // --- ink ----------------------------------------------------------------
  '#F6F0E8': '#F6FAFC', // primary text
  '#CDBDAF': '#B8C4CF', // secondary text
  '#B8A89A': '#A9B8C6', // muted text
  '#E8DDD4': '#E4EBF1',
  '#A67C52': '#8DEBFF',
  // --- accents ------------------------------------------------------------
  '#1E6B73': '#53D6FF', // forge teal -> forged blue
  '#4C9AA3': '#53D6FF',
  '#0F4F57': '#10556E',
  '#18565C': '#219EC6',
  '#3D858B': '#33BEEB',
  '#5FA0A5': '#6FDFFF',
  '#D4A574': '#8DEBFF',
  '#B88A7A': '#A9B8C6',
  // --- stock tailwind-ish neutrals ---------------------------------------
  '#F4F6F9': '#F6FAFC',
  '#F9FAFB': '#F6FAFC',
  '#E5E7EB': '#27313B',
  '#9CA3AF': '#A9B8C6',
  '#6B7280': '#7C8B97',
  '#4B5563': '#7C8B97',
  '#1F2937': '#1A232C',
  '#1F1F1F': '#11161C',
  '#374151': '#27313B',
  '#111827': '#11161C',
  // --- states: every warm signal colour becomes blue --------------------
  '#10B981': '#53D6FF', // success green
  '#059669': '#33BEEB',
  '#F59E0B': '#8DEBFF', // amber warning
  '#D97706': '#6FDFFF',
  '#EF4444': '#FF8C9E', // error -> heart tint (ink only, icon-paired)
  '#DC2626': '#FF8C9E',
  '#B91C1C': '#FF8C9E',
  '#C1121F': '#FF8C9E',
  '#D90429': '#FF8C9E',
  '#9D0208': '#FF8C9E',
};

function listFiles() {
  const out = execSync(
    `git ls-files -co --exclude-standard "app/*.tsx" "app/*.ts" "app/**/*.tsx" "app/**/*.ts" "components/*.tsx" "components/**/*.tsx" "src/**/*.tsx" "src/**/*.ts" "lib/**/*.ts"`,
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !EXCLUDED.some((ex) => f.startsWith(ex) || f === ex));
}

/** Replace every case-insensitive occurrence of `hex`, honouring class prefixes. */
function applyHex(source, hex, resolve) {
  const re = new RegExp(hex.replace('#', '#'), 'gi');
  return source.replace(re, (match, offset) => {
    const before = source.slice(Math.max(0, offset - 24), offset);
    return resolve(before) ?? match;
  });
}

let changedFiles = 0;
let totalReplacements = 0;

for (const rel of listFiles()) {
  const abs = path.join(ROOT, rel);
  let src;
  try {
    src = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  const original = src;

  for (const rule of CONTEXTUAL) {
    src = applyHex(src, rule.from, (before) => {
      for (const [prefix, value] of Object.entries(rule.byPrefix)) {
        // e.g. "bg-[" / "border-[" / "border-t-[" immediately preceding the hex
        if (new RegExp(`${prefix}[a-z-]*\\[$`).test(before)) return value;
      }
      return rule.fallback;
    });
  }

  for (const [from, to] of Object.entries(DIRECT)) {
    src = applyHex(src, from, () => to);
  }

  if (src !== original) {
    const diff = original.split(/#[0-9A-Fa-f]{6}/).length;
    changedFiles += 1;
    totalReplacements += diff;
    if (!DRY) writeFileSync(abs, src);
    console.log(`${DRY ? 'would update' : 'updated'} ${rel}`);
  }
}

console.log(
  `\n${DRY ? 'Would change' : 'Changed'} ${changedFiles} files (${totalReplacements} hex tokens scanned).`
);
