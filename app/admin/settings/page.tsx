'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import styles from './page.module.css'

interface Settings {
  sectors: string[]
  tags: string[]
  featuredJobs: { id: string; title: string; company: string }[]
  featuredCount: number
  adminEmails: string[]
}

export default function AdminSettingsPage() {
  const token = useAdminToken()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // THIS PAGE DID NOT PRINT A CONFIDENT ZERO — IT CRASHED. The old code was
  // `.then(r => r.json()).then(setSettings)` with no status check, so a 403
  // put `{error:'Unauthorized'}` into `settings`. `settings?.sectors.length`
  // then reads `.length` of undefined — the optional chain guards the OBJECT,
  // not the field — and the whole page throws. Found by sweeping the estate
  // for the class of fault rather than for the six pages already named.
  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError('')
    try {
      const r = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load settings')
      setSettings(data)
    } catch (e: any) {
      setSettings(null)
      setLoadError(e.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className={styles.loading}>Loading settings...</div>
  }

  if (loadError) {
    return (
      <div>
        <h1 className={styles.pageTitle}>Platform Settings</h1>
        <div className={styles.card} role="alert">
          <h2 className={styles.cardTitle}>Couldn&rsquo;t load settings.</h2>
          <p className={styles.cardDesc}>
            {loadError} — these aren&rsquo;t empty settings, they weren&rsquo;t reached.
          </p>
          <button type="button" className={styles.retryBtn} onClick={load}>Try again</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Platform Settings</h1>

      {/* Admin Users */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Admin Users</h2>
        <p className={styles.cardDesc}>Users with admin dashboard access.</p>
        <div className={styles.adminList}>
          {(settings?.adminEmails || []).map(email => (
            <div key={email} className={styles.adminItem}>
              <span className={styles.adminEmail}>{email}</span>
              <span className={styles.adminBadge}>Admin</span>
            </div>
          ))}
        </div>
        <p className={styles.adminNote}>To add or remove admin users, update the ADMIN_EMAILS list in lib/admin-client.ts</p>
      </div>

      {/* THE PLATFORM ANNOUNCEMENT PANEL IS GONE, AND IT WAS WORSE THAN
          BROKEN — IT LIED. Removed 15 Aug 2026, dead end to end:

            · READ: the route did .from('platform_settings').select('key, value').
              That table is a SINGLE-ROW table with named columns (site_name,
              tagline, support_email, …). It has no key and no value, so
              PostgREST rejected the WHOLE request — the /insights fault — and
              the error was never checked, so the banner was always empty.
            · WRITE: the upsert had the same problem and its error was also
              never checked. The route then returned { success: true } and the
              page displayed "Announcement saved!".
            · READER: nothing user-facing rendered an announcement anywhere in
              the product. There was no banner to show.

          So an admin could type a maintenance notice, be told it saved, and it
          would reach nobody — the failure mode this project cares most about.
          Repairing it would have meant inventing storage AND a reader for a
          feature nothing asked for; removing the lie is the smaller, honest
          change. If a real announcement banner is wanted it is a fresh build:
          two columns and a component that reads them. */}

      {/* Sectors */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Sectors</h2>
        {/* `sectors?.length`, not `sectors.length` — the optional chain has to
            cover the FIELD, which is what crashed the page on a 403. And the
            plural agrees: this line has read "(1 sectors)" since it shipped. */}
        <p className={styles.cardDesc}>
          Current job sectors used across the platform ({settings?.sectors?.length ?? 0}{' '}
          {(settings?.sectors?.length ?? 0) === 1 ? 'sector' : 'sectors'}).
        </p>
        <div className={styles.tagList}>
          {settings?.sectors?.map(s => (
            <span key={s} className={styles.tag}>{s}</span>
          ))}
          {(!settings?.sectors || settings.sectors.length === 0) && (
            <span className={styles.emptyText}>No sectors found</span>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Job Tags</h2>
        <p className={styles.cardDesc}>
          Tags used in job postings ({settings?.tags?.length ?? 0} unique{' '}
          {(settings?.tags?.length ?? 0) === 1 ? 'tag' : 'tags'}).
        </p>
        <div className={styles.tagList}>
          {settings?.tags?.slice(0, 50).map(t => (
            <span key={t} className={styles.tagSmall}>{t}</span>
          ))}
          {(settings?.tags?.length ?? 0) > 50 && (
            <span className={styles.emptyText}>&hellip;and {(settings?.tags?.length ?? 0) - 50} more</span>
          )}
          {(!settings?.tags || settings.tags.length === 0) && (
            <span className={styles.emptyText}>No tags found</span>
          )}
        </div>
      </div>

      {/* Featured Jobs */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Featured Jobs</h2>
        <p className={styles.cardDesc}>Currently featured/urgent jobs ({settings?.featuredCount ?? 0} active).</p>
        {settings?.featuredJobs && settings.featuredJobs.length > 0 ? (
          <div className={styles.featuredList}>
            {settings.featuredJobs.map(j => (
              <div key={j.id} className={styles.featuredItem}>
                <span className={styles.featuredTitle}>{j.title}</span>
                <span className={styles.featuredCompany}>{j.company}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className={styles.emptyText}>No featured jobs</span>
        )}
      </div>

      {/* Email Templates */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Email Templates</h2>
        <p className={styles.cardDesc}>Configured email templates sent via Resend.</p>
        <div className={styles.templateList}>
          {[
            { name: 'Welcome Email', desc: 'Sent to new employers on signup' },
            { name: 'New Application', desc: 'Sent to employers when candidates apply' },
            { name: 'Application Status', desc: 'Sent to candidates on status changes' },
            { name: 'Interview Scheduled', desc: 'Sent to candidates when interview is booked' },
            { name: 'Trial Ending', desc: 'Sent 3 days before trial expiry' },
            { name: 'New Message', desc: 'Sent when a new message is received' },
            { name: 'Password Reset', desc: 'Sent via Supabase auth' },
            { name: 'Email Verification', desc: 'Sent via Supabase auth' },
          ].map(t => (
            <div key={t.name} className={styles.templateItem}>
              <span className={styles.templateName}>{t.name}</span>
              <span className={styles.templateDesc}>{t.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
