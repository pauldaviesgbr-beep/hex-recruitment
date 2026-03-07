'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEV_MODE } from '@/lib/mockAuth'
import { calculateTrialExpiry } from '@/lib/trialUtils'
import { popularNationalities, allNationalities } from '@/lib/nationalities'
import DatePicker from './DatePicker'
import PostcodeLookup, { type AddressData } from './PostcodeLookup'
import PasswordInput from './PasswordInput'
import styles from './JobSeekerProfileForm.module.css'

// Normalize URL to ensure it has https:// prefix
function normalizeUrl(url: string): string {
  if (!url || url.trim() === '') return ''
  let normalized = url.trim()
  // Remove any leading/trailing whitespace
  // If URL doesn't start with http:// or https://, add https://
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized
  }
  return normalized
}

// Form step definitions (5 steps - no payment required for free trial)
const STEPS = [
  { id: 1, title: 'Personal Details', icon: '👤' },
  { id: 2, title: 'Contact Info', icon: '📞' },
  { id: 3, title: 'Professional', icon: '💼' },
  { id: 4, title: 'Documents', icon: '📋' },
  { id: 5, title: 'Account', icon: '🔐' },
]

// Work experience entry interface
interface WorkExperience {
  company: string
  role: string
  startDate: string
  endDate: string
  description: string
}

// Education entry interface
interface EducationEntry {
  institution: string
  qualification: string
  fieldOfStudy: string
  startDate: string
  endDate: string
  inProgress: boolean
  grade: string
}

// Language entry interface
interface LanguageEntry {
  name: string
  proficiency: 'Native' | 'Fluent' | 'Conversational' | 'Basic'
}

// Job sector options (matching /jobs and /candidates pages)
const JOB_SECTORS = [
  { id: 'hospitality', label: 'Hospitality Tourism & Sport' },
  { id: 'accountancy', label: 'Accountancy Banking & Finance' },
  { id: 'business', label: 'Business Consulting & Management' },
  { id: 'charity', label: 'Charity & Voluntary Work' },
  { id: 'creative', label: 'Creative Arts & Design' },
  { id: 'digital', label: 'Digital & Information Technology' },
  { id: 'energy', label: 'Energy & Utilities' },
  { id: 'engineering', label: 'Engineering & Manufacturing' },
  { id: 'environment', label: 'Environment & Agriculture' },
  { id: 'healthcare', label: 'Healthcare & Social Care' },
  { id: 'law', label: 'Law & Legal Services' },
  { id: 'marketing', label: 'Marketing Advertising & PR' },
  { id: 'media', label: 'Media & Internet' },
  { id: 'property', label: 'Property & Construction' },
  { id: 'public', label: 'Public Services & Administration' },
  { id: 'recruitment', label: 'Recruitment & HR' },
  { id: 'retail', label: 'Retail & Sales' },
  { id: 'science', label: 'Science & Pharmaceuticals' },
  { id: 'teaching', label: 'Teaching & Education' },
  { id: 'transport', label: 'Transport & Logistics' },
]

// Sector-specific professional skills
const SECTOR_SKILLS: Record<string, string[]> = {
  hospitality: [
    // Hospitality & Food Service
    'Fine Dining', 'Menu Development', 'Kitchen Management', 'Team Leadership',
    'Food Costing', 'French Cuisine', 'Italian Cuisine', 'Asian Cuisine',
    'Pastry', 'Wine Service', 'Cocktail Making', 'Customer Service',
    'P&L Management', 'Staff Training', 'Inventory Control', 'EPOS Systems',
    'Event Planning', 'Silver Service', 'Coffee/Barista', 'Health & Safety',
    'HACCP', 'Allergen Management', 'Butchery', 'Grill Section',
    // Tourism & Travel
    'Tour Guiding', 'Travel Planning', 'Booking Systems (Amadeus/Sabre)',
    'Foreign Languages', 'Destination Knowledge', 'Travel Documentation',
    'Group Coordination', 'Cultural Awareness', 'Resort Operations',
    'Airline/Airport Operations', 'Cruise Ship Operations', 'Tourism Marketing',
    'Visa & Immigration Knowledge',
    // Sport & Fitness
    'Sports Coaching', 'Personal Training', 'Fitness Instruction', 'Gym Management',
    'Sports Therapy', 'First Aid', 'Lifeguarding', 'Swimming Instruction',
    'Sports Event Management', 'Referee/Officiating', 'Youth Coaching',
    'Sports Analysis', 'Equipment Maintenance', 'Membership Sales',
    'Class Programming', 'Nutrition Advice', 'Rehabilitation Support',
  ],
  accountancy: [
    'Financial Analysis', 'Bookkeeping', 'Tax Preparation', 'Auditing',
    'Excel/Spreadsheets', 'Sage', 'QuickBooks', 'Payroll', 'VAT Returns',
    'Management Accounts', 'Budgeting', 'Forecasting', 'Credit Control',
    'Reconciliation', 'IFRS/GAAP',
  ],
  business: [
    'Project Management', 'Strategy', 'Stakeholder Management', 'Business Analysis',
    'Change Management', 'Agile/Scrum', 'Process Improvement', 'Presentation Skills',
    'Report Writing', 'Data Analysis', 'Risk Management', 'Lean/Six Sigma',
  ],
  charity: [
    'Fundraising', 'Grant Writing', 'Volunteer Management', 'Community Outreach',
    'Event Coordination', 'Donor Relations', 'Social Media', 'Public Speaking',
    'Safeguarding', 'Impact Reporting', 'Budget Management', 'Partnership Development',
  ],
  creative: [
    'Adobe Creative Suite', 'Photoshop', 'Illustrator', 'InDesign', 'Figma',
    'UI/UX Design', 'Typography', 'Branding', 'Photography', 'Video Editing',
    'Animation', 'Sketching', '3D Modelling', 'Print Design', 'Web Design',
  ],
  digital: [
    'JavaScript', 'Python', 'SQL', 'Cloud Computing', 'Cybersecurity',
    'Networking', 'Help Desk Support', 'Troubleshooting', 'Linux',
    'Windows Server', 'DevOps', 'Data Analysis', 'Machine Learning',
    'React', 'Node.js', 'AWS', 'Azure', 'Docker',
  ],
  energy: [
    'Renewable Energy', 'Solar PV', 'Wind Turbines', 'Electrical Systems',
    'Health & Safety', 'NEBOSH', 'Project Management', 'AutoCAD',
    'Grid Management', 'Environmental Compliance', 'Risk Assessment',
    'Energy Auditing', 'Smart Metering',
  ],
  engineering: [
    'CAD/CAM', 'AutoCAD', 'SolidWorks', 'CNC Programming', 'Lean Manufacturing',
    'Quality Control', 'Six Sigma', 'PLC Programming', 'Welding',
    'Technical Drawing', 'Project Management', 'Health & Safety',
    'ISO Standards', 'Problem Solving', 'Continuous Improvement',
  ],
  environment: [
    'Environmental Impact Assessment', 'Sustainability', 'GIS Mapping',
    'Ecology Surveys', 'Conservation', 'Waste Management', 'Water Treatment',
    'Soil Analysis', 'Wildlife Monitoring', 'ISO 14001', 'Carbon Footprint Analysis',
    'Agricultural Science', 'Land Management',
  ],
  healthcare: [
    'Patient Care', 'First Aid', 'Medication Administration', 'Care Planning',
    'Safeguarding', 'Manual Handling', 'Dementia Care', 'Mental Health Support',
    'Record Keeping', 'Communication', 'Infection Control', 'Wound Care',
    'Phlebotomy', 'CPR/BLS', 'Risk Assessment',
  ],
  law: [
    'Legal Research', 'Contract Review', 'Case Management', 'Client Care',
    'Litigation', 'Conveyancing', 'Legal Drafting', 'Court Procedures',
    'GDPR Compliance', 'Due Diligence', 'Negotiation', 'Legal Aid',
    'Family Law', 'Criminal Law', 'Employment Law',
  ],
  marketing: [
    'Social Media Management', 'SEO', 'Content Writing', 'Google Analytics',
    'Campaign Management', 'Copywriting', 'Brand Management', 'Email Marketing',
    'Photoshop', 'Canva', 'PPC/Google Ads', 'Market Research',
    'CRM Systems', 'A/B Testing', 'Video Production',
  ],
  media: [
    'Journalism', 'Copy Editing', 'Proofreading', 'Content Management Systems',
    'WordPress', 'Video Production', 'Audio Editing', 'Social Media',
    'SEO Writing', 'Photography', 'Broadcasting', 'Scriptwriting',
    'Podcast Production', 'Adobe Premiere', 'Final Cut Pro',
  ],
  property: [
    'Site Management', 'Health & Safety', 'CSCS Card', 'Bricklaying',
    'Plumbing', 'Electrical Installation', 'Carpentry', 'Plastering',
    'Project Management', 'Building Regulations', 'AutoCAD', 'Quantity Surveying',
    'Property Valuation', 'Landscaping', 'Roofing',
  ],
  public: [
    'Policy Analysis', 'Report Writing', 'Public Administration', 'Stakeholder Engagement',
    'Data Analysis', 'Budget Management', 'Freedom of Information', 'Safeguarding',
    'Minute Taking', 'Committee Support', 'Regulatory Compliance',
    'Community Engagement', 'Equality & Diversity',
  ],
  recruitment: [
    'Talent Acquisition', 'Interviewing', 'Candidate Sourcing', 'LinkedIn Recruiter',
    'ATS Systems', 'Employee Relations', 'Onboarding', 'HR Administration',
    'Employment Law', 'Performance Management', 'Payroll', 'CIPD',
    'Diversity & Inclusion', 'Workforce Planning',
  ],
  retail: [
    'Customer Service', 'Cash Handling', 'Stock Management', 'Visual Merchandising',
    'Upselling', 'CRM Systems', 'Sales Targets', 'Inventory Management',
    'EPOS Systems', 'Loss Prevention', 'Team Leadership', 'Store Opening/Closing',
    'Product Knowledge', 'Complaints Handling',
  ],
  science: [
    'Laboratory Techniques', 'Data Analysis', 'Research Methods', 'GLP/GMP',
    'HPLC', 'Mass Spectrometry', 'PCR', 'Cell Culture', 'Statistical Analysis',
    'Report Writing', 'Quality Control', 'Regulatory Affairs',
    'Clinical Trials', 'Microscopy', 'Risk Assessment',
  ],
  teaching: [
    'Lesson Planning', 'Classroom Management', 'Differentiation', 'Assessment',
    'Safeguarding', 'SEN Support', 'Curriculum Development', 'Behaviour Management',
    'Phonics', 'Marking & Feedback', 'Parent Communication', 'EYFS',
    'Key Stage 1-4', 'Pastoral Care', 'Educational Technology',
  ],
  transport: [
    'Driving Licence Categories', 'Forklift Operation', 'Warehouse Management',
    'Route Planning', 'Stock Control', 'Health & Safety', 'Loading/Unloading',
    'Fleet Management', 'CPC Qualification', 'ADR Certification',
    'Supply Chain', 'Inventory Systems', 'Tachograph', 'Vehicle Checks',
  ],
}

interface ProfileFormData {
  // Personal Details
  photo: File | null
  photoPreview: string
  firstName: string
  lastName: string
  dateOfBirth: string
  nationality: string

  // Contact Info
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
  phone: string
  email: string

  // Contact Info extended
  preferredLocations: string

  // Professional
  jobSector: string
  currentPosition: string
  aboutMe: string
  personalBio: string
  professionalSkills: string[]
  workExperience: WorkExperience[]
  yearsExperience: number
  desiredSalary: string
  salaryMin: string
  salaryMax: string
  salaryPeriod: 'hour' | 'year'
  preferredJobTypes: string[]
  workLocationPreferences: string[]
  availability: string
  linkedinUrl: string
  facebookUrl: string
  instagramUrl: string
  cv: File | null
  cvFileName: string
  education: EducationEntry[]
  languages: LanguageEntry[]

  // Documents checkboxes
  hasNiNumber: boolean
  hasBankAccount: boolean
  hasRightToWork: boolean
  hasP45: boolean

  // Account
  password: string
  confirmPassword: string

  // Bank Details
  bankName: string
  sortCode: string
  accountNumber: string
  accountHolderName: string
}

interface JobSeekerProfileFormProps {
  mode: 'register' | 'edit'
  existingData?: Partial<ProfileFormData>
  userId?: string
}

export default function JobSeekerProfileForm({ mode, existingData, userId }: JobSeekerProfileFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cvInputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [nationalitySearch, setNationalitySearch] = useState('')
  const [nationalityOpen, setNationalityOpen] = useState(false)
  const nationalityRef = useRef<HTMLDivElement>(null)
  const [addressFound, setAddressFound] = useState(
    !!(existingData?.addressLine1 || existingData?.city || existingData?.postcode)
  )

  // Close nationality dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (nationalityRef.current && !nationalityRef.current.contains(event.target as Node)) {
        setNationalityOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (success && mode === 'edit') {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setSuccess(false), 4000)
    }
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }
  }, [success, mode])

  // Testing mode only enabled when DEV_MODE is true
  const isTestingMode = DEV_MODE

  // Always 5 steps (no payment step - free trial for 14 days)
  const totalSteps = 5

  const [formData, setFormData] = useState<ProfileFormData>({
    photo: null,
    photoPreview: existingData?.photoPreview || '',
    firstName: existingData?.firstName || '',
    lastName: existingData?.lastName || '',
    dateOfBirth: existingData?.dateOfBirth || '',
    nationality: existingData?.nationality || '',
    addressLine1: existingData?.addressLine1 || '',
    addressLine2: existingData?.addressLine2 || '',
    city: existingData?.city || '',
    county: (existingData as any)?.county || '',
    postcode: existingData?.postcode || '',
    phone: existingData?.phone || '',
    email: existingData?.email || '',
    preferredLocations: (existingData as any)?.preferredLocations || '',
    jobSector: (existingData as any)?.jobSector || 'hospitality',
    currentPosition: existingData?.currentPosition || '',
    aboutMe: (existingData as any)?.aboutMe || '',
    personalBio: (existingData as any)?.personalBio || '',
    professionalSkills: (existingData as any)?.professionalSkills || [],
    workExperience: (existingData as any)?.workExperience || [{ company: '', role: '', startDate: '', endDate: '', description: '' }],
    yearsExperience: (existingData as any)?.yearsExperience || 1,
    desiredSalary: existingData?.desiredSalary || '',
    salaryMin: (existingData as any)?.salaryMin || '',
    salaryMax: (existingData as any)?.salaryMax || '',
    salaryPeriod: existingData?.salaryPeriod || 'year',
    preferredJobTypes: (existingData as any)?.preferredJobTypes || [],
    workLocationPreferences: (existingData as any)?.workLocationPreferences || [],
    availability: (existingData as any)?.availability || 'Available immediately',
    linkedinUrl: existingData?.linkedinUrl || '',
    facebookUrl: (existingData as any)?.facebookUrl || '',
    instagramUrl: existingData?.instagramUrl || '',
    cv: null,
    cvFileName: existingData?.cvFileName || '',
    education: (existingData as any)?.education || [{ institution: '', qualification: '', fieldOfStudy: '', startDate: '', endDate: '', inProgress: false, grade: '' }],
    languages: (existingData as any)?.languages || [{ name: '', proficiency: 'Conversational' as const }],
    hasNiNumber: existingData?.hasNiNumber || false,
    hasBankAccount: existingData?.hasBankAccount || false,
    hasRightToWork: existingData?.hasRightToWork || false,
    hasP45: existingData?.hasP45 || false,
    password: '',
    confirmPassword: '',
    bankName: existingData?.bankName || '',
    sortCode: existingData?.sortCode || '',
    accountNumber: existingData?.accountNumber || '',
    accountHolderName: existingData?.accountHolderName || '',
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleDobChange = (part: 'day' | 'month' | 'year', value: string) => {
    const parts = formData.dateOfBirth ? formData.dateOfBirth.split('-') : ['', '', '']
    const y = part === 'year' ? value : (parts[0] || '')
    const m = part === 'month' ? value : (parts[1] || '')
    const d = part === 'day' ? value : (parts[2] || '')
    const combined = (y && m && d) ? `${y}-${m}-${d}` : ''
    setFormData(prev => ({ ...prev, dateOfBirth: combined }))
  }

  const handleAddressFound = (address: AddressData) => {
    setFormData(prev => ({
      ...prev,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      county: address.county,
      postcode: address.postcode,
    }))
    setAddressFound(true)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Photo must be less than 5MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          photo: file,
          photoPreview: reader.result as string
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('CV must be less than 5MB')
        return
      }
      setFormData(prev => ({
        ...prev,
        cv: file,
        cvFileName: file.name
      }))
    }
  }

  const validateStep = (step: number): boolean => {
    setError('')

    switch (step) {
      case 1: // Personal Details
        if (!formData.firstName.trim()) {
          setError('First name is required')
          return false
        }
        if (!formData.lastName.trim()) {
          setError('Last name is required')
          return false
        }
        if (!formData.dateOfBirth) {
          setError('Date of birth is required')
          return false
        }
        if (!formData.nationality.trim()) {
          setError('Nationality is required')
          return false
        }
        return true

      case 2: // Contact Info
        if (!formData.addressLine1.trim()) {
          setError('Address line 1 is required')
          return false
        }
        if (!formData.city.trim()) {
          setError('City is required')
          return false
        }
        if (!formData.postcode.trim()) {
          setError('Postcode is required')
          return false
        }
        if (!formData.phone.trim()) {
          setError('Phone number is required')
          return false
        }
        if (!/^(\+44|0)[0-9]{10,11}$/.test(formData.phone.replace(/\s/g, ''))) {
          setError('Please enter a valid UK phone number')
          return false
        }
        if (!formData.email.trim()) {
          setError('Email is required')
          return false
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          setError('Please enter a valid email address')
          return false
        }
        return true

      case 3: // Professional
        if (!formData.currentPosition.trim()) {
          setError('Current/desired position is required')
          return false
        }
        if (!formData.salaryMin.trim() && !formData.salaryMax.trim()) {
          setError('Desired salary range is required')
          return false
        }
        return true

      case 4: // Documents
        // Checkboxes are optional, just informational
        return true

      case 5: // Account
        if (mode === 'register' || showChangePassword) {
          if (!formData.password) {
            setError('Password is required')
            return false
          }
          if (formData.password.length < 8) {
            setError('Password must be at least 8 characters')
            return false
          }
          if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match')
            return false
          }
        }
        return true

      default:
        return true
    }
  }

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps))
    } else {
      // Scroll to the error message so the user can see it
      setTimeout(() => {
        document.querySelector(`.${styles.error}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
    }
  }

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const ensureBucketExists = async () => {
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = buckets?.some(b => b.name === 'profiles')
    if (!exists) {
      await supabase.storage.createBucket('profiles', { public: true })
    }
  }

  const uploadFile = async (file: File, path: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `${path}/${fileName}`

    let { error: uploadError } = await supabase.storage
      .from('profiles')
      .upload(filePath, file, { contentType: file.type, upsert: true })

    // If bucket not found, try creating it and retry
    if (uploadError?.message?.includes('Bucket not found') || uploadError?.message?.includes('not found')) {
      await ensureBucketExists()
      const retry = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { contentType: file.type, upsert: true })
      uploadError = retry.error
    }

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return null
    }

    const { data } = supabase.storage.from('profiles').getPublicUrl(filePath)
    return data.publicUrl
  }

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    // Derive desiredSalary from salary range if not explicitly set
    if (!formData.desiredSalary.trim() && (formData.salaryMin || formData.salaryMax)) {
      const period = formData.salaryPeriod === 'hour' ? '/hr' : '/year'
      const derived = formData.salaryMin && formData.salaryMax
        ? `£${formData.salaryMin}-£${formData.salaryMax}${period}`
        : formData.salaryMin
          ? `£${formData.salaryMin}+${period}`
          : `Up to £${formData.salaryMax}${period}`
      formData.desiredSalary = derived
    }

    setLoading(true)
    setError('')

    try {
      if (mode === 'register') {
        // In testing/dev mode, bypass Supabase and save to localStorage
        if (isTestingMode) {
          // Generate a mock user ID
          const mockUserId = `test-user-${Date.now()}`

          // Save profile to localStorage for testing
          const now = new Date()
          const trialExpiresAt = calculateTrialExpiry(now)

          const profileData = {
            id: mockUserId,
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            dateOfBirth: formData.dateOfBirth,
            nationality: formData.nationality,
            addressLine1: formData.addressLine1,
            addressLine2: formData.addressLine2,
            city: formData.city,
            county: formData.county,
            postcode: formData.postcode,
            phone: formData.phone,
            jobSector: formData.jobSector,
            currentPosition: formData.currentPosition,
            aboutMe: formData.aboutMe,
            personalBio: formData.personalBio,
            professionalSkills: formData.professionalSkills,
            workExperience: formData.workExperience.filter(exp => exp.company || exp.role),
            education: formData.education.filter(edu => edu.institution || edu.qualification),
            languages: formData.languages.filter(lang => lang.name),
            yearsExperience: Number(formData.yearsExperience),
            desiredSalary: formData.desiredSalary,
            salaryMin: formData.salaryMin,
            salaryMax: formData.salaryMax,
            salaryPeriod: formData.salaryPeriod,
            preferredJobTypes: formData.preferredJobTypes,
            workLocationPreferences: formData.workLocationPreferences,
            preferredLocations: formData.preferredLocations,
            availability: formData.availability,
            linkedinUrl: normalizeUrl(formData.linkedinUrl),
            facebookUrl: normalizeUrl(formData.facebookUrl),
            instagramUrl: normalizeUrl(formData.instagramUrl),
            cvFileName: formData.cvFileName,
            hasNiNumber: formData.hasNiNumber,
            hasBankAccount: formData.hasBankAccount,
            hasRightToWork: formData.hasRightToWork,
            hasP45: formData.hasP45,
            bankName: formData.bankName,
            sortCode: formData.sortCode,
            accountNumber: formData.accountNumber,
            accountHolderName: formData.accountHolderName,
            photoPreview: formData.photoPreview,
            // Free trial - 14 days
            accountStatus: 'trial',
            trialStartDate: now.toISOString(),
            trialExpiresAt: trialExpiresAt.toISOString(),
            createdAt: now.toISOString(),
          }

          // Store in localStorage
          const existingProfiles = JSON.parse(localStorage.getItem('testProfiles') || '[]')

          // Check if profile with this email already exists - reject duplicates
          const existingProfile = existingProfiles.find(
            (p: any) => p.email?.toLowerCase() === formData.email.toLowerCase()
          )

          if (existingProfile) {
            throw new Error('An account with this email address already exists. Please use a different email or log in.')
          }

          // Add new profile
          existingProfiles.push(profileData)
          localStorage.setItem('testProfiles', JSON.stringify(existingProfiles))

          // Also set as current user
          localStorage.setItem('currentTestProfile', JSON.stringify(profileData))
          localStorage.setItem('userRole', 'employee')

          setSuccess(true)
          setTimeout(() => {
            router.push('/login/employee?registered=true')
          }, 2000)
          return
        }

        // Production mode: Use Supabase
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: `${formData.firstName} ${formData.lastName}`,
              role: 'employee'
            }
          }
        })

        if (authError) {
          console.error('[Registration] Auth error:', authError)
          throw authError
        }
        if (!authData.user) throw new Error('Failed to create account')

        // Upload files if present
        let photoUrl = null
        let cvUrl = null

        if (formData.photo) {
          photoUrl = await uploadFile(formData.photo, `photos/${authData.user.id}`)
        }

        if (formData.cv) {
          cvUrl = await uploadFile(formData.cv, `cvs/${authData.user.id}`)
        }

        // Save profile data with 14-day free trial
        const now = new Date()
        const trialExpiresAt = calculateTrialExpiry(now)

        // Build work_history JSONB from work experience entries
        const workHistory = formData.workExperience
          .filter(exp => exp.company || exp.role)
          .map(exp => ({
            company: exp.company,
            role: exp.role,
            start_date: exp.startDate,
            end_date: exp.endDate,
            description: exp.description,
          }))

        // Use upsert to handle the trigger-created row from auth.signUp
        const profilePayload = {
            user_id: authData.user.id,
            full_name: `${formData.firstName} ${formData.lastName}`.trim(),
            profile_picture_url: photoUrl,
            job_title: formData.currentPosition,
            job_sector: formData.jobSector || null,
            location: `${formData.city}, ${formData.postcode}`.replace(/^, |, $/g, ''),
            years_experience: Number(formData.yearsExperience) || 0,
            bio: formData.aboutMe || '',
            personal_bio: formData.personalBio || '',
            skills: formData.professionalSkills || [],
            work_history: workHistory,
            education: formData.education.filter(edu => edu.institution || edu.qualification).map(edu => ({
              institution: edu.institution, qualification: edu.qualification, field_of_study: edu.fieldOfStudy,
              start_date: edu.startDate, end_date: edu.endDate, in_progress: edu.inProgress, grade: edu.grade,
            })),
            languages: formData.languages.filter(lang => lang.name).map(lang => ({
              name: lang.name, proficiency: lang.proficiency,
            })),
            cv_url: cvUrl,
            cv_file_name: formData.cvFileName || null,
            availability: formData.availability,
            email: formData.email,
            phone: formData.phone,
            date_of_birth: formData.dateOfBirth || null,
            nationality: formData.nationality || null,
            address_line_1: formData.addressLine1 || null,
            address_line_2: formData.addressLine2 || null,
            city: formData.city || null,
            county: formData.county || null,
            postcode: formData.postcode || null,
            preferred_locations: formData.preferredLocations || null,
            desired_salary: formData.desiredSalary || null,
            salary_min: formData.salaryMin ? Number(formData.salaryMin) : null,
            salary_max: formData.salaryMax ? Number(formData.salaryMax) : null,
            salary_period: formData.salaryPeriod || 'year',
            preferred_job_types: formData.preferredJobTypes || [],
            work_location_preferences: formData.workLocationPreferences || [],
            linkedin_url: normalizeUrl(formData.linkedinUrl) || null,
            instagram_url: normalizeUrl(formData.instagramUrl) || null,
            ...(formData.facebookUrl ? { facebook_url: normalizeUrl(formData.facebookUrl) } : {}),
            has_ni_number: formData.hasNiNumber,
            has_bank_account: formData.hasBankAccount,
            has_right_to_work: formData.hasRightToWork,
            has_p45: formData.hasP45,
            bank_name: formData.bankName || null,
            sort_code: formData.sortCode || null,
            account_number: formData.accountNumber || null,
            account_holder_name: formData.accountHolderName || null,
            account_status: 'trial',
            trial_start_date: now.toISOString(),
            trial_expires_at: trialExpiresAt.toISOString(),
        }

        // Use upsert first — it inserts if no row exists, updates if it does.
        // The unique constraint on user_id is required for onConflict to work.
        const { data: upsertData, error: upsertError } = await supabase
          .from('candidate_profiles')
          .upsert(profilePayload, { onConflict: 'user_id' })
          .select('user_id')

        if (upsertError) {
          console.error('[Registration] Upsert failed:', upsertError.message, upsertError.details)
          // Fallback: try direct insert
          const { data: insertData, error: insertError } = await supabase
            .from('candidate_profiles')
            .insert(profilePayload)
            .select('user_id')

          if (insertError) {
            console.error('[Registration] Insert also failed:', insertError.message, insertError.details)
          }
        }

        // For demo, skip actual Stripe and mark as paid
        // In production, this would redirect to Stripe checkout
        setSuccess(true)
        setTimeout(() => {
          router.push('/login/employee?registered=true')
        }, 2000)

      } else {
        // Edit mode - update existing profile
        if (isTestingMode) {
          // Update profile in localStorage
          const profileData = {
            id: userId || `test-user-${Date.now()}`,
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            dateOfBirth: formData.dateOfBirth,
            nationality: formData.nationality,
            addressLine1: formData.addressLine1,
            addressLine2: formData.addressLine2,
            city: formData.city,
            county: formData.county,
            postcode: formData.postcode,
            phone: formData.phone,
            jobSector: formData.jobSector,
            currentPosition: formData.currentPosition,
            aboutMe: formData.aboutMe,
            personalBio: formData.personalBio,
            professionalSkills: formData.professionalSkills,
            workExperience: formData.workExperience.filter(exp => exp.company || exp.role),
            education: formData.education.filter(edu => edu.institution || edu.qualification),
            languages: formData.languages.filter(lang => lang.name),
            yearsExperience: Number(formData.yearsExperience),
            desiredSalary: formData.desiredSalary,
            salaryMin: formData.salaryMin,
            salaryMax: formData.salaryMax,
            salaryPeriod: formData.salaryPeriod,
            preferredJobTypes: formData.preferredJobTypes,
            workLocationPreferences: formData.workLocationPreferences,
            preferredLocations: formData.preferredLocations,
            availability: formData.availability,
            linkedinUrl: normalizeUrl(formData.linkedinUrl),
            facebookUrl: normalizeUrl(formData.facebookUrl),
            instagramUrl: normalizeUrl(formData.instagramUrl),
            cvFileName: formData.cvFileName,
            hasNiNumber: formData.hasNiNumber,
            hasBankAccount: formData.hasBankAccount,
            hasRightToWork: formData.hasRightToWork,
            hasP45: formData.hasP45,
            bankName: formData.bankName,
            sortCode: formData.sortCode,
            accountNumber: formData.accountNumber,
            accountHolderName: formData.accountHolderName,
            photoPreview: formData.photoPreview,
            updatedAt: new Date().toISOString(),
          }

          // Update currentTestProfile
          localStorage.setItem('currentTestProfile', JSON.stringify(profileData))

          // Also update the testProfiles array so candidates page shows updated data
          const existingProfiles = JSON.parse(localStorage.getItem('testProfiles') || '[]')
          const updatedProfiles = existingProfiles.map((p: any) =>
            p.id === profileData.id ? profileData : p
          )
          // If profile wasn't found in array, add it
          if (!existingProfiles.find((p: any) => p.id === profileData.id)) {
            updatedProfiles.push(profileData)
          }
          localStorage.setItem('testProfiles', JSON.stringify(updatedProfiles))

          setSuccess(true)
          return
        }

        // Production mode: Use Supabase
        if (!userId) throw new Error('User ID required for updates')

        // Upload new files if changed
        let photoUrl = formData.photoPreview
        let cvUrl = null

        if (formData.photo) {
          const uploaded = await uploadFile(formData.photo, `photos/${userId}`)
          if (uploaded) photoUrl = uploaded
        }

        if (formData.cv) {
          cvUrl = await uploadFile(formData.cv, `cvs/${userId}`)
        }

        // Build work_history JSONB from work experience entries
        const workHistory = formData.workExperience
          .filter(exp => exp.company || exp.role)
          .map(exp => ({
            company: exp.company,
            role: exp.role,
            start_date: exp.startDate,
            end_date: exp.endDate,
            description: exp.description,
          }))

        const updateData: any = {
          full_name: `${formData.firstName} ${formData.lastName}`.trim(),
          job_title: formData.currentPosition,
          location: `${formData.city}, ${formData.postcode}`.replace(/^, |, $/g, ''),
          years_experience: Number(formData.yearsExperience) || 0,
          bio: formData.aboutMe || '',
          personal_bio: formData.personalBio || '',
          skills: formData.professionalSkills || [],
          work_history: workHistory,
          education: formData.education.filter(edu => edu.institution || edu.qualification).map(edu => ({
            institution: edu.institution, qualification: edu.qualification, field_of_study: edu.fieldOfStudy,
            start_date: edu.startDate, end_date: edu.endDate, in_progress: edu.inProgress, grade: edu.grade,
          })),
          languages: formData.languages.filter(lang => lang.name).map(lang => ({
            name: lang.name, proficiency: lang.proficiency,
          })),
          availability: formData.availability,
          phone: formData.phone,
          date_of_birth: formData.dateOfBirth || null,
          nationality: formData.nationality || null,
          address_line_1: formData.addressLine1 || null,
          address_line_2: formData.addressLine2 || null,
          city: formData.city || null,
          county: formData.county || null,
          postcode: formData.postcode || null,
          preferred_locations: formData.preferredLocations || null,
          desired_salary: formData.desiredSalary || null,
          salary_min: formData.salaryMin ? Number(formData.salaryMin) : null,
          salary_max: formData.salaryMax ? Number(formData.salaryMax) : null,
          salary_period: formData.salaryPeriod || 'year',
          preferred_job_types: formData.preferredJobTypes || [],
          work_location_preferences: formData.workLocationPreferences || [],
          linkedin_url: normalizeUrl(formData.linkedinUrl) || null,
          instagram_url: normalizeUrl(formData.instagramUrl) || null,
          ...(formData.facebookUrl ? { facebook_url: normalizeUrl(formData.facebookUrl) } : {}),
          cv_file_name: formData.cvFileName || null,
          has_ni_number: formData.hasNiNumber,
          has_bank_account: formData.hasBankAccount,
          has_right_to_work: formData.hasRightToWork,
          has_p45: formData.hasP45,
          bank_name: formData.bankName || null,
          sort_code: formData.sortCode || null,
          account_number: formData.accountNumber || null,
          account_holder_name: formData.accountHolderName || null,
          updated_at: new Date().toISOString(),
        }

        if (photoUrl) updateData.profile_picture_url = photoUrl
        if (cvUrl) {
          updateData.cv_url = cvUrl
        }

        const { error: updateError } = await supabase
          .from('candidate_profiles')
          .update(updateData)
          .eq('user_id', userId)

        if (updateError) throw updateError

        // Update password if changed
        if (showChangePassword && formData.password) {
          const { error: passwordError } = await supabase.auth.updateUser({
            password: formData.password
          })
          if (passwordError) throw passwordError
        }

        setSuccess(true)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const renderStepIndicator = () => (
    <div className={styles.stepIndicator}>
      {STEPS.slice(0, totalSteps).map((step, index) => (
        <div
          key={step.id}
          className={`${styles.step} ${currentStep === step.id ? styles.active : ''} ${currentStep > step.id ? styles.completed : ''}`}
          onClick={() => currentStep > step.id && setCurrentStep(step.id)}
        >
          <div className={styles.stepIcon}>
            {currentStep > step.id ? '✓' : step.icon}
          </div>
          <span className={styles.stepTitle}>{step.title}</span>
          {index < totalSteps - 1 && <div className={styles.stepConnector} />}
        </div>
      ))}
    </div>
  )

  const renderStep1 = () => (
    <div className={styles.stepContent}>
      <h2 className={styles.stepHeading}>Personal Details</h2>
      <p className={styles.stepDescription}>Tell us about yourself</p>

      <div className={styles.photoUpload}>
        <div
          className={styles.photoPreview}
          onClick={() => photoInputRef.current?.click()}
        >
          {formData.photoPreview ? (
            <img src={formData.photoPreview} alt="Profile" />
          ) : (
            <div className={styles.photoPlaceholder}>
              <span className={styles.photoIcon}>📷</span>
              <span>Add Photo</span>
            </div>
          )}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className={styles.hiddenInput}
        />
        <p className={styles.photoHint}>Click to upload (max 5MB)</p>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="firstName">First Name *</label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value={formData.firstName}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="John"
            autoComplete="given-name"
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="lastName">Last Name *</label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            value={formData.lastName}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="Smith"
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Date of Birth *</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(() => {
              const parts = formData.dateOfBirth ? formData.dateOfBirth.split('-') : ['', '', '']
              const dobYear = parts[0] || ''
              const dobMonth = parts[1] || ''
              const dobDay = parts[2] || ''
              const currentYear = new Date().getFullYear()
              const maxYear = currentYear - 16
              const minYear = currentYear - 100
              return (
                <>
                  <select
                    aria-label="Day"
                    value={dobDay}
                    onChange={e => handleDobChange('day', e.target.value)}
                    className={styles.select}
                    autoComplete="bday-day"
                    style={{ flex: '0 0 auto', width: '70px' }}
                  >
                    <option value="">DD</option>
                    {Array.from({ length: 31 }, (_, i) => {
                      const d = String(i + 1).padStart(2, '0')
                      return <option key={d} value={d}>{i + 1}</option>
                    })}
                  </select>
                  <select
                    aria-label="Month"
                    value={dobMonth}
                    onChange={e => handleDobChange('month', e.target.value)}
                    className={styles.select}
                    autoComplete="bday-month"
                    style={{ flex: '1 1 auto' }}
                  >
                    <option value="">Month</option>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => {
                      const m = String(i + 1).padStart(2, '0')
                      return <option key={m} value={m}>{name}</option>
                    })}
                  </select>
                  <select
                    aria-label="Year"
                    value={dobYear}
                    onChange={e => handleDobChange('year', e.target.value)}
                    className={styles.select}
                    autoComplete="bday-year"
                    style={{ flex: '0 0 auto', width: '80px' }}
                  >
                    <option value="">YYYY</option>
                    {Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
                      const y = String(maxYear - i)
                      return <option key={y} value={y}>{y}</option>
                    })}
                  </select>
                </>
              )
            })()}
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="nationality">Nationality *</label>
          <div className={styles.nationalityDropdown} ref={nationalityRef}>
            <button
              type="button"
              className={`${styles.select} ${styles.nationalityTrigger}`}
              onClick={() => setNationalityOpen(!nationalityOpen)}
              aria-haspopup="listbox"
              aria-expanded={nationalityOpen}
            >
              <span className={formData.nationality ? '' : styles.nationalityPlaceholder}>
                {formData.nationality || 'Select nationality'}
              </span>
              <span className={`${styles.nationalityArrow} ${nationalityOpen ? styles.nationalityArrowOpen : ''}`}>▾</span>
            </button>
            {nationalityOpen && (
              <div className={styles.nationalityPanel}>
                <div className={styles.nationalitySearchWrap}>
                  <span className={styles.nationalitySearchIcon}>🔍</span>
                  <input
                    type="text"
                    className={styles.nationalitySearchInput}
                    placeholder="Search nationalities..."
                    value={nationalitySearch}
                    onChange={(e) => setNationalitySearch(e.target.value)}
                    autoFocus
                    autoComplete="off"
                  />
                </div>
                <ul className={styles.nationalityList} role="listbox">
                  {nationalitySearch.trim() === '' ? (
                    <>
                      <li className={styles.nationalitySectionLabel}>Popular</li>
                      {popularNationalities.map((nat) => (
                        <li
                          key={`popular-${nat}`}
                          role="option"
                          aria-selected={formData.nationality === nat}
                          className={`${styles.nationalityOption} ${formData.nationality === nat ? styles.nationalityOptionSelected : ''}`}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, nationality: nat }))
                            setNationalityOpen(false)
                            setNationalitySearch('')
                          }}
                        >
                          {nat}
                        </li>
                      ))}
                      <li className={styles.nationalityDivider} />
                      <li className={styles.nationalitySectionLabel}>All Nationalities</li>
                      {allNationalities.map((nat) => (
                        <li
                          key={`all-${nat}`}
                          role="option"
                          aria-selected={formData.nationality === nat}
                          className={`${styles.nationalityOption} ${formData.nationality === nat ? styles.nationalityOptionSelected : ''}`}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, nationality: nat }))
                            setNationalityOpen(false)
                            setNationalitySearch('')
                          }}
                        >
                          {nat}
                        </li>
                      ))}
                    </>
                  ) : (
                    (() => {
                      const query = nationalitySearch.toLowerCase()
                      const filtered = allNationalities.filter(n => n.toLowerCase().includes(query))
                      return filtered.length > 0 ? (
                        filtered.map((nat) => (
                          <li
                            key={`search-${nat}`}
                            role="option"
                            aria-selected={formData.nationality === nat}
                            className={`${styles.nationalityOption} ${formData.nationality === nat ? styles.nationalityOptionSelected : ''}`}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, nationality: nat }))
                              setNationalityOpen(false)
                              setNationalitySearch('')
                            }}
                          >
                            {nat}
                          </li>
                        ))
                      ) : (
                        <li className={styles.nationalityNoResults}>No nationalities found</li>
                      )
                    })()
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="personalBio">About Me / Interests</label>
        <textarea
          id="personalBio"
          name="personalBio"
          value={formData.personalBio}
          onChange={handleInputChange}
          className={styles.input}
          placeholder="Tell us a bit about yourself - your interests, hobbies, or anything you'd like employers to know..."
          rows={4}
          style={{ resize: 'vertical', minHeight: '100px' }}
          autoComplete="off"
        />
        <span className={styles.photoHint}>{formData.personalBio.length}/500 characters</span>
      </div>

      <div className={styles.divider}><span>Languages</span></div>

      {formData.languages.map((lang, index) => (
        <div key={index} className={styles.languageRow}>
          <div className={styles.formGroup} style={{ flex: 1 }}>
            <label className={styles.label} htmlFor={`langName-${index}`}>Language</label>
            <input
              type="text"
              id={`langName-${index}`}
              value={lang.name}
              onChange={(e) => handleLanguageChange(index, 'name', e.target.value)}
              className={styles.input}
              placeholder="e.g. English, Spanish, French"
              autoComplete="off"
            />
          </div>
          <div className={styles.formGroup} style={{ flex: 1 }}>
            <label className={styles.label} htmlFor={`langProficiency-${index}`}>Proficiency</label>
            <select
              id={`langProficiency-${index}`}
              value={lang.proficiency}
              onChange={(e) => handleLanguageChange(index, 'proficiency', e.target.value)}
              className={styles.select}
            >
              <option value="Native">Native</option>
              <option value="Fluent">Fluent</option>
              <option value="Conversational">Conversational</option>
              <option value="Basic">Basic</option>
            </select>
          </div>
          {formData.languages.length > 1 && (
            <button
              type="button"
              onClick={() => removeLanguage(index)}
              className={styles.removeBtn}
              style={{ alignSelf: 'flex-end', marginBottom: '0.5rem' }}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addLanguage}
        className={styles.addWorkBtn}
      >
        + Add Another Language
      </button>
    </div>
  )

  const renderStep2 = () => (
    <div className={styles.stepContent}>
      <h2 className={styles.stepHeading}>Contact Information</h2>
      <p className={styles.stepDescription}>How can employers reach you?</p>

      <div className={styles.formGroup}>
        <label className={styles.label}>Postcode Lookup</label>
        <PostcodeLookup
          onAddressFound={handleAddressFound}
          initialPostcode={formData.postcode}
        />
      </div>

      {addressFound && (
        <>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="addressLine1">Address Line 1 *</label>
            <input
              type="text"
              id="addressLine1"
              name="addressLine1"
              value={formData.addressLine1}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="123 High Street"
              autoComplete="address-line1"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="addressLine2">Address Line 2</label>
            <input
              type="text"
              id="addressLine2"
              name="addressLine2"
              value={formData.addressLine2}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Flat 4B (optional)"
              autoComplete="address-line2"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="city">City *</label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className={styles.input}
                placeholder="London"
                autoComplete="address-level2"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="county">County</label>
              <input
                type="text"
                id="county"
                name="county"
                value={formData.county}
                onChange={handleInputChange}
                className={styles.input}
                autoComplete="address-level1"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="postcode">Postcode *</label>
            <input
              type="text"
              id="postcode"
              name="postcode"
              value={formData.postcode}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="SW1A 1AA"
              autoComplete="postal-code"
              style={{ maxWidth: '180px' }}
            />
          </div>
        </>
      )}

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="preferredLocations">Preferred Work Locations</label>
        <input
          type="text"
          id="preferredLocations"
          name="preferredLocations"
          value={formData.preferredLocations}
          onChange={handleInputChange}
          className={styles.input}
          placeholder="e.g. London, South East, Manchester (comma separated)"
          autoComplete="off"
        />
        <p className={styles.fieldHint}>Where would you like to work? Separate multiple locations with commas.</p>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="phone">UK Phone Number *</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="+44 7700 900000"
            autoComplete="tel"
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="email">Email Address *</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="john.smith@email.com"
            disabled={mode === 'edit'}
            autoComplete="email"
          />
        </div>
      </div>

      <div className={styles.divider}><span>Social Links</span></div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="linkedinUrl">LinkedIn Profile</label>
          <input
            type="text"
            id="linkedinUrl"
            name="linkedinUrl"
            value={formData.linkedinUrl}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="https://linkedin.com/in/yourprofile"
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="facebookUrl">Facebook Profile</label>
          <input
            type="text"
            id="facebookUrl"
            name="facebookUrl"
            value={formData.facebookUrl}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="https://facebook.com/yourprofile"
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="instagramUrl">Instagram Profile</label>
          <input
            type="text"
            id="instagramUrl"
            name="instagramUrl"
            value={formData.instagramUrl}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="https://instagram.com/yourprofile"
          />
        </div>
        <div className={styles.formGroup} />
      </div>
    </div>
  )

  // Handle skill toggle
  const toggleSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      professionalSkills: prev.professionalSkills.includes(skill)
        ? prev.professionalSkills.filter(s => s !== skill)
        : prev.professionalSkills.length < 10
          ? [...prev.professionalSkills, skill]
          : prev.professionalSkills
    }))
  }

  // Handle sector change — keep any already-selected skills
  const handleSectorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      jobSector: e.target.value,
    }))
  }

  // Handle work experience change
  const handleWorkExperienceChange = (index: number, field: keyof WorkExperience, value: string) => {
    setFormData(prev => ({
      ...prev,
      workExperience: prev.workExperience.map((exp, i) =>
        i === index ? { ...exp, [field]: value } : exp
      )
    }))
  }

  // Auto-resize textarea to fit content
  const autoResizeTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(120, el.scrollHeight) + 'px'
  }, [])

  // Add work experience entry
  const addWorkExperience = () => {
    setFormData(prev => ({
      ...prev,
      workExperience: [...prev.workExperience, { company: '', role: '', startDate: '', endDate: '', description: '' }]
    }))
  }

  // Remove work experience entry
  const removeWorkExperience = (index: number) => {
    if (formData.workExperience.length > 1) {
      setFormData(prev => ({
        ...prev,
        workExperience: prev.workExperience.filter((_, i) => i !== index)
      }))
    }
  }

  // Education handlers
  const handleEducationChange = (index: number, field: keyof EducationEntry, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      education: prev.education.map((edu, i) =>
        i === index ? { ...edu, [field]: value } : edu
      )
    }))
  }

  const addEducation = () => {
    setFormData(prev => ({
      ...prev,
      education: [...prev.education, { institution: '', qualification: '', fieldOfStudy: '', startDate: '', endDate: '', inProgress: false, grade: '' }]
    }))
  }

  const removeEducation = (index: number) => {
    if (formData.education.length > 1) {
      setFormData(prev => ({
        ...prev,
        education: prev.education.filter((_, i) => i !== index)
      }))
    }
  }

  // Language handlers
  const handleLanguageChange = (index: number, field: keyof LanguageEntry, value: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.map((lang, i) =>
        i === index ? { ...lang, [field]: value } : lang
      )
    }))
  }

  const addLanguage = () => {
    setFormData(prev => ({
      ...prev,
      languages: [...prev.languages, { name: '', proficiency: 'Conversational' as const }]
    }))
  }

  const removeLanguage = (index: number) => {
    if (formData.languages.length > 1) {
      setFormData(prev => ({
        ...prev,
        languages: prev.languages.filter((_, i) => i !== index)
      }))
    }
  }

  const renderStep3 = () => (
    <div className={styles.stepContent}>
      <h2 className={styles.stepHeading}>Professional Information</h2>
      <p className={styles.stepDescription}>Tell us about your experience and goals</p>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="jobSector">Job Sector *</label>
        <select
          id="jobSector"
          name="jobSector"
          value={formData.jobSector}
          onChange={handleSectorChange}
          className={styles.select}
        >
          {JOB_SECTORS.map(sector => (
            <option key={sector.id} value={sector.id}>{sector.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="currentPosition">Current/Desired Position *</label>
        <input
          type="text"
          id="currentPosition"
          name="currentPosition"
          value={formData.currentPosition}
          onChange={handleInputChange}
          className={styles.input}
          placeholder="e.g. Head Chef, Restaurant Manager, Bartender"
          autoComplete="organization-title"
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="yearsExperience">Years of Experience *</label>
        <select
          id="yearsExperience"
          name="yearsExperience"
          value={formData.yearsExperience}
          onChange={handleInputChange}
          className={styles.select}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(y => (
            <option key={y} value={y}>{y} {y === 1 ? 'year' : 'years'}</option>
          ))}
          <option value={25}>20+ years</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Preferred Job Types *</label>
        <div className={styles.skillsGrid}>
          {['Full-time', 'Part-time', 'Contract', 'Temporary', 'Zero-hours', 'Freelance'].map(type => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  preferredJobTypes: prev.preferredJobTypes.includes(type)
                    ? prev.preferredJobTypes.filter(t => t !== type)
                    : [...prev.preferredJobTypes, type]
                }))
              }}
              className={`${styles.skillPill} ${formData.preferredJobTypes.includes(type) ? styles.skillPillActive : ''}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Work Location Preference *</label>
        <div className={styles.skillsGrid}>
          {['On-site', 'Remote', 'Hybrid'].map(loc => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  workLocationPreferences: prev.workLocationPreferences.includes(loc)
                    ? prev.workLocationPreferences.filter(l => l !== loc)
                    : [...prev.workLocationPreferences, loc]
                }))
              }}
              className={`${styles.skillPill} ${formData.workLocationPreferences.includes(loc) ? styles.skillPillActive : ''}`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Salary Range *</label>
        <div className={styles.formRow}>
          <div className={styles.salaryInput}>
            <span className={styles.currencyPrefix}>£</span>
            <input
              type="number"
              id="salaryMin"
              name="salaryMin"
              value={formData.salaryMin}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Min e.g. 25000"
              autoComplete="off"
            />
          </div>
          <span style={{ alignSelf: 'center', color: 'var(--text-gray)', padding: '0 0.25rem' }}>to</span>
          <div className={styles.salaryInput}>
            <span className={styles.currencyPrefix}>£</span>
            <input
              type="number"
              id="salaryMax"
              name="salaryMax"
              value={formData.salaryMax}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Max e.g. 35000"
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="salaryPeriod">Salary Period</label>
        <select
          id="salaryPeriod"
          name="salaryPeriod"
          value={formData.salaryPeriod}
          onChange={handleInputChange}
          className={styles.select}
        >
          <option value="year">Per Year</option>
          <option value="hour">Per Hour</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="availability">Availability *</label>
        <select
          id="availability"
          name="availability"
          value={formData.availability}
          onChange={handleInputChange}
          className={styles.select}
        >
          <option value="Available immediately">Available immediately</option>
          <option value="Available in 1 week">Available in 1 week</option>
          <option value="Available in 2 weeks">Available in 2 weeks</option>
          <option value="Available in 1 month">Available in 1 month</option>
          <option value="1 month notice">1 month notice</option>
          <option value="2 months notice">2 months notice</option>
          <option value="3 months notice">3 months notice</option>
          <option value="6 months notice">6 months notice</option>
          <option value="6+ months notice">6+ months notice</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Professional Skills</label>
        <p className={styles.photoHint} style={{ marginBottom: '0.75rem' }}>
          Skills for {JOB_SECTORS.find(s => s.id === formData.jobSector)?.label || 'your sector'} (choose up to 10)
        </p>
        <div className={styles.skillsGrid}>
          {(SECTOR_SKILLS[formData.jobSector] || SECTOR_SKILLS.hospitality).map(skill => (
            <button
              key={skill}
              type="button"
              onClick={() => toggleSkill(skill)}
              className={`${styles.skillPill} ${formData.professionalSkills.includes(skill) ? styles.skillPillActive : ''}`}
            >
              {skill}
            </button>
          ))}
        </div>
        {formData.professionalSkills.filter(s => !(SECTOR_SKILLS[formData.jobSector] || []).includes(s)).length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <p className={styles.photoHint} style={{ marginBottom: '0.375rem', fontSize: '0.75rem' }}>Previously selected:</p>
            <div className={styles.skillsGrid}>
              {formData.professionalSkills.filter(s => !(SECTOR_SKILLS[formData.jobSector] || []).includes(s)).map(skill => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`${styles.skillPill} ${styles.skillPillActive}`}
                >
                  {skill} ✕
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={styles.customSkillRow}>
          <input
            type="text"
            placeholder="Add a custom skill..."
            className={styles.input}
            id="customSkillInput"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const input = e.target as HTMLInputElement
                const val = input.value.trim()
                if (val && !formData.professionalSkills.includes(val)) {
                  toggleSkill(val)
                  input.value = ''
                }
              }
            }}
            autoComplete="off"
          />
          <button
            type="button"
            className={styles.addSkillBtn}
            onClick={() => {
              const input = document.getElementById('customSkillInput') as HTMLInputElement
              const val = input?.value.trim()
              if (val && !formData.professionalSkills.includes(val)) {
                toggleSkill(val)
                input.value = ''
              }
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className={styles.divider}><span>Work Experience</span></div>

      {formData.workExperience.map((exp, index) => (
        <div key={index} className={styles.workExperienceCard}>
          <div className={styles.workExperienceHeader}>
            <h4>Position {index + 1}</h4>
            {formData.workExperience.length > 1 && (
              <button
                type="button"
                onClick={() => removeWorkExperience(index)}
                className={styles.removeBtn}
              >
                Remove
              </button>
            )}
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`workCompany-${index}`}>Company/Employer</label>
              <input
                type="text"
                id={`workCompany-${index}`}
                name={`workCompany-${index}`}
                value={exp.company}
                onChange={(e) => handleWorkExperienceChange(index, 'company', e.target.value)}
                className={styles.input}
                placeholder="e.g. The Savoy"
                autoComplete="organization"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`workRole-${index}`}>Job Title</label>
              <input
                type="text"
                id={`workRole-${index}`}
                name={`workRole-${index}`}
                value={exp.role}
                onChange={(e) => handleWorkExperienceChange(index, 'role', e.target.value)}
                className={styles.input}
                placeholder="e.g. Head Chef"
                autoComplete="organization-title"
              />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`workStartDate-${index}`}>Start Date</label>
              <DatePicker
                value={exp.startDate}
                onChange={(val) => handleWorkExperienceChange(index, 'startDate', val)}
                id={`workStartDate-${index}`}
                placeholder="Select start date"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`workEndDate-${index}`}>End Date (leave blank if current)</label>
              <DatePicker
                value={exp.endDate}
                onChange={(val) => handleWorkExperienceChange(index, 'endDate', val)}
                id={`workEndDate-${index}`}
                placeholder="Present (current role)"
              />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor={`workDescription-${index}`}>Description</label>
            <textarea
              id={`workDescription-${index}`}
              name={`workDescription-${index}`}
              value={exp.description}
              ref={(el) => autoResizeTextarea(el)}
              onChange={(e) => {
                handleWorkExperienceChange(index, 'description', e.target.value)
                autoResizeTextarea(e.target)
              }}
              className={styles.input}
              placeholder="Brief description of your responsibilities..."
              rows={4}
              style={{ resize: 'vertical', minHeight: '120px' }}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addWorkExperience}
        className={styles.addWorkBtn}
      >
        + Add Another Position
      </button>

      <div className={styles.divider}><span>CV / Resume</span></div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="cvUpload">Upload CV</label>
        <div
          className={styles.fileUpload}
          onClick={() => cvInputRef.current?.click()}
        >
          <span className={styles.fileIcon}>📄</span>
          <span className={styles.fileText}>
            {formData.cvFileName || 'Click to upload CV (PDF or Word format, max 5MB)'}
          </span>
        </div>
        <input
          ref={cvInputRef}
          type="file"
          id="cvUpload"
          name="cvUpload"
          accept=".pdf,.doc,.docx"
          onChange={handleCvChange}
          className={styles.hiddenInput}
        />
        <p className={styles.fieldHint}>Upload your CV (PDF or Word format, max 5MB). PDF format is recommended as it works best across all devices.</p>
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className={styles.stepContent}>
      <h2 className={styles.stepHeading}>Documents & Verification</h2>
      <p className={styles.stepDescription}>Add your qualifications and confirm documents</p>

      <div className={styles.divider}><span>Education & Qualifications</span></div>

      {formData.education.map((edu, index) => (
        <div key={index} className={styles.workExperienceCard}>
          <div className={styles.workExperienceHeader}>
            <h4>Qualification {index + 1}</h4>
            {formData.education.length > 1 && (
              <button
                type="button"
                onClick={() => removeEducation(index)}
                className={styles.removeBtn}
              >
                Remove
              </button>
            )}
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`eduInstitution-${index}`}>Institution</label>
              <input
                type="text"
                id={`eduInstitution-${index}`}
                value={edu.institution}
                onChange={(e) => handleEducationChange(index, 'institution', e.target.value)}
                className={styles.input}
                placeholder="e.g. University of London"
                autoComplete="organization"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`eduQualification-${index}`}>Qualification/Degree</label>
              <input
                type="text"
                id={`eduQualification-${index}`}
                value={edu.qualification}
                onChange={(e) => handleEducationChange(index, 'qualification', e.target.value)}
                className={styles.input}
                placeholder="e.g. BSc, NVQ Level 3, GCSE"
                autoComplete="off"
              />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`eduField-${index}`}>Field of Study</label>
              <input
                type="text"
                id={`eduField-${index}`}
                value={edu.fieldOfStudy}
                onChange={(e) => handleEducationChange(index, 'fieldOfStudy', e.target.value)}
                className={styles.input}
                placeholder="e.g. Hospitality Management"
                autoComplete="off"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`eduGrade-${index}`}>Grade (optional)</label>
              <input
                type="text"
                id={`eduGrade-${index}`}
                value={edu.grade}
                onChange={(e) => handleEducationChange(index, 'grade', e.target.value)}
                className={styles.input}
                placeholder="e.g. 2:1, Distinction, A*"
                autoComplete="off"
              />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`eduStartDate-${index}`}>Start Date</label>
              <input
                type="month"
                id={`eduStartDate-${index}`}
                value={edu.startDate}
                onChange={(e) => handleEducationChange(index, 'startDate', e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`eduEndDate-${index}`}>End Date</label>
              <input
                type="month"
                id={`eduEndDate-${index}`}
                value={edu.endDate}
                onChange={(e) => handleEducationChange(index, 'endDate', e.target.value)}
                className={styles.input}
                disabled={edu.inProgress}
              />
              <label className={styles.inProgressLabel}>
                <input
                  type="checkbox"
                  checked={edu.inProgress}
                  onChange={(e) => handleEducationChange(index, 'inProgress', e.target.checked)}
                />
                In progress
              </label>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addEducation}
        className={styles.addWorkBtn}
      >
        + Add Another Qualification
      </button>

      <div className={styles.divider}><span>Verification</span></div>

      <div className={styles.checkboxList}>
        <label className={styles.checkboxItem}>
          <input
            type="checkbox"
            name="hasNiNumber"
            checked={formData.hasNiNumber}
            onChange={handleInputChange}
          />
          <span className={styles.checkmark}></span>
          <div className={styles.checkboxContent}>
            <span className={styles.checkboxLabel}>National Insurance Number</span>
            <span className={styles.checkboxHint}>Required for employment in the UK</span>
          </div>
        </label>

        <label className={styles.checkboxItem}>
          <input
            type="checkbox"
            name="hasBankAccount"
            checked={formData.hasBankAccount}
            onChange={handleInputChange}
          />
          <span className={styles.checkmark}></span>
          <div className={styles.checkboxContent}>
            <span className={styles.checkboxLabel}>UK Bank Account</span>
            <span className={styles.checkboxHint}>For subscription payments</span>
          </div>
        </label>

        <label className={styles.checkboxItem}>
          <input
            type="checkbox"
            name="hasRightToWork"
            checked={formData.hasRightToWork}
            onChange={handleInputChange}
          />
          <span className={styles.checkmark}></span>
          <div className={styles.checkboxContent}>
            <span className={styles.checkboxLabel}>Right to Work in UK</span>
            <span className={styles.checkboxHint}>Valid visa or settled status</span>
          </div>
        </label>

        <label className={styles.checkboxItem}>
          <input
            type="checkbox"
            name="hasP45"
            checked={formData.hasP45}
            onChange={handleInputChange}
          />
          <span className={styles.checkmark}></span>
          <div className={styles.checkboxContent}>
            <span className={styles.checkboxLabel}>P45 from Previous Employer</span>
            <span className={styles.checkboxHint}>Or willing to complete starter checklist</span>
          </div>
        </label>
      </div>

      <div className={styles.infoBox}>
        <span className={styles.infoIcon}>ℹ️</span>
        <p>Don't worry if you don't have all documents yet. You can update your profile later.</p>
      </div>
    </div>
  )

  // Password validation
  const passwordChecks = {
    minLength: formData.password.length >= 8,
    hasUppercase: /[A-Z]/.test(formData.password),
    hasLowercase: /[a-z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
    hasSpecial: /[^A-Za-z0-9]/.test(formData.password),
  }

  const passwordRequirementsMet = passwordChecks.minLength && passwordChecks.hasUppercase && passwordChecks.hasLowercase && passwordChecks.hasNumber
  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0

  const getPasswordStrength = (): { label: string; level: 'weak' | 'medium' | 'strong' } => {
    const checks = Object.values(passwordChecks)
    const passed = checks.filter(Boolean).length
    if (passed <= 2) return { label: 'Weak', level: 'weak' }
    if (passed <= 3) return { label: 'Medium', level: 'medium' }
    return { label: 'Strong', level: 'strong' }
  }

  const passwordStrength = formData.password.length > 0 ? getPasswordStrength() : null
  const isStep5Valid = mode === 'edit' ? (!showChangePassword || (passwordRequirementsMet && passwordsMatch)) : (passwordRequirementsMet && passwordsMatch)

  const renderStep5 = () => (
    <div className={styles.stepContent}>
      <h2 className={styles.stepHeading}>Account Setup</h2>
      <p className={styles.stepDescription}>
        {mode === 'register' ? 'Create your login credentials' : 'Update your account details'}
      </p>

      {mode === 'edit' && !showChangePassword ? (
        <div className={styles.changePasswordSection}>
          <button
            type="button"
            className={styles.changePasswordBtn}
            onClick={() => setShowChangePassword(true)}
          >
            🔐 Change Password
          </button>
        </div>
      ) : (
        <div className={styles.passwordSection}>
          {mode === 'edit' && (
            <button
              type="button"
              className={styles.cancelPasswordBtn}
              onClick={() => {
                setShowChangePassword(false)
                setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }))
              }}
            >
              Cancel
            </button>
          )}
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="password">
              {mode === 'register' ? 'Password *' : 'New Password *'}
            </label>
            <PasswordInput
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Minimum 8 characters"
              minLength={8}
              autoComplete={mode === 'register' ? 'new-password' : 'new-password'}
            />

            {formData.password.length > 0 && (
              <>
                <div className={styles.strengthBar}>
                  <div className={`${styles.strengthFill} ${styles[`strength${passwordStrength!.level.charAt(0).toUpperCase() + passwordStrength!.level.slice(1)}`]}`} />
                </div>
                <span className={`${styles.strengthLabel} ${styles[`strength${passwordStrength!.level.charAt(0).toUpperCase() + passwordStrength!.level.slice(1)}`]}`}>
                  {passwordStrength!.label}
                </span>

                <ul className={styles.passwordRequirements}>
                  <li className={passwordChecks.minLength ? styles.requirementMet : styles.requirementUnmet}>
                    <span>{passwordChecks.minLength ? '✓' : '○'}</span> Minimum 8 characters
                  </li>
                  <li className={passwordChecks.hasUppercase ? styles.requirementMet : styles.requirementUnmet}>
                    <span>{passwordChecks.hasUppercase ? '✓' : '○'}</span> At least one uppercase letter
                  </li>
                  <li className={passwordChecks.hasLowercase ? styles.requirementMet : styles.requirementUnmet}>
                    <span>{passwordChecks.hasLowercase ? '✓' : '○'}</span> At least one lowercase letter
                  </li>
                  <li className={passwordChecks.hasNumber ? styles.requirementMet : styles.requirementUnmet}>
                    <span>{passwordChecks.hasNumber ? '✓' : '○'}</span> At least one number
                  </li>
                  <li className={passwordChecks.hasSpecial ? styles.requirementMet : styles.requirementBonus}>
                    <span>{passwordChecks.hasSpecial ? '✓' : '○'}</span> Special character (recommended)
                  </li>
                </ul>
              </>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="confirmPassword">Confirm Password *</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
            {formData.confirmPassword.length > 0 && (
              <div className={passwordsMatch ? styles.passwordMatch : styles.passwordMismatch}>
                <span>{passwordsMatch ? '✓' : '✕'}</span>
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.divider}>
        <span>Bank Details (Optional)</span>
      </div>

      <p className={styles.bankHint}>
        You can add bank details later. These details will be used for subscription payments after your free trial ends.
      </p>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="bankName">Bank Name</label>
        <input
          type="text"
          id="bankName"
          name="bankName"
          value={formData.bankName}
          onChange={handleInputChange}
          className={styles.input}
          placeholder="e.g. Barclays, HSBC, Lloyds"
          autoComplete="off"
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="accountHolderName">Account Holder Name</label>
        <input
          type="text"
          id="accountHolderName"
          name="accountHolderName"
          value={formData.accountHolderName}
          onChange={handleInputChange}
          className={styles.input}
          placeholder="Name as it appears on your bank account"
          autoComplete="cc-name"
        />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="sortCode">Sort Code</label>
          <input
            type="text"
            id="sortCode"
            name="sortCode"
            value={formData.sortCode}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="00-00-00"
            maxLength={8}
            autoComplete="off"
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="accountNumber">Account Number</label>
          <input
            type="text"
            id="accountNumber"
            name="accountNumber"
            value={formData.accountNumber}
            onChange={handleInputChange}
            className={styles.input}
            placeholder="12345678"
            maxLength={8}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  )

  return (
    <>
    <div className={styles.formContainer}>
      {isTestingMode && (
        <div className={styles.testingBanner}>
          <span>🧪</span>
          <span>Testing Mode Active - Supabase bypassed, data saved to localStorage</span>
        </div>
      )}

      {renderStepIndicator()}

      {error && <div className={styles.error}>{error}</div>}
      {success && mode === 'register' && (
        <div className={styles.success}>
          {isTestingMode
            ? 'Test profile created! Redirecting to login...'
            : 'Account created successfully! Redirecting to login...'
          }
        </div>
      )}

      <div className={styles.stepWrapper}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}
      </div>

      <div className={styles.navigation}>
        {currentStep > 1 && (
          <button
            type="button"
            onClick={prevStep}
            className={styles.prevBtn}
            disabled={loading}
          >
            ← Previous
          </button>
        )}

        <div className={styles.navSpacer} />

        {currentStep < totalSteps ? (
          <button
            type="button"
            onClick={nextStep}
            className={styles.nextBtn}
            disabled={loading}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            className={styles.submitBtn}
            disabled={loading || !isStep5Valid}
          >
            {loading ? 'Creating Account...' : mode === 'register' ? 'Complete Free Registration' : 'Save Changes'}
          </button>
        )}
      </div>
    </div>

    {/* Fixed-position toast for edit mode */}
    {success && mode === 'edit' && (
      <div className={`${styles.toast} ${styles.toastSuccess}`}>
        <span>✓</span>
        Profile updated successfully!
        <button className={styles.toastClose} onClick={() => setSuccess(false)}>×</button>
      </div>
    )}
    </>
  )
}
