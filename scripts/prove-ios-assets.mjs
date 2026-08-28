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
const ICON = join(ROOT, 'AppIcon.appiconset', 'AppIcon-512@2x.png');
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
  fail('there is no AppIcon-512@2x.png at all');
}

console.log('');
if (failures) {
  console.log(failures + ' FAILED — this is what Apple refuses the upload for.');
  process.exit(1);
}
console.log('OK — every image the catalogue names is in the repository.');
