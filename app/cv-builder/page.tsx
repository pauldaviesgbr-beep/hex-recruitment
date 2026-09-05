'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopPosition, TabStopType } from 'docx'
import { saveAs } from 'file-saver'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { isNativeApp } from '@/lib/nativeOAuth'
import { DEV_MODE } from '@/lib/mockAuth'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

interface WorkEntry {
  id: string
  jobTitle: string
  company: string
  startDate: string
  endDate: string
  current: boolean
  description: string
}

interface EducationEntry {
  id: string
  qualification: string
  institution: string
  year: string
}

interface ReferenceEntry {
  id: string
  name: string
  company: string
  contact: string
}

interface CVData {
  personalDetails: {
    fullName: string
    email: string
    phone: string
    location: string
  }
  summary: string
  workExperience: WorkEntry[]
  education: EducationEntry[]
  skills: string[]
  references: ReferenceEntry[]
  referencesOnRequest: boolean
}

const emptyCV = (): CVData => ({
  personalDetails: { fullName: '', email: '', phone: '', location: '' },
  summary: '',
  workExperience: [],
  education: [],
  skills: [],
  references: [],
  referencesOnRequest: true,
})

const STEPS = [
  { id: 'personal', label: 'Personal Details' },
  { id: 'summary', label: 'Professional Summary' },
  { id: 'experience', label: 'Work Experience' },
  { id: 'education', label: 'Education' },
  { id: 'skills', label: 'Skills' },
  { id: 'references', label: 'References' },
]

export default function CVBuilderPage() {
  const router = useRouter()
  const [cvData, setCvData] = useState<CVData>(emptyCV())
  const [currentStep, setCurrentStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [cvId, setCvId] = useState<string | null>(null)
  const [skillInput, setSkillInput] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [uploadMode, setUploadMode] = useState<'choose' | 'upload' | 'build' | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // AI Assist state
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiType, setAiType] = useState<'summary' | 'experience'>('summary')
  const [aiExperienceIndex, setAiExperienceIndex] = useState<number>(0)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInput, setAiInput] = useState({ jobTitle: '', keyDuties: '', duration: '', additionalContext: '' })

  // Profile data for AI context
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null)

  // ── EXPORT IS HIDDEN IN THE iOS SHELL, BECAUSE IT CANNOT WORK THERE ────
  //
  // Export PDF calls jsPDF's pdf.save() and Download Word calls file-saver's
  // saveAs(); both are browser downloads — an object URL plus a synthetic
  // anchor click. A Capacitor WKWebView has no download handling for that,
  // so on a handset both buttons tap and NOTHING HAPPENS, silently. Paul
  // found it on the phone; no desktop drive would.
  //
  // Hidden rather than relabelled: a label that promises something which
  // does not exist is worse than either. The web is untouched.
  //
  // The proper fixes and their costs are recorded in the report —
  // @capacitor/filesystem + @capacitor/share needs a NEW BINARY (neither is
  // installed; only app and browser are), while uploading to the profiles
  // bucket and opening a signed URL in the in-app sheet is web-only but
  // needs a cleanup rule. This is the holding position until one lands.
  //
  // IN AN EFFECT, NOT DURING RENDER: isNativeApp() reads window.Capacitor,
  // which the server does not have — reading it while rendering would make
  // the server and client markup disagree.
  const [nativeShell, setNativeShell] = useState(false)
  useEffect(() => { setNativeShell(isNativeApp()) }, [])

  const previewRef = useRef<HTMLDivElement>(null)

  // Load user, profile, and existing CV
  useEffect(() => {
    const load = async () => {
      try {
        let uid: string | null = null
        let hasExistingCV = false

        if (DEV_MODE) {
          const saved = localStorage.getItem('currentTestProfile')
          if (saved) {
            const p = JSON.parse(saved)
            uid = p.user_id || 'dev-user'
            setProfileData(p)
            // Pre-fill from profile
            setCvData(prev => ({
              ...prev,
              personalDetails: {
                fullName: p.full_name || '',
                email: p.email || '',
                phone: p.phone || '',
                location: [p.city, p.county].filter(Boolean).join(', ') || p.location || '',
              },
              summary: p.personal_bio || p.bio || '',
              skills: p.skills || [],
              workExperience: (p.work_history || []).map((w: Record<string, string>, i: number) => ({
                id: `pre-${i}`,
                jobTitle: w.role || w.title || '',
                company: w.company || '',
                startDate: w.start_date || '',
                endDate: w.end_date || '',
                current: !w.end_date,
                description: w.description || '',
              })),
              education: (p.education || []).map((e: Record<string, string>, i: number) => ({
                id: `pre-${i}`,
                qualification: e.qualification || e.field_of_study || '',
                institution: e.institution || '',
                year: e.end_date ? e.end_date.substring(0, 4) : '',
              })),
            }))
          }
        } else {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            uid = session.user.id

            // Fetch profile
            const { data: profile } = await supabase
              .from('candidate_profiles')
              .select('*')
              .eq('user_id', uid)
              .single()

            if (profile) {
              setProfileData(profile)
              setCvData(prev => ({
                ...prev,
                personalDetails: {
                  fullName: profile.full_name || '',
                  email: profile.email || session.user.email || '',
                  phone: profile.phone || '',
                  location: [profile.city, profile.county].filter(Boolean).join(', ') || profile.location || '',
                },
                summary: profile.personal_bio || profile.bio || '',
                skills: profile.skills || [],
                workExperience: (profile.work_history || []).map((w: Record<string, string>, i: number) => ({
                  id: `pre-${i}`,
                  jobTitle: w.role || w.title || '',
                  company: w.company || '',
                  startDate: w.start_date || '',
                  endDate: w.end_date || '',
                  current: !w.end_date,
                  description: w.description || '',
                })),
                education: (profile.education || []).map((e: Record<string, string>, i: number) => ({
                  id: `pre-${i}`,
                  qualification: e.qualification || e.field_of_study || '',
                  institution: e.institution || '',
                  year: e.end_date ? e.end_date.substring(0, 4) : '',
                })),
              }))
            }

            // Fetch existing CV
            const { data: existingCV } = await supabase
              .from('candidate_cvs')
              .select('*')
              .eq('user_id', uid)
              .order('updated_at', { ascending: false })
              .limit(1)
              .single()

            if (existingCV) {
              setCvId(existingCV.id)
              setCvData(existingCV.cv_data as CVData)
              hasExistingCV = true
            }
          }
        }

        setUserId(uid)
        // If user already has a saved CV, go straight to the builder
        setUploadMode(hasExistingCV ? 'build' : 'choose')
      } catch {
        setUploadMode('choose')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Save CV to Supabase
  const saveCV = useCallback(async () => {
    if (!userId || DEV_MODE) {
      setSaved(true)
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2500)
      return
    }

    setSaving(true)
    try {
      if (cvId) {
        await supabase
          .from('candidate_cvs')
          .update({ cv_data: cvData, updated_at: new Date().toISOString() })
          .eq('id', cvId)
      } else {
        const { data } = await supabase
          .from('candidate_cvs')
          .insert({ user_id: userId, cv_data: cvData, title: 'My CV', is_primary: true })
          .select('id')
          .single()
        if (data) setCvId(data.id)
      }
      setSaved(true)
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2500)
    } catch {
      alert('Failed to save CV. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [userId, cvId, cvData])

  // Upload an existing CV file (PDF or Word)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return

    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(file.type)) {
      setUploadError('Please upload a PDF or Word document.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File must be under 5 MB.')
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `${userId}/cv-${Date.now()}.${ext}`

      const { error: storageErr } = await supabase.storage
        .from('profiles')
        .upload(path, file, { upsert: true })
      if (storageErr) throw storageErr

      // Store the path — signed URLs generated at render time
      const fileUrl = path

      // Save a CV record pointing to the uploaded file
      const { data: inserted } = await supabase
        .from('candidate_cvs')
        .insert({
          user_id: userId,
          title: file.name,
          cv_data: { ...emptyCV(), uploadedFileUrl: fileUrl, uploadedFileName: file.name },
          is_primary: true,
        })
        .select('id')
        .single()
      if (inserted) setCvId(inserted.id)

      // Also store the URL on the candidate profile for easy access
      await supabase
        .from('candidate_profiles')
        .update({ cv_url: fileUrl, cv_file_name: file.name })
        .eq('user_id', userId)

      // PHASE 1: read the CV in the background. Nothing consumes the result
      // yet. Fire and forget on purpose — the upload has already succeeded, and
      // a parsing failure must never surface to the candidate as though their
      // CV did not upload, because it did.
      fetch('/api/candidate/parse-cv', { method: 'POST' }).catch(() => {})

      setUploadMode('build')
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // Auto-save on step change
  useEffect(() => {
    if (!loading && userId) {
      const timeout = setTimeout(saveCV, 8000)
      return () => clearTimeout(timeout)
    }
  }, [cvData, currentStep, loading, userId, saveCV])

  // AI Assist
  const openAiModal = (type: 'summary' | 'experience', expIndex?: number) => {
    setAiType(type)
    setAiExperienceIndex(expIndex ?? 0)
    setAiInput({ jobTitle: '', keyDuties: '', duration: '', additionalContext: '' })

    if (type === 'experience' && expIndex !== undefined) {
      const exp = cvData.workExperience[expIndex]
      if (exp) {
        setAiInput(prev => ({ ...prev, jobTitle: exp.jobTitle, duration: '' }))
      }
    }

    setAiModalOpen(true)
  }

  const generateAiText = async () => {
    setAiLoading(true)
    try {
      const payload: Record<string, unknown> = {
        type: aiType,
        data: aiType === 'summary'
          ? {
              name: cvData.personalDetails.fullName,
              jobTitle: (profileData as Record<string, unknown>)?.job_title || aiInput.jobTitle,
              sector: (profileData as Record<string, unknown>)?.job_sector || '',
              yearsExperience: (profileData as Record<string, unknown>)?.years_experience || '',
              skills: cvData.skills,
              location: cvData.personalDetails.location,
              additionalContext: aiInput.additionalContext,
            }
          : {
              jobTitle: aiInput.jobTitle,
              company: cvData.workExperience[aiExperienceIndex]?.company || '',
              keyDuties: aiInput.keyDuties,
              duration: aiInput.duration,
              additionalContext: aiInput.additionalContext,
            },
      }

      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json()

      if (result.text) {
        if (aiType === 'summary') {
          setCvData(prev => ({ ...prev, summary: result.text }))
        } else {
          setCvData(prev => {
            const exp = [...prev.workExperience]
            if (exp[aiExperienceIndex]) {
              exp[aiExperienceIndex] = { ...exp[aiExperienceIndex], description: result.text }
            }
            return { ...prev, workExperience: exp }
          })
        }
        setAiModalOpen(false)
      } else {
        alert(result.error || 'Failed to generate text. Please try again.')
      }
    } catch {
      alert('Failed to connect to AI service. Please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportingWord, setExportingWord] = useState(false)

  // ─── Build CV sections as individual off-screen divs for per-section rendering ───
  const buildSectionHtml = (title: string, content: string): string => {
    return `<div style="margin-bottom:22px;page-break-inside:avoid">
      <h2 style="font-size:15px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0">${title}</h2>
      ${content}
    </div>`
  }

  const exportPDF = async () => {
    setExporting(true)
    try {
      const pd = cvData.personalDetails
      const margin = 15 // mm
      const pageWidth = 210
      const pageHeight = 297
      const contentWidth = pageWidth - margin * 2
      const usableHeight = pageHeight - margin * 2

      const pdf = new jsPDF('p', 'mm', 'a4')
      let yOffset = margin // current Y position in mm

      // Helper: render a section HTML to canvas and add to PDF
      const addSection = async (html: string) => {
        const container = document.createElement('div')
        container.style.position = 'absolute'
        container.style.left = '-9999px'
        container.style.top = '0'
        container.style.width = '714px' // A4 content area at 96 DPI minus margins
        container.style.background = '#fff'
        container.style.padding = '0'
        container.style.fontFamily = 'Inter, system-ui, -apple-system, sans-serif'
        container.style.color = '#1a1a1a'
        container.style.lineHeight = '1.5'
        container.style.fontSize = '14px'
        container.innerHTML = html
        document.body.appendChild(container)

        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        })
        document.body.removeChild(container)

        const imgWidth = contentWidth
        const imgHeight = (canvas.height * imgWidth) / canvas.width
        const imgData = canvas.toDataURL('image/png')

        // If section doesn't fit on current page, start a new page
        if (yOffset + imgHeight > pageHeight - margin && yOffset > margin + 5) {
          pdf.addPage()
          yOffset = margin
        }

        // If single section is taller than a full page, split it
        if (imgHeight > usableHeight) {
          const pxPerMm = canvas.height / imgHeight
          let srcY = 0
          let remainingMm = imgHeight

          while (remainingMm > 0) {
            const sliceHeightMm = Math.min(remainingMm, pageHeight - margin - yOffset)
            const sliceHeightPx = Math.round(sliceHeightMm * pxPerMm)

            const sliceCanvas = document.createElement('canvas')
            sliceCanvas.width = canvas.width
            sliceCanvas.height = sliceHeightPx
            const ctx = sliceCanvas.getContext('2d')!
            ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

            const sliceData = sliceCanvas.toDataURL('image/png')
            pdf.addImage(sliceData, 'PNG', margin, yOffset, imgWidth, sliceHeightMm)

            srcY += sliceHeightPx
            remainingMm -= sliceHeightMm
            yOffset += sliceHeightMm

            if (remainingMm > 0) {
              pdf.addPage()
              yOffset = margin
            }
          }
        } else {
          pdf.addImage(imgData, 'PNG', margin, yOffset, imgWidth, imgHeight)
          yOffset += imgHeight
        }
      }

      // Section 1: Name + Contact header
      await addSection(`<div style="text-align:center;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #1e293b">
        <h1 style="font-size:28px;font-weight:800;color:#1e293b;margin:0 0 6px;letter-spacing:0.02em">${pd.fullName || 'Your Name'}</h1>
        <div style="font-size:13px;color:#64748b">${[pd.email, pd.phone, pd.location].filter(Boolean).join('  |  ')}</div>
      </div>`)

      // Section 2: Professional Summary
      if (cvData.summary) {
        await addSection(buildSectionHtml('Professional Summary',
          `<p style="font-size:13px;color:#334155;margin:0;line-height:1.7">${cvData.summary}</p>`))
      }

      // Section 3: Work Experience (each entry as its own section to avoid mid-entry breaks)
      if (cvData.workExperience.length > 0) {
        // Section heading
        await addSection(`<h2 style="font-size:15px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;padding-bottom:4px;border-bottom:1px solid #e2e8f0">Work Experience</h2>`)

        for (const entry of cvData.workExperience) {
          const startStr = entry.startDate ? formatDate(entry.startDate) : ''
          const endStr = entry.current ? 'Present' : entry.endDate ? formatDate(entry.endDate) : ''
          const dateStr = [startStr, endStr].filter(Boolean).join(' — ')
          let entryHtml = `<div style="margin-bottom:8px;page-break-inside:avoid">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div>
                <strong style="font-size:14px;font-weight:700;color:#1e293b;display:block">${entry.jobTitle || 'Job Title'}</strong>
                <span style="font-size:13px;color:#64748b">${entry.company}</span>
              </div>
              <span style="font-size:12px;color:#64748b;white-space:nowrap;flex-shrink:0">${dateStr}</span>
            </div>`
          if (entry.description) {
            const lines = entry.description.split('\n').map(l =>
              `<p style="font-size:13px;color:#334155;margin:2px 0;line-height:1.5">${l.startsWith('•') ? l : l}</p>`).join('')
            entryHtml += `<div style="margin-top:4px">${lines}</div>`
          }
          entryHtml += `</div>`
          await addSection(entryHtml)
        }
      }

      // Section 4: Education
      if (cvData.education.length > 0) {
        let eduHtml = ''
        cvData.education.forEach(entry => {
          eduHtml += `<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <strong style="font-size:14px;font-weight:700;color:#1e293b;display:block">${entry.qualification || 'Qualification'}</strong>
              <span style="font-size:13px;color:#64748b">${entry.institution}</span>
            </div>
            ${entry.year ? `<span style="font-size:12px;color:#64748b">${entry.year}</span>` : ''}
          </div>`
        })
        await addSection(buildSectionHtml('Education', eduHtml))
      }

      // Section 5: Skills
      if (cvData.skills.length > 0) {
        await addSection(buildSectionHtml('Skills',
          `<p style="font-size:13px;color:#334155;margin:0;line-height:1.7">${cvData.skills.join('  •  ')}</p>`))
      }

      // Section 6: References
      let refsContent = ''
      if (cvData.referencesOnRequest) {
        refsContent = `<p style="font-size:13px;color:#334155;margin:0">Available on request</p>`
      } else if (cvData.references.length > 0) {
        refsContent = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">`
        cvData.references.forEach(ref => {
          refsContent += `<div>
            <strong style="font-size:13px;color:#1e293b">${ref.name}</strong>
            ${ref.company ? `<span style="font-size:12px;color:#64748b"> — ${ref.company}</span>` : ''}
            ${ref.contact ? `<p style="font-size:12px;color:#64748b;margin:2px 0 0">${ref.contact}</p>` : ''}
          </div>`
        })
        refsContent += `</div>`
      } else {
        refsContent = `<p style="font-size:13px;color:#334155;margin:0">No references added</p>`
      }
      await addSection(buildSectionHtml('References', refsContent))

      // Download
      const fileName = pd.fullName ? `${pd.fullName.replace(/\s+/g, '_')}_CV.pdf` : 'My_CV.pdf'
      pdf.save(fileName)
    } catch {
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // ─── Export Word Document ───
  const exportWord = async () => {
    setExportingWord(true)
    try {
      const pd = cvData.personalDetails
      const sections: Paragraph[] = []

      // Helper for section heading with bottom border
      const sectionHeading = (text: string) => new Paragraph({
        children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 24, font: 'Calibri', color: '1e293b' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc', space: 4 } },
      })

      // Name
      sections.push(new Paragraph({
        children: [new TextRun({ text: pd.fullName || 'Your Name', bold: true, size: 36, font: 'Calibri', color: '1e293b' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
      }))

      // Contact details
      const contactParts = [pd.email, pd.phone, pd.location].filter(Boolean)
      if (contactParts.length > 0) {
        sections.push(new Paragraph({
          children: [new TextRun({ text: contactParts.join('  |  '), size: 20, font: 'Calibri', color: '666666' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '1e293b', space: 8 } },
        }))
      }

      // Professional Summary
      if (cvData.summary) {
        sections.push(sectionHeading('Professional Summary'))
        sections.push(new Paragraph({
          children: [new TextRun({ text: cvData.summary, size: 22, font: 'Calibri', color: '333333' })],
          spacing: { after: 100, line: 340 },
        }))
      }

      // Work Experience
      if (cvData.workExperience.length > 0) {
        sections.push(sectionHeading('Work Experience'))
        cvData.workExperience.forEach(entry => {
          const startStr = entry.startDate ? formatDate(entry.startDate) : ''
          const endStr = entry.current ? 'Present' : entry.endDate ? formatDate(entry.endDate) : ''
          const dateStr = [startStr, endStr].filter(Boolean).join(' — ')

          // Job title + date on same line using tab stops
          sections.push(new Paragraph({
            children: [
              new TextRun({ text: entry.jobTitle || 'Job Title', bold: true, size: 23, font: 'Calibri', color: '1e293b' }),
              new TextRun({ text: `\t${dateStr}`, size: 20, font: 'Calibri', color: '666666' }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            spacing: { before: 140, after: 20 },
          }))

          // Company
          if (entry.company) {
            sections.push(new Paragraph({
              children: [new TextRun({ text: entry.company, italics: true, size: 21, font: 'Calibri', color: '555555' })],
              spacing: { after: 60 },
            }))
          }

          // Description lines as bullet points
          if (entry.description) {
            entry.description.split('\n').filter(l => l.trim()).forEach(line => {
              const cleanLine = line.replace(/^[•\-\*]\s*/, '')
              sections.push(new Paragraph({
                children: [new TextRun({ text: cleanLine, size: 21, font: 'Calibri', color: '333333' })],
                bullet: { level: 0 },
                spacing: { after: 40, line: 300 },
              }))
            })
          }
        })
      }

      // Education
      if (cvData.education.length > 0) {
        sections.push(sectionHeading('Education'))
        cvData.education.forEach(entry => {
          sections.push(new Paragraph({
            children: [
              new TextRun({ text: entry.qualification || 'Qualification', bold: true, size: 23, font: 'Calibri', color: '1e293b' }),
              ...(entry.year ? [new TextRun({ text: `\t${entry.year}`, size: 20, font: 'Calibri', color: '666666' })] : []),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            spacing: { before: 100, after: 20 },
          }))
          if (entry.institution) {
            sections.push(new Paragraph({
              children: [new TextRun({ text: entry.institution, italics: true, size: 21, font: 'Calibri', color: '555555' })],
              spacing: { after: 80 },
            }))
          }
        })
      }

      // Skills
      if (cvData.skills.length > 0) {
        sections.push(sectionHeading('Skills'))
        sections.push(new Paragraph({
          children: [new TextRun({ text: cvData.skills.join('  •  '), size: 22, font: 'Calibri', color: '333333' })],
          spacing: { after: 100, line: 340 },
        }))
      }

      // References
      sections.push(sectionHeading('References'))
      if (cvData.referencesOnRequest) {
        sections.push(new Paragraph({
          children: [new TextRun({ text: 'Available on request', size: 22, font: 'Calibri', color: '333333' })],
          spacing: { after: 100 },
        }))
      } else if (cvData.references.length > 0) {
        cvData.references.forEach(ref => {
          const parts: TextRun[] = [new TextRun({ text: ref.name, bold: true, size: 22, font: 'Calibri', color: '1e293b' })]
          if (ref.company) parts.push(new TextRun({ text: ` — ${ref.company}`, size: 21, font: 'Calibri', color: '555555' }))
          if (ref.contact) parts.push(new TextRun({ text: `  |  ${ref.contact}`, size: 20, font: 'Calibri', color: '666666' }))
          sections.push(new Paragraph({ children: parts, spacing: { after: 60 } }))
        })
      }

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 2.54cm = 1 inch = 1440 twips
            },
          },
          children: sections,
        }],
      })

      const blob = await Packer.toBlob(doc)
      const fileName = pd.fullName ? `${pd.fullName.replace(/\s+/g, '_')}_CV.docx` : 'My_CV.docx'
      saveAs(blob, fileName)
    } catch (err) {
      console.error('Word export error:', err)
      alert('Failed to export Word document. Please try again.')
    } finally {
      setExportingWord(false)
    }
  }

  // Helpers
  const updatePersonal = (field: string, value: string) => {
    setCvData(prev => ({
      ...prev,
      personalDetails: { ...prev.personalDetails, [field]: value },
    }))
  }

  const addWorkEntry = () => {
    setCvData(prev => ({
      ...prev,
      workExperience: [...prev.workExperience, {
        id: Date.now().toString(),
        jobTitle: '', company: '', startDate: '', endDate: '', current: false, description: '',
      }],
    }))
  }

  const updateWorkEntry = (index: number, field: string, value: string | boolean) => {
    setCvData(prev => {
      const exp = [...prev.workExperience]
      exp[index] = { ...exp[index], [field]: value }
      return { ...prev, workExperience: exp }
    })
  }

  const removeWorkEntry = (index: number) => {
    setCvData(prev => ({
      ...prev,
      workExperience: prev.workExperience.filter((_, i) => i !== index),
    }))
  }

  const addEducation = () => {
    setCvData(prev => ({
      ...prev,
      education: [...prev.education, { id: Date.now().toString(), qualification: '', institution: '', year: '' }],
    }))
  }

  const updateEducation = (index: number, field: string, value: string) => {
    setCvData(prev => {
      const edu = [...prev.education]
      edu[index] = { ...edu[index], [field]: value }
      return { ...prev, education: edu }
    })
  }

  const removeEducation = (index: number) => {
    setCvData(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }))
  }

  const addSkill = () => {
    const trimmed = skillInput.trim()
    if (trimmed && !cvData.skills.includes(trimmed)) {
      setCvData(prev => ({ ...prev, skills: [...prev.skills, trimmed] }))
      setSkillInput('')
    }
  }

  const removeSkill = (skill: string) => {
    setCvData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))
  }

  const addReference = () => {
    setCvData(prev => ({
      ...prev,
      references: [...prev.references, { id: Date.now().toString(), name: '', company: '', contact: '' }],
    }))
  }

  const updateReference = (index: number, field: string, value: string) => {
    setCvData(prev => {
      const refs = [...prev.references]
      refs[index] = { ...refs[index], [field]: value }
      return { ...prev, references: refs }
    })
  }

  const removeReference = (index: number) => {
    setCvData(prev => ({
      ...prev,
      references: prev.references.filter((_, i) => i !== index),
    }))
  }

  if (loading) {
    return (
      <main className="no-pad">
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading CV Builder...</p>
        </div>
      </main>
    )
  }

  // RENDER STEP CONTENT
  const renderStep = () => {
    switch (STEPS[currentStep].id) {
      case 'personal':
        return (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Personal Details</h2>
            <p className={styles.stepDesc}>Your contact information for the top of your CV.</p>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Full Name</label>
                <input value={cvData.personalDetails.fullName} onChange={e => updatePersonal('fullName', e.target.value)} placeholder="John Smith" />
              </div>
              <div className={styles.formGroup}>
                <label>Email</label>
                <input type="email" value={cvData.personalDetails.email} onChange={e => updatePersonal('email', e.target.value)} placeholder="john@example.com" />
              </div>
              <div className={styles.formGroup}>
                <label>Phone</label>
                <input value={cvData.personalDetails.phone} onChange={e => updatePersonal('phone', e.target.value)} placeholder="07123 456789" />
              </div>
              <div className={styles.formGroup}>
                <label>Location</label>
                <input value={cvData.personalDetails.location} onChange={e => updatePersonal('location', e.target.value)} placeholder="London, UK" />
              </div>
            </div>
          </div>
        )

      case 'summary':
        return (
          <div className={styles.stepContent}>
            <div className={styles.stepHeader}>
              <div>
                <h2 className={styles.stepTitle}>Professional Summary</h2>
                <p className={styles.stepDesc}>A brief paragraph summarising your experience and strengths.</p>
              </div>
              <button className={styles.aiBtn} onClick={() => openAiModal('summary')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                  <path d="M16 14H8a4 4 0 0 0-4 4v2h16v-2a4 4 0 0 0-4-4z" />
                </svg>
                AI Assist
              </button>
            </div>
            <div className={styles.formGroup}>
              <textarea
                value={cvData.summary}
                onChange={e => setCvData(prev => ({ ...prev, summary: e.target.value }))}
                placeholder="Experienced professional with 5+ years in fast-paced environments. Summarise your key strengths and career highlights..."
                rows={6}
              />
            </div>
          </div>
        )

      case 'experience':
        return (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Work Experience</h2>
            <p className={styles.stepDesc}>List your work history, most recent first.</p>
            {cvData.workExperience.map((entry, i) => (
              <div key={entry.id} className={styles.entryCard}>
                <div className={styles.entryHeader}>
                  <span className={styles.entryNumber}>Position {i + 1}</span>
                  <div className={styles.entryActions}>
                    <button className={styles.aiBtn} onClick={() => openAiModal('experience', i)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                        <path d="M16 14H8a4 4 0 0 0-4 4v2h16v-2a4 4 0 0 0-4-4z" />
                      </svg>
                      AI Assist
                    </button>
                    <button className={styles.removeBtn} onClick={() => removeWorkEntry(i)}>Remove</button>
                  </div>
                </div>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Job Title</label>
                    <input value={entry.jobTitle} onChange={e => updateWorkEntry(i, 'jobTitle', e.target.value)} placeholder="e.g. Project Manager" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Company</label>
                    <input value={entry.company} onChange={e => updateWorkEntry(i, 'company', e.target.value)} placeholder="The Ritz London" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Start Date</label>
                    <input type="month" value={entry.startDate} onChange={e => updateWorkEntry(i, 'startDate', e.target.value)} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>End Date</label>
                    <input type="month" value={entry.endDate} onChange={e => updateWorkEntry(i, 'endDate', e.target.value)} disabled={entry.current} />
                    <label className={styles.checkLabel}>
                      <input type="checkbox" checked={entry.current} onChange={e => updateWorkEntry(i, 'current', e.target.checked)} />
                      I currently work here
                    </label>
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label>Description / Responsibilities</label>
                  <textarea
                    value={entry.description}
                    onChange={e => updateWorkEntry(i, 'description', e.target.value)}
                    placeholder="Describe your key responsibilities and achievements..."
                    rows={4}
                  />
                </div>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addWorkEntry}>+ Add Work Experience</button>
          </div>
        )

      case 'education':
        return (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Education</h2>
            <p className={styles.stepDesc}>Your qualifications and education history.</p>
            {cvData.education.map((entry, i) => (
              <div key={entry.id} className={styles.entryCard}>
                <div className={styles.entryHeader}>
                  <span className={styles.entryNumber}>Qualification {i + 1}</span>
                  <button className={styles.removeBtn} onClick={() => removeEducation(i)}>Remove</button>
                </div>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Qualification</label>
                    <input value={entry.qualification} onChange={e => updateEducation(i, 'qualification', e.target.value)} placeholder="BSc Computer Science" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Institution</label>
                    <input value={entry.institution} onChange={e => updateEducation(i, 'institution', e.target.value)} placeholder="University of Manchester" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Year</label>
                    <input value={entry.year} onChange={e => updateEducation(i, 'year', e.target.value)} placeholder="2020" />
                  </div>
                </div>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addEducation}>+ Add Education</button>
          </div>
        )

      case 'skills':
        return (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Skills</h2>
            <p className={styles.stepDesc}>Add your key skills and competencies.</p>
            <div className={styles.skillsInputRow}>
              <input
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                placeholder="Type a skill and press Enter"
              />
              <button className={styles.addSkillBtn} onClick={addSkill}>Add</button>
            </div>
            <div className={styles.skillTags}>
              {cvData.skills.map(skill => (
                <span key={skill} className={styles.skillTag}>
                  {skill}
                  <button onClick={() => removeSkill(skill)}>&times;</button>
                </span>
              ))}
            </div>
            {cvData.skills.length === 0 && (
              <p className={styles.emptyHint}>No skills added yet. Start typing above to add your skills.</p>
            )}
          </div>
        )

      case 'references':
        return (
          <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>References</h2>
            <p className={styles.stepDesc}>Add professional references or choose &quot;Available on request&quot;.</p>
            <label className={styles.checkLabel} style={{ marginBottom: '1rem' }}>
              <input
                type="checkbox"
                checked={cvData.referencesOnRequest}
                onChange={e => setCvData(prev => ({ ...prev, referencesOnRequest: e.target.checked }))}
              />
              Available on request
            </label>
            {!cvData.referencesOnRequest && (
              <>
                {cvData.references.map((ref, i) => (
                  <div key={ref.id} className={styles.entryCard}>
                    <div className={styles.entryHeader}>
                      <span className={styles.entryNumber}>Reference {i + 1}</span>
                      <button className={styles.removeBtn} onClick={() => removeReference(i)}>Remove</button>
                    </div>
                    <div className={styles.formGrid}>
                      <div className={styles.formGroup}>
                        <label>Name</label>
                        <input value={ref.name} onChange={e => updateReference(i, 'name', e.target.value)} placeholder="Jane Doe" />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Company / Position</label>
                        <input value={ref.company} onChange={e => updateReference(i, 'company', e.target.value)} placeholder="Manager at The Ritz" />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Contact (email or phone)</label>
                        <input value={ref.contact} onChange={e => updateReference(i, 'contact', e.target.value)} placeholder="jane@example.com" />
                      </div>
                    </div>
                  </div>
                ))}
                <button className={styles.addBtn} onClick={addReference}>+ Add Reference</button>
              </>
            )}
          </div>
        )

      default:
        return null
    }
  }

  // CV PREVIEW RENDER
  const renderPreview = () => (
    <div className={styles.previewContent} ref={previewRef}>
      {/* Name & Contact */}
      <div className={styles.pvHeader}>
        <h1 className={styles.pvName}>{cvData.personalDetails.fullName || 'Your Name'}</h1>
        <div className={styles.pvContact}>
          {[cvData.personalDetails.email, cvData.personalDetails.phone, cvData.personalDetails.location]
            .filter(Boolean)
            .join('  |  ')}
        </div>
      </div>

      {/* Summary */}
      {cvData.summary && (
        <div className={styles.pvSection}>
          <h2 className={styles.pvSectionTitle}>Professional Summary</h2>
          <p className={styles.pvText}>{cvData.summary}</p>
        </div>
      )}

      {/* Work Experience */}
      {cvData.workExperience.length > 0 && (
        <div className={styles.pvSection}>
          <h2 className={styles.pvSectionTitle}>Work Experience</h2>
          {cvData.workExperience.map((entry, i) => (
            <div key={i} className={styles.pvEntry}>
              <div className={styles.pvEntryHeader}>
                <div>
                  <strong className={styles.pvRole}>{entry.jobTitle || 'Job Title'}</strong>
                  <span className={styles.pvCompany}>{entry.company}</span>
                </div>
                <span className={styles.pvDate}>
                  {entry.startDate && formatDate(entry.startDate)}
                  {(entry.startDate || entry.endDate) && ' — '}
                  {entry.current ? 'Present' : entry.endDate && formatDate(entry.endDate)}
                </span>
              </div>
              {entry.description && (
                <div className={styles.pvDesc}>
                  {entry.description.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Education */}
      {cvData.education.length > 0 && (
        <div className={styles.pvSection}>
          <h2 className={styles.pvSectionTitle}>Education</h2>
          {cvData.education.map((entry, i) => (
            <div key={i} className={styles.pvEntry}>
              <div className={styles.pvEntryHeader}>
                <div>
                  <strong className={styles.pvRole}>{entry.qualification || 'Qualification'}</strong>
                  <span className={styles.pvCompany}>{entry.institution}</span>
                </div>
                {entry.year && <span className={styles.pvDate}>{entry.year}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skills */}
      {cvData.skills.length > 0 && (
        <div className={styles.pvSection}>
          <h2 className={styles.pvSectionTitle}>Skills</h2>
          <p className={styles.pvText}>{cvData.skills.join('  •  ')}</p>
        </div>
      )}

      {/* References */}
      <div className={styles.pvSection}>
        <h2 className={styles.pvSectionTitle}>References</h2>
        {cvData.referencesOnRequest ? (
          <p className={styles.pvText}>Available on request</p>
        ) : cvData.references.length > 0 ? (
          <div className={styles.pvRefsGrid}>
            {cvData.references.map((ref, i) => (
              <div key={i}>
                <strong>{ref.name}</strong>
                {ref.company && <span> — {ref.company}</span>}
                {ref.contact && <p className={styles.pvRefContact}>{ref.contact}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.pvText}>No references added</p>
        )}
      </div>
    </div>
  )

  return (
    <main className={`${styles.page} no-pad`}>
      <Header />

      {/* Banner */}
      <section className={styles.banner}>
        <div className={styles.bannerInner}>
          <h1 className={styles.bannerTitle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            CV Builder
          </h1>
          <div className={styles.bannerActions}>
            <button className={styles.saveBtn} onClick={saveCV} disabled={saving}>
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save CV'}
            </button>
            <button className={styles.previewToggle} onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            {!nativeShell && (
              <>
                <button className={styles.exportBtn} onClick={exportPDF} disabled={exporting}>
                  {exporting ? 'Exporting...' : 'Export PDF'}
                </button>
                <button className={styles.exportBtn} onClick={exportWord} disabled={exportingWord}>
                  {exportingWord ? 'Creating...' : 'Download Word'}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {uploadMode === 'choose' && (
        <div style={{ maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>How would you like to get started?</h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Upload an existing CV or build one from scratch.</p>

          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: '2px dashed #d1d5db', borderRadius: 10, padding: '2rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1rem', background: '#f8fafc', transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#16a34a')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d5db')}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}><Ico name="file" size={20} /></div>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>Upload your CV</div>
            <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>PDF or Word — max 5 MB</div>
            {uploading && <div style={{ marginTop: '0.75rem', color: '#16a34a', fontWeight: 500 }}>Uploading...</div>}
            {uploadError && <div style={{ marginTop: '0.75rem', color: '#dc2626', fontSize: '0.85rem' }}>{uploadError}</div>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </div>

          <button
            onClick={() => setUploadMode('build')}
            style={{ width: '100%', padding: '0.875rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}
          >
            Build from scratch
          </button>
        </div>
      )}

      {uploadMode !== 'choose' && <div className={styles.layout}>
        {/* LEFT: Form */}
        <div className={`${styles.formPanel} ${showPreview ? styles.formPanelHidden : ''}`}>
          {/* Progress Bar */}
          <div className={styles.progressBar}>
            <div className={styles.progressMeta}>
              <span className={styles.progressLabel}>
                {STEPS[currentStep].label}
              </span>
              <span className={styles.progressCount}>
                Step {currentStep + 1} of {STEPS.length}
              </span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>

          {/* Step Content */}
          {renderStep()}

          {/* Navigation */}
          <div className={styles.stepNav}>
            {currentStep > 0 && (
              <button className={styles.prevBtn} onClick={() => setCurrentStep(currentStep - 1)}>
                Back
              </button>
            )}
            {currentStep < STEPS.length - 1 ? (
              <button className={styles.nextBtn} onClick={() => setCurrentStep(currentStep + 1)}>
                Next Step
              </button>
            ) : (
              /* THE SECOND RENDERING, and the one a sweep would miss. On the
                 LAST step these REPLACE Next Step, so hiding them leaves this
                 row with Back alone — checked before doing it, and Save CV
                 and Preview remain in the toolbar above, so the step is not a
                 dead end. */
              !nativeShell && (
                <div className={styles.exportBtns}>
                  <button className={styles.nextBtn} onClick={exportPDF} disabled={exporting}>
                    {exporting ? 'Exporting...' : 'Export PDF'}
                  </button>
                  <button className={styles.nextBtn} onClick={exportWord} disabled={exportingWord}>
                    {exportingWord ? 'Creating...' : 'Download Word'}
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        {/* RIGHT: Live Preview */}
        <div className={`${styles.previewPanel} ${showPreview ? styles.previewPanelFull : ''}`}>
          <div className={styles.previewLabel}>Live Preview</div>
          <div className={styles.previewPage}>
            {renderPreview()}
          </div>
        </div>
      </div>}

      {/* AI Assist Modal */}
      {aiModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !aiLoading && setAiModalOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>AI Writing Assistant</h2>
              <button className={styles.modalClose} onClick={() => !aiLoading && setAiModalOpen(false)}>&times;</button>
            </div>
            <div className={styles.modalBody}>
              {aiType === 'summary' ? (
                <>
                  <p className={styles.modalHint}>
                    We&apos;ll generate a professional summary based on your profile data. Add any additional context below.
                  </p>
                  <div className={styles.formGroup}>
                    <label>Target Role (optional)</label>
                    <input
                      value={aiInput.jobTitle}
                      onChange={e => setAiInput(prev => ({ ...prev, jobTitle: e.target.value }))}
                      placeholder="e.g. Project Manager, Software Engineer"
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.modalHint}>
                    Describe your key duties and we&apos;ll generate professional bullet points.
                  </p>
                  <div className={styles.formGroup}>
                    <label>Job Title</label>
                    <input
                      value={aiInput.jobTitle}
                      onChange={e => setAiInput(prev => ({ ...prev, jobTitle: e.target.value }))}
                      placeholder="e.g. Head Chef"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Key Duties</label>
                    <textarea
                      value={aiInput.keyDuties}
                      onChange={e => setAiInput(prev => ({ ...prev, keyDuties: e.target.value }))}
                      placeholder="e.g. Managed kitchen team of 8, created seasonal menus, maintained food safety standards..."
                      rows={3}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Duration (optional)</label>
                    <input
                      value={aiInput.duration}
                      onChange={e => setAiInput(prev => ({ ...prev, duration: e.target.value }))}
                      placeholder="e.g. 3 years"
                    />
                  </div>
                </>
              )}
              <div className={styles.formGroup}>
                <label>Additional Context (optional)</label>
                <textarea
                  value={aiInput.additionalContext}
                  onChange={e => setAiInput(prev => ({ ...prev, additionalContext: e.target.value }))}
                  placeholder="Any extra details you want included..."
                  rows={2}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setAiModalOpen(false)} disabled={aiLoading}>Cancel</button>
              <button className={styles.modalGenerate} onClick={generateAiText} disabled={aiLoading}>
                {aiLoading ? 'Generating...' : 'Generate Text'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length >= 2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthIndex = parseInt(parts[1]) - 1
    return `${months[monthIndex] || parts[1]} ${parts[0]}`
  }
  return dateStr
}
