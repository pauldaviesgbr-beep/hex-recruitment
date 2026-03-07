'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { calculateTrialExpiry } from '@/lib/trialUtils'
import styles from './page.module.css'

interface FormData {
  // Account Registration
  accountEmail: string
  accountPassword: string
  confirmPassword: string
  // Company Details
  companyName: string
  companyRegistration: string
  vatNumber: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
  companyPhone: string
  companyEmail: string
  // Billing Contact
  contactName: string
  jobTitle: string
  contactEmail: string
  contactPhone: string
  // Card Details
  cardholderName: string
  cardNumber: string
  expiryDate: string
  cvv: string
  sameBillingAddress: boolean
  billingAddressLine1: string
  billingAddressLine2: string
  billingCity: string
  billingCounty: string
  billingPostcode: string
  // Legal
  authorizedPayment: boolean
  agreeTerms: boolean
  agreePrivacy: boolean
  understandBilling: boolean
  agreeRecurring: boolean
}

const initialFormData: FormData = {
  accountEmail: '',
  accountPassword: '',
  confirmPassword: '',
  companyName: '',
  companyRegistration: '',
  vatNumber: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  county: '',
  postcode: '',
  companyPhone: '',
  companyEmail: '',
  contactName: '',
  jobTitle: '',
  contactEmail: '',
  contactPhone: '',
  cardholderName: '',
  cardNumber: '',
  expiryDate: '',
  cvv: '',
  sameBillingAddress: true,
  billingAddressLine1: '',
  billingAddressLine2: '',
  billingCity: '',
  billingCounty: '',
  billingPostcode: '',
  authorizedPayment: false,
  agreeTerms: false,
  agreePrivacy: false,
  understandBilling: false,
  agreeRecurring: false,
}

export default function SubscribePage() {
  const router = useRouter()
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [companyAddressFound, setCompanyAddressFound] = useState(false)
  const [billingAddressFound, setBillingAddressFound] = useState(false)

  // 14-day free trial
  const trialEndDate = calculateTrialExpiry(new Date())
  const formattedTrialEnd = trialEndDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    // Clear error when user types
    if (errors[name as keyof FormData]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleCompanyAddressFound = (address: AddressData) => {
    setFormData(prev => ({
      ...prev,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      county: address.county,
      postcode: address.postcode,
    }))
    setCompanyAddressFound(true)
  }

  const handleBillingAddressFound = (address: AddressData) => {
    setFormData(prev => ({
      ...prev,
      billingAddressLine1: address.addressLine1,
      billingAddressLine2: address.addressLine2,
      billingCity: address.city,
      billingCounty: address.county,
      billingPostcode: address.postcode,
    }))
    setBillingAddressFound(true)
  }

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '')
    const groups = digits.match(/.{1,4}/g)
    return groups ? groups.join(' ').substring(0, 19) : ''
  }

  const formatExpiryDate = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length >= 2) {
      return digits.substring(0, 2) + '/' + digits.substring(2, 4)
    }
    return digits
  }

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value)
    setFormData(prev => ({ ...prev, cardNumber: formatted }))
    if (errors.cardNumber) {
      setErrors(prev => ({ ...prev, cardNumber: '' }))
    }
  }

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiryDate(e.target.value)
    setFormData(prev => ({ ...prev, expiryDate: formatted }))
    if (errors.expiryDate) {
      setErrors(prev => ({ ...prev, expiryDate: '' }))
    }
  }

  const getCardType = (number: string) => {
    const digits = number.replace(/\D/g, '')
    if (digits.startsWith('4')) return 'visa'
    if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'mastercard'
    if (/^3[47]/.test(digits)) return 'amex'
    return null
  }

  // Password requirement checks
  const passwordChecks = {
    minLength: formData.accountPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(formData.accountPassword),
    hasLowercase: /[a-z]/.test(formData.accountPassword),
    hasNumber: /[0-9]/.test(formData.accountPassword),
  }

  const allPasswordChecksPassed = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch = formData.accountPassword === formData.confirmPassword && formData.confirmPassword.length > 0

  // Check if registration section is complete
  const isRegistrationComplete =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.accountEmail) &&
    allPasswordChecksPassed &&
    passwordsMatch

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    // Account Registration
    if (!formData.accountEmail.trim()) newErrors.accountEmail = 'Email address is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.accountEmail)) {
      newErrors.accountEmail = 'Please enter a valid email address'
    }
    if (!formData.accountPassword) newErrors.accountPassword = 'Password is required'
    else if (!allPasswordChecksPassed) {
      newErrors.accountPassword = 'Password does not meet all requirements'
    }
    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password'
    else if (formData.accountPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    // Company Details
    if (!formData.companyName.trim()) newErrors.companyName = 'Company name is required'
    if (!formData.addressLine1.trim()) newErrors.addressLine1 = 'Address is required'
    if (!formData.city.trim()) newErrors.city = 'City is required'
    if (!formData.postcode.trim()) newErrors.postcode = 'Postcode is required'
    if (!formData.companyPhone.trim()) newErrors.companyPhone = 'Company phone is required'
    if (!formData.companyEmail.trim()) newErrors.companyEmail = 'Company email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.companyEmail)) {
      newErrors.companyEmail = 'Invalid email address'
    }

    // Billing Contact
    if (!formData.contactName.trim()) newErrors.contactName = 'Contact name is required'
    if (!formData.contactEmail.trim()) newErrors.contactEmail = 'Contact email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = 'Invalid email address'
    }
    if (!formData.contactPhone.trim()) newErrors.contactPhone = 'Contact phone is required'

    // Card Details
    if (!formData.cardholderName.trim()) newErrors.cardholderName = 'Cardholder name is required'
    if (!formData.cardNumber.trim()) newErrors.cardNumber = 'Card number is required'
    else if (formData.cardNumber.replace(/\D/g, '').length < 15) {
      newErrors.cardNumber = 'Invalid card number'
    }
    if (!formData.expiryDate.trim()) newErrors.expiryDate = 'Expiry date is required'
    else {
      const [month, year] = formData.expiryDate.split('/')
      const expiry = new Date(2000 + parseInt(year || '0'), parseInt(month || '0') - 1)
      if (expiry < new Date()) {
        newErrors.expiryDate = 'Card has expired'
      }
    }
    if (!formData.cvv.trim()) newErrors.cvv = 'CVV is required'
    else if (formData.cvv.length < 3) {
      newErrors.cvv = 'Invalid CVV'
    }

    // Billing Address (if different)
    if (!formData.sameBillingAddress) {
      if (!formData.billingAddressLine1.trim()) newErrors.billingAddressLine1 = 'Billing address is required'
      if (!formData.billingCity.trim()) newErrors.billingCity = 'Billing city is required'
      if (!formData.billingPostcode.trim()) newErrors.billingPostcode = 'Billing postcode is required'
    }

    // Legal checkboxes
    if (!formData.authorizedPayment) newErrors.authorizedPayment = 'You must confirm you are authorized'
    if (!formData.agreeTerms) newErrors.agreeTerms = 'You must agree to the Terms of Service'
    if (!formData.agreePrivacy) newErrors.agreePrivacy = 'You must agree to the Privacy Policy'
    if (!formData.understandBilling) newErrors.understandBilling = 'You must acknowledge the billing terms'
    if (!formData.agreeRecurring) newErrors.agreeRecurring = 'You must agree to recurring billing'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      // Scroll to first error
      const firstError = document.querySelector(`.${styles.inputError}`)
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setLoading(true)

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Get current user or create account
      const { data: { session } } = await supabase.auth.getSession()

      let userId: string | undefined

      if (!session) {
        // Create new employer account with user-provided credentials
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.accountEmail,
          password: formData.accountPassword,
          options: {
            data: {
              full_name: formData.contactName,
              company_name: formData.companyName,
              role: 'employer',
              subscription_plan: 'monthly',
            }
          }
        })

        if (authError) throw authError
        userId = authData.user?.id
      } else {
        userId = session.user.id
      }

      // Activate trial in database via server-side API (uses service role key)
      if (userId) {
        const activateRes = await fetch('/api/activate-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            trialEndsAt: trialEndDate.toISOString(),
            companyName: formData.companyName,
            contactName: formData.contactName,
            email: formData.accountEmail,
          }),
        })

        if (!activateRes.ok) {
          const err = await activateRes.json()
          throw new Error(err.error || 'Failed to activate trial')
        }
      }

      localStorage.setItem('subscriptionStatus', 'trial')
      localStorage.setItem('trialEndDate', trialEndDate.toISOString())

      setShowSuccess(true)

      // Redirect after showing success
      setTimeout(() => {
        router.push('/post-job')
      }, 3000)

    } catch (err: any) {
      setErrors({ companyEmail: err.message || 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  if (showSuccess) {
    return (
      <main>
        <Header />
        <div className={styles.successContainer}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>🎉</div>
            <h1>Welcome to Hex!</h1>
            <p className={styles.successMessage}>Your free trial has started.</p>
            <div className={styles.successDetails}>
              <div className={styles.successItem}>
                <span className={styles.successLabel}>Trial ends:</span>
                <span className={styles.successValue}>{formattedTrialEnd}</span>
              </div>
            </div>
            <p className={styles.redirectMessage}>Redirecting to post your first job...</p>
            <div className={styles.loadingBar}></div>
          </div>
        </div>
      </main>
    )
  }

  const cardType = getCardType(formData.cardNumber)

  return (
    <main>
      <Header />

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Post Jobs - Free for 14 Days</h1>
          <p className={styles.heroSubtitle}>Then from £29.99/month. 1 week cancellation notice.</p>
          <div className={styles.benefitsList}>
            <div className={styles.benefitItem}>✓ Post unlimited job vacancies</div>
            <div className={styles.benefitItem}>✓ Access qualified candidate profiles</div>
            <div className={styles.benefitItem}>✓ Direct messaging with candidates</div>
            <div className={styles.benefitItem}>✓ Featured job listings</div>
            <div className={styles.benefitItem}>✓ 1 week cancellation notice</div>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section className={styles.formSection}>
        <div className={styles.formContainer}>
          <form onSubmit={handleSubmit} className={styles.form}>

            {/* Section 1: Create Your Account */}
            <div className={styles.formSectionCard}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>1</span>
                Create Your Account
              </h2>

              <div className={styles.formGrid}>
                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label htmlFor="accountEmail">Email Address *</label>
                  <input
                    type="email"
                    id="accountEmail"
                    name="accountEmail"
                    value={formData.accountEmail}
                    onChange={handleChange}
                    className={errors.accountEmail ? styles.inputError : ''}
                    placeholder="you@company.co.uk"
                    autoComplete="email"
                  />
                  <span className={styles.recommendNote}>We recommend using your work email</span>
                  {errors.accountEmail && <span className={styles.errorText}>{errors.accountEmail}</span>}
                </div>

                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label htmlFor="accountPassword">Create Password *</label>
                  <PasswordInput
                    id="accountPassword"
                    name="accountPassword"
                    value={formData.accountPassword}
                    onChange={handleChange}
                    className={errors.accountPassword ? styles.inputError : ''}
                    placeholder="Create a secure password"
                    autoComplete="new-password"
                  />
                  <ul className={styles.passwordRequirements}>
                    <li className={passwordChecks.minLength ? styles.requirementMet : ''}>
                      <span className={styles.requirementIcon}>{passwordChecks.minLength ? '✓' : '○'}</span>
                      Minimum 8 characters
                    </li>
                    <li className={passwordChecks.hasUppercase ? styles.requirementMet : ''}>
                      <span className={styles.requirementIcon}>{passwordChecks.hasUppercase ? '✓' : '○'}</span>
                      At least one uppercase letter
                    </li>
                    <li className={passwordChecks.hasLowercase ? styles.requirementMet : ''}>
                      <span className={styles.requirementIcon}>{passwordChecks.hasLowercase ? '✓' : '○'}</span>
                      At least one lowercase letter
                    </li>
                    <li className={passwordChecks.hasNumber ? styles.requirementMet : ''}>
                      <span className={styles.requirementIcon}>{passwordChecks.hasNumber ? '✓' : '○'}</span>
                      At least one number
                    </li>
                  </ul>
                  {errors.accountPassword && <span className={styles.errorText}>{errors.accountPassword}</span>}
                </div>

                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label htmlFor="confirmPassword">Confirm Password *</label>
                  <PasswordInput
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={errors.confirmPassword ? styles.inputError : (formData.confirmPassword && !passwordsMatch ? styles.inputError : '')}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                  />
                  {formData.confirmPassword && passwordsMatch && (
                    <span className={styles.passwordMatch}>
                      <span className={styles.matchIcon}>✓</span> Passwords match
                    </span>
                  )}
                  {formData.confirmPassword && !passwordsMatch && (
                    <span className={styles.passwordMismatch}>Passwords do not match</span>
                  )}
                  {errors.confirmPassword && <span className={styles.errorText}>{errors.confirmPassword}</span>}
                </div>
              </div>
            </div>

            {/* Section 2: Company Details */}
            <div className={styles.formSectionCard}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>2</span>
                Company Details
              </h2>

              <div className={styles.formGrid}>
                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label htmlFor="companyName">Company/Trading Name *</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    className={errors.companyName ? styles.inputError : ''}
                    placeholder="Enter your company name"
                    autoComplete="organization"
                  />
                  {errors.companyName && <span className={styles.errorText}>{errors.companyName}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="companyRegistration">Company Registration Number</label>
                  <input
                    type="text"
                    id="companyRegistration"
                    name="companyRegistration"
                    value={formData.companyRegistration}
                    onChange={handleChange}
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="vatNumber">VAT Number</label>
                  <input
                    type="text"
                    id="vatNumber"
                    name="vatNumber"
                    value={formData.vatNumber}
                    onChange={handleChange}
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </div>

                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label>Postcode Lookup</label>
                  <PostcodeLookup
                    onAddressFound={handleCompanyAddressFound}
                    initialPostcode={formData.postcode}
                  />
                </div>

                {companyAddressFound && (
                  <>
                    <div className={styles.formGroup + ' ' + styles.fullWidth}>
                      <label htmlFor="addressLine1">Address Line 1 *</label>
                      <input
                        type="text"
                        id="addressLine1"
                        name="addressLine1"
                        value={formData.addressLine1}
                        onChange={handleChange}
                        className={errors.addressLine1 ? styles.inputError : ''}
                        placeholder="Street address"
                        autoComplete="address-line1"
                      />
                      {errors.addressLine1 && <span className={styles.errorText}>{errors.addressLine1}</span>}
                    </div>

                    <div className={styles.formGroup + ' ' + styles.fullWidth}>
                      <label htmlFor="addressLine2">Address Line 2</label>
                      <input
                        type="text"
                        id="addressLine2"
                        name="addressLine2"
                        value={formData.addressLine2}
                        onChange={handleChange}
                        placeholder="Optional"
                        autoComplete="address-line2"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="city">City *</label>
                      <input
                        type="text"
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        className={errors.city ? styles.inputError : ''}
                        placeholder="City"
                        autoComplete="address-level2"
                      />
                      {errors.city && <span className={styles.errorText}>{errors.city}</span>}
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="county">County</label>
                      <input
                        type="text"
                        id="county"
                        name="county"
                        value={formData.county}
                        onChange={handleChange}
                        placeholder="Optional"
                        autoComplete="address-level1"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="postcode">Postcode *</label>
                      <input
                        type="text"
                        id="postcode"
                        name="postcode"
                        value={formData.postcode}
                        onChange={handleChange}
                        className={errors.postcode ? styles.inputError : ''}
                        placeholder="SW1A 1AA"
                        autoComplete="postal-code"
                      />
                      {errors.postcode && <span className={styles.errorText}>{errors.postcode}</span>}
                    </div>
                  </>
                )}

                <div className={styles.formGroup}>
                  <label htmlFor="companyPhone">Company Phone *</label>
                  <input
                    type="tel"
                    id="companyPhone"
                    name="companyPhone"
                    value={formData.companyPhone}
                    onChange={handleChange}
                    className={errors.companyPhone ? styles.inputError : ''}
                    autoComplete="tel"
                    placeholder="+44 20 1234 5678"
                  />
                  {errors.companyPhone && <span className={styles.errorText}>{errors.companyPhone}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="companyEmail">Company Email *</label>
                  <input
                    type="email"
                    id="companyEmail"
                    name="companyEmail"
                    value={formData.companyEmail}
                    onChange={handleChange}
                    className={errors.companyEmail ? styles.inputError : ''}
                    placeholder="info@company.co.uk"
                    autoComplete="email"
                  />
                  {errors.companyEmail && <span className={styles.errorText}>{errors.companyEmail}</span>}
                </div>
              </div>
            </div>

            {/* Section 3: Billing Contact */}
            <div className={styles.formSectionCard}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>3</span>
                Billing Contact
              </h2>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label htmlFor="contactName">Contact Name *</label>
                  <input
                    type="text"
                    id="contactName"
                    name="contactName"
                    value={formData.contactName}
                    onChange={handleChange}
                    className={errors.contactName ? styles.inputError : ''}
                    placeholder="Full name"
                    autoComplete="name"
                  />
                  {errors.contactName && <span className={styles.errorText}>{errors.contactName}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="jobTitle">Job Title</label>
                  <input
                    type="text"
                    id="jobTitle"
                    name="jobTitle"
                    value={formData.jobTitle}
                    onChange={handleChange}
                    placeholder="Optional"
                    autoComplete="organization-title"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="contactEmail">Contact Email *</label>
                  <input
                    type="email"
                    id="contactEmail"
                    name="contactEmail"
                    value={formData.contactEmail}
                    onChange={handleChange}
                    className={errors.contactEmail ? styles.inputError : ''}
                    placeholder="billing@company.co.uk"
                    autoComplete="email"
                  />
                  {errors.contactEmail && <span className={styles.errorText}>{errors.contactEmail}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="contactPhone">Contact Phone *</label>
                  <input
                    type="tel"
                    id="contactPhone"
                    name="contactPhone"
                    value={formData.contactPhone}
                    onChange={handleChange}
                    className={errors.contactPhone ? styles.inputError : ''}
                    placeholder="+44 7700 123456"
                    autoComplete="tel"
                  />
                  {errors.contactPhone && <span className={styles.errorText}>{errors.contactPhone}</span>}
                </div>
              </div>
            </div>

            {/* Section 4: Card Payment Details */}
            <div className={styles.formSectionCard}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>4</span>
                Card Payment Details
              </h2>

              <p className={styles.cardNote}>Card required, but you won't be charged for 14 days</p>

              <div className={styles.cardIcons}>
                <span className={`${styles.cardIcon} ${cardType === 'visa' ? styles.active : ''}`} title="Visa">
                  <svg viewBox="0 0 48 32" width="48" height="32">
                    <rect fill="#1A1F71" width="48" height="32" rx="4"/>
                    <text x="24" y="20" textAnchor="middle" fill="#FFF" fontSize="12" fontWeight="bold" fontFamily="Arial">VISA</text>
                  </svg>
                </span>
                <span className={`${styles.cardIcon} ${cardType === 'mastercard' ? styles.active : ''}`} title="Mastercard">
                  <svg viewBox="0 0 48 32" width="48" height="32">
                    <rect fill="#000" width="48" height="32" rx="4"/>
                    <circle cx="18" cy="16" r="9" fill="#EB001B"/>
                    <circle cx="30" cy="16" r="9" fill="#F79E1B"/>
                  </svg>
                </span>
                <span className={`${styles.cardIcon} ${cardType === 'amex' ? styles.active : ''}`} title="American Express">
                  <svg viewBox="0 0 48 32" width="48" height="32">
                    <rect fill="#006FCF" width="48" height="32" rx="4"/>
                    <text x="24" y="20" textAnchor="middle" fill="#FFF" fontSize="8" fontWeight="bold" fontFamily="Arial">AMEX</text>
                  </svg>
                </span>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label htmlFor="cardholderName">Cardholder Name *</label>
                  <input
                    type="text"
                    id="cardholderName"
                    name="cardholderName"
                    value={formData.cardholderName}
                    onChange={handleChange}
                    className={errors.cardholderName ? styles.inputError : ''}
                    placeholder="Name as shown on card"
                    autoComplete="cc-name"
                  />
                  {errors.cardholderName && <span className={styles.errorText}>{errors.cardholderName}</span>}
                </div>

                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label htmlFor="cardNumber">Card Number *</label>
                  <input
                    type="text"
                    id="cardNumber"
                    name="cardNumber"
                    value={formData.cardNumber}
                    onChange={handleCardNumberChange}
                    className={errors.cardNumber ? styles.inputError : ''}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    autoComplete="cc-number"
                  />
                  {errors.cardNumber && <span className={styles.errorText}>{errors.cardNumber}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="expiryDate">Expiry Date (MM/YY) *</label>
                  <input
                    type="text"
                    id="expiryDate"
                    name="expiryDate"
                    value={formData.expiryDate}
                    onChange={handleExpiryChange}
                    className={errors.expiryDate ? styles.inputError : ''}
                    placeholder="MM/YY"
                    maxLength={5}
                    autoComplete="cc-exp"
                  />
                  {errors.expiryDate && <span className={styles.errorText}>{errors.expiryDate}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="cvv">CVV/CVC *</label>
                  <input
                    type="text"
                    id="cvv"
                    name="cvv"
                    value={formData.cvv}
                    onChange={handleChange}
                    className={errors.cvv ? styles.inputError : ''}
                    placeholder="123"
                    maxLength={4}
                    autoComplete="cc-csc"
                  />
                  {errors.cvv && <span className={styles.errorText}>{errors.cvv}</span>}
                </div>

                <div className={styles.formGroup + ' ' + styles.fullWidth}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      name="sameBillingAddress"
                      checked={formData.sameBillingAddress}
                      onChange={handleChange}
                    />
                    <span className={styles.checkmark}></span>
                    Billing address same as company address
                  </label>
                </div>

                {!formData.sameBillingAddress && (
                  <>
                    <div className={styles.formGroup + ' ' + styles.fullWidth}>
                      <label>Billing Postcode Lookup</label>
                      <PostcodeLookup
                        onAddressFound={handleBillingAddressFound}
                        initialPostcode={formData.billingPostcode}
                      />
                    </div>

                    {billingAddressFound && (
                      <>
                        <div className={styles.formGroup + ' ' + styles.fullWidth}>
                          <label htmlFor="billingAddressLine1">Billing Address Line 1 *</label>
                          <input
                            type="text"
                            id="billingAddressLine1"
                            name="billingAddressLine1"
                            value={formData.billingAddressLine1}
                            onChange={handleChange}
                            className={errors.billingAddressLine1 ? styles.inputError : ''}
                            placeholder="Street address"
                            autoComplete="billing address-line1"
                          />
                          {errors.billingAddressLine1 && <span className={styles.errorText}>{errors.billingAddressLine1}</span>}
                        </div>

                        <div className={styles.formGroup + ' ' + styles.fullWidth}>
                          <label htmlFor="billingAddressLine2">Billing Address Line 2</label>
                          <input
                            type="text"
                            id="billingAddressLine2"
                            name="billingAddressLine2"
                            value={formData.billingAddressLine2}
                            onChange={handleChange}
                            placeholder="Optional"
                            autoComplete="billing address-line2"
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="billingCity">City *</label>
                          <input
                            type="text"
                            id="billingCity"
                            name="billingCity"
                            value={formData.billingCity}
                            onChange={handleChange}
                            className={errors.billingCity ? styles.inputError : ''}
                            placeholder="City"
                            autoComplete="billing address-level2"
                          />
                          {errors.billingCity && <span className={styles.errorText}>{errors.billingCity}</span>}
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="billingCounty">County</label>
                          <input
                            type="text"
                            id="billingCounty"
                            autoComplete="billing address-level1"
                            name="billingCounty"
                            value={formData.billingCounty}
                            onChange={handleChange}
                            placeholder="Optional"
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="billingPostcode">Postcode *</label>
                          <input
                            type="text"
                            id="billingPostcode"
                            name="billingPostcode"
                            value={formData.billingPostcode}
                            onChange={handleChange}
                            className={errors.billingPostcode ? styles.inputError : ''}
                            placeholder="SW1A 1AA"
                            autoComplete="billing postal-code"
                          />
                          {errors.billingPostcode && <span className={styles.errorText}>{errors.billingPostcode}</span>}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Section 5: Legal Agreement */}
            <div className={styles.formSectionCard}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNumber}>5</span>
                Legal Agreement
              </h2>

              <div className={styles.legalCheckboxes}>
                <label className={`${styles.checkboxLabel} ${errors.authorizedPayment ? styles.checkboxError : ''}`}>
                  <input
                    type="checkbox"
                    name="authorizedPayment"
                    checked={formData.authorizedPayment}
                    onChange={handleChange}
                  />
                  <span className={styles.checkmark}></span>
                  I am authorized to make payments on behalf of this company *
                </label>

                <label className={`${styles.checkboxLabel} ${errors.agreeTerms ? styles.checkboxError : ''}`}>
                  <input
                    type="checkbox"
                    name="agreeTerms"
                    checked={formData.agreeTerms}
                    onChange={handleChange}
                  />
                  <span className={styles.checkmark}></span>
                  I agree to the <Link href="/terms" className={styles.link} target="_blank" rel="noopener noreferrer">Terms of Service</Link> *
                </label>

                <label className={`${styles.checkboxLabel} ${errors.agreePrivacy ? styles.checkboxError : ''}`}>
                  <input
                    type="checkbox"
                    name="agreePrivacy"
                    checked={formData.agreePrivacy}
                    onChange={handleChange}
                  />
                  <span className={styles.checkmark}></span>
                  I agree to the <Link href="/privacy-policy" className={styles.link} target="_blank" rel="noopener noreferrer">Privacy Policy</Link> *
                </label>

                <label className={`${styles.checkboxLabel} ${errors.understandBilling ? styles.checkboxError : ''}`}>
                  <input
                    type="checkbox"
                    name="understandBilling"
                    checked={formData.understandBilling}
                    onChange={handleChange}
                  />
                  <span className={styles.checkmark}></span>
                  I understand my card will be charged from £29.99/month starting {formattedTrialEnd} *
                </label>

                <label className={`${styles.checkboxLabel} ${errors.agreeRecurring ? styles.checkboxError : ''}`}>
                  <input
                    type="checkbox"
                    name="agreeRecurring"
                    checked={formData.agreeRecurring}
                    onChange={handleChange}
                  />
                  <span className={styles.checkmark}></span>
                  I agree to automatic recurring billing until I cancel *
                </label>
              </div>
            </div>

            {/* Trial Terms Box */}
            <div className={styles.trialTermsBox}>
              <h3 className={styles.trialTermsTitle}>FREE TRIAL TERMS</h3>
              <ul className={styles.trialTermsList}>
                <li>Your 14-day free trial starts today</li>
                <li>No charge until <strong>{formattedTrialEnd}</strong></li>
                <li>Then from £29.99/month (inc. VAT where applicable)</li>
                <li>Cancel during trial with no charges</li>
                <li>After trial, 1 week's notice required to cancel</li>
              </ul>
            </div>

            {/* Submit Button */}
            <div className={styles.submitSection}>
              <button
                type="submit"
                disabled={loading}
                className={styles.submitBtn}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner}></span>
                    Processing your payment details...
                  </>
                ) : (
                  'Start Free 14-Day Trial'
                )}
              </button>
              <div className={styles.securityBadge}>
                <span className={styles.lockIcon}>🔒</span>
                Secure payment • 256-bit SSL encryption
              </div>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
