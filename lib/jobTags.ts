export type TagCategory = 'urgency' | 'experience' | 'workStyle' | 'benefits' | 'application'

export interface TagDefinition {
  label: string
  category: TagCategory
}

export const TAG_CATEGORIES: Record<TagCategory, { title: string; icon: string }> = {
  urgency:     { title: 'Urgency',     icon: '🔥' },
  experience:  { title: 'Experience',  icon: '📊' },
  workStyle:   { title: 'Work Style',  icon: '🕐' },
  benefits:    { title: 'Benefits',    icon: '🎁' },
  application: { title: 'Application', icon: '📋' },
}

export const ALL_TAGS: TagDefinition[] = [
  // URGENCY (4)
  { label: 'Immediate start',      category: 'urgency' },
  { label: 'Urgent hire',          category: 'urgency' },
  { label: 'Interviews this week', category: 'urgency' },
  { label: 'Start date flexible',  category: 'urgency' },

  // EXPERIENCE (5)
  { label: 'No experience required', category: 'experience' },
  { label: 'Entry level',            category: 'experience' },
  { label: 'Mid level',              category: 'experience' },
  { label: 'Senior level',           category: 'experience' },
  { label: 'Management',             category: 'experience' },

  // WORK STYLE (3)
  { label: 'Remote',   category: 'workStyle' },
  { label: 'Hybrid',   category: 'workStyle' },
  { label: 'On-site',  category: 'workStyle' },

  // BENEFITS (5)
  { label: 'Pension',            category: 'benefits' },
  { label: 'Health insurance',   category: 'benefits' },
  { label: 'Bonus scheme',       category: 'benefits' },
  { label: 'Training provided',  category: 'benefits' },
  { label: 'Career progression', category: 'benefits' },

  // APPLICATION (2)
  { label: 'CV required',           category: 'application' },
  { label: 'Cover letter required', category: 'application' },
]

// Maps old / removed tag names to the closest current tag.
// Tags with no suitable replacement map to null so callers can drop them.
export const LEGACY_TAG_MAP: Record<string, string | null> = {
  // Old name formats
  'Immediate start!': 'Immediate start',
  'No experience':    'No experience required',
  'Interviews today': 'Interviews this week',
  // Removed experience tag
  'Executive':        'Management',
  // Removed work-style tags (no equivalent — drop)
  'Flexible hours':      null,
  'Part-time available': null,
  'Shift work':          null,
  'Weekend work':        null,
  'Night shifts':        null,
  'Term-time only':      null,
  // Removed benefit tags
  'Staff discount':        null,
  'Free meals':            null,
  'Uniform provided':      null,
  'Relocation assistance': null,
  'Visa sponsorship':      null,
  // Removed application tags
  'Easy apply':                   null,
  'References required':          null,
  'DBS check required':           null,
  'Right to work in UK required': null,
}

export function getTagsByCategory(): Record<TagCategory, TagDefinition[]> {
  const grouped = {} as Record<TagCategory, TagDefinition[]>
  for (const cat of Object.keys(TAG_CATEGORIES) as TagCategory[]) {
    grouped[cat] = ALL_TAGS.filter(t => t.category === cat)
  }
  return grouped
}

/** Normalise a tag array, dropping removed tags and renaming legacy names. */
export function normalizeTags(tags: string[]): string[] {
  return tags.reduce<string[]>((acc, t) => {
    if (t in LEGACY_TAG_MAP) {
      const mapped = LEGACY_TAG_MAP[t]
      if (mapped) acc.push(mapped)
    } else {
      acc.push(t)
    }
    return acc
  }, [])
}

export function getTagCategory(label: string): TagCategory | null {
  const def = ALL_TAGS.find(t => t.label === label)
  return def?.category ?? null
}

/** The three work-style tags that should appear prominently in badge rows. */
export const WORK_STYLE_TAGS: ReadonlySet<string> = new Set(['Remote', 'Hybrid', 'On-site'])
