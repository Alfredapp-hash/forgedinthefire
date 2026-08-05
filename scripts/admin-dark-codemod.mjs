#!/usr/bin/env node
/**
 * Second pass: bring the admin portal onto the same dark "Forged Light" surface
 * system as the public site. The portal was a light theme (white cards on
 * #F4F6F9); after the palette sweep its ink and surfaces disagreed, so this
 * inverts the surface/ink pairs rather than leaving a light island behind.
 *
 * Not part of any build. Run with --dry to preview.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry');

const SCOPE = ['app/admin/', 'app/admin-setup/', 'src/features/content/'];

/** Applied in order — later rules see the output of earlier ones. */
const RULES = [
  // Ink on a solid forged-blue fill must be near-black, not white.
  [/bg-\[#53D6FF\] hover:bg-\[#53D6FF\] text-\[#F6FAFC\]/g, 'bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]'],
  [/bg-\[#53D6FF\] text-\[#F6FAFC\]/g, 'bg-[#53D6FF] text-[#061016]'],
  [/bg-\[#53D6FF\] text-white/g, 'bg-[#53D6FF] text-[#061016]'],

  // Dark ink -> light ink.
  [/text-\[#05070A\]/g, 'text-[#F6FAFC]'],
  [/text-\[#1A232C\]/g, 'text-[#A9B8C6]'],
  [/text-\[#11161C\]/g, 'text-[#A9B8C6]'],

  // Light surfaces -> forged steel surfaces.
  [/hover:bg-\[#F6FAFC\]/g, 'hover:bg-[#1A232C]'],
  [/bg-\[#F6FAFC\]/g, 'bg-[#05070A]'],
  [/hover:bg-white\b/g, 'hover:bg-[#1A232C]'],
  [/bg-white\b(?!\/)/g, 'bg-[#151B22]'],

  // Hairlines that were "dark at low alpha on white" -> steel divider.
  [/border-\[#1A232C\]\/(?:10|20|30|40)/g, 'border-[#27313B]'],
  [/border-\[#1A232C\](?!\/)/g, 'border-[#27313B]'],
  [/divide-\[#1A232C\](?:\/\d+)?/g, 'divide-[#27313B]'],
  [/ring-\[#1A232C\](?:\/\d+)?/g, 'ring-[#27313B]'],

  // Everything glows; nothing darkens.
  [/hover:shadow-md/g, 'hover:shadow-forge-sm'],
  [/\bshadow-md\b/g, 'shadow-forge-sm'],
  [/\bshadow-lg\b/g, 'shadow-forge'],
  [/\bshadow-sm\b/g, 'shadow-forge-sm'],
];

const files = execSync(
  `git ls-files -co --exclude-standard "app/admin/**" "app/admin-setup/**" "src/features/content/**"`,
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
)
  .split('\n')
  .filter((f) => f && /\.(tsx|ts)$/.test(f) && SCOPE.some((s) => f.startsWith(s)));

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
