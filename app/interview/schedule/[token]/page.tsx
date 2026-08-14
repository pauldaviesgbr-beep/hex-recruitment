'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import CalendarSlotPicker from '@/components/CalendarSlotPicker'
import { Ico } from '@/components/icons'

type Slot = { date: string; time: string; duration: number }

interface ScheduleContext {
  interviewId: string
  employerId: string
  candidateId: string
  applicationId: string
  jobId: string
  jobTitle: string
  company: string
  interviewType: string
  duration: number
}

export default function CandidateSelfSchedulePage() {
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<ScheduleContext | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)

  useEffect(() => {
    const init = async () => {
      // Auth check
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push(`/login/employee?redirect=${encodeURIComponent(pathname)}`)
        return
      }

      // Validate token
      try {
        const res = await fetch(`/api/interview/schedule/${token}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'This link is no longer valid')
          setLoading(false)
          return
        }

        // Verify the authenticated user is the invited candidate
        if (session.user.id !== data.candidateId) {
          setError('This interview invitation is for a different account.')
          setLoading(false)
          return
        }

        setContext(data)

        // Fetch available slots
        setSlotsLoading(true)
        const from = new Date()
        const to = new Date(Date.now() + 28 * 86_400_000)
        const slotsRes = await fetch(
          `/api/calendar/slots?employerId=${data.employerId}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`
        )
        const slotsData = await slotsRes.json()
        setSlots(slotsData.slots || [])
        setSlotsLoading(false)
      } catch {
        setError('Failed to load scheduling page.')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [token, router, pathname])

  const handleBook = async () => {
    if (!context || !selectedDate || !selectedTime) return
    setBooking(true)

    try {
      // Get candidate details for the booking
      const { data: { session } } = await supabase.auth.getSession()
      const candidateName = session?.user?.user_metadata?.full_name || 'Candidate'
      const candidateEmail = session?.user?.email || ''

      const res = await fetch('/api/calendar/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId: context.interviewId,
          employerId: context.employerId,
          candidateId: context.candidateId,
          bookedDate: selectedDate,
          bookedTime: selectedTime,
          duration: context.duration,
          candidateEmail,
          candidateName,
          jobTitle: context.jobTitle,
          companyName: context.company,
          selfScheduled: true,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Booking failed. Please try again.')
        setBooking(false)
        return
      }

      setBooked(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setBooking(false)
    }
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 520, margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
          <p style={{ color: '#64748b' }}>Loading your interview invitation...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 520, margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}><Ico name="calendar" size={20} /></div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>{error}</h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
            {error.includes('already') ? 'Check your dashboard for details.' : 'Please contact the employer if you think this is a mistake.'}
          </p>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '0.625rem 1.25rem', background: '#0f172a', color: '#FFE500', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Go to Dashboard
          </button>
        </div>
      </main>
    )
  }

  if (booked) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 520, margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}><Ico name="party-popper" size={20} /></div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#15803d', marginBottom: '0.5rem' }}>Interview Booked!</h2>
          <p style={{ color: '#64748b', marginBottom: '0.25rem' }}>
            Your interview for <strong>{context?.jobTitle}</strong> at <strong>{context?.company}</strong> has been confirmed.
          </p>
          <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
            Check your email for the calendar invite.
          </p>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '0.625rem 1.25rem', background: '#0f172a', color: '#FFE500', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Back to Dashboard
          </button>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div style={{ maxWidth: 520, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.375rem' }}>Schedule Your Interview</h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
            <strong>{context?.company}</strong> — {context?.jobTitle}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            {context?.interviewType === 'video' ? 'Video Call' : context?.interviewType === 'phone' ? 'Phone Call' : 'In-Person'} · {context?.duration} min
          </p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' }}>
          <CalendarSlotPicker
            slots={slots}
            loading={slotsLoading}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onSelectDate={setSelectedDate}
            onSelectTime={setSelectedTime}
          />
        </div>

        <button
          onClick={handleBook}
          disabled={!selectedDate || !selectedTime || booking}
          style={{
            width: '100%', marginTop: '1rem', padding: '0.875rem',
            background: !selectedDate || !selectedTime || booking ? '#94a3b8' : '#16a34a',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: '1rem', fontWeight: 600,
            cursor: !selectedDate || !selectedTime || booking ? 'not-allowed' : 'pointer',
          }}
        >
          {booking ? 'Booking...' : 'Confirm Interview'}
        </button>
      </div>
    </main>
  )
}
