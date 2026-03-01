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
  // URGENCY
  { label: 'Immediate start',      category: 'urgency' },
  { label: 'Urgent hire',          category: 'urgency' },
  { label: 'Interviews this week', category: 'urgency' },
  { label: 'Start date flexible',  category: 'urgency' },

  // EXPERIENCE
  { label: 'No experience required', category: 'experience' },
  { label: 'Entry level',            category: 'experience' },
  { label: 'Mid level',              category: 'experience' },
  { label: 'Senior level',           category: 'experience' },
  { label: 'Management',             category: 'experience' },
  { label: 'Executive',              category: 'experience' },

  // WORK STYLE
  { label: 'Remote',              category: 'workStyle' },
  { label: 'Hybrid',              category: 'workStyle' },
  { label: 'On-site',             category: 'workStyle' },
  { label: 'Flexible hours',      category: 'workStyle' },
  { label: 'Part-time available', category: 'workStyle' },
  { label: 'Shift work',          category: 'workStyle' },
  { label: 'Weekend work',        category: 'workStyle' },
  { label: 'Night shifts',        category: 'workStyle' },
  { label: 'Term-time only',      category: 'workStyle' },

  // BENEFITS
  { label: 'Pension',               category: 'benefits' },
  { label: 'Health insurance',      category: 'benefits' },
  { label: 'Bonus scheme',          category: 'benefits' },
  { label: 'Staff discount',        category: 'benefits' },
  { label: 'Free meals',            category: 'benefits' },
  { label: 'Uniform provided',      category: 'benefits' },
  { label: 'Training provided',     category: 'benefits' },
  { label: 'Career progression',    category: 'benefits' },
  { label: 'Relocation assistance', category: 'benefits' },
  { label: 'Visa sponsorship',      category: 'benefits' },

  // APPLICATION
  { label: 'Easy apply',                   category: 'application' },
  { label: 'CV required',                  category: 'application' },
  { label: 'Cover letter required',        category: 'application' },
  { label: 'References required',          category: 'application' },
  { label: 'DBS check required',           category: 'application' },
  { label: 'Right to work in UK required', category: 'application' },
]

export const LEGACY_TAG_MAP: Record<string, string> = {
  'Immediate start!': 'Immediate start',
  'No experience':    'No experience required',
  'Easy apply':       'Easy apply',
  'Interviews today': 'Interviews this week',
}

export function getTagsByCategory(): Record<TagCategory, TagDefinition[]> {
  const grouped = {} as Record<TagCategory, TagDefinition[]>
  for (const cat of Object.keys(TAG_CATEGORIES) as TagCategory[]) {
    grouped[cat] = ALL_TAGS.filter(t => t.category === cat)
  }
  return grouped
}

export function normalizeTags(tags: string[]): string[] {
  return tags.map(t => LEGACY_TAG_MAP[t] || t)
}

export function getTagCategory(label: string): TagCategory | null {
  const def = ALL_TAGS.find(t => t.label === label)
  return def?.category ?? null
}
