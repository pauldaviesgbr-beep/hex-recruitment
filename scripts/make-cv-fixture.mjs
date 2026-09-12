// THE SYNTHETIC CV drive-cv-upload-and-confirm UPLOADS.
//
//   node scripts/make-cv-fixture.mjs
//
// Writes cv-fixture.scratch.pdf into the working directory. Deterministic,
// no network, no database. Safe to run any number of times.
//
// ── WHY THIS EXISTS: THE DRIVE'S INPUT WAS LOCAL-ONLY ────────────────────
//
// drive-cv-upload-and-confirm exits 2 with "cv-fixture.scratch.pdf not found"
// and NOTHING IN THE REPOSITORY EVER CREATED THAT FILE. It has never existed
// on any ref — `git log --all --diff-filter=A -- 'cv-fixture*'` returns
// nothing — and it is not even gitignored. Whoever wrote the drive had the PDF
// on their machine and neither committed it nor scripted it.
//
// So that drive has been unrunnable by anybody else since the day it was
// written, on top of the separate sign-in fault that stopped it later. TWO
// independent blockers, and the skip message only ever named one of them at a
// time — which is why fixing the sign-in produced a different exit code rather
// than a working check.
//
// PRESENCE ON YOUR MACHINE IS NOT PRESENCE IN THE REPOSITORY. This repo has
// the scar already: AppIcon-512@2x.png was generated, rendered fine locally,
// was never committed because of a `*.png` ignore rule, and shipped an app with
// no icon past ten green assertions.
//
// GENERATED RATHER THAN COMMITTED, deliberately. A binary fixture in git is a
// thing nobody can read in a diff or correct in place; a generator is 60 lines
// of readable text that says WHY each sentence is in the CV. The `.scratch`
// name says it is disposable.
//
// ── THE CV IS A TEST, NOT A CV, AND EVERY LINE IS LOAD-BEARING ───────────
//
// The drive asserts an exact recentTitle, an exact seniority rank, that the
// most recent role reads as CURRENT, and two NEGATIVE controls. Changing the
// prose here changes what that drive proves, so each block below says what it
// is for. If an assertion in the drive moves, this file moves with it.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'cv-fixture.scratch.pdf')

const LINES = [
  ['H', 'ALEX MORGAN'],
  ['P', 'Bath, Somerset · alex.morgan.fixture@example.invalid'],
  ['S', ''],

  // recentTitle === 'Senior Sous Chef', recentIsCurrent === true,
  // seniorityRank === 7. "Present" is what makes it current; the title string
  // is matched exactly, so do not reword it.
  ['H', 'EXPERIENCE'],
  ['B', 'Senior Sous Chef — The Wheatsheaf, Bath'],
  ['P', 'March 2022 to Present'],

  // THE POSITIVE CONTROL. The drive asserts at least one of allergens, haccp,
  // menu development, rota, training, stock control, gp margin is extracted.
  // Without it the two negative controls below would pass on an empty list —
  // which is the whole reason it is here.
  ['P', 'Run the section on a 90-cover AA Rosette kitchen. Responsible for'],
  ['P', 'menu development with the Head Chef, HACCP records and daily'],
  ['P', 'temperature logs, and allergens compliance across every dish.'],
  ['P', 'I write the rota for nine chefs, handle stock control and ordering,'],
  ['P', 'and report on GP margin to the general manager each period.'],
  ['P', 'Training two commis chefs and one apprentice.'],
  ['S', ''],

  ['B', 'Chef de Partie — Riverside Brasserie, Bristol'],
  ['P', 'June 2019 to February 2022'],
  ['P', 'Larder and sauce sections. Covered service on grill when needed.'],
  ['S', ''],

  // THE TRAP, and it is the point of the whole fixture. A keyword scan reads
  // "pastry" and "butchery" here and tags the candidate with both. The entire
  // argument for using a model rather than a keyword parser rests on it NOT
  // doing that, so the drive asserts the absence.
  //
  // Both words must appear, and both must appear under an explicit negation.
  // Softening this sentence disarms the test without failing it.
  ['H', 'NOTES'],
  ['P', 'No pastry experience — keen to learn butchery.'],
  ['S', ''],

  ['H', 'QUALIFICATIONS'],
  ['P', 'Level 3 Food Safety and Hygiene for Catering'],
  ['P', 'Level 2 Award in Allergen Awareness'],
]

const doc = await PDFDocument.create()
const page = doc.addPage([595, 842]) // A4 at 72dpi
const body = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)

let y = 790
for (const [kind, text] of LINES) {
  if (kind === 'S') { y -= 10; continue }
  const font = kind === 'H' || kind === 'B' ? bold : body
  const size = kind === 'H' ? 13 : kind === 'B' ? 11 : 10
  page.drawText(text, { x: 50, y, size, font, color: rgb(0.1, 0.1, 0.1) })
  y -= kind === 'H' ? 22 : 15
}

const bytes = await doc.save()
writeFileSync(OUT, bytes)

// ASSERT THE ARTEFACT, rather than announcing it. A generator that prints
// "written" over a zero-byte file is the printed-label fault this project
// keeps recording.
const size = bytes.length
if (size < 800) { console.error(`the PDF is only ${size} bytes — that is not a document`); process.exit(1) }
const head = Buffer.from(bytes.slice(0, 5)).toString('latin1')
if (head !== '%PDF-') { console.error(`it does not start with %PDF- (got ${JSON.stringify(head)})`); process.exit(1) }

console.log(`cv-fixture.scratch.pdf — ${size} bytes, ${LINES.filter(l => l[0] !== 'S').length} lines`)
console.log('  recentTitle    Senior Sous Chef, "to Present" so it reads as current')
console.log('  positive       allergens, HACCP, menu development, rota, training, stock control, GP margin')
console.log('  the trap       "No pastry experience — keen to learn butchery."')
