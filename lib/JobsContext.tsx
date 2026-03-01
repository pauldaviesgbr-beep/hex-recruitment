'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Job } from './mockJobs'
import { supabase } from './supabase'
import { supabaseJobToJob, jobToSupabaseInsert } from './types'

interface JobsContextType {
  jobs: Job[]
  loading: boolean
  addJob: (job: any, employerId: string) => Promise<Job | null>
  updateJob: (jobId: string, updates: Partial<Job>) => Promise<void>
  getJobById: (jobId: string) => Job | undefined
  refreshJobs: () => Promise<void>
}

const JobsContext = createContext<JobsContextType | undefined>(undefined)

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('posted_at', { ascending: false })

      if (error) {
        console.error('Error fetching jobs:', error.message)
        setJobs([])
      } else {
        setJobs((data || []).map(supabaseJobToJob))
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
      setJobs([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const addJob = async (jobData: any, employerId: string): Promise<Job | null> => {
    try {
      const payload = jobToSupabaseInsert(jobData, employerId)
      const { data, error } = await supabase
        .from('jobs')
        .insert(payload)
        .select()
        .single()

      if (error) {
        console.error('Error adding job:', error.message)
        return null
      }

      const newJob = supabaseJobToJob(data)
      setJobs(prev => [newJob, ...prev])
      return newJob
    } catch (err) {
      console.error('Failed to add job:', err)
      return null
    }
  }

  const updateJob = async (jobId: string, updates: Partial<Job>) => {
    try {
      // Map camelCase updates to snake_case for Supabase
      const supabaseUpdates: any = {}
      if (updates.status !== undefined) supabaseUpdates.status = updates.status
      if (updates.title !== undefined) supabaseUpdates.title = updates.title
      if (updates.company !== undefined) supabaseUpdates.company = updates.company
      if (updates.companyLogo !== undefined) supabaseUpdates.company_logo_url = updates.companyLogo
      if (updates.companyBanner !== undefined) supabaseUpdates.company_banner_url = updates.companyBanner
      if (updates.companyDescription !== undefined) supabaseUpdates.company_description = updates.companyDescription
      if (updates.description !== undefined) supabaseUpdates.description = updates.description
      if (updates.fullDescription !== undefined) supabaseUpdates.full_description = updates.fullDescription
      if (updates.jobReference !== undefined) supabaseUpdates.job_reference = updates.jobReference
      if (updates.responsibilities !== undefined) supabaseUpdates.responsibilities = updates.responsibilities
      if (updates.requirements !== undefined) supabaseUpdates.requirements = updates.requirements
      if (updates.benefits !== undefined) supabaseUpdates.benefits = updates.benefits
      if (updates.skillsRequired !== undefined) supabaseUpdates.skills_required = updates.skillsRequired
      if (updates.experienceRequired !== undefined) supabaseUpdates.experience_required = updates.experienceRequired
      if (updates.educationRequired !== undefined) supabaseUpdates.education_required = updates.educationRequired
      if (updates.workAuthorization !== undefined) supabaseUpdates.work_authorization = updates.workAuthorization
      if (updates.location !== undefined) supabaseUpdates.location = updates.location
      if (updates.area !== undefined) supabaseUpdates.area = updates.area
      if (updates.fullLocation !== undefined) supabaseUpdates.full_location = updates.fullLocation
      if (updates.salaryMin !== undefined) supabaseUpdates.salary_min = updates.salaryMin
      if (updates.salaryMax !== undefined) supabaseUpdates.salary_max = updates.salaryMax
      if (updates.salaryPeriod !== undefined) supabaseUpdates.salary_type = updates.salaryPeriod === 'year' ? 'annual' : 'hourly'
      if (updates.employmentType !== undefined) supabaseUpdates.employment_type = updates.employmentType
      if (updates.workLocationType !== undefined) supabaseUpdates.work_location = updates.workLocationType
      if (updates.shiftSchedule !== undefined) supabaseUpdates.shift_schedule = updates.shiftSchedule
      if (updates.category !== undefined) supabaseUpdates.category = updates.category
      if (updates.tags !== undefined) supabaseUpdates.tags = updates.tags
      if (updates.urgent !== undefined) supabaseUpdates.urgent = updates.urgent
      if (updates.noExperience !== undefined) supabaseUpdates.no_experience = updates.noExperience
      if (updates.expiresDate !== undefined) supabaseUpdates.expires_at = updates.expiresDate
      supabaseUpdates.updated_at = new Date().toISOString()

      const { error } = await supabase
        .from('jobs')
        .update(supabaseUpdates)
        .eq('id', jobId)

      if (error) {
        console.error('Error updating job:', error.message)
        throw new Error(error.message)
      }

      // Update local state
      setJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, ...updates } : job
      ))
    } catch (err) {
      console.error('Failed to update job:', err)
      throw err
    }
  }

  const getJobById = (jobId: string): Job | undefined => {
    return jobs.find(job => job.id === jobId)
  }

  const refreshJobs = fetchJobs

  return (
    <JobsContext.Provider value={{ jobs, loading, addJob, updateJob, getJobById, refreshJobs }}>
      {children}
    </JobsContext.Provider>
  )
}

export function useJobs() {
  const context = useContext(JobsContext)
  if (context === undefined) {
    throw new Error('useJobs must be used within a JobsProvider')
  }
  return context
}
