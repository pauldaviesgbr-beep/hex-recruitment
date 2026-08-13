'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  getCookieConsent,
  setCookieConsent,
  acceptAllCookies,
  type CookieConsent as CookieConsentType,
} from '@/lib/cookies'
import styles from './CookieConsent.module.css'

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [functional, setFunctional] = useState(true)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    const consent = getCookieConsent()
    if (!consent) {
      setShowBanner(true)
    } else {
      setFunctional(consent.functional)
      setAnalytics(consent.analytics)
    }
  }, [])

  const handleAcceptAll = useCallback(() => {
    acceptAllCookies()
    setShowBanner(false)
    setShowModal(false)
  }, [])

  const handleSavePreferences = useCallback(() => {
    const consent: CookieConsentType = {
      essential: true,
      functional,
      analytics,
    }
    setCookieConsent(consent)
    setShowBanner(false)
    setShowModal(false)
  }, [functional, analytics])

  const handleOpenPreferences = useCallback(() => {
    const consent = getCookieConsent()
    if (consent) {
      setFunctional(consent.functional)
      setAnalytics(consent.analytics)
    }
    setShowModal(true)
  }, [])

  // Expose a global function to reopen preferences from footer link
  useEffect(() => {
    (window as any).__openCookiePreferences = () => {
      handleOpenPreferences()
    }
    return () => {
      delete (window as any).__openCookiePreferences
    }
  }, [handleOpenPreferences])

  /**
   * PUBLISH THE BANNER'S HEIGHT so other fixed-bottom bars can sit above it.
   *
   * THIS BANNER WAS SWALLOWING THE APPLY BUTTON. Both it and the job page's
   * mobile apply bar are position:fixed at bottom:0; the banner is z-index 1001
   * and the bar is 100, so on a phone the banner sat directly on top of Apply
   * Now. A first-time visitor arriving from a link — which is EVERY visitor
   * arriving from a LinkedIn post — tapped Apply and hit the cookie banner.
   * Verified with elementFromPoint at the button's own centre: it returned the
   * banner's Manage Preferences button, not Apply.
   *
   * Raising the apply bar's z-index instead would only reverse the problem and
   * bury the consent controls. Publishing the height lets anything anchored to
   * the bottom move up while the banner is there, and drop back when it goes.
   */
  useEffect(() => {
    const root = document.documentElement
    const showing = showBanner && !showModal
    if (!showing) {
      root.style.setProperty('--cookie-banner-height', '0px')
      return
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>('[data-cookie-banner]')
      root.style.setProperty('--cookie-banner-height', `${el?.offsetHeight ?? 0}px`)
    }
    // Measured after paint, and re-measured on resize — the banner wraps to a
    // different height on a narrow screen, which is exactly where it matters.
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      root.style.setProperty('--cookie-banner-height', '0px')
    }
  }, [showBanner, showModal])

  if (!showBanner && !showModal) return null

  return (
    <>
      {/* Banner */}
      {showBanner && !showModal && (
        <div className={styles.banner} role="dialog" aria-label="Cookie consent" data-cookie-banner>
          <div className={styles.bannerInner}>
            <div className={styles.bannerText}>
              <p>
                We use cookies to improve your experience. Essential cookies are required for the site to work.
                You can choose to accept optional cookies or manage your preferences.{' '}
                <Link href="/privacy-policy" className={styles.bannerLink}>Learn more</Link>
              </p>
            </div>
            <div className={styles.bannerActions}>
              <button onClick={handleOpenPreferences} className={styles.manageBtn}>
                Manage Preferences
              </button>
              <button onClick={handleAcceptAll} className={styles.acceptBtn}>
                Accept All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences Modal */}
      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} role="dialog" aria-label="Cookie preferences" onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Cookie Preferences</h2>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)} aria-label="Close">
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.modalDesc}>
                Choose which cookies you want to allow. Essential cookies cannot be disabled as they are
                required for the site to function properly.
              </p>

              {/* Essential */}
              <div className={styles.cookieRow}>
                <div className={styles.cookieInfo}>
                  <h3 className={styles.cookieName}>Essential Cookies</h3>
                  <p className={styles.cookieDesc}>
                    Required for the website to function. These include authentication, security, and basic functionality.
                  </p>
                </div>
                <label className={`${styles.toggle} ${styles.toggleDisabled}`}>
                  <input type="checkbox" checked disabled />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>Always on</span>
                </label>
              </div>

              {/* Functional */}
              <div className={styles.cookieRow}>
                <div className={styles.cookieInfo}>
                  <h3 className={styles.cookieName}>Functional Cookies</h3>
                  <p className={styles.cookieDesc}>
                    Enable personalised features such as saved preferences, recent searches, and layout settings.
                  </p>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={functional}
                    onChange={e => setFunctional(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              {/* Analytics */}
              <div className={styles.cookieRow}>
                <div className={styles.cookieInfo}>
                  <h3 className={styles.cookieName}>Analytics Cookies</h3>
                  <p className={styles.cookieDesc}>
                    Help us understand how visitors use the site so we can improve it. Data is anonymised.
                  </p>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={e => setAnalytics(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button onClick={handleSavePreferences} className={styles.saveBtn}>
                Save Preferences
              </button>
              <button onClick={handleAcceptAll} className={styles.acceptAllBtn}>
                Accept All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
