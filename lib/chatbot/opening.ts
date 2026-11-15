// Ask Thrive's opening line and suggested questions — one copy, read by the
// chat (components/ChatBot) and by scripts/prove-applicants.ts, which checks
// each suggestion lands on the right canned answer.
//
// NO PRICES AND NO TRIALS (the product rule; Claude Design, 15 Nov 2026). The
// opening offered "pricing" and the first suggestion was "How does the trial
// work?" — a trial length is a price claim in disguise.

export const WELCOME_TEXT =
  "Hi! I'm here to help. Ask me about posting jobs, managing applicants, interviews, or anything else."

export type Asker = 'employer' | 'candidate' | 'signedOut'

/** By who is asking (Claude Design's wording). */
export const SUGGESTED: Record<Asker, string[]> = {
  employer: ['How do I post a job?', 'How do I move an applicant on?', 'How do I schedule interviews?', 'How do I contact support?'],
  candidate: ['How do I apply for a job?', 'Where can I see my applications?', 'How do I build my CV?', 'How do I contact support?'],
  signedOut: ['How do I apply for a job?', 'How do I post a job?', 'How do I contact support?'],
}
