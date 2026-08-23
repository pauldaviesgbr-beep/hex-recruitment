'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Candidate } from '@/lib/mockCandidates'
import { Job } from '@/lib/mockJobs'
import { Boost } from '@/lib/boostTypes'
// The dashboard reaches this through a Proxy called JOB_SECTOR_LABELS that
// forwards every key to getCategoryLabel. Calling the function directly is the
// same answer without carrying the indirection to a second file.
import { getCategoryLabel } from '@/lib/categories'
import { Ico, type IconName } from '@/components/icons'

// THE THREE "HOW AM I DOING" PANELS, LIFTED OFF THE DASHBOARD.
//
// Career Insights, Activity and Profile Views were three of the nine panels on
// the candidate dashboard. They answer one question, none is big enough to be a
// page on its own, and none of them is ever the reason somebody opens the
// dashboard. They now live at /insights, behind one link in the Also row.
//
// MOVED, NOT REWRITTEN. The JSX is what was on the dashboard and the
// derivations are the same memos with the same inputs, so this renders what it
// always did — in a place where it is not competing with the answer line. The
// one deliberate change is that the three sit in a single column here, because
// the dashboard's two-column grid is not what they are in any more.
//
// STYLES ARE THE DASHBOARD'S, PASSED IN rather than copied. Two stylesheets for
// one set of cards is how two cards that used to match stop matching — the same
// argument as nothingLiveSentence having one root string.

export interface CandidateInsightsProps {
  candidate: Candidate | null
  jobs: Job[]
  profileViewEvents: any[]
  statusChangeEvents: any[]
  activeBoost: Boost | null
  profileViews7d: number
  profileViews30d: number
  /** The dashboard's CSS module, so both pages render identically. */
  styles: Record<string, string>
  /** Owned by the caller so the two pages cannot label a status differently. */
  statusLabels: Record<string, string>
  formatRelativeTime: (iso: string) => string
}

export default function CandidateInsights({
  candidate, jobs, profileViewEvents, statusChangeEvents, activeBoost,
  profileViews7d, profileViews30d, styles, statusLabels, formatRelativeTime,
}: CandidateInsightsProps) {
  const STATUS_LABELS = statusLabels

  // Profile view trend
  const viewTrend = useMemo(() => {
    const weeklyRate = profileViews7d
    const prevWeeklyRate = Math.max(0, profileViews30d - profileViews7d) / 3
    if (weeklyRate > prevWeeklyRate) return 'up'
    if (weeklyRate < prevWeeklyRate) return 'down'
    return 'neutral'
  }, [profileViews7d, profileViews30d])

  // ── Career insights (derived from already-loaded jobs) ──

  const sectorJobs = useMemo(() => {
    if (!candidate?.jobSector || jobs.length === 0) return []
    const sector = candidate.jobSector.toLowerCase()
    return jobs.filter(job => {
      const cat = (job.category || '').toLowerCase()
      return cat === sector || cat.includes(sector) || sector.includes(cat)
    })
  }, [candidate, jobs])

  const salaryInsights = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const candPeriod = candidate?.salaryPeriod || 'year'
    const yearlyJobs = sectorJobs.filter(j => j.salaryPeriod === 'year')
    const hourlyJobs = sectorJobs.filter(j => j.salaryPeriod === 'hour')
    const targetJobs = candPeriod === 'hour'
      ? (hourlyJobs.length > 0 ? hourlyJobs : yearlyJobs)
      : (yearlyJobs.length > 0 ? yearlyJobs : hourlyJobs)
    if (targetJobs.length === 0) return null
    const period = targetJobs[0].salaryPeriod
    const avgMin = Math.round(targetJobs.reduce((s, j) => s + j.salaryMin, 0) / targetJobs.length)
    const avgMax = Math.round(targetJobs.reduce((s, j) => s + j.salaryMax, 0) / targetJobs.length)
    const candMin = candidate?.salaryMin ? Number(candidate.salaryMin) : null
    const candMax = candidate?.salaryMax ? Number(candidate.salaryMax) : null
    return { avgMin, avgMax, period, candMin, candMax, jobCount: targetJobs.length }
  }, [sectorJobs, candidate])

  const demandTrend = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const now = Date.now()
    const d30 = now - 30 * 86400000
    const d60 = now - 60 * 86400000
    let last30 = 0
    let prev30 = 0
    sectorJobs.forEach(job => {
      const posted = new Date(job.postedDate || job.postedAt).getTime()
      if (isNaN(posted)) return
      if (posted >= d30) last30++
      else if (posted >= d60) prev30++
    })
    const pctChange = prev30 === 0
      ? (last30 > 0 ? 100 : 0)
      : Math.round(((last30 - prev30) / prev30) * 100)
    return { last30, prev30, pctChange }
  }, [sectorJobs])

  const topSkillsInDemand = useMemo(() => {
    if (sectorJobs.length === 0) return []
    const skillFreq: Record<string, number> = {}
    sectorJobs.forEach(job => {
      (job.skillsRequired || []).forEach((skill: string) => {
        const normalized = skill.trim()
        if (normalized) skillFreq[normalized] = (skillFreq[normalized] || 0) + 1
      })
    })
    const sorted = Object.entries(skillFreq).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const candidateSkillsLower = (candidate?.skills || []).map(s => s.toLowerCase().trim())
    return sorted.map(([skill, count]) => ({
      skill,
      count,
      matched: candidateSkillsLower.some(cs => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs)),
    }))
  }, [sectorJobs, candidate])

  const competitionLevel = useMemo(() => {
    if (sectorJobs.length === 0) return null
    const totalApps = sectorJobs.reduce((s, j) => s + (j.applicationCount || 0), 0)
    const avg = totalApps / sectorJobs.length
    let level: 'Low' | 'Medium' | 'High'
    let color: string
    if (avg < 5) { level = 'Low'; color = '#22c55e' }
    else if (avg <= 15) { level = 'Medium'; color = '#f59e0b' }
    else { level = 'High'; color = '#ef4444' }
    return { level, color, avgAppsPerJob: Math.round(avg), totalJobs: sectorJobs.length }
  }, [sectorJobs])

  const activityFeed = useMemo(() => {
    const events: Array<{ id: string; type: string; icon: IconName; title: string; subtitle: string; timestamp: string }> = []

    profileViewEvents.forEach(pv => {
      events.push({
        id: `pv-${pv.id}`, type: 'profile_view', icon: 'eye',
        title: pv.company_name ? `${pv.company_name} viewed your profile` : 'An employer viewed your profile',
        subtitle: pv.source ? `via ${pv.source}` : '',
        timestamp: pv.viewed_at,
      })
    })

    statusChangeEvents.forEach(app => {
      events.push({
        id: `sc-${app.id}`, type: 'status_change', icon: 'file-text',
        title: `${app.company || 'Employer'} updated your application`,
        subtitle: `${app.job_title || 'Position'} \u2014 now ${STATUS_LABELS[app.status] || app.status}`,
        timestamp: app.updated_at,
      })
    })

    const d7ago = Date.now() - 7 * 86400000
    sectorJobs
      .filter(j => new Date(j.postedDate || j.postedAt).getTime() >= d7ago)
      .slice(0, 3)
      .forEach(job => {
        events.push({
          id: `jm-${job.id}`, type: 'job_match', icon: 'sparkles',
          title: `New match: ${job.title}`,
          subtitle: `${job.company} \u00B7 ${job.location}`,
          timestamp: new Date(job.postedDate || job.postedAt).toISOString(),
        })
      })

    if (activeBoost) {
      const boostStart = new Date(activeBoost.starts_at).getTime()
      const boostedViews = profileViewEvents.filter(pv => new Date(pv.viewed_at).getTime() >= boostStart)
      if (boostedViews.length > 0) {
        events.push({
          id: 'boost-summary', type: 'boost_view', icon: 'zap',
          title: `Boost attracted ${boostedViews.length} profile view${boostedViews.length !== 1 ? 's' : ''}`,
          subtitle: `Since ${new Date(activeBoost.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
          timestamp: activeBoost.starts_at,
        })
      }
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return events.slice(0, 8)
  }, [profileViewEvents, statusChangeEvents, sectorJobs, activeBoost, STATUS_LABELS])

  return (
    <>
            {/* ── 5. PROFILE VIEWS ────────────────────────── */}
            <div className={`${styles.card} ${styles.aGreen} ${styles.mViews}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Profile Views</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.statRow}>
                  <div className={styles.stat}>
                    <span className={styles.statNumber}>{profileViews7d}</span>
                    <span className={styles.statLabel}>Last 7 days</span>
                    {viewTrend === 'up' && <span className={styles.trendUp}>&#9650; Trending up</span>}
                    {viewTrend === 'down' && <span className={styles.trendDown}>&#9660; Trending down</span>}
                    {viewTrend === 'neutral' && <span className={styles.trendNeutral}>&#8212; Steady</span>}
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNumber}>{profileViews30d}</span>
                    <span className={styles.statLabel}>Last 30 days</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${styles.card} ${styles.aCyan} ${styles.mInsights}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Career Insights</h2>
                {candidate?.jobSector && (
                  <span className={styles.insightsSectorBadge}>
                    {getCategoryLabel(candidate.jobSector) || candidate.jobSector}
                  </span>
                )}
              </div>
              <div className={styles.cardBody}>
                {!candidate?.jobSector ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}><Ico name="bar-chart-3" size={24} /></div>
                    <p>Set your job sector to see career insights tailored to your industry.</p>
                    <Link href="/profile" className={styles.cardLink}>Complete Profile &rarr;</Link>
                  </div>
                ) : (
                  <>
                    {/* Salary Range Bar */}
                    {salaryInsights && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>
                          Average Salary Range
                          <span className={styles.insightMeta}>
                            Based on {salaryInsights.jobCount} job{salaryInsights.jobCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className={styles.salaryBar}>
                          <div className={styles.salaryBarTrack}>
                            {salaryInsights.candMin != null && salaryInsights.avgMax > salaryInsights.avgMin && (
                              <div
                                className={styles.salaryBarMarker}
                                style={{
                                  left: `${Math.max(0, Math.min(100,
                                    ((salaryInsights.candMin - salaryInsights.avgMin) /
                                    (salaryInsights.avgMax - salaryInsights.avgMin)) * 100
                                  ))}%`,
                                }}
                              />
                            )}
                          </div>
                          <div className={styles.salaryBarLabels}>
                            <span>
                              {salaryInsights.period === 'hour'
                                ? `\u00A3${salaryInsights.avgMin}/hr`
                                : `\u00A3${Math.round(salaryInsights.avgMin / 1000)}k`}
                            </span>
                            <span>
                              {salaryInsights.period === 'hour'
                                ? `\u00A3${salaryInsights.avgMax}/hr`
                                : `\u00A3${Math.round(salaryInsights.avgMax / 1000)}k`}
                            </span>
                          </div>
                        </div>
                        {salaryInsights.candMin != null && (
                          <p className={styles.salaryYouLabel}>
                            &#9650; Your range: {salaryInsights.period === 'hour'
                              ? `\u00A3${salaryInsights.candMin}-\u00A3${salaryInsights.candMax}/hr`
                              : `\u00A3${Math.round(salaryInsights.candMin / 1000)}k-\u00A3${Math.round((salaryInsights.candMax || salaryInsights.candMin) / 1000)}k`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Demand Trend */}
                    {demandTrend && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Sector Demand</div>
                        <div className={styles.demandRow}>
                          <span className={styles.demandCount}>{demandTrend.last30}</span>
                          <span className={styles.demandText}>jobs posted in last 30 days</span>
                          <span className={
                            demandTrend.pctChange > 0 ? styles.trendUp
                            : demandTrend.pctChange < 0 ? styles.trendDown
                            : styles.trendNeutral
                          }>
                            {demandTrend.pctChange > 0 ? '\u25B2' : demandTrend.pctChange < 0 ? '\u25BC' : '\u2014'}
                            {' '}{Math.abs(demandTrend.pctChange)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Top Skills in Demand */}
                    {topSkillsInDemand.length > 0 && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Top Skills in Demand</div>
                        <div className={styles.skillPills}>
                          {topSkillsInDemand.map(({ skill, count, matched }) => (
                            <span
                              key={skill}
                              className={`${styles.skillPill} ${matched ? styles.skillPillGold : styles.skillPillGrey}`}
                            >
                              {skill}
                              <span className={styles.skillPillCount}>{count}</span>
                              {!matched && (
                                <Link href="/profile" className={styles.skillPillAdd} onClick={(e) => e.stopPropagation()}>
                                  +Add
                                </Link>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Competition Level */}
                    {competitionLevel && (
                      <div className={styles.insightBlock}>
                        <div className={styles.insightLabel}>Competition Level</div>
                        <div className={styles.competitionRow}>
                          <span
                            className={styles.competitionBadge}
                            style={{ background: competitionLevel.color + '18', color: competitionLevel.color }}
                          >
                            {competitionLevel.level}
                          </span>
                          <span className={styles.competitionMeta}>
                            ~{competitionLevel.avgAppsPerJob} applicants per job across {competitionLevel.totalJobs} listings
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Fallback if no data */}
                    {!salaryInsights && !demandTrend && topSkillsInDemand.length === 0 && !competitionLevel && (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}><Ico name="bar-chart-3" size={24} /></div>
                        <p>Not enough job data in your sector yet. Check back soon!</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── 6. ACTIVITY FEED ───────────────────────── */}
            <div className={`${styles.card} ${styles.aEmerald} ${styles.mActivity}`}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Activity</h2>
              </div>
              <div className={styles.cardBody}>
                {activityFeed.length > 0 ? (
                  <div className={styles.timeline}>
                    {activityFeed.map((event, idx) => (
                      <div key={event.id} className={styles.timelineItem}>
                        {idx < activityFeed.length - 1 && <div className={styles.timelineLine} />}
                        <div className={styles.timelineDot}>
                          <span className={styles.timelineIcon}><Ico name={event.icon} size={16} /></span>
                        </div>
                        <div className={styles.timelineContent}>
                          <p className={styles.timelineTitle}>{event.title}</p>
                          {event.subtitle && <p className={styles.timelineSubtitle}>{event.subtitle}</p>}
                          <span className={styles.timelineTime}>{formatRelativeTime(event.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}><Ico name="clock" size={24} /></div>
                    <p>No recent activity. Apply to jobs to see updates here!</p>
                    <Link href="/jobs" className={styles.cardLink}>Browse Jobs &rarr;</Link>
                  </div>
                )}
              </div>
            </div>
    </>
  )
}
