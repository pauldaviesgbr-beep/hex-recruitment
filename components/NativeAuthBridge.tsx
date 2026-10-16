'use client'

// THE iOS APP'S SIGN-IN SHEET, EMAIL HALF (design G2–G6).
//
// The sheet is native, but the signing in is not. It calls these functions on
// the hidden web page through WKWebView's callAsyncJavaScript, so the session
// is created by the same Supabase client as the website, in the same cookie,
// and the app goes on only ever READING it (ios/App/App/ThriveSession.swift).
// Nothing here exists outside the app: the functions are attached only when
// isNativeApp() is true.
//
// Every answer is the website's own wording: lib/loginErrors.ts for sign-in,
// lib/candidateSignup.ts for sign-up. Results carry no token and no password.
//
// Provider sign-ins (Apple, Google, LinkedIn) do not come through here: the
// sheet loads /login?native_start=<provider> and the login page presses its
// own button (components/LoginPanel.tsx).

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isNativeApp } from '@/lib/nativeShell'
import { loginErrorCopy } from '@/lib/loginErrors'
import { setPendingConfirm, clearPendingConfirm } from '@/lib/pendingConfirm'
import { signUpCandidate, resendSignupEmail } from '@/lib/candidateSignup'
import { safeInternalPath } from '@/lib/safeRedirect'

type Answer = Record<string, unknown>

declare global {
  interface Window {
    thriveAuth?: {
      password: (email: string, password: string) => Promise<Answer>
      signUp: (fullName: string, email: string, password: string, returnPath?: string) => Promise<Answer>
      resend: (email: string, returnPath?: string) => Promise<Answer>
      reset: (email: string) => Promise<Answer>
    }
  }
}

export default function NativeAuthBridge() {
  useEffect(() => {
    if (!isNativeApp()) return
    window.thriveAuth = {
      // Same steps as LoginPanel's form: clear any stale local session so the
      // new one replaces it, sign in, and on "not confirmed" remember the email.
      async password(email, password) {
        try {
          await supabase.auth.signOut({ scope: 'local' })
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
          if (error) {
            const copy = loginErrorCopy(error.message)
            if (copy.kind === 'unconfirmed') setPendingConfirm(email.trim())
            return { ok: false, kind: copy.kind, message: copy.message }
          }
          clearPendingConfirm()
          return { ok: true }
        } catch {
          return { ok: false, kind: 'network', message: "Sign-in didn't complete. Please try again." }
        }
      },
      async signUp(fullName, email, password, returnPath) {
        const result = await signUpCandidate({ fullName, email, password, returnPath: safeInternalPath(returnPath) })
        return result.ok ? { ok: true } : { ok: false, field: result.field, message: result.message }
      },
      async resend(email, returnPath) {
        return { ok: await resendSignupEmail(email, safeInternalPath(returnPath)) }
      },
      // The same request /forgot-password makes.
      async reset(email) {
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
          return { ok: !error }
        } catch {
          return { ok: false }
        }
      },
    }
    return () => { delete window.thriveAuth }
  }, [])
  return null
}
