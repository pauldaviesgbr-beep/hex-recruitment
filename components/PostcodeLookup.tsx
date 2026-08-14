'use client'

import { useState, useRef, useEffect } from 'react'
import { normalizePostcode, isValidPostcodeFormat } from '@/lib/postcodeLookup'
import styles from './PostcodeLookup.module.css'
import { Ico } from '@/components/icons'

export interface AddressData {
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
}

interface AddressOption {
  line_1: string
  line_2: string
  town_or_city: string
  county: string
  postcode: string
  formatted: string
}

interface PostcodeLookupProps {
  onAddressFound: (address: AddressData) => void
  initialPostcode?: string
  className?: string
  error?: string
}

export default function PostcodeLookup({
  onAddressFound,
  initialPostcode = '',
  className = '',
  error,
}: PostcodeLookupProps) {
  const [postcode, setPostcode] = useState(initialPostcode)
  const [isLooking, setIsLooking] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [addresses, setAddresses] = useState<AddressOption[]>([])
  const [showAddresses, setShowAddresses] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<AddressOption | null>(null)
  const [manualMode, setManualMode] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowAddresses(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase()
    setPostcode(value)
    setLookupError('')
    setAddresses([])
    setShowAddresses(false)
    setSelectedAddress(null)
  }

  const performLookup = async () => {
    const normalized = normalizePostcode(postcode)

    if (!isValidPostcodeFormat(normalized)) {
      setLookupError('Please enter a valid UK postcode')
      return
    }

    setIsLooking(true)
    setLookupError('')
    setAddresses([])
    setShowAddresses(false)
    setSelectedAddress(null)

    try {
      const res = await fetch(`/api/lookup-postcode?postcode=${encodeURIComponent(normalized)}`)
      const data = await res.json()

      if (!res.ok) {
        // A 404 is a genuine "we couldn't find that postcode" — keep it helpful.
        // Anything else (e.g. the upstream Postcoder service being unavailable or
        // out of credit, which surfaces as a 500/502) is not the user's problem:
        // never show a raw "Lookup failed (403)" — point them to manual entry,
        // which is always available via the button below.
        if (res.status === 404) {
          setLookupError(data.error || 'Postcode not found. Please check and try again.')
        } else {
          setLookupError('Address lookup is temporarily unavailable. Please enter your address manually below.')
        }
        setIsLooking(false)
        return
      }

      if (data.addresses && data.addresses.length > 0) {
        setAddresses(data.addresses)
        setShowAddresses(true)
        setPostcode(data.postcode || normalized)
      } else {
        setLookupError('No addresses found for this postcode.')
      }
    } catch {
      setLookupError('Lookup failed. Please try again or enter address manually.')
    }

    setIsLooking(false)
  }

  const selectAddress = (addr: AddressOption) => {
    setSelectedAddress(addr)
    setShowAddresses(false)
    onAddressFound({
      addressLine1: addr.line_1,
      addressLine2: addr.line_2,
      city: addr.town_or_city,
      county: addr.county,
      postcode: addr.postcode,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      performLookup()
    }
  }

  const handleManualMode = () => {
    setManualMode(true)
    setShowAddresses(false)
    onAddressFound({
      addressLine1: '',
      addressLine2: '',
      city: '',
      county: '',
      postcode: postcode,
    })
  }

  if (manualMode) {
    return (
      <div className={`${styles.container} ${className}`}>
        <div className={styles.manualModeHeader}>
          <span className={styles.manualModeText}>Entering address manually</span>
          <button
            type="button"
            className={styles.useLookupLink}
            onClick={() => setManualMode(false)}
          >
            Use postcode lookup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.container} ${className}`} ref={containerRef}>
      <div className={styles.lookupRow}>
        <div className={styles.inputWrapper}>
          <input
            type="text"
            value={postcode}
            onChange={handlePostcodeChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter postcode (e.g. SW1A 1AA)"
            className={`${styles.input} ${error || lookupError ? styles.inputError : ''}`}
            autoComplete="postal-code"
            aria-label="Postcode"
          />
        </div>
        <button
          type="button"
          onClick={performLookup}
          disabled={isLooking || !postcode.trim()}
          className={styles.findButton}
        >
          {isLooking ? (
            <>
              <span className={styles.spinner}></span>
              Looking...
            </>
          ) : (
            <>
              <span className={styles.searchIcon}><Ico name="search" size={20} /></span>
              Find Address
            </>
          )}
        </button>
      </div>

      {(error || lookupError) && (
        <p className={styles.errorText}>{error || lookupError}</p>
      )}

      {showAddresses && addresses.length > 0 && (
        <div className={styles.addressDropdown}>
          <p className={styles.addressCount}>
            {addresses.length} address{addresses.length !== 1 ? 'es' : ''} found — select yours:
          </p>
          <ul className={styles.addressList} role="listbox">
            {addresses.map((addr, i) => (
              <li
                key={i}
                className={styles.addressItem}
                onClick={() => selectAddress(addr)}
                role="option"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') selectAddress(addr) }}
              >
                <span className={styles.suggestionIcon}><Ico name="map-pin" size={20} /></span>
                {addr.formatted}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedAddress && (
        <div className={styles.foundAddressCard}>
          <div className={styles.foundAddressHeader}>
            <span className={styles.checkIcon}>✓</span>
            <span className={styles.foundTitle}>Address selected</span>
          </div>
          <div className={styles.foundAddressDetails}>
            <p className={styles.foundLocation}>{selectedAddress.formatted}</p>
            <p className={styles.foundPostcode}>{selectedAddress.postcode}</p>
          </div>
        </div>
      )}

      <button
        type="button"
        className={styles.manualLink}
        onClick={handleManualMode}
      >
        Enter address manually
      </button>
    </div>
  )
}
