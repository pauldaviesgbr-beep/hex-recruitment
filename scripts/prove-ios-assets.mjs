#!/usr/bin/env node
/**
 * EVERY IMAGE AN ASSET CATALOGUE NAMES MUST BE IN THE REPOSITORY.
 *
 * Run #4's upload was refused by Apple with four icon errors. The cause was
 * not the icon: it was `.gitignore` line 14, `*.png`, which had never been
 * given an exception for ios/. The PNG sat on the machine that generated it
 * and was never committed, so the runner checked out a Contents.json naming
 * a file that was not there.
 *
 * ACTOOL TREATS THAT AS A WARNING. The archive succeeded, every assertion in
 * the archive job passed, a signed .ipa came out, and it contained no
 * Assets.car at all. Nothing went red until Apple looked at it, two jobs and
 * one dispatch later.
 *
 * So the question this asks is not "is the file on this disk" — it was, all
 * along, which is exactly why nobody saw it. It is "is the file IN GIT",
 * because the runner gets the repository and nothing else.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = 'ios/App/App/Assets.xcassets';
let failures = 0;
const fail = (m) => { console.log('  FAIL  ' + m); failures++; };
const pass = (m) => console.log('  PASS  ' + m);

if (!existsSync(ROOT)) {
  console.log('SKIP  no iOS asset catalogue at ' + ROOT);
  process.exit(0);
}

// every Contents.json under the catalogue
const catalogues = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e === 'Contents.json') catalogues.push(p);
  }
})(ROOT);

console.log('iOS asset catalogue — ' + catalogues.length + ' Contents.json found\n');

// what git actually holds, which is all the runner will ever see
const tracked = new Set(
  execFileSync('git', ['ls-files', ROOT], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map((s) => s.trim())
);

let named = 0;
for (const cat of catalogues) {
  let json;
  try { json = JSON.parse(readFileSync(cat, 'utf8')); }
  catch (e) { fail(cat + ' is not valid JSON: ' + e.message); continue; }

  for (const img of json.images || []) {
    if (!img.filename) continue;          // a slot with no file is legal
    named++;
    const onDisk = join(dirname(cat), img.filename);
    const gitPath = relative('.', onDisk).split(sep).join('/');

    if (!existsSync(onDisk)) {
      fail(img.filename + ' is NAMED by ' + cat + ' and is not on disk');
      continue;
    }
    // THE HALF THAT MATTERS. It was on disk the whole time.
    if (!tracked.has(gitPath)) {
      fail(img.filename + ' EXISTS ON THIS MACHINE BUT IS NOT IN GIT'
           + ' — the runner will not get it, actool will only warn,'
           + ' and the build will ship without it (' + gitPath + ')');
      continue;
    }
    pass(img.filename + ' — named, present, and tracked');
  }
}

if (named === 0) fail('no Contents.json named a single image — nothing was checked');

// Apple's own requirements for the marketing icon, read from the PNG header
// rather than from what the filename claims.
// The marketing icon Apple reads. It used to point at AppIcon-512@2x.png,
// which was the Capacitor placeholder; the master is now the brand asset and
// the appiconset holds only derivatives, so this checks the derivative Apple
// actually receives.
const ICON = join(ROOT, 'AppIcon.appiconset', 'AppIcon-1024.png');
if (existsSync(ICON)) {
  const b = readFileSync(ICON);
  const sig = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), colour = b[25];
  if (!sig) fail('the app icon is not a PNG');
  else pass('the app icon is a real PNG');
  if (w !== 1024 || h !== 1024) fail('the app icon is ' + w + 'x' + h + ', Apple requires 1024x1024');
  else pass('the app icon is 1024x1024');
  // colour type 4 and 6 carry an alpha channel; Apple rejects a transparent icon
  if (colour === 4 || colour === 6) fail('the app icon has an ALPHA CHANNEL — Apple rejects it');
  else pass('the app icon has no alpha channel');
} else {
  fail('there is no AppIcon-1024.png at all');
}

// APPLE NAMED THESE THREE BY NUMBER when it refused run #4, and run #5
// proved that a catalogue which COMPILES is still not enough: the single
// 1024 entry expanded to 120 and 152 and produced no 167 at all.
// TARGETED_DEVICE_FAMILY is '1,2', so the iPad sizes are required.
const REQUIRED_PX = [120, 152, 167];
const declared = new Set();
for (const cat of catalogues) {
  if (!cat.includes('AppIcon.appiconset')) continue;
  let j; try { j = JSON.parse(readFileSync(cat, 'utf8')); } catch { continue; }
  for (const img of j.images || []) {
    if (!img.filename || !img.size || !img.scale) continue;
    const pts = parseFloat(String(img.size).split('x')[0]);
    const scale = parseInt(img.scale, 10);
    if (Number.isFinite(pts) && Number.isFinite(scale)) declared.add(Math.round(pts * scale));
  }
}
for (const need of REQUIRED_PX) {
  if (declared.has(need)) pass('the catalogue declares a ' + need + 'px slot, which Apple named');
  else fail('NO ' + need + 'px SLOT IN THE CATALOGUE - Apple refuses the upload for this by name');
}

// And the key itself. actool did not write it on run #5 even with the
// catalogue compiling, so we declare it ourselves and assert our own
// declaration rather than hoping a tool will supply it.
const PLIST = 'ios/App/App/Info.plist';
if (existsSync(PLIST)) {
  const p = readFileSync(PLIST, 'utf8');
  const m = p.match(/<key>CFBundleIconName<[/]key>\s*<string>([^<]*)<[/]string>/);
  if (!m) fail('Info.plist DOES NOT DECLARE CFBundleIconName - Apple refuses the upload for this by name');
  else if (m[1].trim() !== 'AppIcon') fail("CFBundleIconName is '" + m[1] + "' but the icon set is named AppIcon");
  else pass('Info.plist declares CFBundleIconName = AppIcon');
} else { fail('there is no ' + PLIST); }
// ── IS IT OUR ICON, OR JUST AN ICON? ───────────────────────────────────
//
// Build 7 shipped to TestFlight with CAPACITOR'S TEMPLATE PLACEHOLDER as the
// app icon — a blue geometric mark on white — and it was seen on a real home
// screen next to the PWA showing the correct yellow T. Every check above
// passed on it: it was a real PNG, it was 1024x1024, it had no alpha, it was
// tracked in git, every slot referenced it. ALL TRUE OF A PLACEHOLDER.
//
// App Store Connect accepted that build, so Apple's own validation does not
// catch a WRONG icon, only a missing one. Nothing but identity catches this.
//
// So this asks two questions a placeholder cannot pass:
//   1. is the shipped 1024 the same PICTURE as the brand asset (pixels, not
//      bytes — the generator re-encodes, so the bytes legitimately differ)
//   2. is the known placeholder absent by fingerprint, named explicitly so
//      the failure says WHICH wrong icon it is
const BRAND = 'public/logo/app-icon-1024.png';
const SHIPPED = join(ROOT, 'AppIcon.appiconset', 'AppIcon-1024.png');
// sha256 of Capacitor 8.5.0's template AppIcon-512@2x.png, recorded 29 Aug 2026
const PLACEHOLDER_SHA = '29e4777e319de3ee5a52c3a8004ec19d0568414004257e36d7c94a077d71c93b';

if (!existsSync(BRAND)) {
  fail('the brand asset ' + BRAND + ' is missing — nothing to compare the icon against');
} else if (!existsSync(SHIPPED)) {
  fail('there is no AppIcon-1024.png in the icon set');
} else {
  const { createHash } = await import('node:crypto');
  const sharp = (await import('sharp')).default;

  // 2. the named placeholder must not be anywhere in the set
  let placeholderFound = null;
  for (const cat of catalogues) {
    if (!cat.includes('AppIcon.appiconset')) continue;
    let j; try { j = JSON.parse(readFileSync(cat,'utf8')); } catch { continue; }
    for (const img of j.images || []) {
      if (!img.filename) continue;
      const p = join(dirname(cat), img.filename);
      if (!existsSync(p)) continue;
      if (createHash('sha256').update(readFileSync(p)).digest('hex') === PLACEHOLDER_SHA) placeholderFound = img.filename;
    }
  }
  if (placeholderFound) fail('THE CAPACITOR TEMPLATE PLACEHOLDER IS STILL THE APP ICON (' + placeholderFound + ') — this is what shipped as build 7');
  else pass('the Capacitor template placeholder is not in the icon set');

  // 1. same picture as the brand asset
  const a = await sharp(SHIPPED).removeAlpha().resize(256,256).raw().toBuffer();
  const b = await sharp(BRAND).removeAlpha().resize(256,256).raw().toBuffer();
  let differing = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > 8) differing++;
  const pct = (100 * differing) / n;
  if (pct > 2) fail('THE APP ICON IS NOT THE THRIVE MARK — it differs from ' + BRAND + ' on ' + pct.toFixed(1) + '% of channels. A different picture is shipping.');
  else pass('the app icon is the Thrive mark from ' + BRAND + ' (' + pct.toFixed(2) + '% channel difference)');
}
console.log('');
if (failures) {
  console.log(failures + ' FAILED — this is what Apple refuses the upload for.');
  process.exit(1);
}
console.log('OK — every image the catalogue names is in the repository.');
