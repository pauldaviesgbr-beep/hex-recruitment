// The polite update's words when an employer has not saved their own
// "rejected" template. One copy, read by the Decline box (components/
// DeclineModal) and by the server sender (lib/declineNotice), so the message
// an employer previews is the message the server sends.

export const DEFAULT_REJECTED_BODY = "Thank you for applying for the {{jobTitle}} role at {{companyName}}. Due to a high number of applications, we've decided not to move forward with yours at this time, as we don't feel your experience is quite the right match for what we're looking for. We genuinely appreciate the time you took to apply and wish you all the best in your search."

/** {{name}} substitution, safe in the browser (lib/customEmailTemplate is server-only). */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}
