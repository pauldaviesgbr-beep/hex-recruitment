'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

type CardBrand = 'visa' | 'mastercard' | 'amex' | 'unknown'

interface PaymentFormData {
  cardholderName: string
  cardNumber: string
  expiryDate: string
  cvv: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
}

const initialFormData: PaymentFormData = {
  cardholderName: '',
  cardNumber: '',
  expiryDate: '',
  cvv: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  county: '',
  postcode: '',
}

function detectCardBrand(number: string): CardBrand {
  const digits = number.replace(/\s/g, '')
  if (/^4/.test(digits)) return 'visa'
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'mastercard'
  if (/^3[47]/.test(digits)) return 'amex'
  return 'unknown'
}

function formatCardNumber(value: string, brand: CardBrand): string {
  const digits = value.replace(/\D/g, '')
  const maxLength = brand === 'amex' ? 15 : 16
  const trimmed = digits.slice(0, maxLength)

  if (brand === 'amex') {
    // Amex: 4-6-5 grouping
    const parts = [trimmed.slice(0, 4), trimmed.slice(4, 10), trimmed.slice(10, 15)]
    return parts.filter(Boolean).join(' ')
  }

  // Standard: 4-4-4-4 grouping
  const parts = [trimmed.slice(0, 4), trimmed.slice(4, 8), trimmed.slice(8, 12), trimmed.slice(12, 16)]
  return parts.filter(Boolean).join(' ')
}

function formatExpiryDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export default function PaymentMethodPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<PaymentFormData>(initialFormData)
  const [errors, setErrors] = useState<Partial<Record<keyof PaymentFormData, string>>>({})
  const [showSuccess, setShowSuccess] = useState(false)
  const [cardBrand, setCardBrand] = useState<CardBrand>('unknown')
  const [addressFound, setAddressFound] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type || type !== 'employer') {
          router.push('/login')
          return
        }

        // Load existing payment data if available
        const storedSub = JSON.parse(localStorage.getItem('subscription') || '{}')
        if (storedSub.cardholderName) {
          setFormData(prev => ({
            ...prev,
            cardholderName: storedSub.cardholderName || '',
            addressLine1: storedSub.billingAddress1 || '',
            addressLine2: storedSub.billingAddress2 || '',
            city: storedSub.billingCity || '',
            county: storedSub.billingCounty || '',
            postcode: storedSub.billingPostcode || '',
          }))
          // Show address fields if we have existing address data
          if (storedSub.billingAddress1 || storedSub.billingPostcode) {
            setAddressFound(true)
          }
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
      if (role !== 'employer') {
        router.push('/login')
        return
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target

    if (name === 'cardNumber') {
      const brand = detectCardBrand(value)
      setCardBrand(brand)
      setFormData(prev => ({ ...prev, cardNumber: formatCardNumber(value, brand) }))
    } else if (name === 'expiryDate') {
      setFormData(prev => ({ ...prev, expiryDate: formatExpiryDate(value) }))
    } else if (name === 'cvv') {
      const maxLen = cardBrand === 'amex' ? 4 : 3
      const digits = value.replace(/\D/g, '').slice(0, maxLen)
      setFormData(prev => ({ ...prev, cvv: digits }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }

    // Clear field error on change
    if (errors[name as keyof PaymentFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const handleAddressFound = (address: AddressData) => {
    setFormData(prev => ({
      ...prev,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      county: address.county,
      postcode: address.postcode,
    }))
    setAddressFound(true)
    // Clear address-related errors
    setErrors(prev => ({
      ...prev,
      addressLine1: undefined,
      city: undefined,
      postcode: undefined,
    }))
  }

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PaymentFormData, string>> = {}

    if (!formData.cardholderName.trim()) {
      newErrors.cardholderName = 'Cardholder name is required'
    }

    const cardDigits = formData.cardNumber.replace(/\s/g, '')
    const requiredLength = cardBrand === 'amex' ? 15 : 16
    if (cardDigits.length < requiredLength) {
      newErrors.cardNumber = `Card number must be ${requiredLength} digits`
    }

    const expiryParts = formData.expiryDate.split('/')
    if (expiryParts.length !== 2 || expiryParts[0].length !== 2 || expiryParts[1].length !== 2) {
      newErrors.expiryDate = 'Enter a valid expiry date (MM/YY)'
    } else {
      const month = parseInt(expiryParts[0], 10)
      const year = parseInt('20' + expiryParts[1], 10)
      const now = new Date()
      const expiryEnd = new Date(year, month, 0) // last day of expiry month
      if (month < 1 || month > 12) {
        newErrors.expiryDate = 'Invalid month'
      } else if (expiryEnd < now) {
        newErrors.expiryDate = 'Card has expired'
      }
    }

    const cvvLength = cardBrand === 'amex' ? 4 : 3
    if (formData.cvv.length !== cvvLength) {
      newErrors.cvv = `CVV must be ${cvvLength} digits`
    }

    if (!formData.addressLine1.trim()) {
      newErrors.addressLine1 = 'Address line 1 is required'
    }

    if (!formData.city.trim()) {
      newErrors.city = 'City is required'
    }

    if (!formData.postcode.trim()) {
      newErrors.postcode = 'Postcode is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSaving(true)

    // Extract only safe metadata (last 4 digits and card brand)
    const cardDigits = formData.cardNumber.replace(/\s/g, '')
    const last4 = cardDigits.slice(-4)
    const brand = cardBrand

    if (DEV_MODE) {
      // Store only metadata in localStorage — never store full card number
      const storedSub = JSON.parse(localStorage.getItem('subscription') || '{}')
      storedSub.cardLast4 = last4
      storedSub.cardBrand = brand
      storedSub.cardExpiry = formData.expiryDate
      storedSub.cardholderName = formData.cardholderName
      storedSub.billingAddress1 = formData.addressLine1
      storedSub.billingAddress2 = formData.addressLine2
      storedSub.billingCity = formData.city
      storedSub.billingCounty = formData.county
      storedSub.billingPostcode = formData.postcode
      localStorage.setItem('subscription', JSON.stringify(storedSub))
    } else {
      // Production: Save card metadata to Supabase user profile
      // Full card details would be handled by Stripe — only store metadata
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await supabase
          .from('employer_profiles')
          .update({
            card_last4: last4,
            card_brand: brand,
            card_expiry: formData.expiryDate,
            billing_address_1: formData.addressLine1,
            billing_address_2: formData.addressLine2,
            billing_city: formData.city,
            billing_county: formData.county,
            billing_postcode: formData.postcode,
          })
          .eq('user_id', session.user.id)
      }
    }

    setSaving(false)
    setShowSuccess(true)
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p className={styles.loading}>Loading...</p>
        </div>
      </main>
    )
  }

  if (showSuccess) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.successCard}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.successTitle}>Payment Method Updated</h2>
            <p className={styles.successText}>
              Your {cardBrand !== 'unknown' ? cardBrand.charAt(0).toUpperCase() + cardBrand.slice(1) : 'card'} ending
              in {formData.cardNumber.replace(/\s/g, '').slice(-4)} has been saved successfully.
            </p>
            <Link href="/settings/subscription" className={styles.successLink}>
              ← Back to Subscription & Billing
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <Link href="/settings/subscription" className={styles.backLink}>
          <span className={styles.backArrow}>←</span>
          Back to Subscription & Billing
        </Link>

        <div className={styles.header}>
          <div className={styles.headerIcon}>💳</div>
          <div>
            <h1 className={styles.title}>Update Payment Method</h1>
            <p className={styles.subtitle}>Enter your card details below. Your full card number is never stored.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Card Details Section */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Card Details</h2>

            <div className={styles.formGroup}>
              <label htmlFor="cardholderName">Cardholder Name *</label>
              <input
                type="text"
                id="cardholderName"
                name="cardholderName"
                value={formData.cardholderName}
                onChange={handleChange}
                className={errors.cardholderName ? styles.inputError : ''}
                placeholder="Name as it appears on card"
                autoComplete="cc-name"
              />
              {errors.cardholderName && <span className={styles.errorText}>{errors.cardholderName}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="cardNumber">Card Number *</label>
              <div className={styles.cardNumberWrapper}>
                <input
                  type="text"
                  id="cardNumber"
                  name="cardNumber"
                  value={formData.cardNumber}
                  onChange={handleChange}
                  className={`${styles.cardNumberInput} ${errors.cardNumber ? styles.inputError : ''}`}
                  placeholder={cardBrand === 'amex' ? '3700 000000 00002' : '4242 4242 4242 4242'}
                  autoComplete="cc-number"
                  inputMode="numeric"
                />
                <div className={styles.cardIcons}>
                  <span className={`${styles.cardIcon} ${cardBrand === 'visa' ? styles.cardIconActive : ''}`} title="Visa">
                    <svg viewBox="0 0 48 32" width="36" height="24">
                      <rect fill={cardBrand === 'visa' ? '#1A1F71' : '#d1d5db'} width="48" height="32" rx="4"/>
                      <text x="24" y="20" textAnchor="middle" fill="#FFF" fontSize="12" fontWeight="bold" fontFamily="Arial">VISA</text>
                    </svg>
                  </span>
                  <span className={`${styles.cardIcon} ${cardBrand === 'mastercard' ? styles.cardIconActive : ''}`} title="Mastercard">
                    <svg viewBox="0 0 48 32" width="36" height="24">
                      <rect fill={cardBrand === 'mastercard' ? '#000' : '#d1d5db'} width="48" height="32" rx="4"/>
                      <circle cx="18" cy="16" r="9" fill={cardBrand === 'mastercard' ? '#EB001B' : '#9ca3af'}/>
                      <circle cx="30" cy="16" r="9" fill={cardBrand === 'mastercard' ? '#F79E1B' : '#b0b0b0'}/>
                    </svg>
                  </span>
                  <span className={`${styles.cardIcon} ${cardBrand === 'amex' ? styles.cardIconActive : ''}`} title="American Express">
                    <svg viewBox="0 0 48 32" width="36" height="24">
                      <rect fill={cardBrand === 'amex' ? '#006FCF' : '#d1d5db'} width="48" height="32" rx="4"/>
                      <text x="24" y="20" textAnchor="middle" fill="#FFF" fontSize="8" fontWeight="bold" fontFamily="Arial">AMEX</text>
                    </svg>
                  </span>
                </div>
              </div>
              {errors.cardNumber && <span className={styles.errorText}>{errors.cardNumber}</span>}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="expiryDate">Expiry Date *</label>
                <input
                  type="text"
                  id="expiryDate"
                  name="expiryDate"
                  value={formData.expiryDate}
                  onChange={handleChange}
                  className={errors.expiryDate ? styles.inputError : ''}
                  placeholder="MM/YY"
                  autoComplete="cc-exp"
                  inputMode="numeric"
                  maxLength={5}
                />
                {errors.expiryDate && <span className={styles.errorText}>{errors.expiryDate}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="cvv">CVV *</label>
                <div className={styles.cvvWrapper}>
                  <input
                    type="password"
                    id="cvv"
                    name="cvv"
                    value={formData.cvv}
                    onChange={handleChange}
                    className={errors.cvv ? styles.inputError : ''}
                    placeholder={cardBrand === 'amex' ? '••••' : '•••'}
                    autoComplete="cc-csc"
                    inputMode="numeric"
                    maxLength={cardBrand === 'amex' ? 4 : 3}
                  />
                  <span className={styles.cvvHint}>{cardBrand === 'amex' ? '4 digits on front' : '3 digits on back'}</span>
                </div>
                {errors.cvv && <span className={styles.errorText}>{errors.cvv}</span>}
              </div>
            </div>
          </div>

          {/* Billing Address Section */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Billing Address</h2>

            <div className={styles.formGroup}>
              <label>Postcode Lookup</label>
              <PostcodeLookup
                onAddressFound={handleAddressFound}
                initialPostcode={formData.postcode}
              />
            </div>

            {addressFound && (
              <div className={styles.addressFields}>
                <div className={styles.formGroup}>
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

                <div className={styles.formGroup}>
                  <label htmlFor="addressLine2">Address Line 2</label>
                  <input
                    type="text"
                    id="addressLine2"
                    name="addressLine2"
                    value={formData.addressLine2}
                    onChange={handleChange}
                    placeholder="Flat, suite, unit, etc. (optional)"
                    autoComplete="address-line2"
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="city">City *</label>
                    <input
                      type="text"
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className={errors.city ? styles.inputError : ''}
                      placeholder="City or town"
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
                      placeholder="County (optional)"
                      autoComplete="address-level1"
                    />
                  </div>
                </div>

                <div className={styles.formGroup + ' ' + styles.postcodeGroup}>
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
              </div>
            )}
          </div>

          {/* Security Note */}
          <div className={styles.securityNote}>
            <span className={styles.lockIcon}>🔒</span>
            <p>Your payment details are encrypted and secure. Full card numbers are never stored — only the last 4 digits and card type are saved for your reference.</p>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? (
                <>
                  <span className={styles.spinner}></span>
                  Saving...
                </>
              ) : (
                'Save Payment Method'
              )}
            </button>
            <Link href="/settings/subscription" className={styles.cancelLink}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
