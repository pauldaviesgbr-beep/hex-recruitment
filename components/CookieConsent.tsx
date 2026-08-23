'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  getCookieConsent,
  setCookieConsent,
  acceptAllCookies,
  type CookieConsent as CookieConsentType,
} from '@/lib/cookies'
import styles from './CookieConsent.module.css'

export default function CookieConsent() {
  const bannerRef = useRef<HTMLDivElement>(null)
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

  /**
   * THE LANE IS RESERVED, NOT OVERLAID — and this variable is how.
   *
   * This banner has now covered the Apply button on a job post (which cost
   * Javier Salido his application on 13 Aug 2026) and the password field on
   * the apply gate. BOTH WERE FIXED BY MOVING THE CONTROL, which is the wrong
   * fix: it leaves the next new screen to break the same way, and it did.
   *
   * So the page shell reserves the space instead. `--consent-h` is 88px on a
   * phone and 72px on desktop while the banner is unanswered, and 0 the
   * moment it is not — set on <html> because that is the one element every
   * page already has, and read by a single padding-bottom in globals.css.
   *
   * NEVER A MARGIN ON THE LAST ELEMENT. That is the version of this fix that
   * looks identical and breaks on the next page somebody adds.
   */
  useEffect(() => {
    const root = document.documentElement
    if (!showBanner) { root.style.setProperty('--consent-h', '0px'); return }
    const el = bannerRef.current
    if (!el) return
    // MEASURE THE BOX, DO NOT RESTATE IT. This published '88px' on a phone
    // while the box actually drew taller than its content could fit — the copy
    // ran out of the top of the navy and the buttons were cut off below the
    // fold, with fifteen assertions green. A number in the CSS is not the
    // number on the screen, and the only way the two cannot disagree is for
    // there to be one number: the rendered one.
    const set = () => root.style.setProperty('--consent-h', Math.ceil(el.getBoundingClientRect().height) + 'px')
    set()
    // ResizeObserver rather than a resize listener: the box also changes when
    // the COPY rewraps, which no window event reports.
    const ro = new ResizeObserver(set)
    ro.observe(el)
    window.addEventListener('resize', set)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', set)
      // Unmounting with the lane still reserved would leave a dead gap at the
      // foot of every page.
      root.style.setProperty('--consent-h', '0px')
    }
  }, [showBanner])

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
        <div ref={bannerRef} className={styles.banner} role="dialog" aria-label="Cookie consent" data-cookie-banner>
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
