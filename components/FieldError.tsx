'use client'

/**
 * The message, beside the field it names.
 *
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM FormError. Focusing the
 * offending field fixed the dead-button symptom — measured: the input lands in
 * the viewport with a focus ring — but the SENTENCE stayed off-screen in every
 * case driven, 189px above the window on /post-job and 1173px below it on
 * /temp-work/post. A screen reader was told, via the banner's role="alert". An
 * eye was not. This is the half that focus cannot do.
 *
 * IT IS CHEAP ONLY BECAUSE THE STATE ALREADY CARRIES THE FIELD. Putting the
 * message beside the field was costed at "30 forms' worth of state changes"
 * when every form held a single error string. The four long forms now keep the
 * field identity alongside the message, so this is one line per field.
 *
 * NO role="alert" HERE. The banner at the top already has one and still
 * renders — two live regions would announce the same sentence twice. This one
 * is for reading, and carries a stable id so the input can point at it with
 * aria-describedby.
 */
export default function FieldError({
  activeField,
  name,
  message,
  className,
  style,
}: {
  /** The field the current error is about, or null when there is no error. */
  activeField?: string | null
  /** The field this instance sits beside. */
  name: string
  message?: string | null
  className?: string
  style?: React.CSSProperties
}) {
  if (!message || activeField !== name) return null

  return (
    <p
      id={`${name}-error`}
      className={className}
      style={{
        margin: '0.35rem 0 0',
        fontSize: '0.8rem',
        lineHeight: 1.4,
        color: '#b91c1c',
        ...style,
      }}
    >
      {message}
    </p>
  )
}
