// Frontend high-stakes intercept layer for the Ask Thrive chatbot.
// Belt-and-braces only — the LLM's system prompt already produces
// correct answers on these five topics. This module exists so that
// if drift ever shows up in chat_logs week one, we can flip
// NEXT_PUBLIC_CHATBOT_INTERCEPTS_ENABLED=true and surface a canonical
// phrasing above the streamed LLM response.
//
// Disabled by default. The frontend runs detectHighStakes() BEFORE
// the /api/chatbot fetch only when the env flag is "true". The LLM
// call still happens either way — intercept is additive, not a
// replacement, so the user always gets the contextual answer too.
//
// All five canonical responses interpolate the same constants the
// system prompt does (EMPLOYER_SUBSCRIPTION_PRICE, TRIAL_MONTHS,
// EMPLOYER_COHORT_CAP) so the chip wording and the LLM wording can
// never disagree on numbers.

import { EMPLOYER_SUBSCRIPTION_PRICE, TRIAL_MONTHS } from '@/lib/trialUtils'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'

export type HighStakesTopic = 'cancellation' | 'pricing' | 'trial' | 'support' | 'gdpr'

export interface HighStakesMatch {
  topic: HighStakesTopic
  canonicalResponse: string
}

interface TopicDef {
  topic: HighStakesTopic
  pattern: RegExp
  response: () => string
}

// Order matters — cancellation is checked before trial because "cancel
// during trial" is a cancellation question, not a trial question.
// Similarly pricing before trial because "how much" should hit pricing
// even if the user uses the word "free" elsewhere in the sentence.
const TOPICS: TopicDef[] = [
  {
    topic: 'cancellation',
    pattern: /\b(cancel|cancellation|notice period)\b/i,
    response: () => "Cancel from Settings with 14 days' notice. During your free trial, cancel any time - no charge.",
  },
  {
    topic: 'pricing',
    pattern: /\b(how much|price|cost|£|fee)\b/i,
    response: () => `Single plan - £${EMPLOYER_SUBSCRIPTION_PRICE}/month. No tiers, no upsell. First ${EMPLOYER_COHORT_CAP} employers get ${TRIAL_MONTHS} months free, no card needed.`,
  },
  {
    topic: 'trial',
    pattern: /\b(trial|free for|how long.+free)\b/i,
    response: () => `${TRIAL_MONTHS}-month free trial for the first ${EMPLOYER_COHORT_CAP} employers.`,
  },
  {
    topic: 'support',
    pattern: /\b(support|contact|email)\b/i,
    response: () => 'support@thrivecareer.co.uk - we reply within 24 hours.',
  },
  {
    topic: 'gdpr',
    pattern: /\b(gdpr|data|privacy|personal)\b/i,
    response: () => "Everything's in our privacy policy. For specifics, email support@thrivecareer.co.uk.",
  },
]

export function detectHighStakes(message: string): HighStakesMatch | null {
  for (const def of TOPICS) {
    if (def.pattern.test(message)) {
      return { topic: def.topic, canonicalResponse: def.response() }
    }
  }
  return null
}

export function interceptsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHATBOT_INTERCEPTS_ENABLED === 'true'
}
