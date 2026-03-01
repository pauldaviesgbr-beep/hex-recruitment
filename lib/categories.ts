export interface Category {
  id: string
  label: string
}

export const categories: Category[] = [
  { id: 'accountancy', label: 'Accountancy, Banking & Finance' },
  { id: 'business', label: 'Business, Consulting & Management' },
  { id: 'charity', label: 'Charity & Voluntary Work' },
  { id: 'creative', label: 'Creative Arts & Design' },
  { id: 'digital', label: 'Digital & Information Technology' },
  { id: 'energy', label: 'Energy & Utilities' },
  { id: 'engineering', label: 'Engineering & Manufacturing' },
  { id: 'environment', label: 'Environment & Agriculture' },
  { id: 'healthcare', label: 'Healthcare & Social Care' },
  { id: 'hospitality', label: 'Hospitality, Tourism & Sport' },
  { id: 'law', label: 'Law & Legal Services' },
  { id: 'marketing', label: 'Marketing, Advertising & PR' },
  { id: 'media', label: 'Media & Internet' },
  { id: 'property', label: 'Property & Construction' },
  { id: 'public', label: 'Public Services & Administration' },
  { id: 'recruitment', label: 'Recruitment & HR' },
  { id: 'retail', label: 'Retail & Sales' },
  { id: 'science', label: 'Science & Pharmaceuticals' },
  { id: 'teaching', label: 'Teaching & Education' },
  { id: 'transport', label: 'Transport & Logistics' },
]

export function getCategoryLabel(id: string): string {
  return categories.find(c => c.id === id)?.label || id
}
