// WHICH SECTOR IS THIS JOB IN?
//
// Lifted out of app/jobs/page.tsx on 23 Aug 2026, where it was a module-local
// const with exactly one caller — and where lib/candidatePrefs.ts could not
// reach it, so the preference resolver tested `job.category` while the board
// tested this. Two predicates for one question, which is the fault this whole
// week has been about. One function now, used by both.
//
// THE ORDER OF THE CHECKS IS LOAD-BEARING. Hospitality keywords are tested
// first, because a "Chef de Partie" in a category nobody set is still a
// hospitality job. The category column is second. The title-keyword rules for
// other sectors are last, and the default is 'business' — which is where the
// sixteen were going.

import { categories } from './categories'

/** Every canonical category id. Derived, so this list cannot fall behind. */
const CATEGORY_IDS: string[] = categories.map(c => c.id)

export const getJobSector = (job: { title: string; category?: string }): string => {
  const titleLower = job.title.toLowerCase()
  const catLower = (job.category || '').toLowerCase()

  // Hospitality Tourism & Sport
  if (['restaurant', 'hotel', 'cafe', 'contract catering', 'events', 'chef', 'waiter', 'bar', 'kitchen', 'barista', 'fastfood'].some(k => catLower.includes(k)))
    return 'hospitality'
  if (['chef', 'cook', 'waiter', 'waitress', 'bartender', 'bar ', 'barista', 'kitchen porter', 'porter', 'housekeeper', 'concierge', 'hotel', 'event', 'banquet', 'catering', 'sushi', 'server', 'host', 'coffee', 'restaurant', 'sommelier'].some(k => titleLower.includes(k)))
    return 'hospitality'

  // Direct sector category match (for jobs posted with sector categories)
  // DERIVED, NOT TYPED OUT. This was a hand-written subset of 19 and the
  // canonical list in lib/categories.ts has 33 — so fourteen sectors, INCLUDING
  // 'hospitality', could never be matched on the category column at all. Every
  // one of the 251 live adverts carries category='hospitality', and sixteen of
  // them had titles with no hospitality keyword, so they fell through to the
  // 'business' default and vanished from the only sector on the board.
  //
  // A SEVENTH COPY OF A VOCABULARY. Same fault as the six work-TYPE lists and
  // the two work-LOCATION ones: a list written out by hand beside the list it
  // was supposed to be.
  const sectorIds = CATEGORY_IDS
  if (sectorIds.includes(catLower)) return catLower

  // Management roles
  if (['manager', 'head', 'supervisor', 'director', 'consultant'].some(k => titleLower.includes(k)))
    return 'business'

  // Healthcare
  if (['nurse', 'doctor', 'care', 'health', 'medical', 'pharmacy', 'dental'].some(k => titleLower.includes(k)))
    return 'healthcare'

  // Digital & IT
  if (['developer', 'software', 'engineer', 'data', 'analyst', 'devops', 'cloud', 'cyber', 'tech'].some(k => titleLower.includes(k)))
    return 'digital'

  // Retail & Sales
  if (['sales', 'retail', 'shop', 'store', 'cashier', 'merchandis'].some(k => titleLower.includes(k)))
    return 'retail'

  // Teaching & Education
  if (['teacher', 'tutor', 'lecturer', 'education', 'training'].some(k => titleLower.includes(k)))
    return 'teaching'

  // Marketing
  if (['marketing', 'advertising', 'pr ', 'social media', 'content', 'brand'].some(k => titleLower.includes(k)))
    return 'marketing'

  // Transport & Logistics
  if (['driver', 'delivery', 'logistics', 'warehouse', 'transport'].some(k => titleLower.includes(k)))
    return 'transport'

  // Property & Construction
  if (['builder', 'plumber', 'electrician', 'construction', 'property', 'estate agent'].some(k => titleLower.includes(k)))
    return 'property'

  // Accountancy Banking & Finance
  if (['accountant', 'finance', 'banking', 'audit', 'tax', 'bookkeep'].some(k => titleLower.includes(k)))
    return 'accountancy'

  // Engineering & Manufacturing
  if (['mechanical', 'manufacturing', 'production', 'factory', 'cnc'].some(k => titleLower.includes(k)))
    return 'engineering'

  // Charity & Voluntary
  if (['charity', 'fundrais', 'volunteer', 'nonprofit', 'ngo'].some(k => titleLower.includes(k)))
    return 'charity'

  // Creative Arts & Design
  if (['designer', 'artist', 'creative', 'photographer', 'illustrat', 'animator'].some(k => titleLower.includes(k)))
    return 'creative'

  // Energy & Utilities
  if (['energy', 'solar', 'wind', 'oil', 'gas', 'renewable', 'utilities'].some(k => titleLower.includes(k)))
    return 'energy'

  // Environment & Agriculture
  if (['environment', 'sustainab', 'ecology', 'conservation', 'agricult', 'farm'].some(k => titleLower.includes(k)))
    return 'environment'

  // Law & Legal
  if (['lawyer', 'solicitor', 'legal', 'barrister', 'paralegal'].some(k => titleLower.includes(k)))
    return 'law'

  // Media & Publishing
  if (['journalist', 'editor', 'broadcast', 'media', 'publish', 'reporter'].some(k => titleLower.includes(k)))
    return 'media'

  // Public Sector & Government
  if (['civil servant', 'council', 'government', 'public sector', 'policy'].some(k => titleLower.includes(k)))
    return 'public'

  // Recruitment & HR
  if (['recruit', 'talent acquisition', 'hiring', 'staffing', 'human resources', 'hr '].some(k => titleLower.includes(k)))
    return 'recruitment'

  // Science & Research
  if (['scientist', 'research', 'laboratory', 'lab tech', 'biolog', 'chemist', 'physicist'].some(k => titleLower.includes(k)))
    return 'science'

  // Default to business for unrecognised titles
  return 'business'
}
