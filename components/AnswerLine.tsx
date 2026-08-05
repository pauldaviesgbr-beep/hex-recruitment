'use client'

import Link from 'next/link'
import styles from './AnswerLine.module.css'

// The one line at the top of a dashboard that answers its question.
//
// It replaces five blocks of chrome with one sentence generated from state.
// The employer's question is "what needs me today"; the candidate's is "what do
// I do next". Neither page answered its own question above the fold.
//
// PRESENTATION ONLY. It takes a resolved sentence and renders it. The deciding
// lives in lib/answerLine.ts, so the sentence table can be read, reasoned about
// and tested without a browser — and so the candidate side can reuse this
// component with a different table, which is what makes build item 4 cheap.

export interface AnswerLineModel {
  /** Small mono label above the sentence — "TODAY", or a relative time. */
  eyebrow: string
  /** The sentence itself. Already assembled; this component never composes copy. */
  sentence: string
  /**
   * Omitted entirely for the quiet states — silence is a legitimate answer.
   *
   * `href` navigates; `onClick` acts on the page you are already on. The
   * candidates line needs the second kind: its action applies a filter this
   * page already has ("Show the 10 with a CV"), because the sentence it
   * belongs to is about the 10 rather than the 21. It replaced "Message the
   * 10", which was a control with nothing behind it — bulk messaging does not
   * exist, and /messages takes one participant.
   */
  action?: { label: string; href?: string; onClick?: () => void }
}

export default function AnswerLine({ model }: { model: AnswerLineModel | null }) {
  // Never render an empty shell. The tables have catch-all rows so null should
  // be impossible, but a component that draws a yellow-bordered card around
  // nothing is worse than one that draws nothing.
  if (!model || !model.sentence) return null

  return (
    <section className={styles.answerLine} aria-label="What needs you today">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{model.eyebrow}</p>
        <p className={styles.sentence}>{model.sentence}</p>
      </div>
      {model.action?.href && (
        <Link href={model.action.href} className={styles.action}>
          {model.action.label}
        </Link>
      )}
      {model.action && !model.action.href && model.action.onClick && (
        <button type="button" className={styles.action} onClick={model.action.onClick}>
          {model.action.label}
        </button>
      )}
    </section>
  )
}
