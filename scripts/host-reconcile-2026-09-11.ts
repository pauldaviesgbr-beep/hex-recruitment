// THE HOST STAFFING RECONCILE OF 11 SEPTEMBER 2026.
//
// Host do not permit scraping, so this is the 11 Sept Caterer capture read
// against the board by hand. Adrian confirmed on 11 Sept that Caterer is the
// most up to date of all his surfaces, so where the board and Caterer disagree,
// CATERER WINS. See docs/host-refresh-note.md for the procedure and for the
// salary and area conventions this applies.
//
//     10 archives   dead on Caterer
//     11 inserts    new on Caterer, all to the JOB BOARD
//      3 updates    work_authorization, via RIGHT_TO_WORK_VALUE
//      2 updates    salary corrected to the base/package convention
//
// IT REFUSES TO GUESS WHETHER TO WRITE. --dry-run or --apply, explicitly, or it
// exits 2. There is no default, because the default would be a loaded gun
// pointing at 26 rows of a real employer's live adverts.
//
// EVERY ARCHIVE IS KEYED ON AN EXPLICIT UUID **AND** company = 'Host Staffing'
// AND status = 'active'. The id list alone would be enough; the other two
// conditions make the wrong target impossible rather than merely unlikely.
//
// EVERY PHASE COUNTS BEFORE IT WRITES AND READS BACK AFTER. "0 remain" passes
// whether or not the row ever existed, so it is never used as evidence.
//
//   npx tsx scripts/host-reconcile-2026-09-11.ts --dry-run
//   npx tsx scripts/host-reconcile-2026-09-11.ts --apply

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { RIGHT_TO_WORK_VALUE } from '../lib/rightToWork'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const APPLY = args.has('--apply')
// --emit-sql writes the INSERT statements to a file and touches nothing. It
// exists so the advert text has exactly ONE home: retyping 11 long adverts into
// SQL by hand is how a transcription error reaches a real employer's board.
const EMIT = args.has('--emit-sql')
if (!EMIT && DRY === APPLY) {
  console.error('Pass exactly one of --dry-run or --apply. There is no default: this writes 26 rows of a real employer.')
  process.exit(2)
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const EMPLOYER_ID = '53d6d318-9c2e-43f1-a5a0-5178bf9a3b18'
const COMPANY = 'Host Staffing'
const BANNERS = 'https://aaljufxcniacfggqiuls.supabase.co/storage/v1/object/public/job-banners/host-staffing/'
const LOGO = BANNERS + 'logo-icon.png'

const fails: string[] = []
const check = (ok: boolean, label: string) => { if (!ok) fails.push(label); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`) }

// ───────────────────────────────────────────────────────────────────────────
// THE TEN THAT ARE DEAD ON CATERER.
// ───────────────────────────────────────────────────────────────────────────
const ARCHIVE: { id: string; title: string; why: string }[] = [
  { id: 'f4b9814e-1c66-4bab-a773-a56eed5094bb', title: 'Agency Chef – Mon to Fri', why: 'SUPERSEDED by 871b3f3c, same title, newer rates' },
  { id: 'fd7e3639-a072-4e07-bcf9-aab1028b70a4', title: 'Head Chef – Event Catering (Agency)', why: 'not in the capture' },
  { id: 'b252834d-bc3a-4ff2-bb48-bc8ebbbeb8d5', title: 'Agency Chef de Partie – Mon to Fri, Events', why: 'not in the capture' },
  { id: '999fbc32-e88d-4e80-a37d-25d688aaeb84', title: 'Sous Chef – Italian Pasta Concept (Bib Gourmand)', why: 'not in the capture' },
  { id: 'a0fcd981-7df3-46cb-86dc-9bdf680dd3fb', title: 'Sous Chef / Senior Sous Chef – Culinary Innovation Studio', why: 'not in the capture' },
  { id: 'e970c793-6b33-4bd0-b363-2b94a7885311', title: 'Sous Chef – Prestigious Private Golf Club', why: 'not in the capture' },
  { id: '64eeee0f-9ebc-41b7-a758-6efd6f402f71', title: 'Bar Manager – Country Gastro Pub', why: 'not in the capture' },
  { id: '25862063-9bba-4e36-b259-299b898746f5', title: 'Chef de Partie – Private Members Club', why: 'not in the capture' },
  { id: 'f99cc1be-15eb-4c04-b9ef-79b556c1bcbc', title: 'Front of House Supervisor – Premium Country Pub', why: 'not in the capture' },
  { id: '4a6a83d6-9534-447b-ac46-3993f160d6a8', title: 'Assistant Manager – Country Gastro Pub', why: 'Thatcham cluster, distinct from the Hungerford advert' },
]

// ───────────────────────────────────────────────────────────────────────────
// THE ELEVEN NEW ADVERTS.
//
// work_authorization is RIGHT_TO_WORK_VALUE(false) on every one of them —
// which is [] — because NOT ONE of the eleven states it, including the agency
// role. Read from each advert's own Licences section, never inferred.
//
// salaryCase records which rule of the note produced the figures, so the
// read-back can be checked against the reasoning rather than against a number
// somebody typed.
// ───────────────────────────────────────────────────────────────────────────
type NewAd = {
  ref: string; capture: string; salaryCase: string
  title: string; location: string; area: string; areaCounty: string
  postcode: string | null; city: string
  salaryMin: number; salaryMax: number; salaryType: 'annual' | 'hourly'
  employmentType: string[]; banner: string
  description: string; fullDescription: string
}

const INSERT: NewAd[] = [
  {
    ref: 'HS-042', capture: '01+02', salaryCase: 'A — no bare base; both ends include tronc',
    title: 'Sales & Events Manager – Central London',
    location: 'St James', area: 'Greater London', areaCounty: 'greater-london',
    postcode: 'SW1', city: 'London',
    salaryMin: 42000, salaryMax: 50000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'canapes-wine.jpg',
    description: 'A commercially driven events sales role in a prestigious Central London venue, with uncapped commission.',
    fullDescription: [
      'This is a sales role first. Host Staffing are recruiting a commercially driven Sales & Events Manager who can do more than manage enquiries — someone who can create them.',
      '',
      'You will take ownership of the events sales pipeline, generating new business, converting opportunities and growing revenue across corporate events, group dining, private dining and exclusive hire. With at least 50% of your time focused on proactive outbound sales and business development, this is a genuine opportunity to build your own network across London\'s corporate and events community and make a measurable impact on commercial performance.',
      '',
      'THE ROLE',
      'You will be responsible for driving new business, developing relationships and maximising every events opportunity from initial enquiry through to confirmed booking and beyond.',
      '',
      'NEW BUSINESS AND BUSINESS DEVELOPMENT',
      'Proactively target London\'s corporate market, event agencies, PAs, EAs, hotels, concierge companies and key business partners. Generate new business through outbound calls, LinkedIn, networking, introductions, meetings and relationship building. Identify and develop new corporate and agency accounts. Build and maintain a strong database of commercial contacts. Create long-term relationships that generate repeat and referral business.',
      '',
      'OWN THE SALES PIPELINE',
      'Manage the complete sales journey from initial enquiry through to confirmed event. Proactively follow up leads and maximise conversion. Maintain an accurate sales pipeline and monthly revenue forecast. Track enquiries, conversion rates, lost business and reasons for lost business. Work towards agreed monthly and annual sales targets.',
      '',
      'SELL AND MAXIMISE EVENTS',
      'You will sell a broad range of experiences, including private dining, group dining, corporate entertaining, business lunches and dinners, drinks and networking events, celebrations and special occasions, Christmas and seasonal events, full venue exclusive hire, and brand activations and partnerships.',
      '',
      'GROW QUIETER TRADING PERIODS',
      'A key part of the role will be identifying opportunities to generate additional revenue during quieter periods — midweek events, corporate lunches and dinners, business meetings and entertaining, seasonal occasions, Christmas parties, last-minute opportunities, off-peak private hire and corporate group bookings.',
      '',
      'WHAT SUCCESS LOOKS LIKE',
      'Within your first six months you will be expected to build a strong pipeline of new B2B and B2C opportunities, establish relationships with key corporate clients, agencies, PAs/EAs, hotels and concierge partners, generate measurable new business revenue, increase event bookings during quieter trading periods, improve enquiry-to-booking conversion, increase average event spend through effective upselling, build a network that generates repeat and referral business, and become a key commercial driver of the events business.',
      '',
      'WHO WE ARE LOOKING FOR',
      'Commercially hungry and motivated by targets and earning potential. Experienced in hospitality, events, venues, hotels or a similar sales environment. Confident generating new business rather than simply managing inbound enquiries. A natural networker who enjoys opening doors and building relationships. A strong communicator and confident negotiator. Organised, proactive and comfortable owning a sales pipeline. Confident dealing with senior corporate clients and decision-makers. Comfortable making outbound calls, targeted outreach and attending networking events. Passionate about hospitality and creating memorable client experiences. Results-driven, with a proven track record of delivering sales.',
      '',
      'An existing network of corporate clients, event agencies, PAs/EAs, hotels or concierge partners would be a strong advantage, but it is not essential for the right commercially minded candidate.',
      '',
      'PACKAGE AND EARNING POTENTIAL',
      '£42,000 including estimated tronc, plus uncapped commission — OTE circa £50,000 with uncapped commission. Commission structure: 1% on inbound conversion, 3% on outbound-generated business. Based on a target of £50,000 net event and group sales per month, this role offers genuine uncapped earning potential for someone who can build and convert their own business.',
      '',
      'Both figures above include estimated tronc; the advert does not state a separate basic salary.',
      '',
      'Listed on Caterer as "Sales & Marketing Manager"; the advert body titles the role "Sales & Events Manager", which is what the responsibilities describe.',
    ].join('\n'),
  },
  {
    ref: 'HS-043', capture: '03', salaryCase: 'A — no base; OTE range includes service',
    title: 'Head Chef – Cotswolds, Recently Reopened Premium Country Pub',
    location: 'Cirencester', area: 'Gloucestershire', areaCounty: 'gloucestershire',
    postcode: 'GL7', city: 'Cirencester',
    salaryMin: 55000, salaryMax: 60000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'country-pub-fireside.jpg',
    description: 'Full ownership of the kitchen at a beautiful, recently reopened premium country pub in the Cotswolds.',
    fullDescription: [
      'Host Staffing are recruiting an ambitious and hands-on Head Chef for a beautiful, recently reopened country pub in the Cotswolds. Following a major investment and reopening, this is a fantastic opportunity for a chef to take ownership of the kitchen, develop the food identity and build on the foundations already in place.',
      '',
      'The food is modern British country pub cooking, centred around seasonal and locally sourced produce, comforting classics and lighter seasonal dishes, with fire cooking playing a key role through a Josper oven. Open from breakfast through to dinner, the operation moves from a relaxed daytime café feel into a premium pub and dining offer, all within a beautifully restored setting with exceptional views.',
      '',
      'THE ROLE',
      'You will take full ownership of the kitchen, leading a team of around 8–12 chefs and ensuring consistently high standards across food, service and kitchen operations. This is a hands-on leadership role for someone who enjoys being on the pass, developing chefs and creating a calm, organised and ego-free kitchen environment.',
      '',
      'YOU WILL BE RESPONSIBLE FOR',
      'Leading, training and developing the kitchen team. Developing seasonal menus and daily specials. Driving a strong fire-cooking offer. Maintaining excellent food quality and consistency. Managing GP, labour, stock and kitchen P&L. Developing efficient prep, ordering and service systems. Maintaining food safety, HACCP and compliance standards. Working closely with the GM to drive the overall success of the business.',
      '',
      'ABOUT YOU',
      'We are looking for a Head Chef, or a strong Senior Sous Chef ready to step up, with experience in premium pubs, high-end casual dining or a similar quality-led environment.',
      '',
      'YOU WILL IDEALLY BE',
      'Creative and ingredient-led, with a passion for seasonal cooking. Commercially aware and confident with GP and menu costing. An experienced team builder who leads by example. Calm, organised and professional under pressure. Hands-on and happy to work any section where required. Passionate about fire cooking and quality produce. Comfortable managing a busy kitchen and high-volume service. Ambitious and interested in growing with the group.',
      '',
      'THE OPPORTUNITY',
      'This is an exciting opportunity to join at an important stage of the site\'s development and put your own stamp on the kitchen as it establishes itself following its reopening. You will have genuine creative input, ownership of the kitchen and the opportunity to develop the team and food offer. As the group grows, there is also a clear pathway towards multi-site responsibility.',
      '',
      'PACKAGE',
      'Competitive salary dependent on experience, with OTE including service of £55,000–£60,000. Performance-related bonus linked to GP, labour and guest satisfaction. Genuine creative input and autonomy. Career progression into multi-site leadership. Team meals, discounts and development opportunities. Recently reopened site with significant investment behind it.',
      '',
      'Both ends of the range above include service; the advert does not state a separate basic salary.',
    ].join('\n'),
  },
  {
    ref: 'HS-044', capture: '04+16', salaryCase: 'base 35,000–40,000 plus ~4,000 house tronc; advert headlines 44K',
    title: 'Assistant Manager – Premium Country Pub & Inn',
    location: 'Hungerford', area: 'Berkshire', areaCounty: 'berkshire',
    postcode: 'RG17', city: 'Hungerford',
    salaryMin: 35000, salaryMax: 44000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'country-pub-table.jpg',
    description: 'A key management role at a well-established, independently run country pub and inn in West Berkshire.',
    fullDescription: [
      'An exciting opportunity for an experienced hospitality professional. We are looking for an ambitious and hands-on Assistant Manager to join the team at a well-established, independently run country pub and inn in West Berkshire.',
      '',
      'This is a fantastic opportunity for an experienced Front of House Supervisor, Assistant Manager or Deputy Manager looking for their next step within a quality pub environment.',
      '',
      'Working closely with the Chef Patron, you will play a key role in leading the front of house team and ensuring the highest possible standards of service, hospitality and guest experience across the pub, restaurant and accommodation.',
      '',
      'The business combines a busy pub and restaurant operation with fine guest bedrooms, making this an ideal opportunity for someone with previous experience in a pub, gastro pub, restaurant or hotel environment. Experience overseeing or supporting guest accommodation would be highly beneficial.',
      '',
      'THE ROLE',
      'As Assistant Manager, you will be a key member of the management team and will take an active role in the day-to-day running of the front of house operation.',
      '',
      'YOU WILL',
      'Lead, motivate and develop the front of house team. Take responsibility for the smooth running of service and shifts. Work closely with the Chef Patron to maintain consistently high standards. Deliver warm, knowledgeable and professional hospitality to every guest. Support the management of the pub, restaurant and guest accommodation. Ensure bedrooms and guest areas are presented to a consistently high standard. Manage bookings, guest requests and customer feedback. Train and develop team members, helping to build a strong and engaged front of house team. Maintain excellent communication between front of house and the kitchen. Support stock control, ordering and other operational responsibilities. Help maximise sales while maintaining the quality of the guest experience. Lead by example and remain hands-on during busy services.',
      '',
      'ABOUT YOU',
      'We are looking for someone who genuinely enjoys hospitality and understands what it takes to deliver a great guest experience. You will ideally have experience within a quality pub, gastro pub, restaurant, hotel or similar hospitality operation and be ready to take greater responsibility for a front of house team.',
      '',
      'YOU WILL BE',
      'An experienced Front of House Supervisor, Assistant Manager or Deputy Manager. Confident leading and motivating a team. Naturally hands-on and happy to lead from the floor. Passionate about food, drink and excellent service. Commercially aware and comfortable taking ownership of a shift. Organised, reliable and a strong communicator. Someone who takes pride in standards and presentation. Comfortable working closely with a Chef Patron and kitchen team. Ideally experienced with guest bedrooms and accommodation, although this is not essential. Looking for a long-term opportunity where you can develop and grow with an independent business.',
      '',
      'Due to the rural location of the pub, candidates must have their own reliable transport.',
      '',
      'WHAT IS ON OFFER',
      '£35,000–£40,000 salary depending on experience, plus approximately £4,000 per year in house tronc. Work 48 hours per week, including evenings and weekends. Five days a week over seven days. A key leadership position within an established independent country pub and inn. Close working relationship with the Chef Patron. Responsibility for leading and developing the front of house team. Exposure to both pub and restaurant operations and guest accommodation. The opportunity to make a genuine impact on the business. A role with real scope for career development.',
      '',
      'THE OPPORTUNITY',
      'This is not simply a role for someone to run shifts. It is a genuine opportunity for someone who wants to take ownership, develop a team and become an integral part of the operation. If you are an experienced hospitality professional who is passionate about great service, enjoys the atmosphere of a quality country pub and is looking for a position where you can develop your management career, we would love to hear from you.',
      '',
      'The base salary is £35,000–£40,000 depending on experience; the upper figure shown includes approximately £4,000 of annual house tronc.',
    ].join('\n'),
  },
  {
    ref: 'HS-045', capture: '05', salaryCase: 'B — base range only; tronc of £500–£800 a month is in the text, not in the figures',
    title: 'Chef de Partie – 2 AA Rosette, Working Towards 3',
    location: 'Salisbury', area: 'Wiltshire', areaCounty: 'wiltshire',
    postcode: 'SP4', city: 'Salisbury',
    salaryMin: 34500, salaryMax: 38000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'plated-dish.jpg',
    description: 'A cross-kitchen Chef de Partie role at an ambitious 2 AA Rosette country pub and hospitality business in Wiltshire.',
    fullDescription: [
      'An exciting opportunity for an ambitious Chef de Partie. An established and highly regarded country pub and hospitality business in Wiltshire, which forms part of a local estate, is looking for an experienced and enthusiastic Chef de Partie to join the kitchen team.',
      '',
      'The business has a genuine focus on provenance, seasonality and quality produce. Being part of the estate provides the kitchen with access to an excellent range of ingredients, including estate-reared pork and lamb, locally sourced venison and plenty of seasonal game. The estate also has its own market garden, supplying seasonal produce to the kitchen and allowing the chefs to work closely with ingredients at their best throughout the year.',
      '',
      'The kitchen is currently working towards 3 AA Rosette level, with a strong focus on fresh, seasonal produce, quality ingredients and refined cooking. There is also an exciting development ahead, with the business planning to open a second restaurant next year, offering a dedicated tasting menu.',
      '',
      'The long-term ambition is to develop this into a destination restaurant with Michelin Star aspirations. This is an excellent opportunity for a Chef de Partie who wants to develop their skills and be part of a growing operation with genuine culinary ambitions.',
      '',
      'THE ROLE',
      'As Chef de Partie, you will work as part of a close-knit kitchen team, taking responsibility for your section and helping to deliver consistently high standards across the food offering. You will be working with fresh, seasonal and estate-sourced produce, including game, venison, pork, lamb and market-garden vegetables, giving you the opportunity to develop a broad range of skills and work with ingredients that change throughout the seasons. You will need to be confident working with fresh ingredients, maintaining high standards of preparation and presentation, and be comfortable working in a busy, quality-driven kitchen.',
      '',
      'WE ARE LOOKING FOR SOMEONE WHO IS',
      'An experienced Chef de Partie with a minimum of 1/2 AA Rosette-level experience. Experienced working with fresh food and quality ingredients. Passionate about seasonal cooking and provenance. Ideally interested in or experienced with game and estate produce. Confident running their own section. Organised, reliable and able to work well under pressure. A strong team player with a positive attitude. Ambitious and interested in progressing within a quality kitchen. Keen to be part of a business working towards 3 AA Rosette standards and beyond.',
      '',
      'WHY JOIN?',
      'This is more than simply a Chef de Partie position. Working within an estate environment, you will have the opportunity to work with genuinely seasonal produce and excellent provenance, including estate-reared animals, venison, game and vegetables from the market garden. With the business continuing to invest in its food offering and a new tasting-menu restaurant planned for next year, there is genuine opportunity to develop alongside the business. The successful candidate will have the opportunity to gain experience in a kitchen increasingly focused on refined, seasonal cooking, with ambitions to progress towards Michelin recognition.',
      '',
      'WHAT IS ON OFFER',
      '£34,500–£38,000 salary, depending on experience. £500–£800 per month in tronc, on top of salary. Four-day working week. Three days off every week, normally two consecutive days plus one additional day. Early finish on Sundays, usually around 5pm. Meals provided while on shift. 25% staff discount. 50% discount on hotel room rates. Opportunity to work with estate-reared pork, lamb and venison. Excellent exposure to seasonal game. Access to produce from an estate market garden. Opportunity to develop within a business working towards 3 AA Rosette level. Opportunity to be involved in the development of a new tasting-menu restaurant. Genuine long-term career development for an ambitious chef.',
      '',
      'WORKING PATTERN',
      'The normal working pattern is four days per week, approximately 9am–10pm, with three days off each week. This is typically structured as two consecutive days off plus one additional day. Sunday is an earlier finish, with the kitchen team usually finishing at around 5pm.',
      '',
      'IMPORTANT',
      'No staff accommodation is available, so candidates must have their own reliable transport and be able to commute to and from the property.',
      '',
      'The salary figures above are the basic salary only. Tronc of £500–£800 per month is paid on top and is not included in the range, because the advert does not state a combined total.',
    ].join('\n'),
  },
  {
    ref: 'HS-046', capture: '06', salaryCase: 'base 33,000, advert headlines £37,000 including tronc',
    title: 'Restaurant Supervisor – Central London',
    location: 'Central London', area: 'Greater London', areaCounty: 'greater-london',
    postcode: null, city: 'London',
    salaryMin: 33000, salaryMax: 37000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'wine-pour.jpg',
    description: 'A straight-shift Restaurant Supervisor role in a prestigious casual fine dining restaurant in the heart of Central London.',
    fullDescription: [
      'Host Staffing is delighted to be recruiting for an experienced Restaurant Supervisor to join a prestigious casual fine dining restaurant in the heart of Central London.',
      '',
      'This is an excellent opportunity for a confident restaurant supervisor who enjoys being hands-on, leading from the front and delivering consistently high standards of service within a quality hospitality environment.',
      '',
      'THE ROLE',
      'As Restaurant Supervisor, you will be an important part of the front of house team, supporting the management team and taking responsibility for the smooth running of service.',
      '',
      'YOU WILL',
      'Lead and motivate the front of house team during service. Ensure consistently high standards of guest service. Take responsibility for the smooth running of breakfast or dinner service. Support training and development of team members. Deal confidently with guest queries and resolve issues professionally. Maintain excellent operational, health and safety standards. Support stock control and ensure the restaurant is well presented and organised. Act as a positive role model and lead by example.',
      '',
      'SHIFT PATTERN',
      'This is a straight-shift role, working five shifts per week, covering either breakfast or dinner. Breakfast is 7am–4pm. Dinner is 3pm–close, typically 11pm. There are occasional mid-shifts of 10am–8pm. The role is based on a 40-hour week, with overtime paid pro rata.',
      '',
      'THE IDEAL CANDIDATE',
      'We are looking for an experienced restaurant professional who has previous supervisory experience within a quality or high-end restaurant, is confident leading a team during busy services, has a genuine passion for hospitality and guest experience, has excellent communication and leadership skills, can remain calm and organised under pressure, has strong attention to detail and a proactive approach, and has a good understanding of restaurant operations. A solid bar background and experience with stock management would be an advantage.',
      '',
      'PACKAGE',
      '£33,000 basic salary. Approximately £300–£400 per month in tronc. 40-hour working week. Overtime paid pro rata. 33 days holiday. Company pension. Food on shift. Excellent career development opportunities.',
      '',
      'The basic salary is £33,000; the upper figure is the £37,000 including tronc that the advert headlines.',
    ].join('\n'),
  },
  {
    ref: 'HS-047', capture: '07', salaryCase: 'base £18.74/hr, advert headlines £21.00/hr including holiday pay; service charge on top is unquantified',
    title: 'Sous Chef – Agency',
    location: 'Mayfair', area: 'Greater London', areaCounty: 'greater-london',
    postcode: 'W1C', city: 'London',
    salaryMin: 18.74, salaryMax: 21.00, salaryType: 'hourly',
    employmentType: ['Flexible', 'Temporary'], banner: 'kitchen-pass.jpg',
    description: 'Regular casual agency work as a Junior Sous or Sous Chef at a prestigious five-star hotel in Central London.',
    fullDescription: [
      'We are currently recruiting Junior Sous and Sous Chefs for regular casual work at a prestigious five-star hotel in Central London, with opportunities available from September through to December.',
      '',
      'We are looking for experienced chefs who can confidently manage a section, oversee service and maintain mise en place and cooking standards within a 2–3 AA Rosette environment.',
      '',
      'There are opportunities available across both Main Kitchen and Pastry.',
      '',
      'JUNIOR / SOUS CHEF – MAIN KITCHEN',
      'You should have strong experience across the key sections, including sauces, fish, meat and garnish, à la carte service, high-volume fine-dining service, section management and supervision, and strong mise en place and organisational skills. Candidates must have experience working to a minimum of 2 AA Rosette standards and be confident cooking and leading a section during busy services.',
      '',
      'JUNIOR / SOUS CHEF – PASTRY',
      'We are also seeking Junior Sous Chefs with a strong pastry background. Ideal candidates will have à la carte pastry experience, strong preparation and mise en place skills, experience working to a minimum of 2 AA Rosette standards, previous experience within a five-star hotel or fine-dining environment, and the ability to manage a section and maintain consistently high standards.',
      '',
      'HOURS AND SHIFT PATTERN',
      'A minimum of 40 hours per week. The hotel operates seven days a week, so candidates must be available for a combination of day, evening and weekend shifts. Typical shifts are 10:00am–6:30pm, 11:00am–11:00pm, 12:00pm–9:30pm, 12:00pm–11:00pm, 2:30pm–11:00pm and 3:00pm–11:00pm.',
      '',
      'Please note: this role is not suitable for candidates seeking Monday to Friday work only. Weekend and evening availability is essential.',
      '',
      'PAY AND BENEFITS',
      '£21.00 per hour. £18.74 basic hourly rate plus £2.26 holiday pay. Additional monthly service charge or tronc for every hour worked. Regular work available from September through to December.',
      '',
      'CANDIDATE REQUIREMENTS',
      'We are looking for chefs who can demonstrate a minimum of 2 AA Rosette experience, Junior Sous Chef or strong Senior Chef de Partie-level experience, the ability to manage a section independently, experience overseeing busy service, excellent mise en place and organisational skills, strong cooking ability, a professional approach and high standards, availability for evenings and weekends, and experience within fine dining, luxury hotels or high-end restaurants.',
      '',
      'All candidates will be required to complete a paid trial or test in a busy fine-dining environment to a minimum of 2 AA Rosette standard.',
      '',
      'If you are interested in this role, please apply now. We can arrange a call, and if it works for you, we will schedule an in-person meeting.',
      '',
      'The lower figure is the basic hourly rate; the upper figure is the £21.00 per hour including holiday pay that the advert headlines. Service charge or tronc is paid on top of both and is not quantified in the advert.',
    ].join('\n'),
  },
  {
    ref: 'HS-048', capture: '08', salaryCase: 'straight salary, no uplift of any kind',
    title: 'Plant-Based Chef de Partie – Monday to Friday',
    location: 'Hackney', area: 'Greater London', areaCounty: 'greater-london',
    postcode: 'E9', city: 'London',
    salaryMin: 35000, salaryMax: 38000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'two-chefs-prep.jpg',
    description: 'A Monday to Friday Chef de Partie role in a unique, health-focused kitchen environment in East London.',
    fullDescription: [
      'Host Staffing are delighted to be recruiting for an experienced Chef de Partie to join a unique, health-focused kitchen environment in London.',
      '',
      'This is a great opportunity for a chef who is passionate about fresh, natural and plant-based food, and wants to work in an environment where food, nutrition and wellbeing are genuinely at the heart of what they do.',
      '',
      'You will be working with high-quality organic ingredients, preparing nutritious meals and snacks for children and staff, with the food programme developed around nutrition and the positive impact food can have on health and development.',
      '',
      'THE ROLE',
      'As Chef de Partie, you will be an important part of the kitchen team, responsible for preparing fresh meals and snacks to a consistently high standard. You will also support the day-to-day running of the kitchen, including deliveries, food storage and rotation, and maintaining excellent hygiene standards and ensuring the kitchen is always clean and organised.',
      '',
      'WE ARE LOOKING FOR',
      'Two to three years of professional kitchen experience. A genuine passion for fresh, plant-based food. Experience working in a fast-paced kitchen. Excellent attention to detail and pride in your work. Strong organisation and time-management skills. A positive, reliable and enthusiastic team player. High standards of food hygiene and cleanliness. Someone who remains calm and organised under pressure.',
      '',
      'WHY CONSIDER IT?',
      'This is a fantastic opportunity for a Chef de Partie looking for something different from a traditional restaurant environment — working with quality ingredients and producing food that has a genuine focus on nutrition and wellbeing. If you are passionate about plant-based cooking, take pride in what you produce and are looking for a positive working environment, we would love to hear from you.',
      '',
      'Apply now for a confidential conversation with Host Staffing.',
    ].join('\n'),
  },
  {
    ref: 'HS-049', capture: '09', salaryCase: 'C — uplift is OVERTIME, not tronc; base at both ends',
    title: 'Chef de Partie – Events & Conferencing',
    location: 'Westminster', area: 'Greater London', areaCounty: 'greater-london',
    postcode: 'SW1', city: 'London',
    salaryMin: 33418, salaryMax: 33418, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'chef-plating.jpg',
    description: 'A predominantly Monday to Friday Chef de Partie role with a highly regarded events and hospitality team in Central London.',
    fullDescription: [
      'We are looking for a talented and ambitious Chef de Partie to join a highly regarded events and hospitality team in Central London.',
      '',
      'This is a fantastic opportunity for a chef who enjoys working with high-quality ingredients and wants to develop their skills across a varied range of conferencing, banqueting and fine dining events.',
      '',
      'THE ROLE',
      'You will be working as part of a brigade of nine chefs, producing a wide variety of food for events ranging from canapés and bowl food through to seated fine dining dinners for up to 300 guests. The role offers excellent variety, with plenty of opportunity to develop your skills and progress within the wider business.',
      '',
      'HOURS AND PAY',
      'Basic salary: £33,418 per annum. Contracted to 40 hours per week. Standard rate: £16.06 per hour. Overtime Monday to Friday: £20.07 per hour. Weekend overtime: £32.12 per hour. Typical earnings based on 48 hours per week: £41,767 per annum. OTE of up to £42,923 when you include the weekend work.',
      '',
      'The majority of shifts are worked Monday to Friday, with approximately one Saturday in four required. The earliest start time is 7:30am, with the latest usual finish at 10pm. In the unlikely event of a very late finish after 11:30pm, a taxi home will be provided.',
      '',
      'BENEFITS',
      '36 days annual leave, including bank holidays. Christmas shutdown period. Annual £100 wellbeing allowance. Up to 8% pension contribution. 24-hour employee support line. Death in service benefit equivalent to one year\'s salary. Interest-free season ticket loan. Cycle to Work scheme. Gym membership savings. Employee discount scheme.',
      '',
      'This is an excellent opportunity for a Chef de Partie looking for a better work-life balance while continuing to cook at a high level within a professional and supportive kitchen team.',
      '',
      'The salary shown is the contracted basic for 40 hours per week. The higher figures quoted in the advert — £41,767 and £42,923 — are earnings estimates that assume 48 hours per week and weekend work, so they depend on overtime being worked rather than on the contracted role.',
    ].join('\n'),
  },
  {
    ref: 'HS-050', capture: '10+11', salaryCase: 'flat salary, no uplift',
    title: 'Sushi Chef de Partie – Japanese Cuisine, 2 AA Rosette',
    location: 'Chelsea', area: 'Greater London', areaCounty: 'greater-london',
    postcode: 'SW3', city: 'London',
    salaryMin: 45000, salaryMax: 45000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'chef-portrait.jpg',
    description: 'A Sushi Chef de Partie role at a well-established 2 AA Rosette Japanese restaurant, with 3.5 days off per week.',
    fullDescription: [
      'Sushi Chef de Partie wanted for this well-established 2 AA Rosette Japanese restaurant based in Central London. You will be working closely with the Head Chef, who is from a Michelin background.',
      '',
      'This restaurant is known for their unique selection of sushi and sashimi, made with their own distinctive style. Each piece is a testament to their commitment to sustainability, featuring only the freshest seafood directly sourced from trusted fishermen and day boats.',
      '',
      'THE ROLE AT A GLANCE',
      'Sushi Chef de Partie. Japanese cuisine. 2 AA Rosette. Central London. £45,000 per annum. 3.5 days on and 3.5 days off per week. Fine dining. Structured development plan. Immediate start available for the right candidate.',
      '',
      'You will be given the opportunity to add your own dishes to the menu, and there is a structured development plan in place for junior chefs.',
    ].join('\n'),
  },
  {
    ref: 'HS-051', capture: '13', salaryCase: 'base 43,000 plus ~5,000 service charge; advert headlines £48,000',
    title: 'Head Chef – Breakfast, Independent Hotel',
    location: 'Paddington', area: 'Greater London', areaCounty: 'greater-london',
    postcode: 'W2', city: 'London',
    salaryMin: 43000, salaryMax: 48000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'bakery-pastry.jpg',
    description: 'A 6.30am–3pm Head Chef role leading the breakfast kitchen at an independent hotel in West London.',
    fullDescription: [
      'We are looking for a passionate and experienced Head Chef to lead the kitchen team and oversee a high-quality food offering focused on breakfast, brunch and private events.',
      '',
      'WORKING PATTERN',
      '48 hours per week. Five days per week. Ideally Wednesday to Sunday. Typical shift pattern 6.30am–3.00pm.',
      '',
      'SALARY AND BENEFITS',
      '£43,000 base salary, plus approximately £5,000 service charge. 28 days holiday. Staff meals on duty. Staff discounts across food and drinks. Opportunity to join a creative and independent hospitality business. Supportive and collaborative working environment.',
      '',
      'KEY RESPONSIBILITIES — KITCHEN AND SERVICE',
      'Lead the day-to-day kitchen operation across breakfast, brunch and private events. Develop seasonal menus and create new dishes in line with the business\'s style and guest expectations. Ensure consistency, quality and presentation across all food service. Train, support and motivate the kitchen team. Maintain high standards during busy breakfast and brunch services while keeping a calm and organised kitchen. Work closely with the front of house team to ensure smooth and friendly service.',
      '',
      'STOCK, GP AND FINANCIAL CONTROL',
      'Take responsibility for kitchen GP and food cost targets. Manage stock ordering, supplier relationships and deliveries. Minimise waste through effective preparation, portion control and stock management. Monitor labour costs and rota efficiency in line with business levels. Review monthly P&L reports with management and identify areas for improvement.',
      '',
      'PRIVATE EVENTS',
      'Oversee the food offering for private events and special occasions. Create bespoke event menus tailored to guest requirements and dietary needs. Ensure the smooth planning and execution of all event catering. Work closely with front of house and the events team to deliver seamless service.',
      '',
      'HEALTH AND SAFETY',
      'Maintain full compliance with food hygiene, HACCP and health and safety standards. Ensure exceptional standards of kitchen cleanliness and organisation at all times. Manage allergen procedures and food safety standards across the kitchen. Ensure all equipment is used correctly and maintained appropriately.',
      '',
      'TEAM AND CULTURE',
      'Create a positive, supportive and professional kitchen culture. Support team development through training and regular feedback. Encourage teamwork and strong communication across departments. Attend training sessions and contribute to the overall development of the business.',
      '',
      'ABOUT YOU',
      'Previous experience as a Head Chef or Senior Sous Chef within a quality-led hospitality environment. Strong understanding of food cost control, GP and kitchen finances. Confident leading and developing a team in a fast-paced environment. Highly organised, proactive and calm under pressure. Passionate about seasonal food, hospitality and delivering an excellent guest experience. Excellent understanding of food hygiene, HACCP and health and safety practices.',
      '',
      'Due to the nature of hospitality, flexibility is required and additional duties may occasionally be requested by the management team.',
      '',
      'This is an excellent opportunity for a creative, organised and hands-on chef who is genuinely passionate about seasonal food, hospitality and leading a team. You will enjoy both the operational and creative side of running a kitchen and will play a key role in shaping the overall food offering.',
      '',
      'The base salary is £43,000; the upper figure is the £48,000 including service charge that the advert headlines.',
    ].join('\n'),
  },
  {
    ref: 'HS-052', capture: '24+25', salaryCase: 'B — base only; quarterly bonus of ~£5,000–£8,000 is in the text, not in the figures',
    title: 'Head Chef – Premium Events & Corporate Catering',
    location: 'Nine Elms', area: 'Greater London', areaCounty: 'greater-london',
    postcode: 'SW8', city: 'London',
    salaryMin: 60000, salaryMax: 60000, salaryType: 'annual',
    employmentType: ['Full-time', 'Permanent'], banner: 'grill-chef.jpg',
    description: 'Overall responsibility for a busy Battersea production kitchen serving premium events and corporate hospitality.',
    fullDescription: [
      'Host Staffing Permanent Recruitment is delighted to be working with a well-established premium events caterer, renowned for delivering high-quality food and hospitality across some of London\'s most prestigious corporate and private events.',
      '',
      'We are looking for an experienced Head Chef to take overall responsibility for a busy Battersea production kitchen, leading an established brigade and overseeing food production for a diverse and exciting events calendar.',
      '',
      'This is a fantastic opportunity for a Head Chef or ambitious Senior Sous Chef looking to take the next step within a high-quality events, production kitchen, contract catering or premium hospitality environment.',
      '',
      'THE ROLE',
      'This is a genuinely hands-on Head Chef position, combining kitchen leadership, production, menu execution and event delivery. Based primarily from the Battersea production kitchen, you will take responsibility for the day-to-day culinary operation, ensuring consistently high standards across food quality, preparation, organisation and presentation. You will lead an experienced kitchen team and work closely with the Executive Chef on menu development, event planning and delivery. You will also have the opportunity to support a number of high-profile seasonal and flagship events throughout the year.',
      '',
      'KEY RESPONSIBILITIES',
      'Lead the day-to-day operation of the Battersea production kitchen. Manage, motivate and develop an experienced kitchen brigade. Oversee food preparation and production for a varied programme of corporate events. Maintain consistently high standards of food quality, presentation and execution. Work closely with the Executive Chef on menu development and event planning. Ensure excellent stock control, food safety and kitchen organisation. Coordinate production across multiple events and varying volumes. Support large-scale and seasonal projects where required. Ensure the kitchen operates efficiently while maintaining the highest culinary standards.',
      '',
      'THE KITCHEN TEAM',
      'You will report directly to the Executive Chef and lead an established brigade including a Senior Sous Chef, a pastry team, a tasting kitchen team and production chefs.',
      '',
      'THE EVENTS',
      'The business delivers an exciting range of premium corporate and private hospitality, including corporate dinners, networking receptions, product launches, private hospitality, large-scale seasonal events and major sporting and cultural events. Event sizes can range from intimate VIP occasions of 10–20 guests through to large-scale events for up to 1,000 guests. The business also has an impressive portfolio of flagship seasonal projects, including major regattas, RHS events, Formula One hospitality and other high-profile UK sporting and cultural occasions.',
      '',
      'WORKING PATTERN',
      'Predominantly Monday to Friday. Based from a Battersea production kitchen. London-wide event delivery. Some seasonal and flagship event work during peak periods.',
      '',
      'ABOUT YOU',
      'We are looking for a proven Head Chef or strong Senior Sous Chef with experience within events, production kitchens, contract catering, premium hospitality or a similarly high-volume environment. You will be a confident kitchen leader who enjoys being hands-on and is comfortable managing a team while overseeing multiple events and production requirements simultaneously. You will need to be highly organised, commercially aware and passionate about delivering excellent food, whether you are catering for 20 VIP guests or producing for 1,000.',
      '',
      'WHAT IS ON OFFER',
      '£60,000 salary, plus a quarterly bonus scheme with potential earnings of approximately £5,000–£8,000 per annum. This is an excellent opportunity to join an established and growing events catering operation, with the backing, resources and career development opportunities of a wider hospitality group.',
      '',
      'The salary shown is the base only. The quarterly bonus is paid on top and is not included in the figures, because the advert does not state a combined total.',
    ].join('\n'),
  },
]

// ───────────────────────────────────────────────────────────────────────────
// THE FIVE CORRECTIONS TO ROWS THAT STAY LIVE.
// ───────────────────────────────────────────────────────────────────────────
const RTW_UPDATES = [
  { id: '92bb9e08-402b-4d24-9854-cb9b35952d55', title: 'Pastry Chef – Mon to Fri (Agency)' },
  { id: '2265eec0-99f0-49a2-872a-0eaace2110b8', title: 'Agency Chef – University' },
  { id: '871b3f3c-52f0-4659-aaad-836424929062', title: 'Agency Chef – Mon to Fri, City of London' },
]

const SALARY_UPDATES = [
  { id: 'af21edf9-0e2a-46b8-9346-4f799ea33d9e', title: 'Junior Sous Chef – Cotswolds', was: [36500, 42500], now: [38500, 42500] },
  { id: '8f8e9f63-b0ec-493c-afc8-dda23a73e66e', title: 'Sous Chef – Food-Led Gastro Pub', was: [38000, 48000], now: [36000, 50000] },
]

async function census(label: string) {
  const { count: board } = await supa.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active')
  const { count: host } = await supa.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('company', COMPANY)
  console.log(`${label.padEnd(8)}  board active: ${board}   Host active: ${host}`)
  return { board: board ?? -1, host: host ?? -1 }
}

/** Postgres literal. Doubling the quote is the whole escape; nothing else is interpolated. */
const lit = (v: string | null) => v === null ? 'null' : `'${v.replace(/'/g, "''")}'`
const arrLit = (a: string[]) => a.length === 0 ? `'{}'::text[]` : `array[${a.map(lit).join(',')}]::text[]`

function emitSql() {
  const out: string[] = []
  for (const ad of INSERT) {
    const fl = ad.postcode
      ? lit(JSON.stringify({ city: ad.city, postcode: ad.postcode, addressLine1: '' })) + '::jsonb'
      : 'null'
    out.push(
      `insert into jobs (employer_id, company, company_logo_url, company_banner_url, title,` +
      ` description, full_description, location, area, area_county, full_location,` +
      ` salary_min, salary_max, salary_type, employment_type, work_location, category,` +
      ` job_reference, work_authorization, is_recruiter_posting, status) values (` +
      `${lit(EMPLOYER_ID)}, ${lit(COMPANY)}, ${lit(LOGO)}, ${lit(BANNERS + ad.banner)}, ${lit(ad.title)}, ` +
      `${lit(ad.description)}, ${lit(ad.fullDescription)}, ${lit(ad.location)}, ${lit(ad.area)}, ` +
      `${lit(ad.areaCounty)}, ${fl}, ${ad.salaryMin}, ${ad.salaryMax}, ${lit(ad.salaryType)}, ` +
      `${arrLit(ad.employmentType)}, 'In person', 'hospitality', ${lit(ad.ref)}, ` +
      `${arrLit(RIGHT_TO_WORK_VALUE(false))}, true, 'active');`
    )
  }
  // ONE FILE PER STATEMENT. A blank-line separator cannot work here: the advert
  // text contains blank lines itself, so a single file cannot be split back into
  // statements by any rule that does not also cut the adverts in half.
  const dir = process.env.TEMP + '/host-inserts'
  fs.mkdirSync(dir, { recursive: true })
  out.forEach((sql, i) => fs.writeFileSync(`${dir}/${String(i + 1).padStart(2, '0')}-${INSERT[i].ref}.sql`, sql, 'utf8'))
  // Assert what is now on disk, rather than announcing success.
  const written = fs.readdirSync(dir).filter(f => f.endsWith('.sql'))
  console.log(`wrote ${written.length} files to ${dir} (expected ${INSERT.length})`)
  for (const f of written.sort()) {
    const body = fs.readFileSync(`${dir}/${f}`, 'utf8')
    const stmts = (body.match(/^insert into jobs /gm) || []).length
    console.log(`  ${f}  ${String(body.length).padStart(6)} bytes  statements:${stmts}`)
    if (stmts !== 1) { console.error(`  ${f} does not hold exactly one statement`); process.exit(1) }
  }
  if (written.length !== INSERT.length) { console.error('WRONG FILE COUNT'); process.exit(1) }
}

async function main() {
  if (EMIT) { emitSql(); return }
  console.log(`\nHOST RECONCILE — 11 September 2026  [${DRY ? 'DRY RUN' : 'APPLYING'}]`)
  console.log('Caterer is Host\'s source of truth (Adrian, 11 Sept). Where the board and Caterer disagree, Caterer wins.\n')

  // A standing rule: a live advert can reach real candidates through job_alerts.
  const { count: alerts } = await supa.from('job_alerts').select('*', { count: 'exact', head: true })
  console.log(`job_alerts rows: ${alerts}`)
  if ((alerts ?? 0) > 0) {
    console.error('STOPPING: job_alerts is not empty, so publishing adverts can email real candidates. Ask before continuing.')
    process.exit(1)
  }

  const before = await census('BEFORE')
  console.log('')

  // ── PHASE 1: ARCHIVE ─────────────────────────────────────────────────────
  // Counted BEFORE the write. "0 remain" afterwards would pass whether or not
  // the row ever existed, so it is not used as the evidence.
  console.log(`PHASE 1 — ARCHIVE ${ARCHIVE.length}`)
  const archiveIds = ARCHIVE.map(a => a.id)
  const { data: toArchive, error: readErr } = await supa.from('jobs')
    .select('id, title, company, status').in('id', archiveIds)
  if (readErr) throw readErr
  const eligible = (toArchive ?? []).filter(r => r.company === COMPANY && r.status === 'active')
  console.log(`  matched ${toArchive?.length ?? 0} of ${ARCHIVE.length} ids; ${eligible.length} are Host AND active`)
  check(eligible.length === ARCHIVE.length, `all ${ARCHIVE.length} archive targets are Host Staffing and active before the write`)
  if (fails.length) { console.error('\nRefusing to write: the archive set is not what was expected.'); process.exit(1) }

  let archived = 0
  for (const a of ARCHIVE) {
    if (!DRY) {
      const { data, error } = await supa.from('jobs')
        .update({ status: 'archived' })
        .eq('id', a.id).eq('company', COMPANY).eq('status', 'active')
        .select('id')
      if (error) throw error
      if (data?.length !== 1) { console.error(`  FAILED to archive ${a.id}`); process.exit(1) }
    }
    archived++
    console.log(`  ${DRY ? '[dry] ' : ''}archived  ${a.title}  — ${a.why}`)
  }
  console.log(`  ${archived} archived\n`)

  // ── PHASE 2: INSERT ──────────────────────────────────────────────────────
  console.log(`PHASE 2 — INSERT ${INSERT.length}`)
  const inserted: string[] = []
  for (const ad of INSERT) {
    const row = {
      employer_id: EMPLOYER_ID,
      company: COMPANY,
      company_logo_url: LOGO,
      company_banner_url: BANNERS + ad.banner,
      title: ad.title,
      description: ad.description,
      full_description: ad.fullDescription,
      location: ad.location,
      area: ad.area,
      area_county: ad.areaCounty,
      full_location: ad.postcode ? { city: ad.city, postcode: ad.postcode, addressLine1: '' } : null,
      salary_min: ad.salaryMin,
      salary_max: ad.salaryMax,
      salary_type: ad.salaryType,
      employment_type: ad.employmentType,
      work_location: 'In person',
      category: 'hospitality',
      job_reference: ad.ref,
      // NOT ONE of the eleven adverts states right to work. Read from each
      // advert's Licences section, never inferred from the role type — the
      // agency role among them does not state it either.
      work_authorization: RIGHT_TO_WORK_VALUE(false),
      is_recruiter_posting: true,
      status: 'active',
    }
    if (!DRY) {
      const { data, error } = await supa.from('jobs').insert(row).select('id')
      if (error) throw error
      inserted.push(data![0].id)
    }
    console.log(`  ${DRY ? '[dry] ' : ''}${ad.ref}  ${ad.title}`)
    console.log(`         capture ${ad.capture} · ${ad.location} · ${ad.area} · ${ad.postcode ?? 'no postcode'} · ${ad.salaryMin}–${ad.salaryMax} ${ad.salaryType}`)
    console.log(`         salary: ${ad.salaryCase}`)
  }
  console.log(`  ${INSERT.length} inserted\n`)

  // ── PHASE 3: THE FIVE UPDATES ────────────────────────────────────────────
  console.log('PHASE 3 — 3 RIGHT-TO-WORK + 2 SALARY')
  for (const u of RTW_UPDATES) {
    if (!DRY) {
      const { data, error } = await supa.from('jobs')
        .update({ work_authorization: RIGHT_TO_WORK_VALUE(true) })
        .eq('id', u.id).eq('company', COMPANY).eq('status', 'active').select('id')
      if (error) throw error
      if (data?.length !== 1) { console.error(`  FAILED to update ${u.id}`); process.exit(1) }
    }
    console.log(`  ${DRY ? '[dry] ' : ''}right to work set  ${u.title}`)
  }
  for (const u of SALARY_UPDATES) {
    if (!DRY) {
      const { data, error } = await supa.from('jobs')
        .update({ salary_min: u.now[0], salary_max: u.now[1] })
        .eq('id', u.id).eq('company', COMPANY).eq('status', 'active').select('id')
      if (error) throw error
      if (data?.length !== 1) { console.error(`  FAILED to update ${u.id}`); process.exit(1) }
    }
    console.log(`  ${DRY ? '[dry] ' : ''}salary ${u.was[0]}–${u.was[1]} -> ${u.now[0]}–${u.now[1]}  ${u.title}`)
  }
  console.log('  5 updated\n')

  const after = await census('AFTER')
  console.log('')

  if (DRY) {
    console.log(`DRY RUN — nothing written. Would be: board ${before.board} -> ${before.board - ARCHIVE.length + INSERT.length}, Host ${before.host} -> ${before.host - ARCHIVE.length + INSERT.length}`)
    return
  }

  // ── READ BACK ────────────────────────────────────────────────────────────
  // An insert that succeeded is not the same as an insert that wrote the right
  // thing, so every field the note governs is re-read from the database and
  // compared with what this script intended.
  console.log('READ-BACK — the eleven rows, every field the note governs')
  const { data: back, error: backErr } = await supa.from('jobs')
    .select('id, job_reference, title, area, area_county, full_location, salary_min, salary_max, salary_type, work_authorization, status, company, is_recruiter_posting')
    .in('id', inserted)
  if (backErr) throw backErr
  check(back!.length === INSERT.length, `all ${INSERT.length} inserted rows read back`)

  for (const ad of INSERT) {
    const r = back!.find(x => x.job_reference === ad.ref)
    if (!r) { check(false, `${ad.ref} read back`); continue }
    const pc = (r.full_location as any)?.postcode ?? null
    const ok =
      r.title === ad.title &&
      r.area === ad.area &&
      r.area_county === ad.areaCounty &&
      pc === ad.postcode &&
      Number(r.salary_min) === ad.salaryMin &&
      Number(r.salary_max) === ad.salaryMax &&
      r.salary_type === ad.salaryType &&
      (r.work_authorization ?? []).length === 0 &&
      r.status === 'active' &&
      r.company === COMPANY &&
      r.is_recruiter_posting === true
    check(ok, `${ad.ref} ${ad.title} — area "${r.area}"/${r.area_county}, postcode ${pc ?? 'none'}, ${r.salary_min}–${r.salary_max} ${r.salary_type}, rtw ${(r.work_authorization ?? []).length}`)
  }

  console.log('\nREAD-BACK — the five corrected rows')
  const { data: fixed } = await supa.from('jobs')
    .select('id, title, salary_min, salary_max, work_authorization, status')
    .in('id', [...RTW_UPDATES.map(u => u.id), ...SALARY_UPDATES.map(u => u.id)])
  for (const u of RTW_UPDATES) {
    const r = fixed!.find(x => x.id === u.id)!
    check((r.work_authorization ?? []).length === 1 && r.status === 'active',
      `${u.title} — work_authorization ${JSON.stringify(r.work_authorization)}`)
  }
  for (const u of SALARY_UPDATES) {
    const r = fixed!.find(x => x.id === u.id)!
    check(Number(r.salary_min) === u.now[0] && Number(r.salary_max) === u.now[1],
      `${u.title} — ${r.salary_min}–${r.salary_max}`)
  }

  console.log('\nREAD-BACK — the ten archived rows')
  const { data: gone } = await supa.from('jobs').select('id, title, status').in('id', archiveIds)
  const stillActive = (gone ?? []).filter(r => r.status === 'active')
  check(stillActive.length === 0 && gone!.length === ARCHIVE.length,
    `all ${ARCHIVE.length} archive targets read back, ${stillActive.length} still active`)

  console.log('')
  check(after.board === before.board - ARCHIVE.length + INSERT.length, `board ${before.board} -> ${after.board} (expected ${before.board - ARCHIVE.length + INSERT.length})`)
  check(after.host === before.host - ARCHIVE.length + INSERT.length, `Host ${before.host} -> ${after.host} (expected ${before.host - ARCHIVE.length + INSERT.length})`)

  console.log(`\n${fails.length === 0 ? 'ALL CHECKS PASSED' : `${fails.length} CHECK(S) FAILED`}`)
  if (fails.length) { fails.forEach(f => console.error(`  FAILED: ${f}`)); process.exit(1) }
}

main().catch(e => { console.error(e.message); process.exit(1) })
