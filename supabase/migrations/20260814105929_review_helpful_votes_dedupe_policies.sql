-- review_helpful_votes carried each of its three policies TWICE — two
-- identical SELECTs, two equivalent INSERTs, two equivalent DELETEs — the
-- last duplicate pairs from the 13 Aug policy audit. One of each survives;
-- the kept variants are behaviourally identical to the pairs they replace
-- (the {public} write policies still require auth.uid() = user_id, which is
-- false for anon, so nothing widens).
drop policy "Anyone can read votes" on public.review_helpful_votes;
drop policy "Authenticated users can vote" on public.review_helpful_votes;
drop policy "Users can remove own votes" on public.review_helpful_votes;
