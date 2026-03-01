// Mock Authentication for Development Mode
// This allows working on the UI without real authentication

export const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true'

export type MockUserType = 'employer' | 'employee'

// Mock user data
export const mockUsers = {
  employer: {
    id: 'mock-employer-123',
    email: 'employer@hex-recruitment.dev',
    user_metadata: {
      role: 'employer',
      full_name: 'Sarah Mitchell',
      company_name: 'The Grand Hotel London',
    },
    created_at: '2024-01-01T00:00:00Z',
  },
  employee: {
    id: 'mock-employee-456',
    email: 'jobseeker@hex-recruitment.dev',
    user_metadata: {
      role: 'employee',
      full_name: 'James Wilson',
      company_name: '', // Not applicable for employees, but needed for type consistency
    },
    created_at: '2024-01-01T00:00:00Z',
  },
}

// Get the current mock user type from localStorage or env
export function getMockUserType(): MockUserType {
  if (typeof window === 'undefined') {
    return (process.env.NEXT_PUBLIC_MOCK_USER_TYPE as MockUserType) || 'employer'
  }
  return (localStorage.getItem('mockUserType') as MockUserType) ||
         (process.env.NEXT_PUBLIC_MOCK_USER_TYPE as MockUserType) ||
         'employer'
}

// Set the mock user type in localStorage
export function setMockUserType(type: MockUserType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('mockUserType', type)
    // Trigger a page reload to apply changes
    window.location.reload()
  }
}

// Get the current mock user
export function getMockUser() {
  if (!DEV_MODE) return null
  const type = getMockUserType()
  return mockUsers[type]
}

/**
 * DEV_MODE ONLY — returns true in dev mode, false in production.
 * For production auth checks, use `getCurrentUser()` from `@/lib/auth`.
 */
export function isAuthenticated(): boolean {
  if (DEV_MODE) return true
  return false
}

/**
 * DEV_MODE ONLY — returns mock user role check.
 * For production, check `user.user_metadata?.role === 'employer'` after getting
 * the session via `supabase.auth.getSession()` or `getCurrentUserWithRole()` from `@/lib/auth`.
 */
export function isEmployer(): boolean {
  if (DEV_MODE) {
    return getMockUserType() === 'employer'
  }
  return false
}

/**
 * DEV_MODE ONLY — returns mock user role check.
 * For production, check `user.user_metadata?.role === 'employee'` after getting
 * the session via `supabase.auth.getSession()` or `getCurrentUserWithRole()` from `@/lib/auth`.
 */
export function isEmployee(): boolean {
  if (DEV_MODE) {
    return getMockUserType() === 'employee'
  }
  return false
}

// Get subscription/trial status from localStorage
export function getSubscriptionStatus(): 'active' | 'trial' | 'expired' | 'inactive' {
  if (!DEV_MODE) return 'inactive'

  if (typeof window === 'undefined') return 'trial'

  const userType = getMockUserType()

  if (userType === 'employee') {
    const profile = JSON.parse(localStorage.getItem('currentTestProfile') || '{}')
    if (profile.accountStatus === 'active') return 'active'
    if (profile.trialExpiresAt) {
      const expired = new Date() > new Date(profile.trialExpiresAt)
      return expired ? 'expired' : 'trial'
    }
    return 'trial'
  }

  // Employer
  const subscription = JSON.parse(localStorage.getItem('subscription') || '{}')
  if (subscription.status === 'active') return 'active'
  if (subscription.trialEndDate) {
    const expired = new Date() > new Date(subscription.trialEndDate)
    return expired ? 'expired' : 'trial'
  }
  return 'trial'
}

// Get trial expiry date for current user
export function getTrialExpiryDate(): Date | null {
  if (!DEV_MODE || typeof window === 'undefined') return null

  const userType = getMockUserType()

  if (userType === 'employee') {
    const profile = JSON.parse(localStorage.getItem('currentTestProfile') || '{}')
    return profile.trialExpiresAt ? new Date(profile.trialExpiresAt) : null
  }

  const subscription = JSON.parse(localStorage.getItem('subscription') || '{}')
  return subscription.trialEndDate ? new Date(subscription.trialEndDate) : null
}

/**
 * DEV_MODE ONLY — always returns true in dev mode, false in production.
 * For production, check the user's phone verification status from their profile data.
 */
export function isPhoneVerified(): boolean {
  if (DEV_MODE) return true
  return false
}
