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

import { EMPLOYER_SUBSCRIPTION_PRICE, TRIAL_MONTHS, trialPhraseFormal } from '@/lib/trialUtils'
import { BRAND_FULL } from '@/lib/constants/brand'

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
    response: `${BRAND_FULL} is the UK's recruitment platform connecting employers across all industries with qualified professionals.\n\n**For Job Seekers:** Completely free! Create your profile, upload your CV, browse jobs, and apply directly.\n\n**For Employers:** Post jobs, browse candidate profiles, schedule interviews, send offers, and track your hiring pipeline. Start with a ${trialPhraseFormal()}, then £${EMPLOYER_SUBSCRIPTION_PRICE}/month.`,
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
    response: `There are two ways to join Thrive:\n\n**Job Seekers:** Create a free profile — browse jobs, upload your CV, and apply directly. No cost, ever.\n\n**Employers:** Subscribe to a plan to post jobs and access candidate profiles. Start with a ${trialPhraseFormal()}!`,
    links: [{ text: 'I\'m a Job Seeker', href: '/register/employee' }, { text: 'I\'m an Employer', href: '/subscribe' }]
  },
  {
    keywords: ['log in', 'login', 'sign in', 'forgot password', 'reset password', 'can\'t log in'],
    response: "You can log in from the top-right of the site. If you've forgotten your password, click \"Forgot Password\" on the login page and we'll send you a reset link via email.",
    links: [{ text: 'Log In', href: '/login' }]
  },

  // ── PRICING & SUBSCRIPTION ──
  {
    keywords: ['cost', 'price', 'pay', 'how much', 'pricing', 'fee', 'charge', 'subscription', 'plan'],
    response: `Great question! Thrive offers a **${TRIAL_MONTHS}-month FREE trial**, then just **£${EMPLOYER_SUBSCRIPTION_PRICE}/month**.\n\nYour plan includes:\n• Unlimited job listings\n• Browse and contact candidates\n• Direct messaging & interview scheduling\n• Full analytics dashboard\n• Dedicated account support\n\nCancel anytime. No hidden fees.`,
    links: [{ text: 'View Plans', href: '/subscribe' }]
  },
  {
    keywords: ['free trial', 'trial', '3 month', 'three month', 'try free'],
    response: `Yes! You get ${TRIAL_MONTHS} months completely FREE when you sign up as an employer. During your trial you get full access to:\n• Unlimited job listings\n• Browse all candidate profiles\n• Send and receive messages\n• Schedule interviews\n• Send job offers\n\nNo charges until your trial ends. Cancel anytime with 14 days' notice.`,
    links: [{ text: 'Start Free Trial', href: '/subscribe' }]
  },
  {
    keywords: ['standard plan', 'basic plan', 'starter plan', 'professional plan', 'pro plan', 'premium plan', 'unlimited', 'which plan', 'what plan', 'tier', 'tiers'],
    response: `Thrive has **one plan: £${EMPLOYER_SUBSCRIPTION_PRICE}/month** — no tiers, no upsell. It includes:\n• Unlimited job listings\n• Browse and contact candidates\n• Direct messaging & interview scheduling\n• Full analytics dashboard\n• Dedicated account support\n\nStart with a ${trialPhraseFormal()} — cancel anytime with 14 days' notice.`,
    links: [{ text: 'Subscribe', href: '/subscribe' }]
  },
  {
    keywords: ['cancel', 'unsubscribe', 'stop subscription', 'end subscription'],
    response: "You can cancel your subscription from your Settings page with 14 days' notice. If you cancel during your free trial, you won't be charged at all. Your access continues until the end of the notice period.",
    links: [{ text: 'Settings', href: '/settings' }]
  },
  {
    keywords: ['upgrade', 'change plan', 'switch plan', 'downgrade'],
    response: `Thrive has a single plan at £${EMPLOYER_SUBSCRIPTION_PRICE}/month — there are no tiers to upgrade or downgrade between. Everything's included. If you've cancelled and want to resubscribe, you can do that from your Settings page.`,
    links: [{ text: 'Settings', href: '/settings' }]
  },

  // ── EMPLOYER: POSTING JOBS ──
  {
    keywords: ['post job', 'post a job', 'add job', 'create job', 'new job', 'advertise', 'list job', 'job listing'],
    response: "To post a job on Thrive:\n1. Subscribe to a plan (or start a free trial)\n2. Click \"Post Job\" in the sidebar\n3. Fill in the job details: title, description, salary, location, job type, and category\n4. Publish and your job is live!\n\nYour listing will be visible to thousands of candidates across the UK.",
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
    response: "You can delete a job listing from the \"Manage Job Ads\" page. Click the \"Delete\" button on the job card. Please note that deleting a job will also remove all associated applications."
  },

  // ── EMPLOYER: BROWSING CANDIDATES ──
  {
    keywords: ['find candidate', 'browse candidate', 'search candidate', 'view candidate', 'candidate profile', 'talent pool'],
    response: "As an employer with an active subscription, you can browse our full database of candidates!\n\n• View detailed profiles with skills, experience, and qualifications\n• Download candidate CVs\n• See their availability status\n• Send messages directly to candidates you're interested in\n\nUse filters to narrow by skills, location, and more.",
    links: [{ text: 'Browse Candidates', href: '/candidates' }]
  },

  // ── EMPLOYER: MY CANDIDATES (HIRING PIPELINE) ──
  {
    keywords: ['my candidate', 'my jobs', 'application', 'applicant', 'pipeline', 'hiring pipeline', 'manage candidate'],
    response: "The \"Manage Job Ads\" page is your central hiring dashboard! It shows all your job listings and their applicants. You can:\n\n• View all candidates who applied to your jobs\n• Review their profiles and CVs\n• Move candidates through stages: Reviewing, Interviewing, Offers, Hired\n• Filter by status to focus on what needs attention\n\nUse the sidebar links to quickly jump to Interviews, Offers, or Hired views.",
    links: [{ text: 'Manage Job Ads', href: '/my-jobs' }]
  },

  // ── EMPLOYER: INTERVIEWS ──
  {
    keywords: ['interview', 'schedule interview', 'interview date', 'interview time', 'calendar', 'book interview'],
    response: "Thrive makes interview scheduling easy!\n\n• Schedule interviews directly from a candidate's application\n• Set the date, time, duration, and interview type (in-person, video, or phone)\n• Add a location or video call link\n• Interviews sync with Google Calendar automatically\n• Track all upcoming interviews from the \"Interviews\" tab in the sidebar\n\nThe Interviews view shows today's, this week's, pending confirmation, and completed interviews.",
    links: [{ text: 'View Interviews', href: '/my-jobs?filter=interviewing' }]
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
    response: `The Analytics dashboard gives you insights into your recruitment performance:\n\n• Job posting views and application rates\n• Candidate pipeline breakdown\n• Hiring funnel conversion rates\n• Trend charts over time\n• Top-performing job listings\n\nThe analytics dashboard is included in your plan (£${EMPLOYER_SUBSCRIPTION_PRICE}/month after ${trialPhraseFormal()}).`,
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
    response: "You can upload your CV when creating or editing your candidate profile. Employers can view and download it when considering you for positions.\n\n• PDF format is recommended\n• Keep it up to date with your latest experience\n• A strong CV increases your chances of getting noticed\n\nYou can update your CV at any time from your profile settings.",
    links: [{ text: 'Create Profile', href: '/register/employee' }]
  },
  {
    keywords: ['availability', 'available', 'status', 'looking for work', 'open to work'],
    response: "Candidates can set their availability status on their profile to let employers know if they're:\n\n• Actively looking for work\n• Open to offers\n• Not currently available\n\nKeeping your status up to date helps employers know when to reach out."
  },

  // ── CANDIDATE: BROWSING & APPLYING ──
  {
    keywords: ['job seeker', 'find job', 'apply', 'get hired', 'search job', 'browse job', 'look for job'],
    response: "Job seekers can use Thrive completely FREE!\n\n• Browse hundreds of jobs across all UK sectors\n• Filter by location, category, salary, and job type\n• Apply with one click using your profile and CV\n• Track your applications and their status\n• Receive messages from interested employers\n\nCreate your free profile to get started!",
    links: [{ text: 'Browse Jobs', href: '/jobs' }, { text: 'Create Profile', href: '/register/employee' }]
  },
  {
    keywords: ['track application', 'application status', 'my application', 'where is my application'],
    response: "You can track all your job applications from your dashboard. Each application shows its current status:\n\n• **Pending** — Submitted, awaiting employer review\n• **Reviewing** — Employer is reviewing your profile\n• **Interviewing** — You've been invited for an interview\n• **Offer** — You've received a job offer\n• **Accepted** — Congratulations, you're hired!\n\nYou'll receive notifications when your application status changes."
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
  response: "I'm here to help! You can ask me about:\n\n**For Employers:**\n• Posting jobs & pricing\n• Browsing candidates\n• Interviews, offers & hiring\n• Analytics dashboard\n\n**For Job Seekers:**\n• Creating a free profile\n• Browsing & applying for jobs\n• Tracking applications\n\nWhat would you like to know?",
  links: [{ text: 'Browse Jobs', href: '/jobs' }, { text: 'Post a Job', href: '/post-job' }]
}

export function getKeywordResponse(message: string): KeywordResponse {
  const lowerMessage = message.toLowerCase()

  for (const pattern of responsePatterns) {
    if (pattern.keywords.some(keyword => lowerMessage.includes(keyword))) {
      return { response: pattern.response, links: pattern.links }
    }
  }

  return defaultResponse
}
