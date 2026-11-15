// Rendered only inside ApplicantsView (a client component), so it is not a
// client entry of its own and takes function props.

// THE APPLICANT PAGE (design 24 section 4): "‹ Applicants", the name as the
// title, "job · stage · wait", a five-step progress line, the same next step
// and "Not a fit", then the CV summary and full CV, and "Message {first name}".
// Beside the list from 768 wide; on its own on a phone.
//
// Years of experience is deliberately NOT shown: it is 0 on most candidates
// because almost nobody is asked, and showing it would tell an employer they
// have no experience — a claim the data cannot support (CLAUDE.md).

import Link from 'next/link'
import SignedLink from '@/components/SignedLink'
import {
  NEXT_STEP, PROGRESS_STAGES, STAGE_LABEL, HIRED_NOTE, NOT_A_FIT_NOTE, NOT_A_FIT_PENDING_NOTE,
  daysWaiting, isListed, waitLabel,
} from '@/lib/applicantStages'
import { firstNameOf, type ApplicantRow } from './useApplicants'
import styles from './Applicants.module.css'

type Props = {
  row: ApplicantRow
  onNext: (r: ApplicantRow) => void
  onNotAFit: (r: ApplicantRow) => void
}

export default function ApplicantDetail({ row, onNext, onNotAFit }: Props) {
  const days = daysWaiting(row.stageEnteredAt)
  const step = isListed(row.stage) ? NEXT_STEP[row.stage] : null
  const at = (PROGRESS_STAGES as readonly string[]).indexOf(row.stage)
  const first = firstNameOf(row.name)

  return (
    <article className={styles.detail}>
      <Link href="/applied" scroll={false} className={styles.backLink}>‹ Applicants</Link>
      <h2 className={styles.detailTitle}>{row.name || 'Name not given'}</h2>
      <p className={styles.detailSub}>
        {[row.jobTitle, STAGE_LABEL[row.stage], isListed(row.stage) ? waitLabel(days) : null].filter(Boolean).join(' · ')}
      </p>

      {at >= 0 && (
        <ol className={styles.progress} aria-label="Progress">
          {PROGRESS_STAGES.map((s, i) => (
            <li key={s} className={styles.progressStep} aria-current={i === at ? 'step' : undefined}>
              <span className={`${styles.progressBar} ${i <= at ? styles.progressDone : ''}`} />
              <span className={`${styles.progressLabel} ${i === at ? styles.progressNow : ''}`}>{STAGE_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      )}

      {step && (
        <div className={styles.detailActions}>
          <button type="button" className={`${styles.nextBtn} ${styles.nextBtnWide}`} onClick={() => onNext(row)}>{step.label}</button>
          <button type="button" className={styles.notFitLink} onClick={() => onNotAFit(row)}>Not a fit</button>
        </div>
      )}
      {row.stage === 'hired' && <p className={styles.endNote}>{HIRED_NOTE}</p>}
      {row.stage === 'not_a_fit' && <p className={styles.endNote}>{row.noticeOwed ? NOT_A_FIT_PENDING_NOTE : NOT_A_FIT_NOTE}</p>}
      {row.stage === 'withdrawn' && <p className={styles.endNote}>They withdrew their application.</p>}

      <section className={styles.detailCard} aria-label="CV summary">
        <h3 className={styles.detailCardTitle}>CV summary</h3>
        <dl className={styles.facts}>
          {row.headline && (<><dt>Role</dt><dd>{row.headline}</dd></>)}
          {row.location && (<><dt>Based in</dt><dd>{row.location}</dd></>)}
          {row.availability && (<><dt>Available</dt><dd>{row.availability}</dd></>)}
        </dl>
        {row.bio && <p className={styles.bio}>{row.bio}</p>}
        {row.skills.length > 0 && (
          <ul className={styles.skills}>
            {row.skills.slice(0, 12).map(s => <li key={s}>{s}</li>)}
          </ul>
        )}
        {row.workHistory.length > 0 && (
          <ul className={styles.history}>
            {row.workHistory.slice(0, 4).map((w, i) => (
              <li key={i}>
                <strong>{w.role || 'Role not given'}</strong>
                {w.company ? ` · ${w.company}` : ''}
                {(w.start_date || w.end_date || w.current) && (
                  <span className={styles.historyDates}>
                    {' '}{[w.start_date, w.current ? 'now' : w.end_date].filter(Boolean).join(' – ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!row.headline && !row.location && !row.bio && row.skills.length === 0 && row.workHistory.length === 0 && (
          <p className={styles.muted}>They haven't filled in their profile yet.</p>
        )}
        {row.cvUrl ? (
          <SignedLink src={row.cvUrl} className={styles.cvLink}>Open full CV</SignedLink>
        ) : (
          <p className={styles.muted}>No CV attached.</p>
        )}
      </section>

      {row.coverLetter && (
        <section className={styles.detailCard} aria-label="Cover letter">
          <h3 className={styles.detailCardTitle}>Cover letter</h3>
          <p className={styles.bio}>{row.coverLetter}</p>
        </section>
      )}

      {row.screeningAnswers.length > 0 && (
        <section className={styles.detailCard} aria-label="Screening answers">
          <h3 className={styles.detailCardTitle}>Screening answers</h3>
          {row.screeningAnswers.map((a, i) => (
            <div key={a.questionId || i} className={styles.answer}>
              <p className={styles.answerQ}>{a.question}</p>
              <p>{a.answer}</p>
            </div>
          ))}
        </section>
      )}

      <Link href={`/messages?candidate=${row.candidateId}`} className={styles.messageBtn}>
        {first ? `Message ${first}` : 'Send a message'}
      </Link>
    </article>
  )
}
