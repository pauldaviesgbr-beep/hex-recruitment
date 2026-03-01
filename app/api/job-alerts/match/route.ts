import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseJobToJob } from '@/lib/types'
import { jobMatchesAlert, supabaseRowToJobAlert } from '@/lib/jobAlerts'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Fetch the newly posted job
    const { data: jobRow, error: jobError } = await adminSupabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !jobRow) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const job = supabaseJobToJob(jobRow)

    // 2. Fetch all active instant alerts
    const { data: alertRows, error: alertError } = await adminSupabase
      .from('job_alerts')
      .select('*')
      .eq('is_active', true)
      .eq('frequency', 'instant')

    if (alertError) {
      console.error('Error fetching alerts:', alertError)
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
    }

    if (!alertRows || alertRows.length === 0) {
      return NextResponse.json({ matched: 0 })
    }

    const alerts = alertRows.map(supabaseRowToJobAlert)

    // 3. Find matching alerts
    const matchingAlerts = alerts.filter(alert => jobMatchesAlert(job, alert))

    if (matchingAlerts.length === 0) {
      return NextResponse.json({ matched: 0 })
    }

    // 4. Create notifications — deduplicate by candidate_id
    const notifiedCandidates = new Set<string>()
    const notifications: any[] = []

    for (const alert of matchingAlerts) {
      if (notifiedCandidates.has(alert.candidate_id)) continue
      notifiedCandidates.add(alert.candidate_id)

      notifications.push({
        user_id: alert.candidate_id,
        type: 'job_match',
        title: 'New job matches your alert',
        message: `"${job.title}" at ${job.company} in ${job.location} matches your "${alert.alert_name}" alert.`,
        link: `/jobs?id=${job.id}`,
        related_id: job.id,
        related_type: 'job',
        read: false,
      })
    }

    if (notifications.length > 0) {
      const { error: notifError } = await adminSupabase
        .from('notifications')
        .insert(notifications)

      if (notifError) {
        console.error('Error creating alert notifications:', notifError)
      }
    }

    return NextResponse.json({
      matched: notifications.length,
      alertsChecked: alerts.length,
    })
  } catch (error) {
    console.error('Job alert matching error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
