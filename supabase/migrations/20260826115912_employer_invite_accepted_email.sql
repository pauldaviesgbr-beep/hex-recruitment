-- WHO WAS INVITED, AND WHO JOINED. TWO QUESTIONS, TWO COLUMNS.
--
-- The invite-code route proves control of the invited mailbox and then needs
-- accept_employer_invite's email comparison to pass. Its first implementation
-- did that by re-pointing invited_email at the accepting user — which worked,
-- and DESTROYED the record of who was actually invited. For team membership
-- that record is exactly what you want later.
--
-- So invited_email is now never overwritten, and accepted_email records who
-- joined. It is filled on EVERY successful accept, including the ordinary
-- exact-match path, so the answer to "who joined" is not only present for the
-- unusual route.

alter table public.employer_members
  add column if not exists accepted_email text;

comment on column public.employer_members.invited_email is
  'The address the invite was SENT to. Never overwritten — it is the record of who was invited.';
comment on column public.employer_members.accepted_email is
  'The address that actually accepted. Set by accept_employer_invite on success. '
  'Also acts as the permission slip for the invite-code route: set in advance ONLY '
  'after a code delivered to invited_email has been verified, and cleared again if '
  'the RPC refuses for any other reason.';

-- Unchanged from the live definition except where marked. Every existing gate
-- stays: status must be 'invited', expiry, one active employer per user.
create or replace function public.accept_employer_invite(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_member public.employer_members%rowtype;
  v_active int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  -- NEW, AND IT CLOSES A HOLE THAT WAS ALWAYS THERE. Without this, a caller
  -- with no email address gives v_email = '', and coalesce(invited_email,'')
  -- is ALSO '' for an invite with no address — so empty would match empty and
  -- the comparison below would pass on two absent values. It has never been
  -- reachable (every account here has an address), and it is one line.
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_member
    from public.employer_members
    where invite_token = p_token
    limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_member.status <> 'invited' then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;
  if v_member.invite_expires_at is not null and v_member.invite_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- CHANGED: two ways in, and the second is a STRONGER proof of the same
  -- claim rather than a looser one.
  --
  --   invited_email  matches -> the ordinary path, unchanged
  --   accepted_email matches -> a code sent to invited_email was verified,
  --                             which proves control of that mailbox. A string
  --                             can be typed by anyone; the code can only be
  --                             READ by whoever holds the inbox.
  --
  -- accepted_email is null on every row until something deliberately sets it,
  -- and v_email cannot be empty by the guard above, so a null column can never
  -- match. It is writable only by the service role.
  if lower(coalesce(v_member.invited_email, '')) <> v_email
     and lower(coalesce(v_member.accepted_email, '')) <> v_email then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select count(*) into v_active
    from public.employer_members
    where user_id = v_uid and status = 'active';
  if v_active > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_in_account');
  end if;

  update public.employer_members
    set user_id           = v_uid,
        status            = 'active',
        accepted_at       = now(),
        -- CHANGED: record who joined, on every path, so "who did I invite and
        -- who joined" is answerable for ordinary invites too and not only for
        -- the ones that went through a code.
        accepted_email    = v_email,
        invite_token      = null,
        invite_expires_at = null
    where id = v_member.id;

  return jsonb_build_object('ok', true, 'employer_id', v_member.employer_id);
end;
$$;

grant execute on function public.accept_employer_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
