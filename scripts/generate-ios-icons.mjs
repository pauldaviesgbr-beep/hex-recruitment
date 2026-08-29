#!/usr/bin/env node
/**
 * GENERATE THE ENUMERATED iOS APP ICON SET FROM THE 1024 MASTER.
 *
 * Run #5 compiled the catalogue and still did not satisfy Apple. The single
 * 1024 "universal" entry Capacitor ships expanded to exactly TWO sizes —
 * AppIcon60x60@2x (120) and AppIcon76x76@2x~ipad (152) — and produced no
 * 167x167 and no CFBundleIconName. Apple wants 120, 152 AND 167 because
 * TARGETED_DEVICE_FAMILY is "1,2".
 *
 * I do not know why actool behaved that way and this script does not depend
 * on knowing: enumerating every size means each one is a real file in the
 * catalogue rather than something a tool has to infer.
 *
 * The master is the only input. Regenerate with:  npm run icons:generate
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const MASTER = join(DIR, 'AppIcon-512@2x.png');

if (!existsSync(MASTER)) {
  console.error('THE MASTER ICON IS MISSING: ' + MASTER);
  process.exit(1);
}

// Apple's required set for iPhone + iPad. size is in POINTS, scale multiplies.
const SLOTS = [
  { idiom: 'iphone',       size: '20x20',     scale: '2x' },
  { idiom: 'iphone',       size: '20x20',     scale: '3x' },
  { idiom: 'iphone',       size: '29x29',     scale: '2x' },
  { idiom: 'iphone',       size: '29x29',     scale: '3x' },
  { idiom: 'iphone',       size: '40x40',     scale: '2x' },
  { idiom: 'iphone',       size: '40x40',     scale: '3x' },
  { idiom: 'iphone',       size: '60x60',     scale: '2x' },   // 120 — Apple named this
  { idiom: 'iphone',       size: '60x60',     scale: '3x' },
  { idiom: 'ipad',         size: '20x20',     scale: '1x' },
  { idiom: 'ipad',         size: '20x20',     scale: '2x' },
  { idiom: 'ipad',         size: '29x29',     scale: '1x' },
  { idiom: 'ipad',         size: '29x29',     scale: '2x' },
  { idiom: 'ipad',         size: '40x40',     scale: '1x' },
  { idiom: 'ipad',         size: '40x40',     scale: '2x' },
  { idiom: 'ipad',         size: '76x76',     scale: '1x' },
  { idiom: 'ipad',         size: '76x76',     scale: '2x' },   // 152 — Apple named this
  { idiom: 'ipad',         size: '83.5x83.5', scale: '2x' },   // 167 — Apple named this
  { idiom: 'ios-marketing', size: '1024x1024', scale: '1x' },
];

const px = (s) => {
  const pts = parseFloat(s.size.split('x')[0]);
  const scale = parseInt(s.scale, 10);
  return Math.round(pts * scale);
};

// Several slots resolve to the same pixel size; one file serves them all.
const wanted = [...new Set(SLOTS.map(px))].sort((a, b) => a - b);
console.log('generating ' + wanted.length + ' distinct sizes from the 1024 master');

for (const size of wanted) {
  const out = join(DIR, 'AppIcon-' + size + '.png');
  await sharp(MASTER)
    .resize(size, size, { fit: 'cover' })
    // App Store icons must not carry an alpha channel. The master has none;
    // flattening keeps that true whatever a future master looks like.
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(out);

  // Read the header back rather than trusting the call returned.
  const b = readFileSync(out);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), colour = b[25];
  if (w !== size || h !== size) { console.error('WROTE ' + w + 'x' + h + ' FOR ' + size); process.exit(1); }
  if (colour === 4 || colour === 6) { console.error(out + ' CAME OUT WITH AN ALPHA CHANNEL'); process.exit(1); }
  console.log('  ' + String(size).padStart(4) + 'px  ' + b.length + ' bytes  ' + out.split('/').pop());
}

const contents = {
  images: SLOTS.map((s) => ({
    filename: 'AppIcon-' + px(s) + '.png',
    idiom: s.idiom,
    scale: s.scale,
    size: s.size,
  })),
  info: { author: 'thrive', version: 1 },
};
writeFileSync(join(DIR, 'Contents.json'), JSON.stringify(contents, null, 2) + '\n');

// The three Apple named by number in run #4 must be reachable.
const have = new Set(contents.images.map((i) => i.filename));
for (const need of [120, 152, 167]) {
  if (!have.has('AppIcon-' + need + '.png')) {
    console.error('THE CATALOGUE DOES NOT REFERENCE ' + need + 'px, WHICH APPLE NAMED');
    process.exit(1);
  }
}
console.log('\nContents.json written: ' + contents.images.length + ' slots, ' + wanted.length + ' files');
console.log('120, 152 and 167 are all referenced.');
