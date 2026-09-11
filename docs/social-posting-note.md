# Posting a job to social

How a role goes out, and the things that are easy to get wrong. Decided
11 September 2026.

    make the cards    node scripts/make-social-card.mjs <job-id> --salary "<text>" [--out <dir>]
    what it writes    1080x1350 feed  ·  1080x1920 story      Instagram only
    the board         npm run board

---

## 1. The salary on the card is not the salary in the column

**THE CARD MUST NEVER PRINT A PACKAGE WHERE A CANDIDATE READS A SALARY.**

The Goldenkeys importer parses one `salary_text`, so where the source names a
single figure it writes `salary_min = salary_max = the FOLDED TOTAL` — base plus
service charge. Measured 11 Sept 2026: **81 of 92 live Goldenkeys rows** hold
min = max, and most of those are folded.

> The worked example: the Junior Sous Chef in Berkshire holds `46700` against an
> advert reading *"£41,700 per annum plus £5,000 service charge"*. Its card, made
> on 2 September, printed **£47k** — overstating the guaranteed pay by five
> thousand pounds, in front of 522 impressions.

**So the generator REFUSES** when the row is Goldenkeys and min = max, and prints
the advert's own benefits line so the right value is in front of you. Pass it
back verbatim:

    --salary "£35,000 + service charge"

**IT REFUSES RATHER THAN GUESSES, AND THAT DISTINCTION IS THE WHOLE POINT.** Some
min = max rows are genuinely flat — *"£42,931 per annum"*, *"Up to £39,000"* —
and they are **indistinguishable from the folded ones by any column**. The base
is a sentence in prose, not a field. A person reading the advert is the only
honest source, and anything derived would be invented.

**Say "service charge", not "tips".** A service charge is levied and distributed
through a tronc; tips are discretionary and go to whoever earns them. Writing
"tips" promises something the employer has not offered.

---

## 2. The refs — the hyphen is doing the work

One ref per platform per role. The channel is the **prefix before the first
hyphen or underscore**; the raw ref is kept whole for drill-down, so per-role
tags cannot split a channel.

    ig-sommelier    -> Instagram        tt-sommelier    -> TikTok
    ig-barmanager   -> Instagram        tt-barmanager   -> TikTok

**THE FAILURE MODE IS A MISSING SEPARATOR, NOT A WRONG WORD.** Proven against
the real `normalizeSource`:

    igsommelier     -> "Igsommelier"    a brand new junk label
    ti-sommelier    -> "Ti"             a mistyped prefix, also junk
    instagram-somm  -> Instagram        long alias, fine
    tiktok_barmgr   -> TikTok           underscore, fine

`Instagram` and `TikTok` are already in `CHANNEL_ALIASES`, in the dropdown and in
the referrer map, so **nothing new is ever minted** — that is the fix that
stopped TikTok arriving under four labels, and it only holds if the tag keeps
its separator.

---

## 3. Instagram: the bio link is one at a time, so post one role a day

**Instagram feed captions are not clickable.** The only tappable link on a feed
post is the one in the bio, and there is one bio.

**SO THE ROLES GO OUT A DAY APART AND THE BIO LINK SWAPS WITH THEM.**

    day 1   bio = the day-1 role's ?ref=ig-<role>   + feed post + story sticker
    day 2   SWAP THE BIO, then post the day-2 role

**FORGETTING THE SWAP DOES NOT BREAK ANYTHING VISIBLY — it silently attributes
day 2's signups to day 1's role.** That is the whole reason this step is written
down: nothing goes red, the link still works, and the data is quietly wrong.

Story link stickers are per-post and clickable, so those always carry their own
ref regardless of the bio.

---

## 4. TikTok — not for employer adverts

**A still card does not travel on TikTok, and we cannot make video for somebody
else's vacancy.** `scripts/make-social-video.mjs` says so in its own opening
comment: *generated video of "a kitchen" attached to somebody's vacancy is a
claim about their premises that nobody filmed.* The same rule that keeps
generated imagery off a real employer's advert keeps generated motion off it.

So the honest options on TikTok are a still that will not travel, or footage the
employer has actually supplied. Neither is worth the work today.

**THE WAY IN, WHEN IT IS WORTH DOING, IS VIDEO ABOUT THRIVE** — which
`make-social-video.mjs` exists to make and is allowed to, because the only thing
being asserted there is ours.

**The card generator therefore has no TikTok output.** Its absence is a decision,
not an omission.

---

## 5. Safe areas: where the type is allowed to sit

`scripts/lib/social-formats.mjs` holds the share of the frame each platform
covers with its own UI, **in one place**, imported by both generators.

    linkedin          0.06
    instagram_feed    0        the 4:5 feed image is not overlaid at all
    instagram_story   0.20     reply bar, handle, stickers
    tiktok            0.30     caption, username, the button column

**THE CARD GENERATOR HAD NO CONCEPT OF THIS UNTIL 11 SEPT 2026** and the video
generator did. Measured on the rendered pixels, the old 9:16 card put its type at
**78–96% of the frame** — every word of it under a TikTok UI that starts at 70%.
The type now sits above both the platform's UI and the brand band, and every run
**prints where it landed** so the placement is a number on the screen rather
than a hope.

---

## 6. The card itself

Employer's photograph, their words, our mark — in that order of prominence.

    the photo     the advert's own banner. NEVER generated. An invented kitchen
                  on somebody's real vacancy is true-looking and not true.
    the type      company · role · strapline · place and pay
    the band      solid #FFE500 across the bottom, the lockup left,
                  thrivecareer.co.uk right, both in navy

**Brand second, job first.** The band sits below everything about the vacancy,
because on Instagram the card IS the post — it gets screenshotted and reshared
with no caption, so it has to say where the job came from on its own. **A solid
colour is a shape and a logo is a smudge**: the band is what reads at 100px.

**There is no floating mark on the photograph any more.** Two weak brand cues are
worse than one strong one, and that tile was sitting on somebody else's image.

The band's lockup is `public/logo/thrive-lockup.svg` with its container tile and
shadow plane removed — both lockups carry a #FFE500 tile that would vanish on a
#FFE500 band. No new artwork, no new colour, and the removal is asserted rather
than assumed.
