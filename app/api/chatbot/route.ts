import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'
import { buildSystemPrompt } from '@/lib/chatbot/systemPrompt'

// Why this route uses @anthropic-ai/sdk while app/api/ai-assist/route.ts
// uses raw fetch: ai-assist is non-streaming (CV summary, job-ad JSON,
// offer letter — each one round-trip). chatbot streams back token by
// token via Server-Sent Events. The SDK's messages.stream() iterator
// is materially simpler than parsing raw event-stream chunks from
// fetch, and the runtime cost (~80kb server-side) is irrelevant on
// Vercel Fluid Compute. Divergence is deliberate — do not consolidate
// the two routes.

export const maxDuration = 30
export const dynamic = 'force-dynamic'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY_MS = 86_400_000
const MAX_HISTORY_TURNS = 15
const MAX_MESSAGE_LENGTH = 1000

// lib/rateLimit.ts's in-memory Map is per-Vercel-instance, not global
// per-IP. Acceptable while traffic is light because each instance gets
// its own slice of traffic, so the effective cap per IP is somewhere
// between 50/day (single warm instance) and 50N/day (N instances).
// Revisit when ANY single IP hits >50/day across instances OR monthly
// active conversations exceed ~500 — at that point swap to Upstash,
// Vercel KV (now in marketplace), or another cross-instance store.
const DAILY_LIMIT_PER_IP = 50

const anthropicApiKey = process.env.ANTHROPIC_API_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null

// Service-role client — chat_logs has RLS enabled with no policies, so
// only service_role can insert. We never authenticate against the user's
// session from this client, which is the whole point of the table being
// service-role-only.
const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null

interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

function fallback(): NextResponse {
  return NextResponse.json({ fallback: true }, { status: 503 })
}

function isHistoryEntry(value: unknown): value is ChatHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { role?: unknown; content?: unknown }
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string'
  )
}

export async function POST(request: NextRequest) {
  if (!anthropic || !supabase) {
    return fallback()
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`chatbot:${ip}`, DAILY_LIMIT_PER_IP, DAY_MS)) {
    return fallback()
  }

  let body: {
    message?: unknown
    history?: unknown
    conversation_id?: unknown
    intercept_used?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return fallback()
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : ''
  const rawHistory = Array.isArray(body.history) ? body.history : []
  // Optional client-side signal that the frontend's high-stakes intercept
  // chip fired before the LLM call. Logged as-is so chat_logs can show
  // both signals per turn without coupling the route to the intercept
  // logic itself (which lives entirely client-side behind the
  // NEXT_PUBLIC_CHATBOT_INTERCEPTS_ENABLED flag).
  const interceptUsed = body.intercept_used === true

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return fallback()
  }
  if (!UUID_V4.test(conversationId)) {
    return fallback()
  }

  const history: ChatHistoryEntry[] = rawHistory
    .filter(isHistoryEntry)
    .slice(-MAX_HISTORY_TURNS)

  const turnIndex = history.length

  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ]

  const systemPrompt = buildSystemPrompt()
  const startedAt = Date.now()

  let stream: ReturnType<typeof anthropic.messages.stream>
  try {
    stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      messages,
    })
  } catch {
    return fallback()
  }

  let aggregated = ''

  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      // JSON-encode each delta so newlines inside a chunk don't break
      // the SSE wire format (which uses raw \n\n as message separator).
      // The frontend reader strips the "data: " prefix, JSON.parses, and
      // appends .text. The literal sentinel "[DONE]" is the close signal
      // and is NOT JSON — keeps parity with the build spec's
      // "data: [DONE]" wording.
      const sendDelta = (text: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
      const sendDone = () => controller.enqueue(encoder.encode(`data: [DONE]\n\n`))

      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const delta = event.delta.text
            aggregated += delta
            sendDelta(delta)
          }
        }
        sendDone()
      } catch {
        // Mid-stream Anthropic error: close cleanly so whatever text the
        // user has already seen stays on screen. The frontend's silent
        // fallback fires on 503 or >15s with no first byte, not on a
        // partial stream — that's deliberate.
        sendDone()
      } finally {
        controller.close()

        // Fire-and-forget log insert. Never await — logging must never
        // affect the response or its latency. Errors are swallowed so a
        // chat_logs outage can't cascade into a chatbot outage.
        if (aggregated) {
          supabase
            .from('chat_logs')
            .insert({
              conversation_id: conversationId,
              turn_index: turnIndex,
              user_message: message,
              bot_response: aggregated,
              model: 'claude-haiku-4-5-20251001',
              latency_ms: Date.now() - startedAt,
              fallback_used: false,
              intercept_used: interceptUsed,
            })
            .then(
              () => undefined,
              () => undefined,
            )
        }
      }
    },
  })

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
