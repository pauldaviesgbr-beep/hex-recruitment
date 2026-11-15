// Keyword-matched fallback for the Ask Thrive chatbot. This is the
// silent rescue path: when the /api/chatbot LLM call fails (timeout,
// rate-limit, 5xx, network), the frontend silently runs the user's
// message through getKeywordResponse() and renders the result with
// no error UI. User sees a degraded but functional reply, not a
// failure.
//
// Extracted verbatim from the prior ChatBot.tsx (the entire pre-LLM
// chatbot) so the fallback experience exactly matches what the bot
// used to do. The chatbot-only phrasings ("Great question!", etc.)
// that wouldn't pass the LLM voice rules are kept here on purpose —
// this path is the safety net, not the primary surface.

import { BRAND_FULL } from '@/lib/constants/brand'
import { EMPLOYER_COHORT_CAP, FOUNDING_PERIOD_MONTHS } from '@/lib/constants/cohort'

// THIS FILE IS THE ONE THAT ANSWERED. /api/chatbot returns {"fallback":true}
// far more often than the "silent rescue path" framing above suggests, and the
// browser then renders these strings — so an anonymous visitor asking "how much
// does it cost?" on the live homepage was told "Single plan — £99/month… the
// first 100 get 3 months free" from right here. Both halves were wrong: no
// price has been set, and the real founding offer is 12 months, not 3.
//
// EMPLOYER_SUBSCRIPTION_PRICE and the trial phrasings are deliberately NOT
// imported. The constants stay in lib/trialUtils for the dormant Stripe path;
// nothing that talks to a stranger reads them. See CLAUDE.md.
const PRICING_ANSWER =
  `The first ${EMPLOYER_COHORT_CAP} employers get **${FOUNDING_PERIOD_MONTHS} months free** — no card, no catch.\n\n` +
  `That includes:\n• Unlimited job listings\n• Browse and contact candidates\n• Direct messaging & interview scheduling\n• Full analytics dashboard\n• Dedicated account support\n\n` +
  `Candidates use Thrive free, always.\n\n` +
  `Pricing after the ${FOUNDING_PERIOD_MONTHS} months hasn't been set yet — you'd be told well in advance, and nothing is charged automatically.`

export interface KeywordLink {
  text: string
  href: string
}

export interface KeywordResponse {
  response: string
  links?: KeywordLink[]
}

interface ResponsePattern {
  keywords: string[]
  response: string
  links?: KeywordLink[]
}

const responsePatterns: ResponsePattern[] = [
  // ── GENERAL / ABOUT ──
  {
    keywords: ['what is thrive', 'about thrive', 'how does it work', 'tell me about', 'what does thrive do'],
    response: `${BRAND_FULL} is the UK's recruitment platform connecting employers across all industries with qualified professionals.\n\n**For Job Seekers:** Completely free! Create your profile, upload your CV, browse jobs, and apply directly.\n\n**For Employers:** Post jobs, browse candidate profiles, schedule interviews, send offers, and track your hiring pipeline. The first ${EMPLOYER_COHORT_CAP} employers get ${FOUNDING_PERIOD_MONTHS} months free, no card needed.`,
    links: [{ text: 'Learn More', href: '/' }]
  },
  {
    keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
    response: `Hello! Welcome to ${BRAND_FULL}! I'm here to help you find your next opportunity or hire great talent. What would you like to know?`
  },
  {
    keywords: ['thanks', 'thank you', 'cheers', 'appreciate', 'ta'],
    response: "You're welcome! If you have any other questions, I'm always here to help. Good luck!"
  },
  {
    keywords: ['contact', 'support', 'email', 'phone number'],
    response: "Need more help? Our support team is here for you!\n\nEmail: support@thrivecareer.co.uk\n\nWe typically respond within 24 hours."
  },

  // ── REGISTRATION & LOGIN ──
  {
    keywords: ['register', 'sign up', 'create account', 'join', 'get started'],
    response: `There are two ways to join Thrive:\n\n**Job Seekers:** Create a free profile — browse jobs, upload your CV, and apply directly. No cost, ever.\n\n**Employers:** Post jobs and browse candidate profiles. The first ${EMPLOYER_COHORT_CAP} get ${FOUNDING_PERIOD_MONTHS} months free — no card needed.`,
    links: [{ text: 'I\'m a Job Seeker', href: '/register/employee' }, { text: 'I\'m an Employer', href: '/register/employer-free' }]
  },
  {
    keywords: ['log in', 'login', 'sign in', 'forgot password', 'reset password', 'can\'t log in'],
    response: "You can log in from the top-right of the site. If you've forgotten your password, click \"Forgot Password\" on the login page and we'll send you a reset link via email.",
    links: [{ text: 'Log In', href: '/login' }]
  },

  // ── PRICING & SUBSCRIPTION ──
  {
    // Widened to catch the sideways askings — "is it expensive", "what's the
    // catch", "how does Thrive make money", "what do I pay". Every one of these
    // is the pricing question and must not fall through to a stale answer.
    keywords: ['cost', 'costs', 'price', 'pricing', 'pay', 'paid', 'how much', 'fee', 'fees',
      'charge', 'charged', 'subscription', 'plan', 'expensive', 'afford', 'catch',
      'make money', 'worth it', 'what will i pay', 'after the free'],
    response: PRICING_ANSWER,
    links: [{ text: 'Claim a founding place', href: '/register/employer-free' }]
  },
  {
    keywords: ['free trial', 'trial', 'free period', '12 month', 'twelve month', 'try free', 'founding'],
    response: `Yes — the first ${EMPLOYER_COHORT_CAP} employers get **${FOUNDING_PERIOD_MONTHS} months free**, with no card required. That's full access:\n• Unlimited job listings\n• Browse all candidate profiles\n• Send and receive messages\n• Schedule interviews\n• Send job offers\n\nNothing is charged automatically at the end. What happens afterwards hasn't been decided yet, and you'd hear from us well before it does.`,
    links: [{ text: 'Claim a founding place', href: '/register/employer-free' }]
  },
  {
    keywords: ['standard plan', 'basic plan', 'starter plan', 'professional plan', 'pro plan', 'premium plan', 'unlimited', 'which plan', 'what plan', 'tier', 'tiers'],
    response: `There are no tiers — everyone gets everything:\n• Unlimited job listings\n• Browse and contact candidates\n• Direct messaging & interview scheduling\n• Full analytics dashboard\n• Dedicated account support\n\nThe first ${EMPLOYER_COHORT_CAP} employers get ${FOUNDING_PERIOD_MONTHS} months of it free, no card needed. We haven't set what it costs after that.`,
    links: [{ text: 'Claim a founding place', href: '/register/employer-free' }]
  },
  {
    keywords: ['cancel', 'unsubscribe', 'stop subscription', 'end subscription'],
    response: "You can cancel from your Settings page with 14 days' notice. While you're on the founding offer there's nothing to charge, so cancelling costs you nothing. Your access continues until the end of the notice period.",
    links: [{ text: 'Settings', href: '/settings' }]
  },
  {
    keywords: ['upgrade', 'change plan', 'switch plan', 'downgrade'],
    response: `There are no tiers to move between — everything's included for everyone. If you've cancelled and want to come back, you can do that from your Settings page.`,
    links: [{ text: 'Settings', href: '/settings' }]
  },

  // ── EMPLOYER: POSTING JOBS ──
  {
    keywords: ['post job', 'post a job', 'add job', 'create job', 'new job', 'advertise', 'list job', 'job listing'],
    // No plan, no trial: the product publishes no price and no trial length.
    response: "To post a job:\n1. Open Your job ads (on a phone it's under More; on a laptop, Post Job is in the side menu)\n2. Press \"+ Post a job\"\n3. Add the role, pay, place and description\n4. Publish, and it goes live straight away.",
    links: [{ text: 'Post a Job', href: '/post-job' }]
  },
  {
    keywords: ['edit job', 'update job', 'change job', 'modify listing'],
    response: "You can edit any of your job listings from the \"Manage Job Ads\" page. Find the job card and click \"Edit\" to update the title, description, salary, location, or any other details. Changes go live immediately."
  },
  {
    keywords: ['pause job', 'deactivate job', 'hide job'],
    response: "You can pause a job listing from the \"Manage Job Ads\" page. Click the \"Pause\" button on any active job card. Paused jobs are hidden from candidates but can be reactivated at any time."
  },
  {
    keywords: ['delete job', 'remove job', 'close job'],
    // "will also remove all associated applications" was false: they are kept.
    response: "Open Your job ads, choose the advert's menu, and press Remove ad. It comes off the board straight away. Applications are kept, and you can send the people still waiting a polite update. You can restore it from the Archived tab."
  },

  // ── EMPLOYER: BROWSING CANDIDATES ──
  {
    keywords: ['find candidate', 'browse candidate', 'search candidate', 'view candidate', 'candidate profile', 'talent pool'],
    response: "As an employer with an active subscription, you can browse our full database of candidates!\n\n• View detailed profiles with skills, experience, and qualifications\n• Download candidate CVs\n• See their availability status\n• Send messages directly to candidates you're interested in\n\nUse filters to narrow by skills, location, and more.",
    links: [{ text: 'Browse Candidates', href: '/candidates' }]
  },

  // ── CANDIDATE: MY APPLICATIONS — AHEAD OF THE EMPLOYER ENTRY BELOW ──
  // "Where can I see my applications?" (a suggested question) contains
  // "application", which the employer entry also matches, and the first match
  // wins. So the candidate phrasings come first.
  {
    keywords: ['my applications', 'see my application', 'track application', 'application status', 'my application', 'where is my application'],
    response: "Your applications are on the Applications tab. Each one shows where it stands: Applied, Viewed, Shortlisted, Interview, Offer, Hired or Not selected. You'll get a notification when it changes.",
    links: [{ text: 'My applications', href: '/applications' }]
  },

  // ── EMPLOYER: APPLICANTS ──
  {
    keywords: ['move an applicant', 'applicant', 'my candidate', 'application', 'pipeline', 'manage candidate'],
    response: "Open Applicants. Each person has one next step: Shortlist, Invite to interview, Make offer or Mark hired. \"Not a fit\" sends them a polite update after a few seconds, so you can Undo. The stage chips show who is where, longest waiting first.",
    links: [{ text: 'Applicants', href: '/applied' }]
  },

  // ── EMPLOYER: INTERVIEWS ──
  {
    keywords: ['interview', 'schedule interview', 'interview date', 'interview time', 'calendar', 'book interview'],
    response: "On Applicants, press \"Invite to interview\" for someone you've shortlisted. Choose in person, video or phone, and they pick a time from your availability. Every interview shows on your Calendar, and can sync with Google Calendar.",
    links: [{ text: 'Calendar', href: '/calendar' }, { text: 'Applicants', href: '/applied' }]
  },
  {
    keywords: ['reschedule', 'change interview', 'move interview', 'cancel interview'],
    response: "You can reschedule or cancel an interview from the candidate's application page. Update the date, time, or location as needed. The candidate will be notified of any changes. Cancelled interviews are tracked separately from completed ones."
  },

  // ── EMPLOYER: OFFERS ──
  {
    keywords: ['offer', 'job offer', 'send offer', 'make offer', 'offer letter', 'signature'],
    response: "When you're ready to hire, you can send a formal job offer through Thrive!\n\n• Create an offer with salary, start date, and terms\n• The candidate receives a notification and can review the offer\n• Candidates can accept and sign digitally, or decline\n• Track all your pending and accepted offers from the \"Offers\" tab\n\nOffers include a digital signature system for quick acceptance.",
    links: [{ text: 'View Offers', href: '/my-jobs?filter=offers' }]
  },

  // ── EMPLOYER: HIRED ──
  {
    keywords: ['hired', 'accepted offer', 'onboard', 'successful hire', 'filled position'],
    response: "The \"Hired\" tab shows all candidates who have accepted your job offers. From here you can:\n\n• View the details of each successful hire\n• See which positions have been filled\n• Archive completed hires\n• Track your overall hiring success rate\n\nCongratulations on each new team member!",
    links: [{ text: 'View Hired', href: '/my-jobs?filter=hired' }]
  },

  // ── EMPLOYER: ANALYTICS ──
  {
    keywords: ['analytics', 'dashboard', 'stats', 'statistics', 'performance', 'metrics', 'report', 'chart'],
    response: `The Analytics dashboard gives you insights into your recruitment performance:\n\n• Job posting views and application rates\n• Candidate pipeline breakdown\n• Hiring funnel conversion rates\n• Trend charts over time\n• Top-performing job listings\n\nIt's included for everyone — there's no add-on to buy.`,
    links: [{ text: 'View Analytics', href: '/dashboard/analytics' }]
  },

  // ── EMPLOYER: REVIEWS ──
  {
    keywords: ['review', 'feedback', 'rating', 'employer review', 'candidate review'],
    response: "The Reviews section lets you manage feedback and ratings. Both employers and candidates can leave reviews after the hiring process. Good reviews help build trust and attract better candidates to your future listings.",
    links: [{ text: 'View Reviews', href: '/reviews' }]
  },

  // ── MESSAGING ──
  {
    keywords: ['message', 'chat', 'inbox', 'direct message', 'dm', 'communicate', 'send message'],
    response: "Thrive has built-in messaging so you can communicate directly with candidates or employers!\n\n• Send and receive messages from your inbox\n• Get notifications for new messages\n• Discuss job details, arrange interviews, or ask questions\n• Messages are accessible from the top navigation bar\n\nLook for the message icon in the navbar to access your conversations.",
    links: [{ text: 'Browse Jobs', href: '/jobs' }]
  },

  // ── NOTIFICATIONS ──
  {
    keywords: ['notification', 'alert', 'bell', 'updates', 'notify'],
    response: "Stay up to date with Thrive notifications! You'll receive alerts for:\n\n• New job applications\n• Messages from candidates or employers\n• Interview confirmations and reminders\n• Offer responses (accepted or declined)\n• Profile views\n\nClick the bell icon in the top navigation bar to see all your notifications."
  },

  // ── SETTINGS ──
  {
    keywords: ['setting', 'account setting', 'profile setting', 'preferences', 'account details'],
    response: "From the Settings page you can manage:\n\n• Your company/profile information\n• Subscription plan and billing\n• Notification preferences\n• Account security and password\n• Phone number verification\n\nAccess Settings from the sidebar menu.",
    links: [{ text: 'Settings', href: '/settings' }]
  },

  // ── CANDIDATE: PROFILE & CV ──
  {
    keywords: ['candidate profile', 'create profile', 'my profile', 'set up profile'],
    response: "Creating your candidate profile is quick and free!\n\n1. Register as a job seeker\n2. Fill in your details: name, skills, experience, and qualifications\n3. Upload your CV (PDF recommended)\n4. Set your availability status\n5. Start browsing and applying for jobs!\n\nA complete profile helps employers find and contact you.",
    links: [{ text: 'Create Profile', href: '/register/employee' }]
  },
  {
    keywords: ['cv', 'resume', 'upload cv', 'upload resume', 'document'],
    response: "Open the CV builder (Profile › CV builder on a phone). It starts from your profile, so add your experience and skills, then download it or use it when you apply. You can also upload a CV you already have.",
    links: [{ text: 'CV builder', href: '/cv-builder' }]
  },
  {
    keywords: ['availability', 'available', 'status', 'looking for work', 'open to work'],
    response: "Candidates can set their availability status on their profile to let employers know if they're:\n\n• Actively looking for work\n• Open to offers\n• Not currently available\n\nKeeping your status up to date helps employers know when to reach out."
  },

  // ── CANDIDATE: BROWSING & APPLYING ──
  {
    keywords: ['job seeker', 'find job', 'apply', 'get hired', 'search job', 'browse job', 'look for job'],
    response: "Job seekers can use Thrive completely FREE!\n\n• Browse the live jobs\n• Filter by location, category, salary, and job type\n• Apply with one click using your profile and CV\n• Track your applications and their status\n• Receive messages from interested employers\n\nCreate your free profile to get started!",
    links: [{ text: 'Browse Jobs', href: '/jobs' }, { text: 'Create Profile', href: '/register/employee' }]
  },

  // ── CANDIDATE: INTERVIEWS ──
  {
    keywords: ['my interview', 'interview invite', 'confirm interview', 'interview notification'],
    response: "When an employer schedules an interview with you, you'll receive a notification with the details:\n\n• Date, time, and duration\n• Interview type (in-person, video, or phone)\n• Location or video call link\n• Option to confirm or request a reschedule\n\nInterviews can also sync with Google Calendar so you never miss one!"
  },

  // ── CANDIDATE: OFFERS ──
  {
    keywords: ['receive offer', 'got an offer', 'accept offer', 'decline offer', 'sign offer'],
    response: "When an employer sends you a job offer, you'll see it in your notifications and dashboard. You can:\n\n• Review the full offer details (salary, start date, terms)\n• Accept and digitally sign the offer\n• Decline if it's not the right fit\n\nTake your time to review, but don't wait too long — the employer is excited about you!"
  },

  // ── SECTORS & CATEGORIES ──
  {
    keywords: ['sector', 'industry', 'category', 'what jobs', 'job type', 'positions', 'field'],
    response: "Thrive covers all major UK job sectors:\n\n• Accountancy, Banking & Finance\n• Admin, Secretarial & PA\n• Digital & IT\n• Engineering & Manufacturing\n• Healthcare & Social Care\n• Hospitality, Tourism & Sport\n• Legal\n• Marketing, Advertising & PR\n• Retail & Sales\n• Teaching & Education\n• Construction & Property\n• Transport & Logistics\n\nAnd many more!",
    links: [{ text: 'Browse All Jobs', href: '/jobs' }]
  },

  // ── LOCATION ──
  {
    keywords: ['london', 'manchester', 'birmingham', 'location', 'where', 'city', 'area', 'region'],
    response: "Thrive covers jobs across the entire UK! We have listings in:\n\n• London\n• Manchester\n• Birmingham\n• Edinburgh\n• Leeds\n• Bristol\n• And many more cities\n\nUse the location filter when browsing jobs to find opportunities near you.",
    links: [{ text: 'Browse Jobs', href: '/jobs' }]
  },

  // ── SIDEBAR / NAVIGATION ──
  {
    keywords: ['sidebar', 'navigation', 'menu', 'where do i find', 'how to navigate'],
    response: "The employer sidebar gives you quick access to all key areas:\n\n• **Post Job** — Create a new listing\n• **Browse Jobs** — See all active jobs on the platform\n• **Candidates** — Browse the candidate database\n• **My Candidates** — Your jobs and applicants\n• **Interviews** — Upcoming and past interviews\n• **Offers** — Pending and accepted offers\n• **Hired** — Successfully hired candidates\n• **Analytics** — Performance dashboard\n• **Reviews** — Feedback and ratings\n• **Settings** — Account and subscription management\n\nYou can collapse or expand the sidebar using the arrow button."
  },

  // ── EMPLOYER: GENERAL HIRING ──
  {
    keywords: ['hire', 'hiring process', 'recruitment process', 'how to hire'],
    response: "The hiring process on Thrive is straightforward:\n\n1. **Post a Job** — Create your listing with details\n2. **Review Applications** — Candidates apply and you review them\n3. **Schedule Interviews** — Book interviews with top candidates\n4. **Send Offers** — Make formal offers with digital signatures\n5. **Hire!** — Track successful hires in your dashboard\n\nEverything is managed from your employer dashboard.",
    links: [{ text: 'Post a Job', href: '/post-job' }, { text: 'Browse Candidates', href: '/candidates' }]
  },

  // ── FREE FOR CANDIDATES ──
  {
    keywords: ['free for candidate', 'candidate cost', 'does it cost candidate', 'job seeker free', 'do i pay'],
    response: "Thrive is completely FREE for job seekers! You can:\n\n• Create your profile at no cost\n• Browse and apply for unlimited jobs\n• Receive messages from employers\n• Track your applications\n• Accept job offers\n\nThere are no hidden fees for candidates — ever.",
    links: [{ text: 'Create Free Profile', href: '/register/employee' }]
  },

  // ── VERIFICATION ──
  {
    keywords: ['verify', 'verification', 'phone number', 'verify phone', 'confirm identity'],
    response: "Employers are required to verify their phone number before posting jobs. This helps maintain trust and quality on the platform. Verification is quick — just enter your phone number and confirm the code sent via SMS."
  },

  // ── GOOGLE CALENDAR ──
  {
    keywords: ['google calendar', 'calendar sync', 'calendar integration'],
    response: "Thrive integrates with Google Calendar! When interviews are scheduled, they can be automatically added to your Google Calendar with all the details — date, time, location or video link, and candidate/employer information. Never miss an interview!"
  }
]

const defaultResponse: KeywordResponse = {
  response: "I'm here to help! You can ask me about:\n\n**For Employers:**\n• Posting jobs\n• Managing applicants\n• Browsing candidates\n• Interviews, offers & hiring\n• Analytics dashboard\n\n**For Job Seekers:**\n• Creating a free profile\n• Browsing & applying for jobs\n• Tracking applications\n\nWhat would you like to know?",
  links: [{ text: 'Browse Jobs', href: '/jobs' }, { text: 'Post a Job', href: '/post-job' }]
}

export function getKeywordResponse(message: string): KeywordResponse {
  const lowerMessage = message.toLowerCase()

  // SHORT KEYWORDS MATCH WHOLE WORDS ONLY. Substring matching made "ta" (in
  // the thanks entry) match "contact", so "How do I contact support?" — now a
  // suggested question — was answered "You're welcome!"; "hi" matched "this"
  // and "which" the same way. Three letters or fewer must be a word of its own.
  const hit = (keyword: string) =>
    keyword.length <= 3
      ? new RegExp(`(^|[^a-z])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(lowerMessage)
      : lowerMessage.includes(keyword)

  for (const pattern of responsePatterns) {
    if (pattern.keywords.some(hit)) {
      return { response: pattern.response, links: pattern.links }
    }
  }

  return defaultResponse
}
