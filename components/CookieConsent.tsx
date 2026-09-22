'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  getCookieConsent,
  setCookieConsent,
  acceptAllCookies,
  rejectNonEssentialCookies,
  clearNonEssentialCookies,
  type CookieConsent as CookieConsentType,
} from '@/lib/cookies'
import { captureFirstTouch } from '@/lib/firstTouch'
import styles from './CookieConsent.module.css'

export default function CookieConsent() {
  const bannerRef = useRef<HTMLDivElement>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [functional, setFunctional] = useState(true)

  useEffect(() => {
    const consent = getCookieConsent()
    if (!consent) {
      setShowBanner(true)
    } else {
      setFunctional(consent.functional)
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

  // ACCEPT IS ALSO THE MOMENT WE CAPTURE.
  //
  // Nothing optional was stored before this — the gate in lib/cookies treats
  // undecided as no. So the tagged URL and the referrer the visitor arrived on
  // are still right here in the browser, and this is the only point at which
  // capturing them is both possible and permitted. Capture on mount instead
  // and every tagged arrival is thrown away before anyone can agree to it.
  const handleAcceptAll = useCallback(() => {
    acceptAllCookies()
    captureFirstTouch()
    setFunctional(true)
    setShowBanner(false)
    setShowModal(false)
  }, [])

  // DECLINE DELETES AS WELL AS REFUSING. `thrive_country` may already be on the
  // browser from an earlier request — it is set at the edge — and a refusal
  // that leaves it there is not a refusal.
  const handleRejectAll = useCallback(() => {
    rejectNonEssentialCookies()
    setFunctional(false)
    setShowBanner(false)
    setShowModal(false)
  }, [])

  const handleSavePreferences = useCallback(() => {
    const consent: CookieConsentType = { essential: true, functional }
    setCookieConsent(consent)
    if (functional) captureFirstTouch()
    else clearNonEssentialCookies()
    setShowBanner(false)
    setShowModal(false)
  }, [functional])

  const handleOpenPreferences = useCallback(() => {
    const consent = getCookieConsent()
    if (consent) {
      setFunctional(consent.functional)
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
                <strong>We do not track you.</strong> Thrive sets no advertising cookies and no
                third-party cookies — every cookie here is set by this site and read only by us.
                Essential ones keep you signed in. Optional ones remember your country, your
                timezone, and which Thrive link brought you here.{' '}
                <button onClick={handleOpenPreferences} className={styles.bannerLinkBtn}>
                  See what we set
                </button>
                {' · '}
                <Link href="/privacy-policy" className={styles.bannerLink}>Privacy policy</Link>
              </p>
            </div>
            <div className={styles.bannerActions}>
              {/* DECLINE COSTS THE SAME AS ACCEPT — one tap, same row, same
                  weight of control. It used to take three: Manage Preferences,
                  a toggle, then Save. */}
              <button onClick={handleRejectAll} className={styles.manageBtn}>
                Decline optional
              </button>
              <button onClick={handleAcceptAll} className={styles.acceptBtn}>
                Accept
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
                <strong>We do not track users.</strong> Thrive sets no advertising cookies, no
                third-party cookies and no analytics cookies, and shares nothing with advertisers
                or data brokers. Every cookie below is set by this site and read only by us. This
                is the complete list.
              </p>

              {/* Essential */}
              <div className={styles.cookieRow}>
                <div className={styles.cookieInfo}>
                  <h3 className={styles.cookieName}>Essential</h3>
                  <p className={styles.cookieDesc}>
                    Needed for the site to work at all. Without these you cannot stay signed in.
                  </p>
                  <ul className={styles.cookieList}>
                    <li><code>sb-…-auth-token</code> — keeps you signed in</li>
                    <li><code>hex_session_started</code> — marks that a browsing session has begun</li>
                    <li><code>hex_cookie_consent</code> — this choice, so we stop asking</li>
                  </ul>
                </div>
                <label className={`${styles.toggle} ${styles.toggleDisabled}`}>
                  <input type="checkbox" checked disabled />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>Always on</span>
                </label>
              </div>

              {/* Optional — the only real choice on this panel, and it is wired.
                  There is no Analytics row any more: no analytics cookie has
                  ever been set on this site, so the toggle controlled nothing. */}
              <div className={styles.cookieRow}>
                <div className={styles.cookieInfo}>
                  <h3 className={styles.cookieName}>Optional</h3>
                  <p className={styles.cookieDesc}>
                    Help us see which of our own job posts bring people here, and show times and
                    places correctly. Never shared with anyone.
                  </p>
                  <ul className={styles.cookieList}>
                    <li><code>thrive_country</code> — the two-letter country your connection came from</li>
                    <li><code>thrive_tz</code> — your timezone, so times read correctly</li>
                    <li><code>thrive_attr</code> — which Thrive link you followed, e.g. <code>li</code> for LinkedIn</li>
                  </ul>
                  <p className={styles.cookieDesc}>
                    Turn this off and none of the three are stored. Any already on your browser are
                    deleted when you save.
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
            </div>

            <div className={styles.modalFooter}>
              <button onClick={handleSavePreferences} className={styles.saveBtn}>
                Save
              </button>
              <button onClick={handleAcceptAll} className={styles.acceptAllBtn}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
