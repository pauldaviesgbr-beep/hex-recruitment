-- Chatbot observability table for the LLM-backed Ask Thrive widget.
-- Stores one row per LLM turn. No IP address is captured — only the
-- message text, bot response, latency, and which path served the turn
-- (LLM vs silent keyword fallback vs frontend intercept).
--
-- RLS is enabled with NO policies, which makes the table service-role
-- only — anon and authenticated roles cannot read or write. Inserts
-- happen server-side from the chatbot API route using SUPABASE_SERVICE_
-- ROLE_KEY.
--
-- A 90-day retention function ships in this migration; the cron schedule
-- that invokes it lives in the next migration (split so a pg_cron
-- permission error can't roll back the table).

CREATE TABLE IF NOT EXISTS public.chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  turn_index integer NOT NULL,
  user_message text NOT NULL,
  bot_response text NOT NULL,
  model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  latency_ms integer,
  fallback_used boolean NOT NULL DEFAULT false,
  intercept_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_logs_conversation_id_idx
  ON public.chat_logs(conversation_id);

CREATE INDEX IF NOT EXISTS chat_logs_created_at_idx
  ON public.chat_logs(created_at DESC);

ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — service-role-only access.

REVOKE ALL ON public.chat_logs FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.prune_chat_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.chat_logs WHERE created_at < now() - interval '90 days';
$$;

REVOKE EXECUTE ON FUNCTION public.prune_chat_logs() FROM anon, authenticated, PUBLIC;
