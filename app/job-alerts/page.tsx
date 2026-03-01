'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { categories, getCategoryLabel } from '@/lib/categories'
import { ukCities } from '@/lib/ukCities'
import { ALL_TAGS, TAG_CATEGORIES, getTagsByCategory, type TagCategory } from '@/lib/jobTags'
import { type JobAlert, supabaseRowToJobAlert } from '@/lib/jobAlerts'
import styles from './page.module.css'

const employmentTypes = ['Full-time', 'Part-time', 'Flexible']
const contractTypes = ['Permanent', 'Temporary', 'Fixed-term']

const emptyForm = {
  alert_name: '',
  sectors: new Set<string>(),
  locations: new Set<string>(),
  min_salary: '',
  max_salary: '',
  job_types: new Set<string>(),
  tags: new Set<string>(),
  frequency: 'instant' as 'instant' | 'daily' | 'weekly',
}

export default function JobAlertsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<JobAlert[]>([])
  const [error, setError] = useState('')

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingAlert, setEditingAlert] = useState<JobAlert | null>(null)
  const [formData, setFormData] = useState({ ...emptyForm, sectors: new Set<string>(), locations: new Set<string>(), job_types: new Set<string>(), tags: new Set<string>() })
  const [locationSearch, setLocationSearch] = useState('')
  const [showLocationDropdown, setShowLocationDropdown] = useState(false)
  const [saving, setSaving] = useState(false)

  const locationRef = useRef<HTMLDivElement>(null)

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      if (DEV_MODE) {
        const mockUser = getMockUser()
        if (mockUser?.user_metadata?.role === 'employee') {
          setUser(mockUser)
        } else {
          router.push('/login/employee')
        }
        setLoading(false)
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.user_metadata?.role !== 'employee') {
        router.push('/login/employee')
        return
      }
      setUser(session.user)
      setLoading(false)
    }
    checkAuth()
  }, [router])

  // Fetch alerts
  useEffect(() => {
    if (!user) return
    const fetchAlerts = async () => {
      const { data, error: fetchError } = await supabase
        .from('job_alerts')
        .select('*')
        .eq('candidate_id', user.id)
        .order('created_at', { ascending: false })

      if (!fetchError && data) {
        setAlerts(data.map(supabaseRowToJobAlert))
      }
    }
    fetchAlerts()
  }, [user])

  // Close location dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setShowLocationDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Location search filter
  const filteredCities = locationSearch.length >= 2
    ? ukCities.filter(city =>
        city.toLowerCase().includes(locationSearch.toLowerCase()) &&
        !formData.locations.has(city)
      ).slice(0, 15)
    : []

  // Toggle a value in a Set within formData
  const toggleSetValue = (field: 'sectors' | 'locations' | 'job_types' | 'tags', value: string) => {
    setFormData(prev => {
      const newSet = new Set(prev[field])
      if (newSet.has(value)) {
        newSet.delete(value)
      } else {
        newSet.add(value)
      }
      return { ...prev, [field]: newSet }
    })
  }

  const addLocation = (city: string) => {
    setFormData(prev => {
      const newSet = new Set(prev.locations)
      newSet.add(city)
      return { ...prev, locations: newSet }
    })
    setLocationSearch('')
    setShowLocationDropdown(false)
  }

  const removeLocation = (city: string) => {
    setFormData(prev => {
      const newSet = new Set(prev.locations)
      newSet.delete(city)
      return { ...prev, locations: newSet }
    })
  }

  const resetForm = () => {
    setFormData({
      alert_name: '',
      sectors: new Set<string>(),
      locations: new Set<string>(),
      min_salary: '',
      max_salary: '',
      job_types: new Set<string>(),
      tags: new Set<string>(),
      frequency: 'instant',
    })
    setEditingAlert(null)
    setShowForm(false)
    setError('')
  }

  const handleEdit = (alert: JobAlert) => {
    setFormData({
      alert_name: alert.alert_name,
      sectors: new Set(alert.sectors),
      locations: new Set(alert.locations),
      min_salary: alert.min_salary ? String(alert.min_salary) : '',
      max_salary: alert.max_salary ? String(alert.max_salary) : '',
      job_types: new Set(alert.job_types),
      tags: new Set(alert.tags),
      frequency: alert.frequency,
    })
    setEditingAlert(alert)
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCreateOrUpdate = async () => {
    if (!formData.alert_name.trim()) {
      setError('Please enter an alert name')
      return
    }
    if (!user) return

    setSaving(true)
    setError('')

    const payload = {
      candidate_id: user.id,
      alert_name: formData.alert_name.trim(),
      sectors: Array.from(formData.sectors),
      locations: Array.from(formData.locations),
      min_salary: formData.min_salary ? parseInt(formData.min_salary) : null,
      max_salary: formData.max_salary ? parseInt(formData.max_salary) : null,
      job_types: Array.from(formData.job_types),
      tags: Array.from(formData.tags),
      frequency: formData.frequency,
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editingAlert) {
        const { data, error: updateError } = await supabase
          .from('job_alerts')
          .update(payload)
          .eq('id', editingAlert.id)
          .select()
          .single()

        if (updateError) throw updateError
        if (data) {
          setAlerts(prev => prev.map(a => a.id === editingAlert.id ? supabaseRowToJobAlert(data) : a))
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('job_alerts')
          .insert(payload)
          .select()
          .single()

        if (insertError) throw insertError
        if (data) {
          setAlerts(prev => [supabaseRowToJobAlert(data), ...prev])
        }
      }
      resetForm()
    } catch (err: any) {
      setError(err.message || 'Failed to save alert')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (alertId: string) => {
    const { error: deleteError } = await supabase
      .from('job_alerts')
      .delete()
      .eq('id', alertId)

    if (!deleteError) {
      setAlerts(prev => prev.filter(a => a.id !== alertId))
    }
  }

  const handleToggleActive = async (alertId: string, currentState: boolean) => {
    const { data, error: toggleError } = await supabase
      .from('job_alerts')
      .update({ is_active: !currentState, updated_at: new Date().toISOString() })
      .eq('id', alertId)
      .select()
      .single()

    if (!toggleError && data) {
      setAlerts(prev => prev.map(a => a.id === alertId ? supabaseRowToJobAlert(data) : a))
    }
  }

  // Build criteria summary for an alert card
  const getCriteriaSummary = (alert: JobAlert): string[] => {
    const chips: string[] = []
    alert.sectors.forEach(s => chips.push(getCategoryLabel(s)))
    alert.locations.forEach(l => chips.push(l))
    if (alert.min_salary || alert.max_salary) {
      const min = alert.min_salary ? `${(alert.min_salary / 1000).toFixed(0)}k` : '0'
      const max = alert.max_salary ? `${(alert.max_salary / 1000).toFixed(0)}k` : '+'
      chips.push(`${min}-${max}`)
    }
    alert.job_types.forEach(t => chips.push(t))
    alert.tags.forEach(t => chips.push(t))
    return chips
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loading}>Loading...</div>
      </main>
    )
  }

  const activeCount = alerts.filter(a => a.is_active).length

  return (
    <main className={styles.page}>
      <Header />

      {/* Page Header */}
      <section className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <h1 className={styles.pageTitle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Job Alerts
            {alerts.length > 0 && (
              <span className={styles.alertCount}>{activeCount}</span>
            )}
          </h1>
        </div>
      </section>

      <div className={styles.container}>
        {/* Error */}
        {error && <div className={styles.error}>{error}</div>}

        {/* Top Bar */}
        {(alerts.length > 0 || showForm) && !showForm && (
          <div className={styles.topBar}>
            <span className={styles.topBarTitle}>
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''} configured
            </span>
            <button className={styles.createBtn} onClick={() => setShowForm(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Alert
            </button>
          </div>
        )}

        {/* Create/Edit Form */}
        {showForm && (
          <div className={styles.formCard}>
            <h2 className={styles.formTitle}>
              {editingAlert ? 'Edit Alert' : 'Create New Alert'}
            </h2>

            {/* Alert Name */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Alert Name<span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. Chef roles in London"
                value={formData.alert_name}
                onChange={e => setFormData(prev => ({ ...prev, alert_name: e.target.value }))}
              />
            </div>

            {/* Sectors */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Sectors</label>
              <div className={styles.checkboxGroup}>
                {categories.map(cat => (
                  <label key={cat.id} className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkboxInput}
                      checked={formData.sectors.has(cat.id)}
                      onChange={() => toggleSetValue('sectors', cat.id)}
                    />
                    <span className={styles.checkboxBox} />
                    <span className={styles.checkboxText}>{cat.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Locations</label>
              {formData.locations.size > 0 && (
                <div className={styles.locationChips}>
                  {Array.from(formData.locations).map(loc => (
                    <span key={loc} className={styles.locationChip}>
                      {loc}
                      <button
                        type="button"
                        className={styles.locationChipRemove}
                        onClick={() => removeLocation(loc)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className={styles.locationSearch} ref={locationRef}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Search UK cities..."
                  value={locationSearch}
                  onChange={e => {
                    setLocationSearch(e.target.value)
                    setShowLocationDropdown(e.target.value.length >= 2)
                  }}
                  onFocus={() => {
                    if (locationSearch.length >= 2) setShowLocationDropdown(true)
                  }}
                />
                {showLocationDropdown && filteredCities.length > 0 && (
                  <div className={styles.locationDropdown}>
                    {filteredCities.map(city => (
                      <div
                        key={city}
                        className={styles.locationOption}
                        onClick={() => addLocation(city)}
                      >
                        {city}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Salary Range */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Salary Range (annual)</label>
              <div className={styles.salaryRow}>
                <input
                  type="number"
                  className={styles.input}
                  placeholder="Min e.g. 20000"
                  value={formData.min_salary}
                  onChange={e => setFormData(prev => ({ ...prev, min_salary: e.target.value }))}
                />
                <span className={styles.salaryDash}>—</span>
                <input
                  type="number"
                  className={styles.input}
                  placeholder="Max e.g. 40000"
                  value={formData.max_salary}
                  onChange={e => setFormData(prev => ({ ...prev, max_salary: e.target.value }))}
                />
              </div>
            </div>

            {/* Job Types */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Job Types</label>
              <div className={styles.checkboxGroup}>
                {[...employmentTypes, ...contractTypes].map(type => (
                  <label key={type} className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkboxInput}
                      checked={formData.job_types.has(type)}
                      onChange={() => toggleSetValue('job_types', type)}
                    />
                    <span className={styles.checkboxBox} />
                    <span className={styles.checkboxText}>{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Tags</label>
              {(Object.keys(TAG_CATEGORIES) as TagCategory[]).map(catKey => {
                const allGrouped = getTagsByCategory()
                const catTags = allGrouped[catKey] || []
                return (
                  <div key={catKey} className={styles.tagCategoryGroup}>
                    <div className={styles.tagCategoryTitle}>
                      {TAG_CATEGORIES[catKey].icon} {TAG_CATEGORIES[catKey].title}
                    </div>
                    <div className={styles.checkboxGroup}>
                      {catTags.map(tag => (
                        <label key={tag.label} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            className={styles.checkboxInput}
                            checked={formData.tags.has(tag.label)}
                            onChange={() => toggleSetValue('tags', tag.label)}
                          />
                          <span className={styles.checkboxBox} />
                          <span className={styles.checkboxText}>{tag.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Frequency */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Alert Frequency</label>
              <select
                className={styles.select}
                value={formData.frequency}
                onChange={e => setFormData(prev => ({ ...prev, frequency: e.target.value as any }))}
              >
                <option value="instant">Instant — notify me immediately</option>
                <option value="daily">Daily — once per day digest</option>
                <option value="weekly">Weekly — once per week digest</option>
              </select>
            </div>

            {/* Actions */}
            <div className={styles.formActions}>
              <button
                className={styles.saveBtn}
                onClick={handleCreateOrUpdate}
                disabled={saving}
              >
                {saving ? 'Saving...' : editingAlert ? 'Update Alert' : 'Create Alert'}
              </button>
              <button className={styles.cancelBtn} onClick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Alerts List */}
        {alerts.length > 0 && (
          <div className={styles.alertsList}>
            {alerts.map(alert => {
              const chips = getCriteriaSummary(alert)
              return (
                <div
                  key={alert.id}
                  className={`${styles.alertCard} ${!alert.is_active ? styles.alertCardPaused : ''}`}
                >
                  <div className={styles.alertCardHeader}>
                    <span className={styles.alertName}>{alert.alert_name}</span>
                    <div className={styles.alertActions}>
                      {/* Toggle */}
                      <label className={styles.toggleWrapper} title={alert.is_active ? 'Pause alert' : 'Resume alert'}>
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={alert.is_active}
                          onChange={() => handleToggleActive(alert.id, alert.is_active)}
                        />
                        <span className={styles.toggleSlider} />
                      </label>
                      {/* Edit */}
                      <button
                        className={styles.actionBtn}
                        onClick={() => handleEdit(alert)}
                        title="Edit alert"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                        onClick={() => handleDelete(alert.id)}
                        title="Delete alert"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className={styles.criteriaTags}>
                    <span className={`${styles.criteriaTag} ${styles.frequencyBadge}`}>
                      {alert.frequency === 'instant' ? 'Instant' : alert.frequency === 'daily' ? 'Daily' : 'Weekly'}
                    </span>
                    {!alert.is_active && (
                      <span className={`${styles.criteriaTag} ${styles.pausedBadge}`}>Paused</span>
                    )}
                    {chips.map((chip, i) => (
                      <span key={i} className={styles.criteriaTag}>{chip}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Empty State */}
        {!showForm && alerts.length === 0 && !loading && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>No job alerts yet</h2>
            <p className={styles.emptyText}>
              Create alerts to get notified when new jobs matching your criteria are posted.
              Choose your preferred sectors, locations, salary range, and more.
            </p>
            <button className={styles.emptyBtn} onClick={() => setShowForm(true)}>
              Create Your First Alert
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
