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
  const [bulletPoints, setBulletPoints] = useState('')
  const [companyDescription, setCompanyDescription] = useState('')
  const [loadingCompanyDesc, setLoadingCompanyDesc] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<JobAdResult | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(false)

  // Fetch company description from employer_profiles when panel opens
  useEffect(() => {
    if (isOpen && userId && !companyDescription) {
      setLoadingCompanyDesc(true)
      supabase
        .from('employer_profiles')
        .select('company_description')
        .eq('user_id', userId)
        .single()
        .then(({ data }) => {
          if (data?.company_description) {
            setCompanyDescription(data.company_description)
          }
          setLoadingCompanyDesc(false)
        })
    }
  }, [isOpen, userId, companyDescription])

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
            bulletPoints: mode === 'generate' ? bulletPoints : undefined,
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
              onClick={() => { setMode('generate'); setResult(null); setError('') }}
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

          {/* Form summary */}
          <div className={styles.summary}>
            <div className={styles.summaryTitle}>Using form values:</div>
            <div className={styles.summaryGrid}>
              <span className={styles.summaryItem}><strong>Title:</strong> {formData.title || <em>not set</em>}</span>
              <span className={styles.summaryItem}><strong>Location:</strong> {formData.location || <em>not set</em>}</span>
              <span className={styles.summaryItem}><strong>Salary:</strong> {formData.salaryMin ? `£${formData.salaryMin}${formData.salaryMax ? `–£${formData.salaryMax}` : ''} / ${formData.salaryPeriod}` : <em>not set</em>}</span>
              <span className={styles.summaryItem}><strong>Type:</strong> {formData.employmentType}</span>
            </div>
          </div>

          {mode === 'generate' && (
            <div className={styles.field}>
              <label className={styles.label}>Key points to include (optional)</label>
              <textarea
                className={styles.textarea}
                rows={4}
                placeholder={'e.g.\n• Fast-paced environment\n• Immediate start available\n• Tips included\n• Progression opportunities'}
                value={bulletPoints}
                onChange={e => setBulletPoints(e.target.value)}
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
