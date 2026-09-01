-- BLOCKING IS ENFORCED AT THE DATABASE, NOT AT THE CALL SITES.
--
-- There are TEN places in the application that insert into `messages`:
-- app/messages/page.tsx (×2), app/my-jobs/[jobId]/applications/page.tsx,
-- app/temp-work/page.tsx (×2), DeclineModal, DeclineOfferModal,
-- MakeOfferModal, ScheduleInterviewModal and WithdrawModal.
--
-- Ten call sites is ten chances to miss one, and a block that works on nine of
-- them is WORSE than none: the person believes they are protected. Adding one
-- clause to the policy that already governs every insert covers all ten, both
-- directions, and every call site added later — without touching any of them.
--
-- is_blocked_in_conversation() returns true if EITHER participant has blocked
-- the other, which is what makes one row stop messages both ways. Proven in all
-- four states against the fixture thread before this was applied:
--   no block            → false
--   candidate blocks    → true
--   employer blocks     → true
--   removed             → false
--
-- The rest of the clause is unchanged from "Users can send messages" as it
-- stood; it is restated in full because a policy cannot be amended in place.
drop policy if exists "Users can send messages" on public.messages;

create policy "Users can send messages" on public.messages
  for insert
  with check (
    (sender_id = auth.uid())
    and (conversation_id in (
      select conversations.id from conversations
      where (conversations.participant_1 = auth.uid())
         or (conversations.participant_2 = auth.uid())
    ))
    and (not is_employer_blocked_by_approval())
    and (not is_blocked_in_conversation(conversation_id))
  );

notify pgrst, 'reload schema';
