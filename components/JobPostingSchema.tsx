'use client'

import { Job } from '@/lib/mockJobs'

function mapEmploymentType(types: string[]): string[] {
  const map: Record<string, string> = {
    'Full-time': 'FULL_TIME',
    'Part-time': 'PART_TIME',
    'Contract': 'CONTRACTOR',
    'Temporary': 'TEMPORARY',
    'Flexible': 'OTHER',
    'Permanent': 'FULL_TIME',
  }
  return types.map(t => map[t] || 'OTHER')
}

export default function JobPostingSchema({ job }: { job: Job }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hexrecruitment.co.uk'

  const salaryUnit = job.salaryPeriod === 'hour' ? 'HOUR' : 'YEAR'

  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.fullDescription || job.description,
    datePosted: job.postedDate,
    ...(job.expiresDate && { validThrough: job.expiresDate }),
    employmentType: mapEmploymentType(job.employmentType),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      ...(job.companyLogo && { logo: job.companyLogo }),
      ...(job.companyWebsite && { sameAs: job.companyWebsite }),
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.fullLocation?.city || job.location,
        ...(job.area && { addressRegion: job.area }),
        addressCountry: 'GB',
        ...(job.fullLocation?.postcode && { postalCode: job.fullLocation.postcode }),
        ...(job.fullLocation?.addressLine1 && { streetAddress: job.fullLocation.addressLine1 }),
      },
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'GBP',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        unitText: salaryUnit,
      },
    },
    jobLocationType: job.workLocationType === 'Remote' ? 'TELECOMMUTE' : undefined,
    url: `${siteUrl}/jobs?id=${job.id}`,
    identifier: {
      '@type': 'PropertyValue',
      name: 'Hex',
      value: job.jobReference || job.id,
    },
    ...(job.skillsRequired?.length && {
      skills: job.skillsRequired.join(', '),
    }),
    ...(job.educationRequired && {
      educationRequirements: {
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: job.educationRequired,
      },
    }),
    ...(job.experienceRequired && {
      experienceRequirements: job.experienceRequired,
    }),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
