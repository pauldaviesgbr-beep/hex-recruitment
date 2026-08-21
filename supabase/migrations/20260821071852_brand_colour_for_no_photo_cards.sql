-- The employer's brand colour, clamped into a band that guarantees white type
-- stays legible on it. From the design handoff for the no-photo job card: the
-- panel becomes the employer's colour rather than Thrive navy, so a card
-- carries one visual system instead of two.
--
-- Computed ONCE from the employer's logo at upload (lib/brandColour), never in
-- the browser. Nullable: null means "not computed yet" and the panel falls back
-- to navy, which is also what a high hue-variance logo resolves to.
--
-- TWO COLUMNS, DELIBERATELY. The value is derived from the logo, which belongs
-- to the employer — but it is STAMPED onto each job at posting time so an
-- employer changing their logo later does not restyle adverts that are already
-- live and already been seen.
alter table employer_profiles add column if not exists brand_colour text;
alter table jobs add column if not exists brand_colour text;

comment on column employer_profiles.brand_colour is
  'Clamped brand colour (hex) derived from the company logo at upload. OKLCH L 0.30-0.42, C <= 0.12, hue untouched. NULL = not computed.';
comment on column jobs.brand_colour is
  'Snapshot of the employer brand_colour at posting time, so a later logo change does not restyle live adverts. NULL = fall back to navy.';

notify pgrst, 'reload schema';
