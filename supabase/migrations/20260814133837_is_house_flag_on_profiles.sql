-- THE HOUSE ACCOUNT is a third kind of row: not a fixture (is_test — we
-- drive those), not a customer, but the platform's own real account. Paul's
-- employer profile "Thrive Career Platform LTD" is a genuine signup with a
-- genuine login history, so flagging it is_test would make that flag's name
-- lie — and a flag whose name lies is how the last three of these started.
-- Two booleans, each name true: is_test = fixture, is_house = ours.
--
-- Stamped now: ONLY the house employer profile. Paul's personal candidate
-- account and "Tester (Sarah)" are named in the report as candidates for
-- this flag but are NOT stamped without his word.

alter table public.candidate_profiles add column if not exists is_house boolean not null default false;
alter table public.employer_profiles add column if not exists is_house boolean not null default false;

update public.employer_profiles set is_house = true
where user_id = '5c2510a9-5510-4705-a113-faeb5da48ae0';  -- paul@thrivecareer.co.uk / Thrive Career Platform LTD;
