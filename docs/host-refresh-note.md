# Refreshing the Host Staffing adverts

How a Host reconcile is done, and the two entry conventions decided on
11 September 2026. **Read this before keying a Host advert**, because both
conventions are the kind of thing that holds for one session and drifts by the
next unless somebody writes them where the next person looks.

## Why this has to be done, and done regularly

**NOTHING EXPIRES A HOST ADVERT ON A CLOCK. A DEAD ONE STAYS ON THE BOARD
FOREVER UNLESS A PERSON REMOVES IT.**

`is_recruiter_posting` is true on all 19 live Host rows, which exempts them from
the 60-day expiry cron — and there is no scrape behind them to contradict them
either. So a Host advert has **no mechanism of any kind** that can retire it.
Goldenkeys rows are exempt from the same cron for a good reason: the weekly
scrape reconciles them. Host rows inherited the exemption without inheriting the
thing that justified it.

**That is the whole argument for running this weekly**, and it is not
theoretical. On 10 September 2026 the Goldenkeys board turned out to be 135 dead
adverts out of 247, and **43% of every real application ever made on Thrive had
gone to a role that no longer existed.** Host is small enough today that a lapse
is cheap. It will not stay that way.

---

Goldenkeys reconciles itself weekly through `scripts/import-goldenkeys.mjs`.
**Host does not and never will:** Host do not permit scraping, so every Host row
on the board is keyed in by hand from screenshots of their Caterer listings, and
every reconcile is those images read against the board.

    the board today          npm run board
    the 11 Sept capture      C:\Users\pauld\OneDrive\Thrive\host-captures\2026-09-11\
                             25 images, 20 distinct adverts, MANIFEST.md beside them

The capture folder is deliberately **outside the repository**. `.gitignore`
line 14 is `*.png` with exceptions only for `public/**` and `app/**`, so images
copied into `docs/` would be silently untracked — on disk, absent from every
clone, looking exactly like a record. Run `git check-ignore -v <path>` BEFORE
copying files in, not after wondering why they never appeared in a diff. The
repository is also public and these are a supplier's adverts, not ours.

---

## 1. Salary — base at the bottom, package at the top

**DECIDED 11 Sept 2026. This is the rule for every Host row.**

    salary_min = the BASE
    salary_max = the FULL PACKAGE   (base + tronc + service charge + bonus)

**Why:** almost every Host advert folds pay, and in four different ways — tronc,
service charge, commission, bonus. Four rows on the board already store it this
way and whoever keyed them solved the problem without a schema change. It is the
most honest storage available: **the bottom of the range is what the employer
guarantees, the top is what they advertise.** A candidate filtering on salary
gets a floor that is real and a ceiling that is the employer's own claim.

The alternative — storing the headline total in both columns — makes a guaranteed
£33,418 look like a guaranteed £41,767. That is a claim only the employer can
make and they did not make it.

### The convention holds where an advert gives a BASE and a TOTAL

Roughly half of them do not. **These are the three shapes where it does not, all
three met in the 11 September capture, all three decided.** They are named cases
rather than a principle to re-derive, because the next person will meet them
again and the principle is easy to reason your way out of at 6pm.

**CASE A — NO BASE IS STATED AT ALL.**
*"OTE inc service £55,000-£60,000"*, or *"£42,000 inc estimated tronc, OTE circa
£50,000"*. The advert never names a guaranteed figure.

> **Store the range as advertised, and say in the description that both ends
> include tronc or service.** There is no base to put at the bottom and we do
> not invent one.

**CASE B — THE UPLIFT IS A RANGE AND NO TOTAL IS ADVERTISED.**
*"£34,500-£38,000 DOE + £500-£800 per month tronc"*, or *"£60,000 + quarterly
bonus, potential earnings approximately £5,000-£8,000"*. Taking the top of both
gives £47,600 and £68,000.

> **Store the BASE range; put the uplift in the text.** Those two totals are
> figures the employer never advertised. **We do not compute a number and then
> present it as theirs.** Where the advert does state its own total, use that —
> the objection is to arithmetic of ours wearing their name.

**CASE C — THE UPLIFT IS OVERTIME, NOT TRONC.**
*"Basic salary £33,418 … typical earnings based on 48 hours per week: £41,767 …
OTE of up to £42,923 when you include the weekend work."* The contract is 40
hours.

> **Store the base at both ends** — £33,418 to £33,418 — and put the overtime
> rates in the description.
>
> **The reason, which is not a technicality: tronc and service charge are earned
> during contracted hours; overtime is pay for working more of them.** An advert
> whose headline assumes a 48-hour week against a 40-hour contract is not
> offering a bigger package, it is offering more hours. The decided list reads
> "base, tronc, service charge, bonus", and overtime is deliberately not on it.
>
> **The card will show less than Host advertise. That is the correct outcome
> rather than a cost.**

### Goldenkeys cannot do this, and that asymmetry is permanent

`scripts/import-goldenkeys.mjs` parses one `salary_text` string. Where that
string names a single figure it writes `salary_min = salary_max` — **81 of the
92 live Goldenkeys rows, measured 11 Sept 2026.** The other 11 carry a range
because the source stated one.

**But a Goldenkeys range and a Host range do not mean the same thing, and that
is the part to know.** A Goldenkeys range is a DOE range — two points on the
same advertised figure. A Host range under this convention is base-to-package —
a floor and a claim. There is no base anywhere in the Goldenkeys source and no
way to derive one, so this cannot be fixed by keying it differently.

**So the board carries two salary conventions at once**, and a range on one
source is not comparable with a range on the other. Recorded here rather than
left as a surprise for whoever next compares them.

---

## 2. `area` — a county or a region, never a postcode

**DECIDED 11 Sept 2026, for NEW entries.**

    area           a county or a region      "West Berkshire", "Wiltshire"
    full_location  the postcode              { city, postcode, addressLine1 }

**Why:** `jobs.area` is **printed verbatim beside the town** on every card and
every job page. A county reads naturally after a town; a postcode district does
not. Measured across the live board on 11 Sept, the column held three different
kinds of thing depending on who keyed the row — Goldenkeys writes a county or
region, Host writes a postcode district, Collins King writes both — so the board
read *"Durham, County Durham"* beside *"London, SW18"* beside
*"London, London E9 5EN"*. No bug: every value is true and nothing type-checks a
convention. This makes Host match Goldenkeys rather than the other way round.

**DO NOT BACKFILL THE EXISTING ROWS.** 112 rows of copy is its own job. New
entries follow the convention; old ones get fixed when there is a reason to
touch them.

### What the Caterer location field actually looks like

One hyperlinked string, up to three parts:

    Place, Town (District), Full postcode      "The City, City of London (EC2), EC3V 3LA"

**The parts disagree with each other on real adverts** — one carries `(SW4)` with
`SW9 9AE`, another `(SW8)` with `SW11 8AL` — and several adverts have no postcode
at all, just `Central London, London`. So the postcode is not reliable enough to
key anything on, and **two adverts carrying different postcodes are not thereby
two vacancies**: the 11 Sept capture holds one advert posted twice, word for
word identical, under RG20 and RG17.

**And for agency roles the pin is not the workplace.** Those adverts say so in
their own body text — *"client kitchens are based throughout London to suit your
home or work location"*. Do not key a district that implies a fixed site.

---

## 3. Right to work — read every advert, never infer from the role type

`work_authorization` is a `text[]` and the sentence is written in exactly one
place: `RIGHT_TO_WORK_SENTENCE` in `lib/rightToWork.ts`. **Set it through
`RIGHT_TO_WORK_VALUE(required)`, never by retyping the string**, so the board
never ends up with two wordings for one requirement. The helper returns `[]` for
"they have not said so", which renders nothing — absent stays absent, because a
default here would be a claim only the employer can make.

**THE RULE IS TO READ EACH ADVERT'S OWN Licences/Certifications SECTION.** It is
tempting to infer it from the role type, and that inference is wrong on this
data: in the 11 Sept capture, three adverts state right to work and **all three
are agency roles — but a fourth agency advert does not state it at all.** Role
type predicts nothing; only the advert does.

A row left empty is not an omission to be tidied up later. It means the employer
did not ask for it, which is the honest reason.

---

## 4. Matching an advert to a board row

**Match on the advert, not on one field.** Host re-post the same vacancy under
different location pins, and they key clusters of roles at one site with a
shared salary floor — so both of the obvious discriminators lie:

- **Postcode.** One advert in the 11 Sept capture appears twice, body text word
  for word identical, as RG20 and as RG17.
- **`salary_min`.** Three unrelated board rows — an Assistant Manager, a Bar
  Manager and a Front of House Supervisor — all carry `31725`. It is a keying
  convention for one site, not three employers offering the same odd number.
  **A figure repeated across unrelated roles is an artefact, not evidence.**

What does discriminate: the body text, which is copied verbatim when Host
re-post; the advertised ceiling; and whether a row belongs to a cluster keyed on
the same day for the same site.

**AND WHEN YOU DECIDE ONE OF THESE, RECORD THE ARGUMENT AGAINST.** The
11 September call — that the Thatcham Assistant Manager row is a different
vacancy from the Hungerford one — has a real counter-argument: the Caterer title
of the new advert is *"Assistant Manager 44K Rural Gastro Pub"* and the board
row's ceiling is exactly £44,000, in the same county, with "Gastro Pub" in both
titles. **The cluster evidence outweighs it and the decision stands.** But if
this is ever reopened, that is where it starts, and it should not have to be
rediscovered.

### The two titles do not agree, and the body is the one to use

A Caterer listing carries a headline title and the advert body carries its own.
They differ: one advert in the capture is listed as *"Sales & Marketing
Manager"* and its body heading reads *"Sales & Events Manager"*, with the whole
advert describing events sales — the pipeline, the bookings, the corporate and
private events calendar.

**Use the BODY. The body describes the job; the Caterer title is a listing
headline.** Record both in the description so the disagreement stays visible to
anyone matching the advert to a row later.

---

## 5. The order of a reconcile

1. **Capture** the live Caterer listings and copy them to a dated folder outside
   the repo, with a manifest. Count ADVERTS, not images — long adverts get split
   across two screenshots and some get captured twice.
2. **Compare** against `npm run board` filtered to Host, producing three sets:
   still live, dead, and new, using §4.
3. **Check what the dead ones carry before archiving, and say so out loud.**
   Applications against a role that no longer exists are the reason the
   reconcile matters. Count them, and say whether any were ever opened.
4. **Archive, insert, correct** — in that order, with the conventions above.
5. **Update this note** if anything here turned out to be wrong.

### What the 11 September archive cost, recorded

Four real applications sat on three of the ten dead rows:

    e970c793  Sous Chef – Prestigious Private Golf Club   2, both opened
    b252834d  Agency Chef de Partie – Mon to Fri, Events  1, opened
    4a6a83d6  Assistant Manager – Country Gastro Pub      1, NEVER opened

All four `pending`, none from a fixture, one from a candidate since erased.
Nobody had ever moved any of them.

**This is not a reason to hold an archive** — the roles are gone and leaving
them live is worse. It is recorded because it is the small version of what the
Goldenkeys board did at scale, and because a count of people who applied into
nothing is the only honest measure of what a lapsed reconcile costs.
