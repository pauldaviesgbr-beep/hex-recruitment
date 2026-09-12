'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import StarRating from '@/components/StarRating'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

type UserRole = 'employer' | 'employee' | null

const CANDIDATE_QUESTIONS = [
  { id: 'q1', label: 'How easy was it to find relevant jobs?', options: ['Very easy', 'Easy', 'OK', 'Difficult', 'Very difficult'] },
  { id: 'q2', label: 'How straightforward was applying for a job?', options: ['Very easy', 'Easy', 'OK', 'Difficult', 'Very difficult'] },
  { id: 'q3', label: 'How useful are job recommendations?', options: ['Very useful', 'Useful', 'Somewhat', 'Not useful', "Haven't used it"] },
  { id: 'q4', label: "How does Thrive compare to other job sites you've used?", options: ['Much better', 'Better', 'About the same', 'Worse', 'Much worse'] },
  { id: 'q5', label: 'How likely are you to keep using Thrive?', options: ['Very likely', 'Likely', 'Unsure', 'Unlikely'] },
  { id: 'q6', label: 'Would you recommend Thrive to someone looking for work?', options: ['Yes definitely', 'Maybe', 'No'] },
]

const CANDIDATE_FEATURES = ['Job search', 'CV Builder', 'Saved Jobs', 'Job Alerts', 'Messages', 'Company Reviews', 'Recommended Jobs']

const EMPLOYER_QUESTIONS = [
  { id: 'q1', label: 'How easy was posting your first job?', options: ['Very easy', 'Easy', 'OK', 'Difficult', 'Very difficult'] },
  { id: 'q2', label: 'How useful is the candidate search and pipeline?', options: ['Very useful', 'Useful', 'Somewhat', 'Not useful', "Haven't used it"] },
  { id: 'q3', label: 'How easy is it to manage applications?', options: ['Very easy', 'Easy', 'OK', 'Difficult', 'Very difficult'] },
  { id: 'q4', label: 'How does Thrive compare to other recruitment tools?', options: ['Much better', 'Better', 'About the same', 'Worse', 'Much worse'] },
  { id: 'q5', label: 'How likely are you to keep using Thrive?', options: ['Very likely', 'Likely', 'Unsure', 'Unlikely'] },
  { id: 'q6', label: 'Would you recommend Thrive to another business owner?', options: ['Yes definitely', 'Maybe', 'No'] },
]

const EMPLOYER_FEATURES = ['Post a Job', 'Job ads', 'Find Candidates', 'Application Pipeline', 'Analytics', 'Messages', 'Boost']

const HEARD_FROM_OPTIONS = ['Friend/colleague', 'Social media', 'Google search', 'Other']

export default function FeedbackPage() {
  const router = useRouter()
  const [role, setRole] = useState<UserRole>(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [features, setFeatures] = useState<string[]>([])
  const [heardFrom, setHeardFrom] = useState('')
  const [bugs, setBugs] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const checkRole = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const r = session.user.user_metadata?.role
        setRole(r === 'employer' ? 'employer' : 'employee')
      }
      setLoading(false)
    }
    checkRole()
  }, [])

  const questions = role === 'employer' ? EMPLOYER_QUESTIONS : CANDIDATE_QUESTIONS
  const featureOptions = role === 'employer' ? EMPLOYER_FEATURES : CANDIDATE_FEATURES

  const toggleFeature = (f: string) => {
    setFeatures(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])
  }

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a star rating')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const comment = JSON.stringify({
        type: role === 'employer' ? 'employer-questionnaire' : 'candidate-questionnaire',
        ...answers,
        features,
        heardFrom,
        bugs: bugs.trim() || null,
        notes: suggestions.trim() || null,
      })

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment,
          pageUrl: '/feedback',
        }),
      })

      if (!res.ok) throw new Error('Failed')
      setSubmitted(true)
      setTimeout(() => {
        router.push(role === 'employer' ? '/employer/dashboard' : '/dashboard')
      }, 2000)
    } catch {
      setError('Something went wrong, please try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>Loading...</div>
        </div>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.container}>
          <div className={styles.successCard}>
            <span className={styles.successIcon}>&#10003;</span>
            <h2 className={styles.successTitle}>Thank you!</h2>
            <p className={styles.successText}>Your feedback helps us make Thrive better. Redirecting to dashboard...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>

        <h1 className={styles.title}>Share Your Feedback</h1>
        <p className={styles.subtitle}>Takes 2 minutes — helps us build what you need</p>

        <div className={styles.form}>
          {/* Star Rating */}
          <div className={styles.section}>
            <label className={styles.label}>Overall, how would you rate Thrive?</label>
            <StarRating rating={rating} interactive size="md" onRate={r => { setRating(r); setError('') }} />
          </div>

          {/* Role-specific questions */}
          {questions.map(q => (
            <div key={q.id} className={styles.section}>
              <label className={styles.label}>{q.label}</label>
              <div className={styles.pillRow}>
                {q.options.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`${styles.pill} ${answers[q.id] === opt ? styles.pillActive : ''}`}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: prev[q.id] === opt ? '' : opt }))}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Features multi-select */}
          <div className={styles.section}>
            <label className={styles.label}>Which features do you use most? (select all that apply)</label>
            <div className={styles.pillRow}>
              {featureOptions.map(f => (
                <button
                  key={f}
                  type="button"
                  className={`${styles.pill} ${features.includes(f) ? styles.pillActive : ''}`}
                  onClick={() => toggleFeature(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* How did you hear about us */}
          <div className={styles.section}>
            <label className={styles.label}>How did you hear about Thrive?</label>
            <div className={styles.pillRow}>
              {HEARD_FROM_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`${styles.pill} ${heardFrom === opt ? styles.pillActive : ''}`}
                  onClick={() => setHeardFrom(prev => prev === opt ? '' : opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Bugs */}
          <div className={styles.section}>
            <label className={styles.label}>Any bugs or issues you&apos;ve encountered? (optional)</label>
            <textarea
              className={styles.textarea}
              placeholder="Describe any problems you've run into..."
              maxLength={1000}
              rows={3}
              value={bugs}
              onChange={e => setBugs(e.target.value)}
            />
          </div>

          {/* Suggestions */}
          <div className={styles.section}>
            <label className={styles.label}>What would make Thrive better? (optional)</label>
            <textarea
              className={styles.textarea}
              placeholder="Tell us what's missing or what could be improved..."
              maxLength={1000}
              rows={3}
              value={suggestions}
              onChange={e => setSuggestions(e.target.value)}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </main>
  )
}
