import SwiftUI
import Combine
import AuthenticationServices

// THE NATIVE SIGN-IN SHEET (design G2–G6, third addendum).
//
// Native to look at, website underneath. Nothing here signs anybody in:
//   - Apple, Google, LinkedIn: store.startProvider loads the website's login
//     page hidden behind the app with ?native_start=<provider>, and the page
//     presses its own, proven button. The system browser sheet then opens.
//   - Email: store.callAuth runs window.thriveAuth.* on the hidden page
//     (components/NativeAuthBridge.tsx), which uses the website's own Supabase
//     client and its own error wording (lib/loginErrors.ts).
// When the session cookie appears, the root closes this sheet and finishes
// whatever was waiting (a save, or Apply).

struct SignInSheet: View {
    @ObservedObject var store: ThriveStore
    let close: () -> Void

    enum Mode: Equatable { case signIn, signUp, checkEmail(String), unconfirmed(String) }
    @State private var mode: Mode = .signIn

    @State private var email = ""
    @State private var password = ""
    @State private var fullName = ""
    @State private var showPassword = false

    @State private var busy: String?            // "apple" | "google" | "linkedin_oidc" | "email"
    @State private var panel: String?           // the generic warning panel at the top
    @State private var fieldError: (field: String, message: String)?
    @State private var showResetOffer = false
    @State private var resetSent = false
    @State private var resendWait = 0
    @FocusState private var focus: Field?
    enum Field { case name, email, password }

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let p = panel {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "exclamationmark.triangle").foregroundColor(TC.warning)
                            Text(p).font(.inter(16)).foregroundColor(TC.navy).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(red: 1, green: 247/255, blue: 230/255))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(red: 243/255, green: 209/255, blue: 156/255), lineWidth: 1))
                        .cornerRadius(14)
                    }
                    switch mode {
                    case .signIn: signInForm
                    case .signUp: signUpForm
                    case .checkEmail(let e): checkEmail(e, afterSignUp: true)
                    case .unconfirmed(let e): checkEmail(e, afterSignUp: false)
                    }
                }
                .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 32)
                .frame(maxWidth: 540)
                .frame(maxWidth: .infinity)
            }
            .background(Color.white)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if mode == .signIn { Button("Cancel") { close() } }
                    else { Button("Back") { panel = nil; fieldError = nil; mode = .signIn } }
                }
            }
        }
        .onReceive(store.$providerOutcome) { outcome in
            guard let outcome = outcome else { return }
            busy = nil
            if outcome.how != "cancelled" {
                panel = outcome.message ?? "Sign-in didn't complete. Please try again."
            }
            store.providerOutcome = nil
        }
        .onReceive(timer) { _ in if resendWait > 0 { resendWait -= 1 } }
    }

    private var title: String {
        switch mode {
        case .signIn: return "Sign in to Thrive"
        case .signUp: return "Create an account"
        case .checkEmail: return "Check your email"
        case .unconfirmed: return "Confirm your email first"
        }
    }

    // MARK: - G2

    private var signInForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            AppleButton { startProvider("apple") }
                .frame(height: 52).cornerRadius(14)
                .disabled(busy != nil)
            providerButton("Continue with Google", image: "GoogleG", provider: "google")
            providerButton("Continue with LinkedIn", image: "LinkedInMark", provider: "linkedin_oidc")

            HStack(spacing: 12) {
                Rectangle().fill(TC.border).frame(height: 1)
                Text("or with email").font(.inter(16)).foregroundColor(TC.muted).fixedSize()
                Rectangle().fill(TC.border).frame(height: 1)
            }.padding(.vertical, 6)

            label("Email")
            field("you@example.com", text: $email, focus: .email, keyboard: .emailAddress, content: .username)
            label("Password")
            secureField($password, content: .password)
            if let fe = fieldError, fe.field == "password" { errorLine(fe.message) }
            if showResetOffer {
                if resetSent {
                    Text("Sent. Check \(email) for a link to reset your password.")
                        .font(.inter(16)).foregroundColor(TC.ink2)
                } else {
                    OutlineButton(title: "Email me a link to reset it") { sendReset() }
                }
            }

            PrimaryButton(title: busy == "email" ? "Signing in…" : "Sign in") { signInWithEmail() }
                .disabled(busy != nil)
                .padding(.top, 4)

            HStack {
                Button("Forgot password?") {
                    fieldError = nil
                    showResetOffer = true
                    resetSent = false
                }
                .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
                Spacer()
                Button("Create an account") { panel = nil; fieldError = nil; mode = .signUp }
                    .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
            }
        }
    }

    private func providerButton(_ title: String, image: String, provider: String) -> some View {
        Button { startProvider(provider) } label: {
            HStack(spacing: 10) {
                Image(image).resizable().frame(width: 20, height: 20)
                Text(busy == provider ? "Opening…" : title).font(.inter(17, .semibold)).foregroundColor(TC.navy)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(TC.navy, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(busy != nil)
    }

    private func startProvider(_ provider: String) {
        guard store.online else { panel = "Signing in needs signal."; return }
        panel = nil
        busy = provider
        store.startProvider(provider)
    }

    private func signInWithEmail() {
        guard store.online else { panel = "Signing in needs signal."; return }
        panel = nil; fieldError = nil; showResetOffer = false
        let e = email.trimmingCharacters(in: .whitespaces)
        guard !e.isEmpty, !password.isEmpty else { fieldError = ("password", "Enter your email and password."); return }
        busy = "email"
        store.callAuth("password", ["email": e, "password": password]) { answer in
            busy = nil
            guard let answer = answer else { panel = "Sign-in didn't complete. Please try again."; return }
            if answer["ok"] as? Bool == true { return } // the root closes the sheet when the session appears
            let kind = answer["kind"] as? String ?? "unknown"
            let message = answer["message"] as? String ?? "Sign-in didn't complete. Please try again."
            switch kind {
            case "unconfirmed":                               // G4
                mode = .unconfirmed(e)
            case "wrong-password":                            // G3
                password = ""
                fieldError = ("password", message)
                showResetOffer = true
                resetSent = false
                focus = .password
            case "rate-limited":
                fieldError = ("password", message)
                showResetOffer = true
            default:
                panel = message
            }
        }
    }

    private func sendReset() {
        let e = email.trimmingCharacters(in: .whitespaces)
        guard !e.isEmpty else { fieldError = ("password", "Enter your email above first."); return }
        store.callAuth("reset", ["email": e]) { answer in
            if answer?["ok"] as? Bool == true { resetSent = true }
            else { panel = "That didn't send. Please try again." }
        }
    }

    // MARK: - G5

    private var signUpForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            label("Full name")
            field("", text: $fullName, focus: .name, keyboard: .default, content: .name)
            if let fe = fieldError, fe.field == "name" { errorLine(fe.message) }
            label("Email")
            field("you@example.com", text: $email, focus: .email, keyboard: .emailAddress, content: .username)
            if let fe = fieldError, fe.field == "email" { errorLine(fe.message) }
            if let fe = fieldError, fe.field == "exists" {
                errorLine(fe.message)
                OutlineButton(title: "Sign in instead") { fieldError = nil; password = ""; mode = .signIn }
            }
            label("Password")
            secureField($password, content: .newPassword)
            Text("At least 8 characters.").font(.inter(16)).foregroundColor(TC.muted)
            if let fe = fieldError, fe.field == "password" { errorLine(fe.message) }

            PrimaryButton(title: busy == "email" ? "Creating your account…" : "Create account") { signUp() }
                .disabled(busy != nil).padding(.top, 4)

            HStack(spacing: 0) {
                Text("By creating an account you agree to our ").font(.inter(16)).foregroundColor(TC.ink2)
            }
            HStack(spacing: 12) {
                Button("Terms") { close(); store.openWeb("/terms", "Jobs") }
                Button("Privacy policy") { close(); store.openWeb("/privacy-policy", "Jobs") }
            }
            .font(.inter(16, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
        }
    }

    private func signUp() {
        guard store.online else { panel = "Creating an account needs signal."; return }
        panel = nil; fieldError = nil
        busy = "email"
        let e = email.trimmingCharacters(in: .whitespaces)
        store.callAuth("signUp", ["fullName": fullName, "email": e, "password": password, "returnPath": ""]) { answer in
            busy = nil
            guard let answer = answer else { panel = "That didn't go through. Please try again."; return }
            if answer["ok"] as? Bool == true { password = ""; mode = .checkEmail(e); return }
            let field = answer["field"] as? String ?? "general"
            let message = answer["message"] as? String ?? "Something went wrong. Please try again."
            if field == "general" { panel = message } else { fieldError = (field, message) }
        }
    }

    // MARK: - G4 and G6

    private func checkEmail(_ e: String, afterSignUp: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if afterSignUp {
                Text("We sent a link to \(e).").font(.inter(17)).foregroundColor(TC.navy)
                Text("1. Open it on this \(ThriveDates.deviceWord). It opens in Safari and confirms your account.")
                    .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                Text("2. Come back to Thrive and sign in.")
                    .font(.inter(16)).foregroundColor(TC.ink2)
            } else {
                Text("We sent a link to \(e). Open it, then come back here and sign in.")
                    .font(.inter(17)).foregroundColor(TC.navy).fixedSize(horizontal: false, vertical: true)
            }
            PrimaryButton(title: "Open Mail") {
                if let url = URL(string: "message://") { UIApplication.shared.open(url) }
            }
            if afterSignUp {
                OutlineButton(title: "I've confirmed it. Sign in") { email = e; mode = .signIn; focus = .password }
            }
            Button(resendWait > 0 ? "Sent. You can send another in 0:\(String(format: "%02d", resendWait))" : "Send the link again") {
                guard resendWait == 0 else { return }
                store.callAuth("resend", ["email": e, "returnPath": ""]) { answer in
                    if answer?["ok"] as? Bool == true { resendWait = 45 }
                    else { panel = "That didn't send. Please try again." }
                }
            }
            .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
            .disabled(resendWait > 0)
            if !afterSignUp {
                Button("Use a different email") { email = ""; password = ""; mode = .signIn; focus = .email }
                    .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
            }
        }
    }

    // MARK: - Pieces

    private func label(_ s: String) -> some View {
        Text(s).font(.inter(17, .semibold)).foregroundColor(TC.navy).padding(.top, 4)
    }

    private func errorLine(_ s: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.circle").foregroundColor(TC.warning)
            Text(s).font(.inter(16)).foregroundColor(TC.warning).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func field(_ placeholder: String, text: Binding<String>, focus f: Field, keyboard: UIKeyboardType, content: UITextContentType) -> some View {
        TextField(placeholder, text: text)
            .font(.inter(17))
            .keyboardType(keyboard)
            .textContentType(content)
            .textInputAutocapitalization(f == .name ? .words : .never)
            .disableAutocorrection(true)
            .focused($focus, equals: f)
            .padding(.horizontal, 14).frame(minHeight: 52)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(TC.border, lineWidth: 1))
    }

    private func secureField(_ text: Binding<String>, content: UITextContentType) -> some View {
        HStack(spacing: 0) {
            Group {
                if showPassword { TextField("", text: text) } else { SecureField("", text: text) }
            }
            .font(.inter(17))
            .textContentType(content)
            .textInputAutocapitalization(.never)
            .disableAutocorrection(true)
            .focused($focus, equals: .password)
            Button { showPassword.toggle() } label: {
                Image(systemName: showPassword ? "eye.slash" : "eye").foregroundColor(TC.muted).frame(width: 44, height: 44)
            }
            .accessibilityLabel(showPassword ? "Hide password" : "Show password")
        }
        .padding(.leading, 14).frame(minHeight: 52)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(TC.border, lineWidth: 1))
    }
}

/// Apple's own button, as Apple requires: drawn by the system, never by us.
struct AppleButton: UIViewRepresentable {
    let action: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(action: action) }
    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let b = ASAuthorizationAppleIDButton(authorizationButtonType: .continue, authorizationButtonStyle: .black)
        b.cornerRadius = 14
        b.addTarget(context.coordinator, action: #selector(Coordinator.tap), for: .touchUpInside)
        return b
    }
    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {}
    final class Coordinator: NSObject {
        let action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func tap() { action() }
    }
}

/// G9: an account tab, signed out.
struct SignedOutTab: View {
    @ObservedObject var store: ThriveStore
    let title: String
    let symbol: String
    let heading: String
    let message: String

    var body: some View {
        VStack(spacing: 0) {
            NavyTitleBand(title: title) { SignInTopButton(store: store, onNavy: true) }
            ScrollView {
                EmptyState(symbol: symbol, heading: heading, message: message) {
                    PrimaryButton(title: "Sign in or create an account") { store.requireSignIn() }
                    OutlineButton(title: store.jobs.isEmpty ? "Browse jobs" : "Browse \(store.jobs.count) jobs") { store.selectTab(0) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(TC.page)
    }
}

/// The "Sign in" text button where the bell goes (G1, G9).
struct SignInTopButton: View {
    @ObservedObject var store: ThriveStore
    /// White on the navy bars.
    var onNavy = false
    var body: some View {
        Button("Sign in") { store.requireSignIn() }
            .font(.inter(17, .semibold)).foregroundColor(onNavy ? .white : TC.navy)
            .frame(minWidth: 44, minHeight: 44)
    }
}

/// G1: the prompt card where For you would be.
struct SignedOutPromptCard: View {
    @ObservedObject var store: ThriveStore
    var body: some View {
        // Half the height it was: on a phone the full card pushed the jobs
        // below the fold for every signed-out visitor, a reviewer included.
        VStack(alignment: .leading, spacing: 10) {
            Text("Save jobs and apply in a minute").font(.inter(17, .semibold)).foregroundColor(TC.navy)
            PrimaryButton(title: "Sign in or create an account", height: 44) { store.requireSignIn() }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white).cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.navy, lineWidth: 1.5))
        .padding(.horizontal, 16).padding(.bottom, 10)
    }
}
