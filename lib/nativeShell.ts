/**
 * ARE WE INSIDE THE iOS SHELL? — the one definition, for every caller.
 *
 * It lived in lib/nativeOAuth, which is a 'use client' module that dynamically
 * imports the Capacitor plugins. lib/cookies needs the same answer, and
 * lib/cookies is also imported by middleware at the edge — so the question
 * moved here, into a module with no imports at all, and nativeOAuth re-exports
 * it. One definition; two callers cannot drift.
 *
 * WHY THE NATIVE BRIDGE AND NOT THE USER AGENT. Capacitor's native code
 * injects `window.Capacitor` into the webview before any page script runs, so
 * it is present in every build that has ever shipped. The `ThriveApp`
 * user-agent marker is not: it was added to capacitor.config AFTER build 10,
 * which is the binary under review, and a user agent is a claim anybody can
 * type anyway.
 *
 * Deliberately a `window` property read and NOT an import of
 * @capacitor/core, so the web bundle does not carry the runtime.
 *
 * Browser only. On the server it answers false, which is why nothing on the
 * server keys on it — the edge's own gate is "no consent cookie, no optional
 * cookie", and the app never records a consent.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    return Boolean(cap?.isNativePlatform?.())
  } catch {
    return false
  }
}
