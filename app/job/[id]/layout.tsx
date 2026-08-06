import type { Metadata } from 'next'
import { getJobForMeta, formatSalaryShort } from '@/lib/jobMeta'
import { buildJobPostingLd } from '@/lib/jobPostingLd'

interface Props {
  params: { id: string }
}

// Per-job metadata so a shared /job/<id> link previews as the ROLE (title +
// branded image), reading as a candidate invite — not the generic root
// employer pitch the client page would otherwise inherit. The matching
// opengraph-image.tsx in this segment supplies the preview image; Next wires
// og:image / twitter:image to it automatically.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getJobForMeta(params.id)
  const url = `/job/${params.id}`

  if (!job) {
    return {
      title: 'Job',
      description: 'Browse hospitality roles and apply on Thrive.',
      alternates: { canonical: url },
    }
  }

  const title = `${job.title} at ${job.company}`
  const salary = formatSalaryShort(job)
  const bits = [job.company, job.location, salary].filter(Boolean).join(' · ')
  const description = `${job.title} — ${bits}. View the role and apply on Thrive.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: { canonical: url },
  }
}

/**
 * THE JOB PAGE'S STRUCTURED DATA, SERVER-RENDERED.
 *
 * The page itself is 'use client', so the client JobPostingSchema it used to
 * render arrived only after hydration — and Google's job crawler does not run
 * our JavaScript. A live job page served ZERO occurrences of "JobPosting"
 * before this. Google was crawling 246 URLs from the sitemap and finding a
 * title and an empty room.
 *
 * It goes here because this layout is ALREADY a server component and ALREADY
 * fetches the job for generateMetadata — so the schema reaches the served HTML
 * without page.tsx being touched. The layout renders {children} and nothing
 * else, so a sibling script cannot affect the client page's data flow.
 *
 * Two fetches of the same row per request would be wasteful; getJobForMeta is
 * cached for 300s by its own fetch, so generateMetadata and this share one.
 */
export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const job = await getJobForMeta(params.id)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'

  return (
    <>
      {job && (
        <script
          type="application/ld+json"
          // The object is built server-side and stringified here; there is no
          // user-supplied HTML in it, and < is escaped so a description
          // containing markup cannot close the script tag early.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildJobPostingLd(job, params.id, siteUrl)).replace(/</g, '\u003c'),
          }}
        />
      )}
      {children}
    </>
  )
}
