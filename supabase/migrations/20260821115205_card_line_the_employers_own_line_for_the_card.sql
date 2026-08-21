-- THE ONE LINE THE EMPLOYER WANTS ON THEIR CARD.
--
-- The no-photograph card lifts a sentence from the advert. That works when the
-- advert happens to open a section with a short sentence, and fails when it
-- does not: Collins King's advert is well written and every one of its nine
-- sentences is over 100 characters, so it falls to a ghosted monogram.
--
-- The line design drew on their own mock — "Full ownership of the food offer,
-- Monday to Friday" — is not in that advert and could only be produced by
-- WRITING copy on the employer's behalf, which is the one thing this whole
-- feature refuses to do.
--
-- So the employer writes it. Optional, their words, shown live on the card
-- preview as they type. The lifted sentence stays as the fallback beneath it,
-- so an advert that never fills this in is no worse off than today.
alter table jobs add column if not exists card_line text;

comment on column jobs.card_line is
  'Optional one-line summary the employer writes for the no-photograph card. '
  'Takes precedence over the sentence lifted from the description by '
  'lib/jobQuote. Never generated: if this is null we lift, and if we cannot '
  'lift we fall back to tags and then the monogram.';
