'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

interface SettingCard {
  id: string
  title: string
  description: string
  icon: string
  href: string
  forUserTypes: ('employer' | 'employee')[]
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
  {
    id: 'subscription',
    title: 'Subscription & Billing',
    description: 'View your plan, trial status, and payment history',
    icon: '💳',
    href: '/settings/subscription',
    forUserTypes: ['employer', 'employee'],
  },
]

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null)
  const [userName, setUserName] = useState('')

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
      } else {
        setUserName(`${session.user.user_metadata?.first_name || ''} ${session.user.user_metadata?.last_name || ''}`.trim() || 'User')
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  const visibleCards = settingsCards.filter(card =>
    userType && card.forUserTypes.includes(userType)
  )

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
