// THE HOST STAFFING RECONCILE OF 5 NOVEMBER 2026.
//
// Caterer is Host's source of truth (Adrian, 11 Sept 2026), and on 5 Nov 2026
// Paul confirmed Adrian has agreed we take the roles from Caterer. So, unlike
// 11 Sept, the adverts were FETCHED from Caterer (Firecrawl, both Host company
// pages: 614335 main, 1374941 agency — 25 live roles) rather than read from
// screenshots. The text below is each advert's own body, cleaned to the house
// style; the per-advert decisions follow docs/host-refresh-note.md.
//
//     18 archives   live on the board, no longer on Caterer
//     23 inserts    live on Caterer, not on the board (HS-053 … HS-075)
//      2 updates    HS-039 and HS-023 stay live; they get their Caterer link
//
// EVERY ROW THIS WRITES CARRIES ITS CATERER ADVERT IN source_url, and the two
// kept rows get one too. That is what lets the next reconcile (weekly, Tuesday)
// tell a dead advert from a live one by URL instead of by reading text. It also
// takes Host rows out of the 30-day "is this still open?" reminder
// (lib/jobReminders.ts), which is right: they are reconciled from Caterer now.
// Adrian had never been sent one (0 Host rows reminded, 5 Nov).
//
// IT REFUSES TO GUESS WHETHER TO WRITE: --dry-run or --apply, or it exits 2.
// EVERY ARCHIVE AND UPDATE IS KEYED ON AN EXPLICIT UUID **AND** company =
// 'Host Staffing' AND status = 'active'. The UUIDs were READ from the database
// by job_reference when this file was generated, not typed.
//
//   npx tsx scripts/host-reconcile-2026-11-05.ts --dry-run
//   npx tsx scripts/host-reconcile-2026-11-05.ts --apply

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { RIGHT_TO_WORK_VALUE } from '../lib/rightToWork'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const APPLY = args.has('--apply')
if (DRY === APPLY) {
  console.error('Pass exactly one of --dry-run or --apply. There is no default: this writes 43 rows of a real employer.')
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

type Insert = {
  ref: string; catererId: string; sourceUrl: string; catererTitle: string; salaryCase: string
  title: string; description: string; fullDescription: string
  location: string; area: string; areaCounty: string; areaRegion: string; postcode: string | null; city: string
  salaryMin: number; salaryMax: number; salaryType: 'annual' | 'hourly'
  employmentType: string[]; rtw: boolean; banner: string
}
type Keep = { ref: string; id: string; title: string; why: string; sourceUrl: string; set: Record<string, unknown> }
type Archive = { ref: string; id: string; title: string }

const DATA: { inserts: Insert[]; keep: Keep[]; archive: Archive[] } = {
  "inserts": [
    {
      "ref": "HS-053",
      "catererId": "108258618",
      "sourceUrl": "https://www.caterer.com/job/chef-de-partie-predominantly-monday-friday-40-45-hours/host-staffing-job108258618",
      "catererTitle": "Chef De Partie - Predominantly Monday - Friday - 40 - 45 hours",
      "salaryCase": "C — £36,296 on a 40-hour contract; the £42,345 headline is about 5 hours of weekly overtime",
      "title": "Chef de Partie – Private Members Club, Mostly Mon–Fri",
      "description": "Chef de Partie for a central London private members club, cooking modern European food across the restaurant and events, predominantly Monday to Friday.",
      "fullDescription": "This private members club which is based in central London is seeking the talents of an experienced Chef De Partie to join its stable brigade. You will be based in their restaurant, but you will also be involved in events. You will be creating modern European dishes and there is a strong focus on using the best seasonal produce available.\n\n• Chef De Partie\n• Private members club\n• Central London\n• £36,296 per annum\n• Predominantly Monday – Friday – (you will be required to work one Saturday a month and one Sunday every 3 months)\n• 40-hour contract (most chefs are working around 5 hours overtime per week which brings your salary up to £42,345)\n• Overtime paid at time and a third (£23.26)\n• Modern European cuisine\n\nOTHER BENEFITS INCLUDE\n\n• 31 days holidays including Bank Holidays\n• Uniform provided\n• Shutdown over Christmas and new year period\n• Personal pension scheme- starting at 9% increases with age and or service\n• Employee assistance programme\n• Death in service benefit equivalent to three year’s salary\n• Interest free season ticket loan\n\nAs Chef De Partie, you will be working closely with The Head Chef across all sections of the kitchen. There will also be the opportunity for you to add your own dishes to the menu.",
      "location": "Mayfair",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "W1B",
      "city": "London",
      "salaryMin": 36296,
      "salaryMax": 36296,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "chef-plating.jpg"
    },
    {
      "ref": "HS-054",
      "catererId": "108238206",
      "sourceUrl": "https://www.caterer.com/job/pastry-chef-de-partie-japanese-cuisine-2-aa-rosette-michelin-listed-3-5/host-staffing-job108238206",
      "catererTitle": "Pastry Chef de Partie - 2 AA Rosette - Michelin Listed - 3.5 Days off",
      "salaryCase": "single figure stated, no uplift",
      "title": "Pastry Chef de Partie – Japanese, 2 AA Rosette, 3.5 Days Off",
      "description": "Pastry Chef de Partie for a 2 AA Rosette, Michelin-listed Japanese restaurant, 48 hours over 3.5 days.",
      "fullDescription": "This well-established Japanese restaurant in Southwest London is seeking an experienced Pastry Chef de Partie to join its brigade. Holding 2 AA Rosettes and being Michelin-listed, the restaurant is renowned for its commitment to quality and its distinctive approach to Japanese cuisine.\n\n• Pastry Chef de Partie\n• Salary: £40,000\n• Cuisine: Japanese\n• Accolades: 2 AA Rosettes, Michelin Listed\n• Location: Southwest London\n• Hours: 48 hours over 3.5 days\n• Days Off: 3.5 days per week\n• Start Date: Immediate start available\n\nYou will be working with the finest quality produce, creating contemporary Japanese-inspired desserts that combine traditional flavours with modern techniques and exquisite presentation. This is an excellent opportunity for a passionate pastry chef to develop their skills within a quality-driven kitchen.",
      "location": "Knightsbridge",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "SW1",
      "city": "London",
      "salaryMin": 40000,
      "salaryMax": 40000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "bakery-pastry.jpg"
    },
    {
      "ref": "HS-055",
      "catererId": "108237784",
      "sourceUrl": "https://www.caterer.com/job/breakfast-chef-5-star-mayfair-hotel-2-michelin-keys-2-aa-rosettes/host-staffing-job108237784",
      "catererTitle": "Breakfast Chef - 5-Star - 2 Michelin Keys - 2 AA Rosettes",
      "salaryCase": "STD — £36,000 basic; the advert states its own package total of £44,000",
      "title": "Breakfast Chef – 5-Star Hotel, 2 Michelin Keys, Daytime Hours",
      "description": "Breakfast Chef for a 5-star Mayfair hotel with 2 Michelin Keys and a 2 AA Rosette restaurant, working daytime shifts.",
      "fullDescription": "An exclusive 5-star hotel in Mayfair is seeking an experienced Breakfast Chef to join its talented kitchen brigade. The hotel is renowned for its exceptional standards, with a strong focus on modern British cuisine and the finest quality seasonal produce.\n\nThis is an excellent opportunity for a passionate chef to join a prestigious hotel kitchen, with daytime working hours and an attractive salary package.\n\nTHE OPPORTUNITY\n\n• Location: Mayfair, Central London\n• Salary Package: £44,000, comprising £36,000 basic salary plus approximately £8,000–£12,000 TRONC\n• Shifts: 5.30am – 2.30pm\n• Overtime: All overtime paid hourly\n• Accolades: 5-star hotel, 2 Michelin Keys and a 2 AA Rosette restaurant\n• Start Date: Immediate trials available\n\nTHE ROLE\n\nAs Breakfast Chef, you will be responsible for running your own section, preparing high-quality breakfast dishes and ensuring consistently exceptional standards across the kitchen. You will work with premium ingredients to deliver a refined breakfast offering, contributing to the hotel's reputation for outstanding food and service.\n\nBENEFITS\n\n• A competitive salary package.\n• Exclusive access to industry discounts via the CODE App.\n• 28 days holiday per annum (including bank holidays).\n• 50% discount in Hotel Restaurants,\n• 30% discount gym and spa.\n• Nutritious, complimentary meals at work.\n• Uniform and safety shoes.\n• Ongoing training opportunities and supplier trips.\n• Healthcare benefits and subsidiaries.\n• Season ticket loans.\n• Pension contributions.\n• Personal recognition awards.\n• Exciting social celebrations and events.\n• Employee assistance program and helpline.\n• Complimentary laundry service for uniforms/business attire\n• Immediate trials are available for the right candidate.",
      "location": "Mayfair",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "W1",
      "city": "London",
      "salaryMin": 36000,
      "salaryMax": 44000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "plated-dish.jpg"
    },
    {
      "ref": "HS-056",
      "catererId": "108220708",
      "sourceUrl": "https://www.caterer.com/job/general-manager-new-opening/host-staffing-job108220708",
      "catererTitle": "General Manager - New Opening",
      "salaryCase": "STD — basic £65,000–£70,000; the advert states its own total OTE of £93,000–£99,000",
      "title": "General Manager – New Opening, Premium Gastro Pub, Chelsea",
      "description": "Lead the March 2027 opening of a premium, multi-faceted gastro pub in Chelsea for an independent, family-owned business.",
      "fullDescription": "£93,000-£99,000+ OTE Package | Flagship New Opening | March 2027\n\n• Host Staffing is exclusively recruiting an exceptional General Manager to lead the opening of a premium, multi-faceted gastro pub in Chelsea, London.\n• This is a fantastic opportunity for an ambitious, commercially astute hospitality professional to take the lead on a major new opening within an independent, family-owned business.\n• Combining premium food, an outstanding drinks offer, private events, late-night trading and live music every day, this exciting venue is set to become a standout destination in one of London's most prestigious neighbourhoods.\n• With forecast net sales of approximately £150,000 per week, this is a substantial operation offering genuine autonomy, significant commercial responsibility and excellent long-term career potential.\n\nThe anticipated opening is March 2027, with an earlier pre-opening start.\n\nTHE ROLE - GENERAL MANAGER\n\n• Reporting directly to the Managing Director, you will take full responsibility for the successful launch and ongoing performance of this flagship gastro pub.\n• You will lead the pre-opening process, build an exceptional management team and establish the standards, culture and commercial strategy required to create a highly successful business.\n\nKEY RESPONSIBILITIES WILL INCLUDE\n\n• Leading the pre-opening, recruitment, training and launch of the venue.\n• Taking full ownership of P&L, budgets, forecasting and financial performance.\n• Driving sales, profitability and commercial performance across all revenue streams.\n• Recruiting, developing and empowering a high-performing management team.\n• Overseeing food, beverage, events and late-night operations.\n• Working closely with the Senior Head Chef to deliver outstanding food-led hospitality.\n• Managing labour costs, gross profit, stock control and operating margins.\n• Delivering exceptional guest experiences and consistently high service standards.\n• Building relationships with local residents, businesses and the wider Chelsea community.\n• Establishing the venue as a leading neighbourhood destination.\n\nWHAT WE'RE LOOKING FOR\n\n• We're keen to speak with experienced General Managers currently working within premium gastro pubs, restaurant-led pubs, premium casual dining or comparable high-volume hospitality businesses.\n\nYOU'LL IDEALLY DEMONSTRATE\n\n• Experience leading a substantial, high-turnover hospitality operation.\n• Strong commercial awareness and proven P&L management experience.\n• A track record of driving revenue, controlling costs and improving profitability.\n• Experience recruiting, leading and developing management teams.\n• A strong understanding of premium food-led hospitality and beverage operations.\n• The ability to manage multiple revenue streams, including events and late-night trading.\n• Excellent leadership, organisation and decision-making skills.\n• A genuine passion for hospitality, guest experience and team development.\n• Experience opening a new venue, managing a major refurbishment or launching a flagship operation would be a distinct advantage.\n• We are also open to strong General Managers from premium restaurant groups who possess excellent commercial skills, beverage knowledge and a genuine understanding of neighbourhood hospitality.\n• Above all, we're looking for a confident, entrepreneurial leader who can build a business, develop people and deliver outstanding commercial results without compromising hospitality standards.\n\nSALARY & PACKAGE\n\nTotal OTE package: £93,000-£99,000 per annum, plus potential additional tronc.\n\n• Basic salary: £65,000-£70,000.\n• Guaranteed tronc: £15,000 per annum.\n• Performance bonus: 20% of basic salary (£13,000-£14,000).\n• Additional tronc top-ups may be available.\n• Genuine opportunities for career progression as the business expands.\n\nWhy Apply?\n\n• Lead an exciting, premium gastro pub opening in Chelsea.\n• Take ownership of a flagship operation forecasting approximately £150,000 in weekly net sales.\n• Help shape the business, culture and team from day one.\n• Work directly with the Managing Director and senior leadership.\n• Join an independent, family-owned business with ambitious growth plans.\n• Build a long-term career with the potential to progress into wider operational leadership.\n\n• Apply Today - Confidential Recruitment\n• This is an exclusive and confidential appointment managed by Host Staffing.\n• All applications and enquiries will be treated in the strictest confidence.",
      "location": "Chelsea",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "SW1W",
      "city": "London",
      "salaryMin": 65000,
      "salaryMax": 99000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "wine-pour.jpg"
    },
    {
      "ref": "HS-057",
      "catererId": "108219166",
      "sourceUrl": "https://www.caterer.com/job/head-chef-private-dining-events-5-hotel-mayfair-ote-65-000/host-staffing-job108219166",
      "catererTitle": "Head Chef - Private Dining & Events, 5* Hotel Mayfair. OTE £65,000",
      "salaryCase": "A — no base stated; OTE £65,000 including tronc",
      "title": "Head Chef – Private Dining & Events, 5-Star Hotel",
      "description": "Head Chef for the private dining and events operation of a luxury 5-star hotel in Mayfair. OTE £65,000 including tronc.",
      "fullDescription": "We are working with a prestigious luxury hotel in Mayfair to recruit an exceptional Head Chef to lead its private dining and events operation.\n\nThis is an exciting opportunity for an ambitious and talented culinary professional to join one of London’s most distinguished hospitality environments, delivering outstanding food for exclusive private dining experiences, bespoke functions and high-profile events.\n\nTHE ROLE\n\nAs Head Chef, you will take responsibility for the kitchen operation across private dining and events, ensuring consistently high standards of food quality, presentation and service. You will lead and develop the brigade, oversee menu development and work closely with the wider events and front-of-house teams to deliver memorable guest experiences.\n\nKEY RESPONSIBILITIES INCLUDE\n\n• Leading, motivating and developing the kitchen team.\n• Creating and delivering menus for private dining, bespoke events and special occasions.\n• Overseeing food preparation, production and service to the highest standards.\n• Working closely with the events team to plan and execute functions seamlessly.\n• Managing food costs, stock control, purchasing and supplier relationships.\n• Maintaining excellent food safety, hygiene and kitchen standards.\n• Ensuring the kitchen is organised, efficient and prepared for a varied events schedule.\n\nTHE IDEAL CANDIDATE\n\nWe are looking for a proven Head Chef or an ambitious Senior Sous Chef ready to take the next step, with experience in luxury hotels, high-end private dining, premium banqueting or prestigious event catering.\n\nYou will be a confident leader with excellent culinary skills, strong organisational ability and a genuine passion for delivering exceptional food. Commercial awareness, attention to detail and the ability to perform under pressure are essential.\n\nExperience catering for VIP guests, bespoke functions and demanding private clients would be particularly advantageous.\n\nTHE OPPORTUNITY\n\nThis is an excellent opportunity to join a highly regarded luxury hotel in Mayfair, taking a leading role in its private dining and events offering. The position would suit a chef who enjoys combining creativity with operational leadership in a premium hospitality environment.\n\nInterested?\n\nIf you have the relevant experience and are looking for your next challenge in luxury hospitality, please apply with your CV or contact us for a confidential discussion.",
      "location": "Mayfair",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "W1",
      "city": "London",
      "salaryMin": 65000,
      "salaryMax": 65000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "canapes-wine.jpg"
    },
    {
      "ref": "HS-058",
      "catererId": "108213318",
      "sourceUrl": "https://www.caterer.com/job/chef-de-partie-5-star-hotel-2-aa-rosette-2-michelin-keys/host-staffing-job108213318",
      "catererTitle": "Chef De Partie - 5 Star Hotel - 2 AA Rosette - 2 Michelin Keys",
      "salaryCase": "STD — £39,936 basic plus service charge averaging £8,000; the advert headlines £48,000",
      "title": "Chef de Partie – 5-Star Hotel, 2 AA Rosette, 2 Michelin Keys",
      "description": "Chef de Partie at an exclusive 5-star central London hotel with 2 Michelin Keys, cooking modern British food to a 2 AA Rosette standard.",
      "fullDescription": "Chef De Partie wanted for this exclusive five-star hotel situated in central London. You will be working closely with the Chef Director who has previously achieved Michelin stars. You will be creating modern British dishes to a 2 AA rosette standard and there is a strong focus on using the best quality produce available.\n\n• £39,936 per annum + Service Charge (average £8000 per annum)\n• Chef De Partie\n• Exclusive 5-star hotel\n• Central London\n• 48 hours per week\n• Modern British cuisine\n• 5 Star, 2 Michelin Keys, 2 AA rosette\n\nBenefits:\n\n• A competitive salary package.\n• Exclusive access to industry discounts via the CODE App.\n• 28 days holiday per annum (including bank holidays).\n• 50% discount in Hotel Restaurants,\n• 30% discount gym and spa.\n• Nutritious, complimentary meals at work.\n• Uniform and safety shoes.\n• Ongoing training opportunities and supplier trips.\n• Healthcare benefits and subsidiaries.\n• Season ticket loans.\n• Pension contributions.\n• Personal recognition awards.\n• Exciting social celebrations and events.\n• Employee assistance program and helpline.\n• Complimentary laundry service for uniforms/business attire\n\nChef De Partie, you will be working closely with The Head Chef across all sections of the kitchen. There will also be the opportunity for you to add your own dishes to the menu.",
      "location": "Mayfair",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "W1",
      "city": "London",
      "salaryMin": 39936,
      "salaryMax": 48000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "kitchen-pass.jpg"
    },
    {
      "ref": "HS-059",
      "catererId": "108207487",
      "sourceUrl": "https://www.caterer.com/job/sushi-sous-chef-japanese-cuisine-2-aa-rosette-3-5-days-off/host-staffing-job108207487",
      "catererTitle": "Sushi Sous Chef - Japanese cuisine - 2 AA Rosette - 3.5 Days off",
      "salaryCase": "single figure stated, no uplift",
      "title": "Sushi Sous Chef – Japanese, 2 AA Rosette, 3.5 Days Off",
      "description": "Sushi Sous Chef for a well-established 2 AA Rosette Japanese restaurant, working 3.5 days on and 3.5 days off.",
      "fullDescription": "Sushi Sous Chef wanted for this well-established 2 AA Rosette, Japanese restaurant based in Central London. You will be working closely with the Head Chef who is from a Michelin background.\n\nThis restaurant is known for their unique selection of sushi and sashimi, made with their own distinctive style. Each piece is a testament to their commitment to sustainability, featuring only the freshest seafood directly sourced from trusted fisherman and day boats.\n\n• Sushi Sous Chef\n• Japanese cuisine\n• 2 AA Rosette\n• Central London\n• £52,000 per annum\n• 3.5 days on and 3.5 days off per week\n• Fine dining\n• Structured development plan\n• Immediate start available for the right candidate\n\nYou will be given the opportunity for you to add your own dishes to the menu and there is a structured development plan in place for junior chefs.",
      "location": "Knightsbridge",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "SW1",
      "city": "London",
      "salaryMin": 52000,
      "salaryMax": 52000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "chef-portrait.jpg"
    },
    {
      "ref": "HS-060",
      "catererId": "108180675",
      "sourceUrl": "https://www.caterer.com/job/senior-sous-chef/host-staffing-job108180675",
      "catererTitle": "Senior Sous Chef",
      "salaryCase": "A — no base stated; £60,000 inclusive of tronc",
      "title": "Senior Sous Chef – New Opening, Premium Pub & Restaurant",
      "description": "Senior Sous Chef for a new premium pub and restaurant opening in central London in March 2027, with a path towards Head Chef. £60,000 inclusive of tronc.",
      "fullDescription": "• Salary from £60,000 per annum inclusive of tronc\n• Location: SW3\n• Start Date: January 2027\n• Opening Date: March 2027\n\n• Are you an ambitious Senior Sous Chef looking for your next career move?\n• Do you have experience in premium gastropubs, high-end restaurants or quality-driven London kitchens?\n• We are recruiting a talented Senior Sous Chef to join an exciting new premium pub and restaurant opening in Central London in March 2027.\n• With a salary package starting at £60,000 per annum inclusive of tronc, this is an outstanding opportunity to join a high-volume kitchen operation, help build a brigade from the ground up and work towards a future Head Chef position.\n• The business will offer a contemporary take on British pub dining, with a focus on seasonal ingredients, quality produce and consistently excellent food across breakfast, lunch, dinner and events.\n\nTHE ROLE\n\n• Working closely with the Senior Head Chef, you will play a key role in the day-to-day running of the kitchen, leading services, developing the team and maintaining exceptional standards of food quality, consistency and presentation.\n• Joining in January 2027 ahead of the March opening, you will be involved in the pre-opening process, helping recruit and train the kitchen brigade, establish systems and prepare the operation for launch.\n• This role offers a genuine opportunity for an ambitious chef to develop their management skills, take on greater responsibility and work towards progression to Head Chef after approximately six months, subject to performance, readiness and business requirements.\n\nKEY RESPONSIBILITIES\n\n• Support the Senior Head Chef in managing the day-to-day kitchen operation.\n• Lead and motivate the brigade, maintaining high standards during busy, high-volume services.\n• Assist with recruitment, training and development of the kitchen team.\n• Contribute to menu development, seasonal dishes, recipe testing and food costing.\n• Help establish kitchen systems, preparation procedures and operational standards ahead of opening.\n• Manage stock control, ordering, portion control, food costs and wastage.\n• Support labour management, rota planning and efficient kitchen operations.\n• Maintain excellent food safety, hygiene and allergen management standards.\n• Work closely with the front-of-house team to ensure smooth service and outstanding guest experiences.\n• Take responsibility for the kitchen in the Senior Head Chef's absence.\n• Help develop a positive, professional kitchen culture built around teamwork, consistency and accountability.\n\nTHE IDEAL CANDIDATE\n\n• Proven experience as a Senior Sous Chef, Sous Chef or Head Chef within a quality-driven kitchen.\n• A strong background in premium gastropubs, restaurant-led pubs, high-end restaurants or premium casual dining.\n• Experience delivering high-volume services without compromising food quality.\n• Strong leadership and team development skills.\n• A passion for seasonal cooking, quality ingredients and modern British-inspired cuisine.\n• Good commercial awareness, including food costing, stock control, purchasing and waste management.\n• The ability to remain organised and calm under pressure.\n• A hands-on approach, leading by example and maintaining high standards.\n• Ambition to progress into a Head Chef position and take on greater responsibility.\n• Experience with new openings, kitchen recruitment and building a brigade from scratch would be advantageous.\n\nSALARY AND BENEFITS\n\n• Salary up to £60,000 per annum inclusive of tronc.\n• January 2027 start ahead of the March 2027 opening.\n• An opportunity to help shape a new kitchen operation from day one.\n• A potential development pathway towards Head Chef after approximately six months.\n• The opportunity to work alongside an experienced senior kitchen team.\n• Longer-term career development opportunities within an ambitious hospitality business.\n\nAPPLY NOW\n\n• If you are an ambitious Senior Sous Chef or an experienced Sous Chef ready to take the next step, we would love to hear from you.\n• This is an opportunity to join an exciting new opening, develop your leadership skills and build a long-term career in premium hospitality.\n\nApply today for a confidential discussion.\n\n• This vacancy is being advertised confidentially by Host Staffing a specialist hospitality recruitment agency.",
      "location": "Chelsea",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "SW3",
      "city": "London",
      "salaryMin": 60000,
      "salaryMax": 60000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "two-chefs-prep.jpg"
    },
    {
      "ref": "HS-061",
      "catererId": "108180117",
      "sourceUrl": "https://www.caterer.com/job/deputy-general-manager/host-staffing-job108180117",
      "catererTitle": "Deputy General Manager",
      "salaryCase": "A — no base stated; about £60,000 inclusive of tronc",
      "title": "Deputy General Manager – New Opening, Premium Pub",
      "description": "Deputy General Manager for a new premium pub and restaurant opening in central London in March 2027. About £60,000 inclusive of tronc.",
      "fullDescription": "• Salary package up to £60,000 inclusive of tronc\n• January 2027 start | March 2027 opening\n\n• Are you an ambitious Deputy General Manager with a background in premium London pubs, bars or restaurants?\n• Are you ready to be part of an exciting new opening in one of London's most prestigious areas?\n• We are recruiting a talented Deputy General Manager for an exciting new premium hospitality venue opening in Central London in March 2027.\n• Offering a salary package of approximately £60,000 inclusive of tronc, this is a fantastic opportunity for an experienced hospitality manager to join ahead of opening, help build a high-performing team and play a key role in establishing a new destination venue.\n\nTHE OPPORTUNITY\n\n• This is a premium, high-volume operation combining the character of a traditional British pub with a contemporary food and drink offering and a vibrant atmosphere throughout the day and evening.\n• Working closely with the General Manager, you will support the day-to-day running of the business, ensuring exceptional hospitality, strong team engagement and consistently high operating standards.\n\nWE ARE PARTICULARLY INTERESTED IN\n\n• Experienced Deputy General Managers from high-volume, premium hospitality operations.\n• General Managers currently running smaller businesses who are ready to step up into a larger operation.\n• Assistant General Managers or Restaurant Managers from established premium London restaurant and bar groups.\n• A strong background in premium London pubs, bars or restaurants is essential.\n• Experience in fine dining or high-end restaurants would be a distinct advantage.\n\nKEY RESPONSIBILITIES\n\n• Support the General Manager in the smooth day-to-day running of the business.\n• Lead, motivate and develop the front-of-house team, creating a positive and professional working environment.\n• Deliver exceptional guest experiences and maintain consistently high service standards.\n• Support pre-opening preparations, including recruitment, staff training and operational planning.\n• Work closely with the kitchen team to deliver an outstanding food and beverage operation.\n• Assist with rota planning, labour control, stock management and operational costs.\n• Contribute to sales growth and the overall commercial success of the business.\n• Lead busy services confidently, resolving issues quickly and maintaining standards under pressure.\n• Handle guest feedback professionally and build strong relationships with regular customers.\n• Deputise for the General Manager when required.\n\nWHAT WE'RE LOOKING FOR\n\n• Proven experience as a Deputy General Manager, Assistant General Manager, Restaurant Manager or similar.\n• High-volume Deputy General Manager experience, or General Manager experience within a smaller operation.\n• A strong track record within premium London pubs, bars or restaurants.\n• Fine dining or high-end restaurant experience would be advantageous.\n• Excellent leadership and people-management skills.\n• A positive, approachable personality with excellent communication skills.\n• Strong operational awareness and a commercially minded approach.\n• The ability to work effectively in a fast-paced environment and make decisions under pressure.\n• A genuine passion for hospitality and exceptional customer service.\n• Flexibility to work evenings, weekends and bank holidays.\n\nSALARY & BENEFITS\n\n• Approximately £60,000 per annum inclusive of tronc.\n• January 2027 start date.\n• Opportunity to be involved in a major new opening in March 2027.\n• A key management position within a premium hospitality operation.\n• The opportunity to develop your experience alongside an established General Manager.\n• Potential for future career progression within an ambitious hospitality business.\n\nAPPLY TODAY\n\n• If you're an ambitious hospitality professional with the experience, personality and drive to help launch an exciting new venue, we'd love to hear from you.\n• Apply now to discuss this opportunity in confidence.\n\nThis vacancy is being advertised confidentially by Host Staffing a specialist hospitality recruitment agency.",
      "location": "Chelsea",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "SW3",
      "city": "London",
      "salaryMin": 60000,
      "salaryMax": 60000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "bar-apron.jpg"
    },
    {
      "ref": "HS-062",
      "catererId": "108092172",
      "sourceUrl": "https://www.caterer.com/job/events-sous-chef-central-london-48-000/host-staffing-job108092172",
      "catererTitle": "Events Sous Chef - Central London. £48,000",
      "salaryCase": "single figure stated, no uplift",
      "title": "Events Sous Chef – Prestigious London Events Operation",
      "description": "Events Sous Chef for a prestigious London events operation: corporate, private and cultural events, from film premieres to boardroom lunches.",
      "fullDescription": "We are working with a prestigious London events and hospitality operation delivering exceptional food and service across a diverse programme of corporate, private and cultural events.\n\nFrom film premieres and private functions to boardroom lunches and large-scale events, the business delivers high-quality hospitality to discerning clients and guests.\n\nTHE ROLE\n\nWe are looking for an experienced Events Sous Chef to support the senior culinary team in the delivery of a busy, high-volume events operation.\n\nYou will play a key role in the day-to-day running of the kitchen, leading and supporting the brigade during preparation and service while ensuring consistently high standards of food, presentation and hygiene.\n\nThe role will involve working across a varied events calendar and collaborating closely with the wider events team to ensure every event is delivered smoothly and to an exceptional standard.\n\nKEY RESPONSIBILITIES\n\n• Support the senior kitchen team with the day-to-day running of the events kitchen\n• Lead and motivate the brigade during preparation and service\n• Ensure food is prepared and delivered consistently to a high standard\n• Support the delivery of large-scale events, private functions and corporate hospitality\n• Assist with menu preparation, production planning and event execution\n• Brief the kitchen team on menus, service requirements and daily events\n• Organise workloads across sections during busy services\n• Maintain excellent food hygiene, HACCP and allergen standards\n• Support stock control, food ordering and cost management\n• Help train and develop junior chefs and agency staff\n• Work closely with the wider events team to ensure smooth and successful delivery\n• Maintain a professional, positive and collaborative approach at all times\n\nABOUT YOU\n\nYou will be an experienced Sous Chef or strong Junior Sous Chef with a solid background in events, banqueting, high-volume hospitality or premium contract catering. Experience within cultural venues, visitor attractions or premium events would be advantageous.\n\nWE ARE LOOKING FOR SOMEONE WHO\n\n• Has proven experience delivering high-quality food within a busy events environment\n• Is confident leading a team during demanding services\n• Has strong organisational and communication skills\n• Understands menu preparation, production and service at scale\n• Has excellent food safety and HACCP knowledge\n• Can remain calm and professional under pressure\n• Takes pride in food quality, presentation and consistency\n• Is comfortable working with senior chefs, clients and wider operational teams\n• Has a flexible approach to working hours, including evenings and weekends when required\n\nTHE OPPORTUNITY\n\nAn excellent opportunity to join a prestigious London events operation with an exceptional and varied calendar of work.\n\nYou will work alongside an experienced culinary team, delivering food for high-profile corporate, private and cultural events, with genuine opportunities for development and progression.",
      "location": "Central London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": null,
      "city": "London",
      "salaryMin": 48000,
      "salaryMax": 48000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "canapes-wine.jpg"
    },
    {
      "ref": "HS-063",
      "catererId": "108091755",
      "sourceUrl": "https://www.caterer.com/job/executive-chef-london-event-catering-up-to-80-000-doe/host-staffing-job108091755",
      "catererTitle": "Executive Chef - London Event Catering. Up to £80,000",
      "salaryCase": "B — up to circa £80,000 DOE; the company bonus is in the text",
      "title": "Executive Chef – London Event Catering",
      "description": "Executive Chef for a growing London events and catering business: weddings, corporate events, private functions and workplace catering.",
      "fullDescription": "THE OPPORTUNITY\n\nWe are recruiting an experienced Executive Chef for an established and growing London events and catering business delivering high-quality food and hospitality across weddings, corporate events, private functions, workplace catering and large-scale occasions.\n\nThe business is entering an exciting period of growth, with new contracts and expanded operations creating an opportunity for a senior culinary leader to take ownership of the overall food strategy and help shape the next stage of the business.\n\nThis is a senior leadership position with responsibility for the culinary direction of a diverse and growing operation.\n\nThe successful candidate will lead the food vision, strengthen the BOH operation, develop the senior chef team and ensure consistently exceptional food standards while delivering against commercial targets.\n\nThis is a hands-on leadership role, but the emphasis is on culinary strategy, people, standards and commercial performance, rather than simply running a single kitchen.\n\nThis is an excellent opportunity for a senior culinary professional to join a growing London catering and events business at an important stage of its development.\n\nThe successful Executive Chef will have significant scope to influence the food strategy, strengthen the BOH operation, develop the senior culinary team and build a modern, scalable and commercially successful food operation\n\nWHAT’S ON OFFER\n\n• Salary up to circa £80,000, depending on experience\n• 45-hour working week\n• Predominantly Monday–Friday, with occasional weekends, particularly during peak season from July–September\n• Predominantly Monday–Friday, occasional weekend work during peak wedding season\n• Private medical insurance\n• Employee Assistance Programme, including wellbeing and counselling support\n• Company bonus scheme\n• Professional training and development\n\nKEY RESPONSIBILITIES\n\nCulinary Leadership & Development\n\nTake overall responsibility for the culinary direction of the business.\n\nReview and develop the existing BOH operation, introducing improved systems, processes and working practices.\n\nKeep the food proposition current, relevant and aligned with modern food trends.\n\nLead menu development across events, weddings, workplace catering and bespoke client requirements.\n\n• Develop new dishes, concepts and seasonal menus.\n• Lead and participate in client tastings, menu presentations and food development.\n• Encourage creativity and innovation across the culinary team.\n• Identify opportunities to develop new food propositions as the business continues to grow.\n\nOPERATIONS & FOOD QUALITY\n\n• Ensure consistently high standards of food quality, presentation and execution.\n• Oversee food production from preparation through to packing, dispatch and event delivery.\n• Ensure all food is produced in accordance with HACCP, food safety and hygiene standards.\n• Develop robust kitchen systems to improve consistency, efficiency and productivity.\n• Review production methods and workflows, including high-volume and batch production.\n\nEnsure the operation is properly prepared for events ranging from smaller functions through to large-scale occasions.\n\nMaintain exceptional standards across all kitchens and food production areas.\n\nLEADERSHIP & PEOPLE\n\nLead and develop a senior culinary structure including three Sous Chefs.\n\nBuild, motivate and develop the wider kitchen team.\n\nProvide clear direction, accountability and performance standards across the BOH operation.\n\nEnsure the business has the appropriate staffing structure for day-to-day production and major events.\n\n• Lead culinary teams of up to 50 chefs during large events.\n• Develop training and progression opportunities for chefs at all levels.\n• Build a positive, professional and high-performing kitchen culture.\n\nCOMMERCIAL MANAGEMENT\n\n• Take ownership of kitchen financial performance alongside the senior management team.\n• Manage and control food costs, labour costs and wage budgets.\n• Ensure menus are appropriately costed and commercially viable.\n• Monitor GP performance and identify opportunities to improve margins.\n• Manage stock control, ordering, inventory and supplier relationships.\n• Reduce waste and improve production efficiency.\n• Ensure the kitchen operates within agreed budgets without compromising food quality.\n\nGROWTH & NEW BUSINESS\n\n• Support the senior leadership team with the continued growth of the business.\n• Provide culinary input into new contracts, tenders and business opportunities.\n• Support the mobilisation and development of new catering contracts.\n• Help integrate and develop new food operations as the business expands.\n\nIdentify opportunities to share culinary talent, systems, products and ideas across the wider business.\n\nRepresent the culinary operation at client meetings, tastings and industry events where required.\n\nContribute to food competitions, industry activity and the continued development of the business.\n\nTHE IDEAL CANDIDATE\n\nWe are looking for an experienced Executive Chef, Culinary Director or highly accomplished Head Chef ready to take responsibility for a broader, multi-faceted culinary operation.\n\nYou will ideally have experience within high-end events, contract catering, workplace catering, premium hospitality or a similar food-led environment.\n\nYOU WILL NEED\n\n• Proven experience leading sizeable culinary teams and senior chefs.\n• Experience managing multiple food operations, contracts or event environments.\n• Strong menu development and contemporary food knowledge.\n• Excellent understanding of food cost, labour cost, GP and kitchen finances.\n• Experience with high-volume production and large-scale events.\n• Strong knowledge of HACCP, food safety and kitchen compliance.\n\nExperience with batch production and efficient kitchen workflows, including brat pan cookery.\n\n• Excellent organisational and time-management skills.\n• Strong communication and leadership abilities.\n• Confidence working with senior management, clients and suppliers.\n• A commercially minded approach without compromising culinary standards.\n• The ability to bring structure and accountability while encouraging creativity.\n• A genuine passion for developing people, food and the wider business.",
      "location": "Walthamstow",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "E17",
      "city": "London",
      "salaryMin": 80000,
      "salaryMax": 80000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "grill-chef.jpg"
    },
    {
      "ref": "HS-064",
      "catererId": "108067175",
      "sourceUrl": "https://www.caterer.com/job/head-chef-central-london-55-000-60-000-ot-premium-contract-catering/host-staffing-job108067175",
      "catererTitle": "HEAD CHEF - £55,000-£60,000 + OT. Premium Contract Catering",
      "salaryCase": "C — base £55,000–£60,000; evening work is paid overtime (about £5,000 a year), in the text",
      "title": "Head Chef – Premium Corporate Catering, City of London",
      "description": "Client-facing Head Chef for a premium corporate catering operation in the City: a busy staff restaurant plus hospitality and events.",
      "fullDescription": "We are recruiting for an experienced Head Chef to lead a high-profile corporate food operation in central London.\n\nThis is a genuinely client-facing role overseeing both a busy staff restaurant and a premium hospitality and events operation. The client has high expectations around food quality, presentation and service, so we are looking for a chef who is confident engaging with senior stakeholders and enjoys being visible on the floor.\n\nThe staff restaurant serves around 450 hot meals daily to approximately 1,300 employees, with a varied offer including street food, European cuisine and Australasian-inspired dishes, alongside regular cultural and seasonal food activations.\n\nThe hospitality operation covers around 10–12 rooms each day, from breakfast and sandwiches through to refined bowl food, finger food and fine dining. Evening events take place approximately twice a week, with functions of up to 300 guests. Evening work is paid as overtime, with the potential to earn around £5,000 extra per year.\n\nThe kitchen team includes Senior Sous Chefs, Sous Chefs, Junior Sous Chefs, CDPs, Commis Chefs, a Breakfast Chef and Kitchen Porters.\n\nBoth kitchen facilities are due to undergo refurbishment during 2027, giving the successful Head Chef an opportunity to play an important role in developing the future operation.\n\nWE ARE LOOKING FOR\n\n• Experienced Head Chef from premium contract catering, hotels, restaurants or events\n• Strong food and menu development skills\n• Experience across high-volume dining and premium hospitality\n• Excellent leadership and team development skills\n• Strong commercial and operational awareness\n• A highly visible, personable and customer-focused approach\n• Someone comfortable working directly with a demanding corporate client\n\nImmediate interviews and trial shifts are available.",
      "location": "Moorgate",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "EC2",
      "city": "London",
      "salaryMin": 55000,
      "salaryMax": 60000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "chef-plating.jpg"
    },
    {
      "ref": "HS-065",
      "catererId": "108063158",
      "sourceUrl": "https://www.caterer.com/job/general-manager-new-opening/host-staffing-job108063158",
      "catererTitle": "General Manager - New Opening",
      "salaryCase": "B — £50,000 base; the 10% profit share is in the text",
      "title": "General Manager – Countryside Gastro Pub, West Berkshire",
      "description": "General Manager for a quality countryside gastro pub near Newbury, with a 10% profit share and genuine autonomy.",
      "fullDescription": "Salary: £50,000 + 10% Profit Share\n\nLocation: West Berkshire, near Newbury\n\n• An exciting opportunity has arisen for an experienced and commercially minded General Manager to take the lead at a quality countryside gastro pub near Newbury.\n• This is a fantastic opportunity for a hands-on hospitality leader to join an ambitious independent business and play a key role in developing the operation, team and commercial performance.\n\nABOUT THE ROLE\n\n• As General Manager, you will have overall responsibility for the day-to-day running of the pub, leading the team and delivering an outstanding guest experience.\n\nKEY RESPONSIBILITIES INCLUDE\n\n• Leading, motivating and developing the FOH team\n• Managing the daily operation of the pub\n• Driving sales, service standards and profitability\n• Managing labour, GP, costs and budgets\n• Working closely with the Head Chef to develop the food and beverage operation\n• Growing private dining, weddings, functions and events\n• Recruiting, training and developing the team\n• Building relationships within the local community\n• Identifying opportunities to increase revenue and footfall\n• Supporting the continued growth and development of the business\n\nABOUT YOU\n\nWe are looking for an experienced General Manager, Pub Manager or Restaurant Manager with a strong operational and commercial background.\n\nYou will ideally have:\n\n• Proven experience managing a busy hospitality operation\n• Strong leadership and people-management skills\n• Good understanding of P&L, GP, labour and commercial performance\n• Experience driving sales and developing new revenue streams\n• Excellent customer service standards\n• A hands-on and visible management style\n• Strong organisational and communication skills\n• The ambition and personality to make a genuine impact\n\nWHAT'S ON OFFER\n\n• £50,000 salary\n• 10% profit share\n• Genuine autonomy within the operation\n• Beautiful countryside location near Newbury\n• Opportunity to develop events, private dining and destination trade\n• Ability to shape and grow the business\n• Long-term opportunity within an ambitious independent operation\n\nThis is an excellent opportunity for a General Manager who wants more than simply running a pub and is looking for the opportunity to have a genuine influence on the direction and success of a business.\n\nTo apply, please use the application button and submit your CV.\n\nAll applications will be treated in confidence.",
      "location": "Newbury",
      "area": "Berkshire",
      "areaCounty": "berkshire",
      "areaRegion": "south-east",
      "postcode": "RG20",
      "city": "Newbury",
      "salaryMin": 50000,
      "salaryMax": 50000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "country-pub-fireside.jpg"
    },
    {
      "ref": "HS-066",
      "catererId": "108062889",
      "sourceUrl": "https://www.caterer.com/job/sous-chef-new-opening/host-staffing-job108062889",
      "catererTitle": "Sous Chef - New Opening",
      "salaryCase": "B — £40,000 base; the share of tronc/tips is in the text",
      "title": "Sous Chef – Countryside Gastro Pub, West Berkshire",
      "description": "Sous Chef for a quality countryside gastro pub near Newbury: seasonal British food, 48 hours, Wednesday to Sunday.",
      "fullDescription": "£40,000 + Share of Tronc | 48 Hours | Wednesday-Sunday\n\n• An exciting opportunity for a passionate Sous Chef to join a quality countryside gastro pub near Newbury.\n• The business offers seasonal, British-focused food with international influences and is developing an exciting programme of private functions, weddings and events.\n\nTHE ROLE\n\n• Working alongside the Head Chef, you will help lead the kitchen, deliver consistently high-quality food and support the development of menus and the wider kitchen team.\n\nYOU'LL BE INVOLVED IN\n\n• Running the kitchen during service\n• Cooking and preparing seasonal dishes\n• Menu development and specials\n• Ordering, stock control and food safety\n• Training and developing junior chefs\n• Supporting events, functions and Sunday lunch\n\nABOUT YOU\n\nWe're looking for a confident, hands-on Sous Chef who:\n\n• Has previous Sous Chef or strong Junior Sous/Senior CDP experience\n• Is passionate about quality food\n• Has strong kitchen management and leadership skills\n• Works well under pressure and leads by example\n• Takes pride in maintaining high standards\n\nWhat's on Offer?\n\n• £40,000 + share of tronc/tips\n• 48 hours per week - Wednesday to Sunday\n• Monday & Tuesday off\n• Beautiful countryside setting\n• Opportunity to influence the food offering\n• Events and private dining experience\n• Genuine opportunity to grow with an ambitious business\n\nLocation: West Berkshire, near Newbury",
      "location": "Newbury",
      "area": "Berkshire",
      "areaCounty": "berkshire",
      "areaRegion": "south-east",
      "postcode": "RG20",
      "city": "Newbury",
      "salaryMin": 40000,
      "salaryMax": 40000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "country-pub-table.jpg"
    },
    {
      "ref": "HS-067",
      "catererId": "108058123",
      "sourceUrl": "https://www.caterer.com/job/head-chef-new-opening/host-staffing-job108058123",
      "catererTitle": "Head Chef - New Opening",
      "salaryCase": "B — circa £70,000; the quarterly bonus is in the text",
      "title": "Head Chef – New Opening, Premium Pub & Brasserie",
      "description": "Hands-on Head Chef to build the kitchen of a new premium pub and brasserie in West London, from pre-opening.",
      "fullDescription": "West London | £70,000 + Generous Quarterly Bonus | Pre-Opening Opportunity\n\n• A leading London hospitality group is preparing to launch an exciting new premium pub and brasserie in West London, and we are looking for an exceptional Head Chef to join the team ahead of the November opening.\n• This is a genuine pre-opening opportunity where you will have significant input into the creation of the kitchen, food offering and team from the very beginning.\n\nA CHANCE TO BUILD SOMETHING FROM SCRATCH\n\n• Joining in November, you will become a key part of the pre-opening team and will have a genuine voice in how the operation is created.\n\nWorking alongside the senior team, your involvement will include:\n\n• Input into kitchen layout, design and equipment selection\n• Having a say in the selection of crockery, cutlery, kitchen equipment and smallwares\n• Developing the food concept and creating the opening menus\n• Selecting suppliers and building strong long-term relationships with producers\n• Recruiting the entire kitchen brigade\n• Establishing kitchen systems, procedures and standards ahead of opening\n• Training and developing the team before launch\n• Working closely with the wider management team to ensure a successful opening\n\nTHE FOOD\n\n• The venue will offer a premium brasserie-style menu, built around exceptional ingredients, seasonal produce and cooking from scratch.\n• You will have significant creative freedom to develop the menu and will be responsible for creating a food offering capable of delivering a Rosette-level standard within a high-volume, commercially focused operation.\n• We are looking for a chef who understands that great food starts with great ingredients and who takes genuine pride in everything that leaves the kitchen.\n\nTHIS IS A HANDS-ON HEAD CHEF ROLE\n\n• Once open, this will be a genuinely hands-on Head Chef position.\n• We are not looking for someone who wants to manage the kitchen from the other side of the pass.\n\nYou need to be a chef who still loves cooking.\n\n• You will lead from the front, working alongside your brigade during service while maintaining responsibility for the overall kitchen operation, standards, team and commercial performance.\n\nABOUT YOU\n\n• We are looking for an experienced Head Chef with a proven background in a high-volume, premium pub, brasserie or restaurant environment.\n\nYOU SHOULD HAVE\n\n• Proven Head Chef experience within a premium, high-volume operation\n• A strong background in fresh, from-scratch cooking\n• Experience delivering food to a Rosette-level standard\n• Excellent knowledge of quality ingredients and seasonal produce\n• Strong menu development and costing experience\n• Experience recruiting and building a kitchen team\n• Good commercial awareness and understanding of kitchen profitability\n• Strong leadership and team development skills\n• A genuine passion for cooking and being hands-on in the kitchen\n\nThis is an opportunity for a chef who wants more than simply taking over an established kitchen.\n\nYou will help build this one.\n\nFrom the kitchen design and equipment, through to the suppliers, menu, recruitment and ultimately the food on the plate, you will have genuine ownership of the operation.\n\nPACKAGE\n\n• Salary: Circa £70,000\n• Bonus: Generous quarterly performance bonus\n• Start: November 2026 - pre-opening\n• Location: West London\n\nIf you are an ambitious Head Chef with the experience to operate at this level and want to be part of an exciting new opening from the ground up, apply now for a confidential conversation.",
      "location": "West London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "SW1W",
      "city": "London",
      "salaryMin": 70000,
      "salaryMax": 70000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "two-chefs-prep.jpg"
    },
    {
      "ref": "HS-068",
      "catererId": "108057873",
      "sourceUrl": "https://www.caterer.com/job/head-chef-central-london-60-000-plus-tronc-and-bonus-excellent-benefits/host-staffing-job108057873",
      "catererTitle": "HEAD CHEF - CENTRAL LONDON, £60,000 plus tronc and bonus + Excellent Benefits",
      "salaryCase": "B — £60,000 base; tronc and the 10% bonus are in the text",
      "title": "Head Chef – Cultural Venue Restaurant, Central London",
      "description": "Head Chef for the restaurant of a high-profile cultural venue in central London: contemporary British food, mainly daytime.",
      "fullDescription": "A fantastic opportunity for an experienced Head Chef or strong Senior Sous Chef to join a high-profile cultural hospitality operation in Central London.\n\nThis senior kitchen leadership role combines contemporary British food, seasonal ingredients, sustainability and provenance within a high-quality restaurant environment.\n\nTHE ROLE\n\nYou will take overall responsibility for the restaurant kitchen, leading a team of Senior Sous, Sous and Junior Chefs and ensuring consistently high standards across food preparation and service.\n\nWorking closely with the Executive Chef, you will help develop the seasonal food offer, menus and daily specials, while also supporting events and special functions throughout the year.\n\nKEY RESPONSIBILITIES\n\n• Lead, motivate and develop the kitchen team\n• Oversee daily kitchen operations and restaurant service\n• Develop seasonal contemporary British menus and daily specials\n• Manage ordering, stock control, inventory and suppliers\n• Control food, labour and operational costs\n• Oversee menu costing, recipes and production\n• Minimise wastage and maintain excellent stock rotation\n• Manage kitchen rotas, holidays and staffing levels\n• Lead service from the pass and work closely with FOH\n• Maintain high food safety, HACCP and allergen standards\n• Support events and wider catering operations when required\n\nTHE IDEAL CHEF\n\nWe are looking for an established Head Chef or experienced Senior Sous Chef with a strong restaurant background and genuine passion for food.\n\nYou should have:\n\n• Strong contemporary British food knowledge\n• A passion for seasonal, quality-led cooking\n• Experience leading and developing a professional kitchen team\n• Strong commercial awareness, including food and labour costs\n• Experience with ordering, stocktaking and supplier management\n• Excellent food safety and HACCP knowledge\n• Level 3 Food Safety or above\n• A calm, organised approach to busy service\n• Excellent communication and leadership skills\n• A genuine interest in developing menus and improving the food offer\n\nWORKING PATTERN\n\nThe restaurant operates predominantly during the daytime, with daytime and evening service towards the end of the week, offering a more structured working pattern than many traditional restaurant environments.\n\nPACKAGE\n\n• £60,000 salary plus tronc\n• 10% potential annual management bonus\n• 22 days holiday plus bank holidays, increasing to 27 days with service\n• Paid Christmas Eve\n• Free staff meals\n• Enhanced pension contributions\n• Medicash healthcare plan\n• Cycle-to-work scheme\n• Employee Assistance Programme and mental health support\n• Additional holiday purchase scheme\n• Industry discounts and benefits\n• Free access to exhibitions and cultural events\n• Company-funded professional training and qualifications\n• Food and beverage tastings and producer/supplier trips\n\nAn excellent opportunity for a talented Head Chef or Senior Sous Chef to join a prestigious Central London operation where food quality, sustainability, team development and professional growth are genuinely valued.\n\nFor more information or a confidential conversation, please contact Host Staffing.",
      "location": "Central London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "SE1",
      "city": "London",
      "salaryMin": 60000,
      "salaryMax": 60000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "plated-dish.jpg"
    },
    {
      "ref": "HS-069",
      "catererId": "108053719",
      "sourceUrl": "https://www.caterer.com/job/chef-de-partie-members-club-monday-to-friday-40hrs-35-000/host-staffing-job108053719",
      "catererTitle": "CHEF DE PARTIE, Members Club, Monday to Friday - 40hrs, £35,000",
      "salaryCase": "single figure stated, no uplift",
      "title": "Chef de Partie – Members Club, Monday to Friday",
      "description": "Chef de Partie for a 5-star events and hospitality operation in the City, Monday to Friday, 9am to 5pm.",
      "fullDescription": "We’re recruiting for an experienced Chef de Partie to join the kitchen team of a prestigious 5-Star Events & Hospitality London hospitality operation, working across a varied programme of high-quality events, functions and private dining.\n\nThis is a great opportunity for a Chef de Partie with a strong 5-star background who enjoys working to high standards, has experience across multiple sections and thrives in a professional, busy kitchen environment.\n\nTHE ROLE\n\nWorking closely with the Head Chef and wider brigade, you’ll be involved in the preparation and delivery of food for a varied programme of company and commercial functions.\n\nYou’ll be expected to maintain consistently high culinary standards while working across different sections of the kitchen and supporting the smooth running of events and services.\n\nKEY RESPONSIBILITIES INCLUDE\n\n• Preparing and delivering food to a consistently high standard\n• Working across all sections of the kitchen\n• Supporting the Head Chef and wider brigade during busy services\n• Assisting with the preparation and coordination of functions\n• Checking deliveries and ensuring correct storage and stock rotation\n• Maintaining excellent food hygiene, cleanliness and safety standards\n• Working closely with the wider Events & Catering team\n• Supervising kitchen porters when required\n• Remaining calm, organised and professional under pressure\n\nTHE IDEAL CHEF\n\nWe’re looking for someone with:\n\n• Minimum 2 years’ experience within a similar 5-star environment\n• Experience across all sections of a professional kitchen\n• Excellent attention to detail and high standards\n• A genuine passion for food\n• Strong teamwork and communication skills\n• A reliable, positive and professional attitude\n• The ability to remain calm under pressure\n• Level 3 Food Hygiene & Safety in Catering\n• Level 2 HACCP\n\nHOURS\n\nMinimum 40 hours per week, dependent on business levels, predominantly Monday to Friday 9am - 5.00pm although occasional weekend work may be required\n\nWHAT’S ON OFFER\n\n• 26 days annual leave, increasing annually up to 31 days\n• Non-contributory pension with employer contributions of up to 18%, depending on age\n• Life assurance at four times annual salary\n• Income protection insurance\n• Private medical insurance option\n• Full health assessments\n• Employee wellbeing and assistance support\n• Remote GP access, medical second opinions, mental health support and physiotherapy\n• Interest-free season ticket loan\n• Cycle to work scheme\n• Matched charitable giving\n\nThis is an excellent opportunity for a Chef de Partie looking to join a prestigious London operation offering a strong benefits package, high culinary standards and a varied events-led environment.",
      "location": "City of London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": "EC2",
      "city": "London",
      "salaryMin": 35000,
      "salaryMax": 35000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "kitchen-pass.jpg"
    },
    {
      "ref": "HS-070",
      "catererId": "108041146",
      "sourceUrl": "https://www.caterer.com/job/junior-sous-chef-2-aa-rosette-restaurant-mayfair-up-to-50-000-bonus/host-staffing-job108041146",
      "catererTitle": "JUNIOR SOUS CHEF - 2 AA ROSETTE RESTAURANT. Up to £50,000 + bonus",
      "salaryCase": "B — up to £50,000; the bonus is in the text",
      "title": "Junior Sous Chef – 2 AA Rosette Seafood Restaurant, Mayfair",
      "description": "Junior Sous Chef for a 2 AA Rosette, 160-cover restaurant in Mayfair built around seafood, fire and seasonal cooking.",
      "fullDescription": "We’re recruiting for an exciting Mayfair restaurant from an award-winning chef, with an experienced Executive Chef leading the kitchen.\n\nThe restaurant has already achieved 2 AA Rosettes, reflecting the quality and ambition of its food offering.\n\nThis is a serious food-led operation centred around exceptional seafood, seasonal produce, fire and quality cooking. With around 160 covers, the restaurant features an oyster and raw bar, open kitchen, wood-fired grill, private dining room and year-round terrace.\n\nWe’re looking for an ambitious Junior Sous Chef who enjoys being hands-on, leading from the front and working with excellent ingredients in a high-quality, busy kitchen.\n\nTHE ROLE\n\nWorking closely with the Executive Chef and senior kitchen team, you’ll help lead the brigade and take responsibility for maintaining high standards across service.\n\nThe kitchen has been designed with chefs in mind and includes a dedicated fish preparation room, raw bar, open kitchen and wood-fired grill.\n\nThere is a strong focus on whole fish, seafood preparation, butchery, fire cooking and fresh food made from scratch.\n\nTHE IDEAL CHEF\n\n• Proven Junior Sous Chef experience within a quality, high-volume restaurant\n• Confident leading a brigade during busy services\n• Strong organisation, consistency and attention to detail\n• Excellent knowledge of fresh produce and a genuine passion for seafood\n• Hands-on approach with high standards\n• Ambitious, positive and keen to develop\n\nWHY CONSIDER IT?\n\n• Up to £50,000 + bonus\n• 2 AA Rosette kitchen\n• Serious food and excellent produce\n• Impressive chef-led kitchen\n• Strong focus on seafood, fire and seasonal cooking\n• Opportunity to develop specialist skills in fish preparation, butchery and fire cooking\n• Experienced senior kitchen team\n• Meals on duty\n• Training and development opportunities\n• Birthday day off\n• Christmas Day and Boxing Day guaranteed off\n• Additional holiday entitlement with length of service\n• Health and wellbeing support\n• Discounted gym membership and industry perks\n\nThis is a great opportunity for a Junior Sous Chef looking to join an ambitious Mayfair restaurant where the food, kitchen and quality of the operation are genuinely important.\n\nTo find out more, please get in touch with Host Staffing.",
      "location": "Mayfair",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": null,
      "city": "London",
      "salaryMin": 50000,
      "salaryMax": 50000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "grill-chef.jpg"
    },
    {
      "ref": "HS-071",
      "catererId": "108041071",
      "sourceUrl": "https://www.caterer.com/job/sous-chef-2-aa-rosette-restaurant-mayfair-up-to-65-000-bonus/host-staffing-job108041071",
      "catererTitle": "SOUS CHEF — 2 AA ROSETTE RESTAURANT. Up to £65,000 + bonus",
      "salaryCase": "B — up to £65,000; the bonus is in the text",
      "title": "Sous Chef – 2 AA Rosette Seafood Restaurant, Mayfair",
      "description": "Sous Chef for a 2 AA Rosette, 160-cover restaurant in Mayfair built around seafood, fire and seasonal cooking.",
      "fullDescription": "We’re recruiting for an exciting Mayfair restaurant from an award-winning chef, with an experienced Executive Chef leading the kitchen.\n\nThe restaurant has already achieved 2 AA Rosettes, reflecting the quality and ambition of its food offering.\n\nThis is a serious food-led operation centred around exceptional seafood, seasonal produce, fire and quality cooking. With around 160 covers, the restaurant features an oyster and raw bar, open kitchen, wood-fired grill, private dining room and year-round terrace.\n\nWe’re looking for an ambitious Sous Chef who enjoys being hands-on, leading from the front and working with excellent ingredients in a high-quality, busy kitchen.\n\nTHE ROLE\n\nWorking closely with the Executive Chef and senior kitchen team, you’ll help lead the brigade and take responsibility for maintaining high standards across service.\n\nThe kitchen has been designed with chefs in mind and includes a dedicated fish preparation room, raw bar, open kitchen and wood-fired grill.\n\nThere is a strong focus on whole fish, seafood preparation, butchery, fire cooking and fresh food made from scratch.\n\nTHE IDEAL CHEF\n\n• Proven Sous Chef experience within a quality, high-volume restaurant\n• Confident leading a brigade during busy services\n• Strong organisation, consistency and attention to detail\n• Excellent knowledge of fresh produce and a genuine passion for seafood\n• Hands-on approach with high standards\n• Ambitious, positive and keen to develop\n\nWHY CONSIDER IT?\n\n• Up to £65,000 + bonus\n• 2 AA Rosette kitchen\n• Serious food and excellent produce\n• Impressive chef-led kitchen\n• Strong focus on seafood, fire and seasonal cooking\n• Opportunity to develop specialist skills in fish preparation, butchery and fire cooking\n• Experienced senior kitchen team\n• Meals on duty\n• Training and development opportunities\n• Birthday day off\n• Christmas Day and Boxing Day guaranteed off\n• Additional holiday entitlement with length of service\n• Health and wellbeing support\n• Discounted gym membership and industry perks\n\nThis is a great opportunity for a Sous Chef looking to join an ambitious Mayfair restaurant where the food, kitchen and quality of the operation are genuinely important.\n\nTo find out more, please get in touch with Host Staffing.",
      "location": "Mayfair",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": null,
      "city": "London",
      "salaryMin": 65000,
      "salaryMax": 65000,
      "salaryType": "annual",
      "employmentType": [
        "Full-time",
        "Permanent"
      ],
      "rtw": false,
      "banner": "kitchen-pass.jpg"
    },
    {
      "ref": "HS-072",
      "catererId": "108259008",
      "sourceUrl": "https://www.caterer.com/job/agency-chef-de-partie-mon-to-fri-events/host-staffing-job108259008",
      "catererTitle": "Agency Chef de Partie - Mon to Fri - Events",
      "salaryCase": "STD — £16.95 basic at the bottom; £23.50 including holiday pay at the top",
      "title": "Agency Chef de Partie – Mon to Fri, Events",
      "description": "Flexible agency Chef de Partie work with event caterers across London through the winter season, Monday to Friday plus evening functions.",
      "fullDescription": "We are looking for chefs to join our team Supporting Event catering Companies for the 2026 Winter Season. This role gives you flexible work, as much or as little as you need: full-time hours or an evening or day here or there, for a week here or there, or the 3- 4 months of the whole winter, September to December.\n\nThis will suit you if you live in Southeast London, as we have various event clients there, so a very short commute may suit you!!\n\nOpportunities for all Levels - Chef de Partie, Sous-Chef, Lead Chef\n\nPAY PER HOUR\n\n• £19.00 Inc Holiday (£16.95 + £2.05) to £23.50 Per Hour (£20.97 + £2.53)\n• Rate Per Hour -This depends on each client. Then, your Experience and the Role.\n• Roles Range – Chef de Partie, Premier Chef de Partie, Lead Chef et Sous-Chef\n• Weekly Paid\n\nTIMES OF WORK\n\n• Monday to Friday\n• 8am till 4.30pm + Evening Functions\n• Evening Functions – It may suit you if you want extra work around a full-time job.\n• Some Weekends – To Support Functions, i.e. Weddings\n\nWHAT THE WORK IS\n\n• Volume Event Prep- Canapés, Bowl food, Weddings, Film Premiers, seated plated dinners/banquets.\n• Crew and VIP Catering at Band, Film/TV Locations and Festivals.\n• Plating Up & Garnishing at Function\n\nLOCATION\n\n• Client kitchens are based throughout London to suit your home or work location.\n• Evening Functions –majority-based in London, so can suit your home or work location.\n• Weekend functions and weddings may be outside London.\n• Functions out of London – Travel Time and Travel Cost paid.\n• Taxis are provided from home if public transport is not available.\n\nEXPERIENCE AND REQUIREMENTS\n\n• Relevant Quality Chef Experience- Fresh Food and Volume.\n• Great Knives Skills\n• Professional, Flexible Attitude and ability to work consistently under pressure and deadlines\n• Minimum experience needed at the Chef De Partie level.\n\nLICENCE/CERTIFICATIONS\n\n• Level 2 Food Safety Certificate\n• Allergen Training -Certificate\n• Your own Presentable chef whites, hat, black apron, knives, and steel-toe cap safety shoes\n• Right to Work in the UK\n\nIf you are interested in a role, please apply now. We can arrange a call, and then, if it works for you, we will organise an in-person meeting.",
      "location": "South East London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": null,
      "city": "London",
      "salaryMin": 16.95,
      "salaryMax": 23.5,
      "salaryType": "hourly",
      "employmentType": [
        "Flexible",
        "Temporary"
      ],
      "rtw": true,
      "banner": "canapes-wine.jpg"
    },
    {
      "ref": "HS-073",
      "catererId": "108258989",
      "sourceUrl": "https://www.caterer.com/job/agency-chef-de-partie-mon-to-fri/host-staffing-job108258989",
      "catererTitle": "Agency Chef de Partie - Mon to Fri",
      "salaryCase": "A — both ends include holiday pay; no basic stated",
      "title": "Agency Chef de Partie – Mon to Fri, Flexible Shifts",
      "description": "Flexible agency Chef de Partie shifts across central London: events, banqueting, stadia and contract catering. £17.50 to £23.50 an hour including holiday pay.",
      "fullDescription": "£17.50–£23.50 per hour (including holiday pay)\n\nIMMEDIATE STARTS AVAILABLE\n\nFlexible Shifts – Monday to Friday, Evenings & Weekends\n\nWe are looking for chefs to join our company, to give you flexible work, as much or as little as you need: full-time hours or an evening or day here or there, for a week here or there or for the Summer.\n\nWe are extremely busy from September with a high volume of ongoing work; to keep you busy over the Winter and beyond.\n\nWHAT WE OFFER\n\n• £17.50 – £23.50 per hour (including holiday pay)- Dependent on Role\n• Regular Monday–Friday work available\n• Evening Functions – It may suit you if you want extra work around a full-time job.\n• Some Weekends – To Support Functions, i.e. Weddings\n• Ongoing, consistent shifts across Central London\n• Easy-to-use App booking system, with Humans at the end of the phone to support you.\n\nVARIETY OF DIFFERENT KITCHENS\n\n• Stadia & sporting events\n• Large-scale events & banqueting\n• Corporate & contract catering\n• Crew and VIP Catering at Band, Film/TV Locations and Festivals.\n• Plating Up & Garnishing at Functions- Weddings, Film Premiers, seated plated dinners/banquets.\n\nWHAT WE’RE LOOKING FOR\n\n• Experienced chefs (Chef De Partie level and above preferred)\n• Available to work 3–5 days per week\n• Reliable, punctual, and confident in fast-paced kitchens\n• Super Smart Whites, Skull Cap, Black Apron, Black Trouser and Knives\n• Food Safety Level 2 & Allergen (Natasha’s Law) certification\n• Available and Flexible to work over Sept to December\n\nWhy Work with Us?\n\nWe are one of London’s leading hospitality agencies, and we look after our chefs. We work with and represent you as much as we do our clients. As we can't do it without you.\n\nAPPLY NOW IF INTERESTED\n\nIf you are interested in a role, please apply now. We can arrange a call, and if it works for you, we will organise an in-person meeting. This is a casual, flexible position with ongoing opportunities.",
      "location": "Central London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": null,
      "city": "London",
      "salaryMin": 17.5,
      "salaryMax": 23.5,
      "salaryType": "hourly",
      "employmentType": [
        "Flexible",
        "Temporary"
      ],
      "rtw": false,
      "banner": "two-chefs-prep.jpg"
    },
    {
      "ref": "HS-074",
      "catererId": "108110106",
      "sourceUrl": "https://www.caterer.com/job/chef-de-partie-mon-to-fri-contract-catering/host-staffing-job108110106",
      "catererTitle": "Chef De Partie - Mon to Fri - Agency",
      "salaryCase": "STD — £17.00 basic at the bottom; £20.17 including holiday pay at the top",
      "title": "Agency Chef de Partie – Mon to Fri, Contract Catering",
      "description": "Agency Chef de Partie work in corporate contract catering kitchens across central London, Monday to Friday, until Christmas.",
      "fullDescription": "£17.00- £18.00 Per Hour (£19.00-£20.17 Per Hour Inclusive of Holiday)\n\nWe seek an experienced Chef De Partie for Agency - flexible work across central London to join our contract catering division, working in corporate businesses, now till Christmas.\n\nYou will be working in various kitchens across London, including staff restaurants, hospitality kitchens, Executive and director dining, and production kitchens.\n\nRemuneration\n\n• Chef de Partie £17.00- £18.00 Per Hour - Dependant on client, if pastry or directors\n• (£19.00-£20.17 Per Hour Inclusive of Holiday)\n\nTimes of Work\n\n• Monday to Friday\n• Working Hours- 7/8 am till 3/4 pm\n• Evening Functions – Some Sites will have Doubles for Evening functions\n• Top Up Hours with Weekend and/or Evening work also available with our events team\n\nWhat and Where\n\n• Hospitality, Directors Dining and Fine Dining\n• Main Kitchen and Pastry Kitchen\n• Staff Restaurant for all sizes of office catering\n• Clients are based throughout London to suit your home or work location.\n\nExperience and Requirements\n\n• Relevant Chef De Partie Experience- Quality, Fresh Food and Volume.\n• Minimum 3 years’ experience needed\n\nLicence/Certifications:\n\n• Level 2 Food Safety Certificate\n• Allergen Training -Certificate\n• Your own Presentable chef whites, hat, apron, knives, and Full back steel-toe cap safety shoes\n• Right to Work in the UK\n\nIf you are interested in a role, please apply now. We will call you back to chat through the work, and if it suits you, get you in for a chat in person. Then out to work.",
      "location": "Central London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": null,
      "city": "London",
      "salaryMin": 17,
      "salaryMax": 20.17,
      "salaryType": "hourly",
      "employmentType": [
        "Flexible",
        "Temporary"
      ],
      "rtw": true,
      "banner": "chef-plating.jpg"
    },
    {
      "ref": "HS-075",
      "catererId": "108074825",
      "sourceUrl": "https://www.caterer.com/job/pastry-chef-mon-to-fri-agency/host-staffing-job108074825",
      "catererTitle": "Pastry Chef - Mon to Fri - Agency",
      "salaryCase": "STD — £17.85 basic at the bottom; £20.00 including holiday pay at the top",
      "title": "Agency Pastry Chef – Event Caterer, South East London",
      "description": "Agency Pastry Chef for a top London event caterer's pastry kitchen in South East London, Monday to Friday through to December.",
      "fullDescription": "We are looking for Pastry chefs to support a Southeast London based Top London Event Caterer's Pastry kitchen. You could start next week or the week after for a trial and, if all goes well, work through until December. The schedule is generally Monday to Friday, with a preference for a few evenings (one or two per week).\n\nPAY\n\n• Hourly Paid or Day Rate for Band and Film Work\n• £17.85 (£20.00 Inc Holiday)\n• Hourly Rate Dependent on Client, Experience and Role.\n• Weekly Pay\n\nTIMES OF WORK\n\n• Monday to Friday\n• 8am till 4.30pm + Evening Functions\n• Evening Functions – It may suit you if you want extra work around a full-time job.\n• Some Weekends – To Support Functions, i.e. Weddings\n\nWHAT THE WORK IS\n\n• Volume event prep- canapés, Bowl food, Weddings, Film Premiers, seated plated dinners/banquets.\n• Plating Up & Garnishing at Function\n\nLOCATION\n\n• Client kitchens are based throughout London to suit your home or work location.\n• Evening Functions –majority-based in London, so can suit your home or work location.\n• Weekend functions and weddings may be outside London.\n• Functions out of London – Travel Time and Travel Cost paid.\n• Taxis are provided if public transport is not available.\n\nEXPERIENCE AND REQUIREMENTS\n\n• Relevant Chef Experience- Fresh Food and Volume.\n• Minimum experience needed: Pastry Chef De Partie Level.\n\nLICENCE/CERTIFICATIONS\n\n• Level 2 Food Safety Certificate\n• Allergen Training -Certificate\n• Your own Presentable chef whites, hat, apron, knives, and steel-toe cap safety shoes\n• ·Right to Work in the UK\n\nIf you are interested in a role, please apply now. We can arrange a call, and if it works for you, we will schedule an in-person meeting.",
      "location": "South East London",
      "area": "Greater London",
      "areaCounty": "greater-london",
      "areaRegion": "london",
      "postcode": null,
      "city": "London",
      "salaryMin": 17.85,
      "salaryMax": 20,
      "salaryType": "hourly",
      "employmentType": [
        "Flexible",
        "Temporary"
      ],
      "rtw": true,
      "banner": "bakery-pastry.jpg"
    }
  ],
  "keep": [
    {
      "ref": "HS-039",
      "id": "4cda1ca9-d22c-4fd9-97f6-4c6ecdc39a27",
      "title": "Sous Chef – Countryside Gastro Pub, 4 Day Week",
      "why": "body text is the Andover \"Sous Chef – 48k Package\" advert, word for word",
      "sourceUrl": "https://www.caterer.com/job/sous-chef-48k-package/host-staffing-job108114202",
      "set": {
        "area": "Hampshire",
        "area_region": "south-east"
      }
    },
    {
      "ref": "HS-023",
      "id": "92bb9e08-402b-4d24-9854-cb9b35952d55",
      "title": "Pastry Chef – Mon to Fri (Agency)",
      "why": "body text is Host's general agency pastry advert; it is now pinned to Southfields, same pay",
      "sourceUrl": "https://www.caterer.com/job/pastry-chef-mon-to-fri-agency/host-staffing-job108109875",
      "set": {
        "location": "London",
        "area": "Greater London",
        "area_county": "greater-london",
        "area_region": "london",
        "description": "Flexible agency Pastry Chef work with Host's event clients across London, Monday to Friday plus evening functions.",
        "full_description": "Host Staffing is the specialist chef agency supporting many of the UK's biggest and most prestigious events. We are looking for Pastry chefs to join our company to give you flexible work, as much or as little as you need: full-time hours or an evening or day here or there, for a week here or there or for September to December\n\nCurrently, we are recruiting Casual Event Pastry Chefs for September onwards for the coming Winter Season.\n\nPAY\n\n• Hourly Paid or Day Rate for Band and Film Work\n• £17.40 (£19.50 Inc holiday) to £20.97 (£23.50 Inc Holiday)\n• Hourly Rate Dependent on Client, Experience and Role.\n• Weekly Pay\n\nTIMES OF WORK\n\n• Monday to Friday\n• 8am till 4.30pm + Evening Functions\n• Evening Functions – It may suit you if you want extra work around a full-time job.\n• Some Weekends – To Support Functions, i.e. Weddings\n\nWHAT THE WORK IS\n\n• Volume event prep- canapés, Bowl food, Weddings, Film Premiers, seated plated dinners/banquets.\n• Crew and VIP Catering at Band, Film/TV Locations and Festivals.\n• Plating Up & Garnishing at Function\n\nLOCATION\n\n• Client kitchens are based throughout London to suit your home or work location.\n• Evening Functions –majority-based in London, so can suit your home or work location.\n• Weekend functions and weddings may be outside London.\n• Functions out of London – Travel Time and Travel Cost paid.\n• Taxis are provided if public transport is not available.\n\nEXPERIENCE AND REQUIREMENTS\n\n• Relevant Chef Experience- Fresh Food and Volume.\n• Minimum experience needed: Pastry Chef De Partie Level.\n\nLICENCE/CERTIFICATIONS\n\n• Level 2 Food Safety Certificate\n• Allergen Training -Certificate\n• Your own Presentable chef whites, hat, apron, knives, and steel-toe cap safety shoes\n• ·Right to Work in the UK\n\nIf you are interested in a role, please apply now. We can arrange a call, and if it works for you, we will schedule an in-person meeting."
      }
    }
  ],
  "archive": [
    {
      "ref": "HS-009",
      "id": "8f8e9f63-b0ec-493c-afc8-dda23a73e66e",
      "title": "Sous Chef – Food-Led Gastro Pub"
    },
    {
      "ref": "HS-012",
      "id": "e6e8a89a-ed80-415d-8f83-15ecb625fe60",
      "title": "Chef de Partie – Live In, Countryside Gastro Pub"
    },
    {
      "ref": "HS-035",
      "id": "af21edf9-0e2a-46b8-9346-4f799ea33d9e",
      "title": "Junior Sous Chef – Cotswolds"
    },
    {
      "ref": "HS-036",
      "id": "d0ecb906-129d-4090-9193-012fcb617a17",
      "title": "Senior Chef de Partie – Premium Country Pub & Inn"
    },
    {
      "ref": "HS-037",
      "id": "2265eec0-99f0-49a2-872a-0eaace2110b8",
      "title": "Agency Chef – University"
    },
    {
      "ref": "HS-038",
      "id": "871b3f3c-52f0-4659-aaad-836424929062",
      "title": "Agency Chef – Mon to Fri, City of London"
    },
    {
      "ref": "HS-040",
      "id": "bc053e32-74b6-461e-a022-aafb8a9536b6",
      "title": "Head Chef – Boutique Country Coaching Inn & Estate Events"
    },
    {
      "ref": "HS-042",
      "id": "9ddf66cc-24b9-412d-9153-c492f06f3a50",
      "title": "Sales & Events Manager – Central London"
    },
    {
      "ref": "HS-043",
      "id": "24d70755-836a-454f-9489-ae03b553887d",
      "title": "Head Chef – Cotswolds, Recently Reopened Premium Country Pub"
    },
    {
      "ref": "HS-044",
      "id": "5fc69011-45cb-4def-b558-f5abd3d44c00",
      "title": "Assistant Manager – Premium Country Pub & Inn"
    },
    {
      "ref": "HS-045",
      "id": "1cb6ddf5-3d4e-4644-ab8c-8368a9e816ef",
      "title": "Chef de Partie – 2 AA Rosette, Working Towards 3"
    },
    {
      "ref": "HS-046",
      "id": "a0061fe3-9b77-46eb-a3e4-f28141d2afdd",
      "title": "Restaurant Supervisor – Central London"
    },
    {
      "ref": "HS-047",
      "id": "aab70c3e-44b9-4f43-8b79-b7c1e93d892c",
      "title": "Sous Chef – Agency"
    },
    {
      "ref": "HS-048",
      "id": "bbd12d10-f0da-4616-acb4-bb4b8eaf7ade",
      "title": "Plant-Based Chef de Partie – Monday to Friday"
    },
    {
      "ref": "HS-049",
      "id": "343bc935-7a2d-4ce8-b911-00dc72212a46",
      "title": "Chef de Partie – Events & Conferencing"
    },
    {
      "ref": "HS-050",
      "id": "6cc5d91f-aab9-4b06-87ed-eb8ab9cd1dac",
      "title": "Sushi Chef de Partie – Japanese Cuisine, 2 AA Rosette"
    },
    {
      "ref": "HS-051",
      "id": "705a1ea9-07d9-40f9-8b60-41abe8659f41",
      "title": "Head Chef – Breakfast, Independent Hotel"
    },
    {
      "ref": "HS-052",
      "id": "ac91328b-7351-4c73-8c04-5ec6c966d0ae",
      "title": "Head Chef – Premium Events & Corporate Catering"
    }
  ]
}

const fails: string[] = []
const check = (ok: boolean, label: string) => { if (!ok) fails.push(label); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`) }

async function census(label: string) {
  const { count: board } = await supa.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active')
  const { count: host } = await supa.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('company', COMPANY)
  console.log(`${label.padEnd(8)}  board active: ${board}   Host active: ${host}`)
  return { board: board ?? -1, host: host ?? -1 }
}

async function main() {
  const { inserts: INSERT, keep: KEEP, archive: ARCHIVE } = DATA
  console.log(`\nHOST RECONCILE — 5 November 2026  [${DRY ? 'DRY RUN' : 'APPLYING'}]`)
  console.log(`${ARCHIVE.length} archives · ${INSERT.length} inserts · ${KEEP.length} updates\n`)

  // A live advert can reach real candidates through job_alerts.
  const { count: alerts } = await supa.from('job_alerts').select('*', { count: 'exact', head: true })
  console.log(`job_alerts rows: ${alerts}`)
  if ((alerts ?? 0) > 0) {
    console.error('STOPPING: job_alerts is not empty, so publishing adverts can email real candidates. Ask before continuing.')
    process.exit(1)
  }

  const before = await census('BEFORE')

  // ── THE RE-RUN GUARD ─────────────────────────────────────────────────────
  // Archives and updates are idempotent; inserts are not. Once applied, this
  // file is a RECORD, not a task.
  const { data: already, error: alreadyErr } = await supa.from('jobs')
    .select('job_reference').eq('company', COMPANY).in('job_reference', INSERT.map(a => a.ref))
  if (alreadyErr) throw alreadyErr
  if ((already?.length ?? 0) > 0) {
    console.error(`\nREFUSING: ${already!.length} of this reconcile's ${INSERT.length} references already exist:`)
    console.error(`  ${already!.map(r => r.job_reference).sort().join(', ')}`)
    console.error('This reconcile was applied and is a RECORD. A new reconcile takes a new date and fresh references.')
    process.exit(2)
  }
  // And by Caterer URL: a role already on the board under another reference
  // must not be inserted twice.
  const { data: byUrl, error: byUrlErr } = await supa.from('jobs')
    .select('job_reference, source_url').eq('company', COMPANY).eq('status', 'active')
    .in('source_url', INSERT.map(a => a.sourceUrl))
  if (byUrlErr) throw byUrlErr
  if ((byUrl?.length ?? 0) > 0) {
    console.error(`\nREFUSING: ${byUrl!.length} of these Caterer adverts are already live on the board:`)
    byUrl!.forEach(r => console.error(`  ${r.job_reference}  ${r.source_url}`))
    process.exit(2)
  }
  console.log(`re-run guard: none of ${INSERT.length} references or Caterer links exist yet\n`)

  // ── PHASE 1: ARCHIVE ─────────────────────────────────────────────────────
  console.log(`PHASE 1 — ARCHIVE ${ARCHIVE.length}  (live on the board, no longer on Caterer)`)
  const archiveIds = ARCHIVE.map(a => a.id)
  const { data: toArchive, error: readErr } = await supa.from('jobs').select('id, company, status').in('id', archiveIds)
  if (readErr) throw readErr
  const eligible = (toArchive ?? []).filter(r => r.company === COMPANY && r.status === 'active')
  check(eligible.length === ARCHIVE.length, `all ${ARCHIVE.length} archive targets are Host Staffing and active before the write (found ${eligible.length})`)
  if (fails.length) { console.error('\nRefusing to write: the archive set is not what was expected.'); process.exit(1) }
  for (const a of ARCHIVE) {
    if (APPLY) {
      const { data, error } = await supa.from('jobs').update({ status: 'archived' })
        .eq('id', a.id).eq('company', COMPANY).eq('status', 'active').select('id')
      if (error) throw error
      if (data?.length !== 1) { console.error(`  FAILED to archive ${a.ref} ${a.id}`); process.exit(1) }
    }
    console.log(`  ${DRY ? '[dry] ' : ''}archived  ${a.ref}  ${a.title}`)
  }

  // ── PHASE 2: INSERT ──────────────────────────────────────────────────────
  console.log(`\nPHASE 2 — INSERT ${INSERT.length}  (live on Caterer, not on the board)`)
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
      area_region: ad.areaRegion,
      country: 'GB',
      full_location: ad.postcode ? { city: ad.city, postcode: ad.postcode, addressLine1: '' } : null,
      salary_min: ad.salaryMin,
      salary_max: ad.salaryMax,
      salary_type: ad.salaryType,
      employment_type: ad.employmentType,
      work_location: 'In person',
      category: 'hospitality',
      job_reference: ad.ref,
      source_url: ad.sourceUrl,
      // Read from each advert's own Licence/Certifications section, never
      // inferred from the role type (note §3).
      work_authorization: RIGHT_TO_WORK_VALUE(ad.rtw),
      is_recruiter_posting: true,
      status: 'active',
    }
    if (APPLY) {
      const { data, error } = await supa.from('jobs').insert(row).select('id')
      if (error) throw error
      inserted.push(data![0].id)
    }
    const pay = ad.salaryType === 'hourly' ? `£${ad.salaryMin.toFixed(2)}–£${ad.salaryMax.toFixed(2)}/hr` : `£${ad.salaryMin.toLocaleString('en-GB')}–£${ad.salaryMax.toLocaleString('en-GB')}`
    console.log(`  ${DRY ? '[dry] ' : ''}${ad.ref}  ${ad.title}`)
    console.log(`         ${ad.location}, ${ad.area}${ad.postcode ? ' (' + ad.postcode + ')' : ''} · ${pay} · ${ad.employmentType.join('/')} · right to work: ${ad.rtw ? 'stated' : 'not stated'} · ${ad.fullDescription.length} chars`)
    console.log(`         salary: ${ad.salaryCase}`)
    console.log(`         Caterer: "${ad.catererTitle}"  job${ad.catererId}`)
  }

  // ── PHASE 3: THE TWO THAT STAY ───────────────────────────────────────────
  console.log(`\nPHASE 3 — UPDATE ${KEEP.length}  (still live on Caterer)`)
  for (const k of KEEP) {
    const patch = { ...k.set, source_url: k.sourceUrl }
    if (APPLY) {
      const { data, error } = await supa.from('jobs').update(patch)
        .eq('id', k.id).eq('company', COMPANY).eq('status', 'active').select('id')
      if (error) throw error
      if (data?.length !== 1) { console.error(`  FAILED to update ${k.ref} ${k.id}`); process.exit(1) }
    }
    console.log(`  ${DRY ? '[dry] ' : ''}${k.ref}  ${k.title} — ${k.why}`)
    console.log(`         sets: ${Object.keys(patch).join(', ')}`)
  }

  const after = await census('\nAFTER')
  const expectHost = before.host - ARCHIVE.length + INSERT.length
  const expectBoard = before.board - ARCHIVE.length + INSERT.length
  if (DRY) {
    console.log(`\nDRY RUN — nothing written. Would be: board ${before.board} -> ${expectBoard}, Host ${before.host} -> ${expectHost}`)
    return
  }

  // ── READ BACK ────────────────────────────────────────────────────────────
  console.log('\nREAD-BACK — the inserted rows, every field the note governs')
  const { data: back, error: backErr } = await supa.from('jobs')
    .select('id, job_reference, title, area, area_county, area_region, full_location, salary_min, salary_max, salary_type, work_authorization, status, company, is_recruiter_posting, source_url, full_description')
    .in('id', inserted)
  if (backErr) throw backErr
  check(back!.length === INSERT.length, `all ${INSERT.length} inserted rows read back`)
  for (const ad of INSERT) {
    const r = back!.find(x => x.job_reference === ad.ref)
    if (!r) { check(false, `${ad.ref} read back`); continue }
    const pc = (r.full_location as any)?.postcode ?? null
    const ok = r.title === ad.title && r.area === ad.area && r.area_county === ad.areaCounty && r.area_region === ad.areaRegion &&
      pc === ad.postcode && Number(r.salary_min) === ad.salaryMin && Number(r.salary_max) === ad.salaryMax &&
      r.salary_type === ad.salaryType && (r.work_authorization ?? []).length === (ad.rtw ? 1 : 0) &&
      r.status === 'active' && r.company === COMPANY && r.is_recruiter_posting === true &&
      r.source_url === ad.sourceUrl && r.full_description === ad.fullDescription
    check(ok, `${ad.ref} ${ad.title}`)
  }
  console.log('\nREAD-BACK — the two kept rows')
  const { data: kept } = await supa.from('jobs').select('id, job_reference, status, source_url').in('id', KEEP.map(k => k.id))
  for (const k of KEEP) {
    const r = kept!.find(x => x.id === k.id)
    check(!!r && r.status === 'active' && r.source_url === k.sourceUrl, `${k.ref} active with its Caterer link`)
  }
  console.log('\nREAD-BACK — the archived rows')
  const { data: gone } = await supa.from('jobs').select('id, status').in('id', archiveIds)
  const stillActive = (gone ?? []).filter(r => r.status === 'active')
  check(stillActive.length === 0 && gone!.length === ARCHIVE.length, `all ${ARCHIVE.length} archive targets read back, ${stillActive.length} still active`)

  check(after.board === expectBoard, `board ${before.board} -> ${after.board} (expected ${expectBoard})`)
  check(after.host === expectHost, `Host ${before.host} -> ${after.host} (expected ${expectHost})`)
  console.log(`\n${fails.length === 0 ? 'ALL CHECKS PASSED' : `${fails.length} CHECK(S) FAILED`}`)
  if (fails.length) { fails.forEach(f => console.error(`  FAILED: ${f}`)); process.exit(1) }
}

main().catch(e => { console.error(e.message); process.exit(1) })
