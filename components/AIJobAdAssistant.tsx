'use client'

import { useState, useEffect } from 'react'
import { Wand2, ChevronDown, ChevronUp, Loader2, CheckCircle, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import styles from './AIJobAdAssistant.module.css'

interface FormData {
  title: string
  company: string
  category: string
  location: string
  salaryMin: string
  salaryMax: string
  salaryPeriod: string
  employmentType: string
  workLocationType: string
  description: string
}

interface JobAdResult {
  title: string
  description: string
  requirements: string
  benefits: string
}

interface Props {
  formData: FormData
  userId: string | null
  onApply: (fields: { title?: string; description?: string }) => void
}

export default function AIJobAdAssistant({ formData, userId, onApply }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'generate' | 'enhance'>('generate')
  const [bulletPoints, setBulletPoints] = useState('• ')
  const [companyDescription, setCompanyDescription] = useState('')
  const [loadingCompanyDesc, setLoadingCompanyDesc] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<JobAdResult | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(false)

  // Fetch company description from employer_profiles each time the panel opens
  useEffect(() => {
    if (!isOpen) return
    const fetchCompanyDesc = async () => {
      setLoadingCompanyDesc(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoadingCompanyDesc(false); return }
      const { data } = await supabase
        .from('employer_profiles')
        .select('company_description')
        .eq('user_id', session.user.id)
        .single()
      if (data?.company_description) {
        setCompanyDescription(data.company_description)
      }
      setLoadingCompanyDesc(false)
    }
    fetchCompanyDesc()
  }, [isOpen])

  const handleBulletKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const { value, selectionStart } = el

    if (e.key === 'Enter') {
      e.preventDefault()
      const before = value.slice(0, selectionStart)
      const after = value.slice(selectionStart)
      const next = before + '\n• ' + after
      setBulletPoints(next)
      setTimeout(() => {
        el.selectionStart = selectionStart + 3
        el.selectionEnd = selectionStart + 3
      }, 0)
      return
    }

    if (e.key === 'Backspace') {
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
      const currentLine = value.slice(lineStart, selectionStart)
      if (currentLine === '• ') {
        e.preventDefault()
        if (lineStart === 0) {
          // Only line — keep the starter bullet, don't delete it
          setBulletPoints('• ')
          setTimeout(() => { el.selectionStart = 2; el.selectionEnd = 2 }, 0)
        } else {
          // Remove this empty bullet line (including the preceding newline)
          const newValue = value.slice(0, lineStart - 1) + value.slice(lineStart + 2)
          setBulletPoints(newValue)
          setTimeout(() => {
            const pos = lineStart - 1
            el.selectionStart = pos
            el.selectionEnd = pos
          }, 0)
        }
      }
    }
  }

  // Strip "• " prefixes before sending to API
  const bulletPointsForApi = bulletPoints
    .split('\n')
    .map(line => line.replace(/^•\s*/, '').trim())
    .filter(Boolean)
    .join('\n')

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mode === 'generate' ? 'job-ad' : 'job-ad-enhance',
          data: {
            title: formData.title,
            company: formData.company,
            category: formData.category,
            location: formData.location,
            salaryMin: formData.salaryMin,
            salaryMax: formData.salaryMax,
            salaryPeriod: formData.salaryPeriod,
            employmentType: formData.employmentType,
            workLocationType: formData.workLocationType,
            description: mode === 'enhance' ? formData.description : undefined,
            bulletPoints: mode === 'generate' ? bulletPointsForApi : undefined,
            companyDescription,
          },
        }),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        setError(json.error || 'Something went wrong. Please try again.')
        return
      }

      setResult(json.jobAd)
    } catch {
      setError('Failed to connect to AI service.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleApply = () => {
    if (!result) return
    const combined = [
      result.description || '',
      result.requirements ? `<h3>Requirements</h3>${result.requirements}` : '',
      result.benefits ? `<h3>Benefits</h3>${result.benefits}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    onApply({
      title: result.title || formData.title,
      description: combined,
    })

    setToast(true)
    setTimeout(() => setToast(false), 3000)
    setResult(null)
    setIsOpen(false)
  }

  const hasEnoughInfo = formData.title || formData.category

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => setIsOpen(v => !v)}
      >
        <Wand2 size={16} />
        <span>AI Job Ad Assistant</span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <Wand2 size={18} />
              AI Job Ad Assistant
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {/* Mode tabs */}
          <div className={styles.modeTabs}>
            <button
              type="button"
              className={`${styles.modeTab} ${mode === 'generate' ? styles.modeTabActive : ''}`}
              onClick={() => { setMode('generate'); setResult(null); setError(''); setBulletPoints('• ') }}
            >
              Generate from scratch
            </button>
            <button
              type="button"
              className={`${styles.modeTab} ${mode === 'enhance' ? styles.modeTabActive : ''}`}
              onClick={() => { setMode('enhance'); setResult(null); setError('') }}
            >
              Enhance existing
            </button>
          </div>

          {mode === 'generate' && (
            <div className={styles.field}>
              <label className={styles.label}>Key points to include (optional)</label>
              <textarea
                className={styles.textarea}
                rows={4}
                value={bulletPoints}
                onChange={e => setBulletPoints(e.target.value)}
                onKeyDown={handleBulletKeyDown}
              />
            </div>
          )}

          {mode === 'enhance' && !formData.description && (
            <div className={styles.warning}>
              No description in the form yet. Fill in the Job Description field first, then use Enhance.
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>
              Company description (pulled from your profile)
              {loadingCompanyDesc && <span className={styles.loadingText}> Loading…</span>}
            </label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Describe your company, culture, and what makes it a great place to work…"
              value={companyDescription}
              onChange={e => setCompanyDescription(e.target.value)}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="button"
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={isGenerating || !hasEnoughInfo || (mode === 'enhance' && !formData.description)}
          >
            {isGenerating ? (
              <>
                <Loader2 size={15} className={styles.spin} />
                Generating…
              </>
            ) : (
              <>
                <Wand2 size={15} />
                {mode === 'generate' ? 'Generate Job Ad' : 'Enhance Job Ad'}
              </>
            )}
          </button>

          {!hasEnoughInfo && (
            <p className={styles.hint}>Fill in at least a Job Title or Category above to generate.</p>
          )}

          {/* Result preview */}
          {result && (
            <div className={styles.result}>
              <div className={styles.resultHeader}>
                <CheckCircle size={16} className={styles.checkIcon} />
                <span>AI draft ready — review and apply to form</span>
              </div>

              {result.title && result.title !== formData.title && (
                <div className={styles.resultField}>
                  <div className={styles.resultLabel}>Suggested Title</div>
                  <div className={styles.resultValue}>{result.title}</div>
                </div>
              )}

              <div className={styles.resultField}>
                <div className={styles.resultLabel}>Description</div>
                <div
                  className={styles.resultPreview}
                  dangerouslySetInnerHTML={{ __html: result.description }}
                />
              </div>

              {result.requirements && (
                <div className={styles.resultField}>
                  <div className={styles.resultLabel}>Requirements</div>
                  <div
                    className={styles.resultPreview}
                    dangerouslySetInnerHTML={{ __html: result.requirements }}
                  />
                </div>
              )}

              {result.benefits && (
                <div className={styles.resultField}>
                  <div className={styles.resultLabel}>Benefits</div>
                  <div
                    className={styles.resultPreview}
                    dangerouslySetInnerHTML={{ __html: result.benefits }}
                  />
                </div>
              )}

              <div className={styles.resultActions}>
                <button type="button" className={styles.applyBtn} onClick={handleApply}>
                  <CheckCircle size={15} />
                  Apply to form
                </button>
                <button
                  type="button"
                  className={styles.regenBtn}
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? <Loader2 size={14} className={styles.spin} /> : <Wand2 size={14} />}
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className={styles.toast}>
          <CheckCircle size={16} />
          Job ad applied to form!
        </div>
      )}
    </div>
  )
}
