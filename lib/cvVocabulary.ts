// THE HOSPITALITY VOCABULARY — SENIORITY-RANKED.
//
// This is the reusable asset of CV parsing, and the part worth getting right.
// Everything else here is plumbing that could be rewritten in an afternoon;
// this encodes what the roles ARE and how they relate.
//
// WHY RANKED AND NOT A FLAT LIST. A CV describes a career, not a job:
// commis -> chef de partie -> sous -> head. Extract it flat and a head chef
// matches commis roles exactly as strongly as head chef roles, which is wrong
// most of the time. The rank is what lets the scorer tell "this is what they
// can do" from "this is what they are doing now".
//
// THE RANKS ARE ORDINAL, NOT A SCORE. Rank 5 is not "five times" rank 1. They
// exist to be COMPARED — is this role above, below, or level with that one —
// and nothing should ever multiply by them.
//
// KITCHEN AND FRONT OF HOUSE ARE SEPARATE LADDERS with deliberately comparable
// ranks, so a sous chef (4) and an assistant manager (4) read as roughly
// equivalent standing. That comparison is rough and is meant to be: it exists
// so a career change reads sensibly, not so anyone can compute a difference.
//
// MATCHING IS ON THE ALIASES, LOWERCASED, and the aliases carry the spellings
// people actually write on CVs — "chef de partie", "CDP", "cheff de partie".
// The board's own data is the source: 41 live listings say "Chef De Partie"
// with that exact capitalisation, and candidates write it six different ways.

export type Ladder = 'kitchen' | 'front' | 'management'

export interface SeniorityRole {
  /** Canonical name. What gets stored and displayed. */
  title: string
  /** 1 = entry, ascending. Ordinal — compare, never arithmetic. */
  rank: number
  ladder: Ladder
  /** Lowercased spellings seen on real CVs. Order does not matter; the longest
   *  match wins at lookup time so "senior sous chef" beats "sous chef". */
  aliases: string[]
}

export const SENIORITY: SeniorityRole[] = [
  // ── KITCHEN ──────────────────────────────────────────────────────────
  { title: 'Kitchen Porter',        rank: 1, ladder: 'kitchen', aliases: ['kitchen porter', 'kp', 'kitchen assistant', 'kitchen hand'] },
  { title: 'Commis Chef',           rank: 2, ladder: 'kitchen', aliases: ['commis chef', 'commis', 'trainee chef', 'apprentice chef'] },
  { title: 'Demi Chef de Partie',   rank: 3, ladder: 'kitchen', aliases: ['demi chef de partie', 'demi chef', 'demi cdp'] },
  { title: 'Chef de Partie',        rank: 4, ladder: 'kitchen', aliases: ['chef de partie', 'chef de parti', 'cheff de partie', 'cdp', 'section chef'] },
  { title: 'Junior Sous Chef',      rank: 5, ladder: 'kitchen', aliases: ['junior sous chef', 'junior sous', 'jnr sous chef'] },
  { title: 'Sous Chef',             rank: 6, ladder: 'kitchen', aliases: ['sous chef', 'sous-chef', 'sous'] },
  { title: 'Senior Sous Chef',      rank: 7, ladder: 'kitchen', aliases: ['senior sous chef', 'senior sous', 'snr sous chef'] },
  { title: 'Head Chef',             rank: 8, ladder: 'kitchen', aliases: ['head chef', 'head-chef', 'chef de cuisine', 'kitchen manager'] },
  { title: 'Executive Chef',        rank: 9, ladder: 'kitchen', aliases: ['executive chef', 'exec chef', 'executive head chef', 'group head chef', 'culinary director'] },

  // Kitchen specialisms. RANKED ALONGSIDE, NOT ABOVE OR BELOW — a pastry chef
  // is not senior or junior to a chef de partie, they are a different thing.
  // Given the CDP rank because that is the standing they usually hold.
  { title: 'Pastry Chef',           rank: 4, ladder: 'kitchen', aliases: ['pastry chef', 'patissier', 'pâtissier', 'pastry cdp'] },
  { title: 'Head Pastry Chef',      rank: 8, ladder: 'kitchen', aliases: ['head pastry chef', 'head patissier', 'executive pastry chef'] },
  { title: 'Butcher',               rank: 4, ladder: 'kitchen', aliases: ['butcher', 'boucher'] },
  { title: 'Baker',                 rank: 4, ladder: 'kitchen', aliases: ['baker', 'head baker'] },

  // ── FRONT OF HOUSE ───────────────────────────────────────────────────
  { title: 'Runner',                rank: 1, ladder: 'front', aliases: ['runner', 'food runner', 'commis waiter'] },
  { title: 'Host',                  rank: 2, ladder: 'front', aliases: ['host', 'hostess', 'receptionist', 'maitre d hotel desk'] },
  { title: 'Waiter',                rank: 2, ladder: 'front', aliases: ['waiter', 'waitress', 'server', 'waiting staff', 'front of house team member'] },
  { title: 'Bartender',             rank: 3, ladder: 'front', aliases: ['bartender', 'barman', 'barmaid', 'mixologist', 'bar staff'] },
  { title: 'Chef de Rang',          rank: 3, ladder: 'front', aliases: ['chef de rang'] },
  { title: 'Head Waiter',           rank: 4, ladder: 'front', aliases: ['head waiter', 'head waitress', 'maitre d', "maitre d'", 'maître d'] },
  { title: 'Supervisor',            rank: 4, ladder: 'front', aliases: ['supervisor', 'floor supervisor', 'shift supervisor', 'team leader'] },
  { title: 'Bar Manager',           rank: 5, ladder: 'front', aliases: ['bar manager', 'head bartender'] },
  { title: 'Sommelier',             rank: 5, ladder: 'front', aliases: ['sommelier', 'head sommelier', 'wine director'] },
  { title: 'Assistant Manager',     rank: 5, ladder: 'front', aliases: ['assistant manager', 'assistant restaurant manager', 'deputy manager', 'assistant front of house manager'] },
  { title: 'Restaurant Manager',    rank: 6, ladder: 'front', aliases: ['restaurant manager', 'front of house manager', 'foh manager', 'reception manager'] },

  // ── MANAGEMENT / ABOVE THE VENUE ─────────────────────────────────────
  { title: 'General Manager',       rank: 7, ladder: 'management', aliases: ['general manager', 'gm', 'venue manager', 'hotel manager'] },
  { title: 'Operations Manager',    rank: 8, ladder: 'management', aliases: ['operations manager', 'ops manager', 'area manager', 'multi site manager', 'multi-site manager'] },
  { title: 'Operations Director',   rank: 9, ladder: 'management', aliases: ['operations director', 'director of operations', 'food and beverage director', 'f&b director'] },
]

/**
 * SKILL TERMS THE MODEL IS ALLOWED TO RETURN.
 *
 * A closed list, and that is the point. It is what makes a match explainable —
 * "because your CV mentions pastry, Michelin and allergens" — and it stops the
 * model inventing categories that nothing else in the product understands.
 *
 * Anything a CV says that is not in here is simply not extracted. That is a
 * deliberate trade: a smaller, trustworthy signal beats a larger vague one.
 */
export const SKILL_TERMS: string[] = [
  // Sections and stations
  'larder', 'garnish', 'sauce', 'grill', 'pastry', 'butchery', 'fish', 'bakery',
  'breakfast', 'banqueting', 'pass',
  // Standards and settings
  'michelin', 'aa rosette', 'fine dining', 'gastropub', 'brasserie', 'bistro',
  'hotel', 'contract catering', 'events catering', 'high volume', 'à la carte',
  'tasting menu', 'private dining', 'room service', 'all day dining',
  // Cuisines
  'french', 'italian', 'japanese', 'indian', 'thai', 'chinese', 'spanish',
  'british', 'mediterranean', 'middle eastern', 'seafood', 'steakhouse', 'vegan',
  // Craft
  'menu development', 'recipe development', 'plating', 'butchery skills',
  'fermentation', 'sous vide', 'bread making', 'chocolate work', 'sugar work',
  // Running a section or a business
  'brigade', 'rota', 'stock control', 'ordering', 'supplier management',
  'gp margin', 'food cost', 'labour cost', 'p&l', 'budgeting', 'forecasting',
  // Compliance and safety
  'allergens', 'haccp', 'food hygiene', 'level 2 food safety',
  'level 3 food safety', 'coshh', 'due diligence', 'eho',
  // People
  'training', 'mentoring', 'recruitment', 'appraisals', 'team leadership',
  // Front of house
  'wine service', 'wset', 'cocktails', 'barista', 'epos', 'opentable',
  'resdiary', 'sequence of service', 'upselling', 'complaint handling',
]

/**
 * FOLD ACCENTS AWAY ON BOTH SIDES, or the accented aliases are unreachable.
 *
 * The first version stripped anything outside [a-z0-9] from the INPUT only, so
 * "maître d" arrived as "ma tre d" and could never match the alias "maître d"
 * — while an unaccented CV saying "maitre d" matched fine. The accented alias,
 * the one written for the people who spell it properly, was dead on arrival.
 * Same for pâtissier. Normalising one side and not the other is the whole bug.
 */
export function foldTitle(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // é -> e, î -> i
    .toLowerCase()
    .replace(/['’`]/g, '')                               // maitre d' -> maitre d
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const BY_ALIAS: { alias: string; role: SeniorityRole }[] = SENIORITY
  .flatMap(role => role.aliases.map(alias => ({ alias: foldTitle(alias), role })))
  // LONGEST FIRST. "senior sous chef" contains "sous chef", so a shortest-first
  // scan would call every senior sous a sous — silently demoting them by a
  // rank on every CV that says it.
  .sort((a, b) => b.alias.length - a.alias.length)

/** Resolve a free-text job title to a ranked role, or null if unrecognised.
 *  Null is a real answer and is stored as such — inventing a rank for a title
 *  we do not know is worse than admitting we do not know it. */
export function resolveSeniority(rawTitle: string | null | undefined): SeniorityRole | null {
  if (!rawTitle) return null
  const t = foldTitle(rawTitle)
  if (!t) return null
  for (const { alias, role } of BY_ALIAS) {
    if (t === alias || t.includes(alias)) return role
  }
  return null
}

/** The canonical titles, for the model's output schema. */
export const CANONICAL_TITLES = SENIORITY.map(r => r.title)
