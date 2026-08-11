'use client'
import { PAID_SURFACES_ENABLED } from '@/lib/paidSurfaces'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getEmployerCapabilities } from '@/lib/employer'
import type { PermissionKey } from '@/lib/teamPermissions'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

interface SettingCard {
  id: string
  title: string
  description: string
  icon: string
  href: string
  forUserTypes: ('employer' | 'employee')[]
  // When set, an employer must hold this capability to see the card. Owners
  // hold everything; team members are hidden the controls they can't use.
  requiresCap?: PermissionKey
}

const settingsCards: SettingCard[] = [
  {
    id: 'account',
    title: 'Account Settings',
    description: 'Update your contact information, email, and phone number',
    icon: '👤',
    href: '/settings/account',
    forUserTypes: ['employer', 'employee'],
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Change your password and manage account security',
    icon: '🔒',
    href: '/settings/security',
    forUserTypes: ['employer', 'employee'],
  },
  {
    id: 'profile',
    title: 'Profile Settings',
    description: 'Control what employers can see on your profile',
    icon: '⚙️',
    href: '/settings/profile',
    forUserTypes: ['employee'],
  },
  {
    id: 'company',
    title: 'Company Profile',
    description: 'Update your company information and branding',
    icon: '🏢',
    href: '/settings/company',
    forUserTypes: ['employer'],
    requiresCap: 'edit_company',
  },
  {
    id: 'availability',
    title: 'Interview Availability',
    description: 'Set your available days and hours for candidate interview bookings',
    icon: '📅',
    href: '/settings/availability',
    forUserTypes: ['employer'],
  },
  {
    id: 'email-templates',
    title: 'Email Templates',
    description: 'Customise the emails sent to candidates at each stage of your hiring pipeline',
    icon: '✉️',
    href: '/settings/email-templates',
    forUserTypes: ['employer'],
  },
  {
    id: 'team',
    title: 'Team',
    description: 'Invite colleagues and manage what each teammate can do',
    icon: '👥',
    href: '/settings/team',
    forUserTypes: ['employer'],
    requiresCap: 'manage_team',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Manage email and SMS notification preferences',
    icon: '🔔',
    href: '/settings/notifications',
    forUserTypes: ['employer', 'employee'],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    description: 'Control your profile visibility and data settings',
    icon: '🛡️',
    href: '/settings/privacy',
    forUserTypes: ['employer', 'employee'],
  },
  ...(PAID_SURFACES_ENABLED ? ([{
      id: 'subscription',
    title: 'Subscription & Billing',
    description: 'View your plan, trial status, and payment history',
    icon: '💳',
    href: '/settings/subscription',
    forUserTypes: ['employer', 'employee'],
    requiresCap: 'manage_billing',
  }] as SettingCard[]) : []),
]

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null)
  const [userName, setUserName] = useState('')
  const [caps, setCaps] = useState<Record<PermissionKey, boolean> | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type) {
          router.push('/login')
          return
        }
        setUserType(type)
        const mockUser = getMockUser()
        if (type === 'employer') {
          setUserName(mockUser?.user_metadata?.company_name || 'User')
        } else {
          setUserName(mockUser?.user_metadata?.full_name || 'User')
        }
        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const role = session.user.user_metadata?.role
      setUserType(role === 'employer' ? 'employer' : 'employee')

      if (role === 'employer') {
        setUserName(session.user.user_metadata?.company_name || 'User')
        // Resolve this employer's capabilities so team members only see the
        // settings they can actually use (owners hold everything).
        setCaps(await getEmployerCapabilities(supabase))
      } else {
        setUserName(`${session.user.user_metadata?.first_name || ''} ${session.user.user_metadata?.last_name || ''}`.trim() || 'User')
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  const visibleCards = settingsCards.filter(card => {
    if (!userType || !card.forUserTypes.includes(userType)) return false
    // Capability gate applies to employers only; a resolved cap set that lacks
    // the requirement hides the card. Unresolved caps (null) default to visible
    // so owners / DEV are never over-hidden.
    if (card.requiresCap && userType === 'employer' && caps && caps[card.requiresCap] === false) return false
    return true
  })

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>Loading settings...</div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>
            Manage your account preferences and settings
          </p>
        </div>

        <div className={styles.cardsGrid}>
          {visibleCards.map(card => (
            <Link
              key={card.id}
              href={card.href}
              className={styles.settingCard}
            >
              <div className={styles.cardIcon}>{card.icon}</div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardDescription}>{card.description}</p>
              </div>
              <div className={styles.cardArrow}>→</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
