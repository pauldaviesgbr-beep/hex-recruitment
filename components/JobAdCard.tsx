'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Ico } from '@/components/icons'
import styles from './JobAdCard.module.css'

// THE EMPLOYER'S ADVERT CARD.
//
// WEIGHT TRACKS HOW MUCH THE ADVERT NEEDS YOU. A live advert with people
// waiting is the loudest thing on the page; a filled one is the quietest.
// The first review instinct is to make the three states match "for
// consistency" -- THE INCONSISTENCY IS THE DESIGN, and it is the whole reason
// this card exists rather than a status pill on a uniform row.
//
// IT IS NOT THE BOARD'S FeedCard, AND THAT IS A REVERSAL. This page used to
// render the same photographic card a candidate sees, so the employer could
// check their own advert without opening the public page. Good reason, wrong
// trade: a photo card is 320px of picture before the first word, and the
// questions an employer actually has -- is it live, is anybody waiting, how do
// I change it -- were all below the fold or behind a kebab. The public view is
// one tap away on `View`, which is where a preview belongs.
//
// "EDIT" APPEARS NOWHERE IN THE PRODUCT TODAY. That is the finding the action
// bar answers: employers believed they could not change a posted advert,
// because the only route to it was labelled with three dots. If a menu item is
// one of the two things employers do most, it belongs in the bar.
//
// DOM ORDER IS title -> attention -> Edit ad -> View -> kebab, deliberately.
// The kebab paints top-right but comes last for a keyboard user, because it
// holds the destructive items and nobody should tab through Archive to reach
// View.

export type JobAdState = 'live' | 'filled' | 'archived'

export interface JobAdCardModel {
  id: string
  title: string
  /** Which tab this advert belongs to. Exactly one, always -- see tabOf(). */
  state: JobAdState
  /** LIVE / PAUSED / CLOSED / FILLED / ARCHIVED. Never a pill. */
  statusWord: string
  /**
   * The one time-critical fact, or nothing.
   *
   * ONLY EVER SET WHEN IT IS TRUE OF THIS ADVERT. A countdown is a claim, and
   * the expiry cron excludes recruiter postings -- so "3 DAYS LEFT" on an
   * advert that nothing will ever expire is a false statement to the person
   * who owns it. The list computes this; the card only prints it.
   */
  statusDetail?: string
  site?: string
  pay?: string
  contract?: string
  /** Applicant state IN WORDS. "No applicants yet", not "0 ->". */
  applicantLine: string
  /** Drives the attention strip. Zero means no strip at all. */
  newApplicants: number
}

interface Props {
  model: JobAdCardModel
  /** The title and the attention strip both lead here. */
  onOpen: () => void
  onEdit: () => void
  onReuse: () => void
  /** Rendered into the card's own corner; kept last in DOM order. */
  kebab?: ReactNode
}

export default function JobAdCard({ model: m, onOpen, onEdit, onReuse, kebab }: Props) {
  const live = m.state === 'live'
  const waiting = m.newApplicants > 0
  const detail = m.statusDetail ? ' · ' + m.statusDetail : ''

  return (
    // data-job-id IS FOR THE CHECK, AND IT IS THERE ON PURPOSE.
    // The three tabs are meant to PARTITION the adverts -- every one on
    // exactly one tab, none on two, none missing. That property cannot be
    // asserted from counts alone, because a badge and a list can agree with
    // each other while both being wrong about the same advert. Comparing
    // titles would work until two roles share a name, which on this board is
    // forty Chefs de Partie. An id is the only thing that cannot collide.
    <article className={styles.card} data-state={m.state} data-job-id={m.id}>
      <div className={styles.body}>
        <p className={styles.status} data-live={live || undefined}>
          <span className={styles.dot} aria-hidden="true" />
          {m.statusWord}{detail}
        </p>

        {/* WRAPS, NEVER TRUNCATES -- in every state, filled included.
            And deliberately NOT clamped to two lines either: this board's
            longest roles need three, and a clamp cuts the word "Manager" off
            the end of "Assistant Food & Beverage Operations Manager", which is
            precisely the identity loss the rule exists to prevent. Two lines is
            what nearly all of them take, not a ceiling imposed on the rest. */}
        <h3 className={styles.title}>
          <button type="button" className={styles.titleBtn} onClick={onOpen}>
            {m.title}
          </button>
        </h3>

        <p className={styles.meta}>
          {[m.site, m.pay, m.contract].filter(Boolean).join(' · ')}
        </p>
        <p className={styles.applicants}>{m.applicantLine}</p>

        {waiting && (
          <button type="button" className={styles.attn} onClick={onOpen}>
            <span className={styles.attnLead}>
              {m.newApplicants} new applicant{m.newApplicants === 1 ? '' : 's'}
            </span>
            <span className={styles.attnGo}>
              Review <Ico name="chevron-right" size={16} />
            </span>
          </button>
        )}
      </div>

      {/* ONE BAR, TWO CELLS, A HAIRLINE BETWEEN. The card is overflow:hidden so
          the bar meets the corners -- which is also why the kebab's menu cannot
          live inside this element and is layered over it by the list. */}
      {live ? (
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={onEdit}>
            <Ico name="pencil" size={16} /> Edit ad
          </button>
          <Link href={`/job/${m.id}?from=my-jobs`} className={styles.action}>
            <Ico name="eye" size={16} /> View
          </Link>
        </div>
      ) : (
        <div className={styles.actions} data-single="true">
          <button type="button" className={styles.action} onClick={onReuse}>
            <Ico name="copy" size={16} /> Reuse
          </button>
        </div>
      )}

      {kebab && <div className={styles.kebabSlot}>{kebab}</div>}
    </article>
  )
}
