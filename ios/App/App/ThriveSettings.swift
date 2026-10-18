import SwiftUI
import UIKit
import UserNotifications

// NATIVE SETTINGS (design S1–S3), pushed from Profile.
//
// S1 lists the account (opening the website's own pages under the navy bar),
// Privacy, Delete account, and Sign out. S3 deletes through the website's own
// endpoint (/api/account/delete), with the website's own sentence and typed
// confirmation word, served by /api/app/me/settings from lib/accountDeletion
// so the app and the site cannot say different things.
//
// S2 (notifications) is built and NOT SHOWN: the app cannot receive a push
// until APNs is set up, and a switch for something that never arrives is the
// fault this codebase already removed twice (the marketing and analytics
// switches). The day push works, flip `pushReady`.

enum ThriveFeatures {
    static let pushReady = false
}

struct AppSettings: Codable, Equatable {
    struct Notifications: Codable, Equatable { var replies: Bool; var applications: Bool }
    struct Counts: Codable, Equatable { let savedJobs: Int?; let applications: Int?; let conversations: Int? }
    let email: String?
    let providers: [String]
    let hasPassword: Bool
    var notifications: Notifications
    let counts: Counts
    let deleteText: String
    let confirmWord: String
}

extension ThriveStore {
    func refreshSettings() {
        guard let token = token() else { settings = nil; return }
        ThriveAPI.get("/me/settings", token: token, as: AppSettings.self) { [weak self] r in
            switch r {
            case .success(let s): self?.settings = s; self?.settingsFailed = false
            case .failure: if self?.settings == nil { self?.settingsFailed = true }
            }
        }
    }

    func setPush(replies: Bool? = nil, applications: Bool? = nil, done: @escaping (Bool) -> Void) {
        guard let token = token() else { done(false); return }
        var body: [String: Any] = [:]
        if let r = replies { body["replies"] = r }
        if let a = applications { body["applications"] = a }
        ThriveAPI.send("PUT", "/me/notifications", token: token, json: body) { [weak self] r in
            if case .success = r { done(true); self?.refreshSettings() } else { done(false) }
        }
    }

    /// S3. The website's endpoint, as the person. Returns nil on success, or
    /// the sentence to show.
    func deleteAccount(confirm: String, done: @escaping (String?) -> Void) {
        guard let token = token(), let url = URL(string: "https://thrivecareer.co.uk/api/account/delete") else {
            done("Your session has ended. Sign in again, then try once more."); return
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["confirm": confirm])
        URLSession.shared.dataTask(with: req) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let body = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            DispatchQueue.main.async {
                if status == 200, body?["deleted"] as? Bool == true { done(nil); return }
                if error != nil { done("Deleting your account needs signal. Nothing has been deleted."); return }
                if status == 401 { done("Your session has ended. Sign in again, then try once more."); return }
                // The route's own sentences are written for people (each says
                // whether anything was deleted and who to contact).
                done((body?["error"] as? String) ?? "Something went wrong and your account has NOT been deleted. Please try again.")
            }
        }.resume()
    }
}

// MARK: - S1 Settings

struct SettingsScreen: View {
    @ObservedObject var store: ThriveStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmSignOut = false
    @State private var showDelete = false
    @State private var showNotifications = false
    @State private var pushAllowed: Bool?

    var body: some View {
        VStack(spacing: 0) {
            DetailTopBar(title: "Settings", backTitle: "Profile", back: { dismiss() }) { EmptyView() }
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if store.settings == nil && store.settingsFailed {
                        EmptyState(symbol: "exclamationmark.triangle", heading: "Settings didn't load",
                                   message: store.online ? "Thrive didn't answer. Try again in a moment."
                                                         : "Settings need signal.") {
                            PrimaryButton(title: "Try again") { store.refreshSettings() }
                        }
                    }

                    groupHeading("Account")
                    group {
                        settingsRow("Email", value: store.settings?.email) { web("/settings/account") }
                        rowDivider
                        settingsRow(store.settings?.hasPassword == false ? "Set a password" : "Password") { web("/settings/security") }
                        rowDivider
                        settingsRow("Signed in with", value: store.settings.map { $0.providers.joined(separator: ", ") }) { web("/settings/security") }
                    }

                    if ThriveFeatures.pushReady {
                        groupHeading("Notifications")
                        group {
                            settingsRow("Notifications", value: notificationsValue) { showNotifications = true }
                        }
                    }

                    groupHeading("Privacy")
                    group {
                        settingsRow("Privacy policy") { web("/privacy-policy") }
                        rowDivider
                        settingsRow("Delete account", subline: "Removes your profile, CVs and applications") { showDelete = true }
                    }

                    OutlineButton(title: "Sign out") { confirmSignOut = true }
                        .padding(.top, 20)
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
        }
        .background(TC.page.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            store.refreshSettings()
            UNUserNotificationCenter.current().getNotificationSettings { s in
                DispatchQueue.main.async { pushAllowed = s.authorizationStatus == .authorized || s.authorizationStatus == .provisional }
            }
        }
        .alert("Sign out?", isPresented: $confirmSignOut) {
            Button("Cancel", role: .cancel) {}
            Button("Sign out") { store.signOut(false) }
        } message: {
            Text("Saved jobs and applications are removed from this \(ThriveDates.deviceWord) until you sign in again.")
        }
        .navigationDestination(isPresented: $showDelete) { DeleteAccountScreen(store: store) }
        .navigationDestination(isPresented: $showNotifications) { NotificationSettingsScreen(store: store) }
    }

    private var notificationsValue: String? {
        guard pushAllowed == true, let n = store.settings?.notifications else { return pushAllowed == nil ? nil : "Off" }
        return (n.replies || n.applications) ? "On" : "Off"
    }

    private func web(_ path: String) { store.openWeb(path, "Settings") }
}

// MARK: - S2 Notifications (shown only once push works; see ThriveFeatures)

struct NotificationSettingsScreen: View {
    @ObservedObject var store: ThriveStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var allowed: Bool?
    @State private var replies = true
    @State private var applications = true
    @State private var failed = false

    var body: some View {
        VStack(spacing: 0) {
            DetailTopBar(title: "Notifications", backTitle: "Settings", back: { dismiss() }) { EmptyView() }
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if allowed == false {
                        // C3: not dead switches, a way to turn them on.
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Notifications are off").font(.inter(17, .semibold)).foregroundColor(TC.navy)
                            Text("Turn them on in iOS Settings to hear when an employer replies or your application changes.")
                                .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                            PrimaryButton(title: "Open Settings") { openIOSSettings() }
                        }
                        .padding(16).background(Color.white).cornerRadius(16)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
                    } else {
                        group {
                            toggleRow("Replies from employers", isOn: $replies) { v in save(replies: v) }
                            rowDivider
                            toggleRow("Changes to your applications", isOn: $applications) { v in save(applications: v) }
                        }
                        Text(failed ? "That didn't save. Check your signal and try again."
                                    : "We only send these two. They also appear under the bell, whatever you choose here.")
                            .font(.inter(15)).foregroundColor(failed ? TC.warning : TC.ink2)
                            .padding(.horizontal, 16).padding(.top, 4)
                    }
                    groupHeading("On this \(ThriveDates.deviceWord)")
                    group {
                        settingsRow("Allowed in iOS Settings", value: allowed.map { $0 ? "Yes" : "No" }) { openIOSSettings() }
                    }
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
        }
        .background(TC.page.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            check()
            if let n = store.settings?.notifications { replies = n.replies; applications = n.applications }
        }
        .onChange(of: phase) { p in if p == .active { check() } }   // back from iOS Settings
    }

    private func check() {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            DispatchQueue.main.async { allowed = s.authorizationStatus == .authorized || s.authorizationStatus == .provisional }
        }
    }

    private func save(replies r: Bool? = nil, applications a: Bool? = nil) {
        failed = false
        store.setPush(replies: r, applications: a) { ok in
            if !ok {
                failed = true
                if let r = r { replies = !r }
                if let a = a { applications = !a }
            }
        }
    }

    private func toggleRow(_ title: String, isOn: Binding<Bool>, changed: @escaping (Bool) -> Void) -> some View {
        Toggle(isOn: Binding(get: { isOn.wrappedValue }, set: { isOn.wrappedValue = $0; changed($0) })) {
            Text(title).font(.inter(17, .medium)).foregroundColor(TC.navy)
        }
        .tint(TC.navy)
        .padding(.horizontal, 16).frame(minHeight: 54)
    }
}

// MARK: - S3 Delete account

struct DeleteAccountScreen: View {
    @ObservedObject var store: ThriveStore
    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @State private var deleting = false
    @State private var error: String?

    /// systemRed and its text colour #D70015, used only here (design S3).
    private let red = Color(UIColor.systemRed)
    private let redText = Color(red: 215/255, green: 0, blue: 21/255)

    private var word: String { store.settings?.confirmWord ?? "DELETE" }
    private var matches: Bool { typed.trimmingCharacters(in: .whitespaces) == word }

    var body: some View {
        VStack(spacing: 0) {
            DetailTopBar(title: "Delete account", backTitle: "Settings", back: { dismiss() }) { EmptyView() }
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Delete your Thrive account?").font(.inter(28, .heavy)).tracking(-0.5)
                        .foregroundColor(TC.navy).fixedSize(horizontal: false, vertical: true)

                    if let s = store.settings {
                        let lines = countLines(s.counts)
                        if !lines.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("You have").font(.inter(17, .semibold)).foregroundColor(TC.navy)
                                ForEach(lines, id: \.self) { Text("· \($0)").font(.inter(17)).foregroundColor(TC.ink2) }
                            }
                            .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                            .background(TC.page).cornerRadius(14)
                        }
                        Text(s.deleteText).font(.inter(16)).foregroundColor(TC.ink2)
                            .lineSpacing(4).fixedSize(horizontal: false, vertical: true)

                        if store.online {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Type \(word) to confirm").font(.inter(16, .semibold)).foregroundColor(TC.navy)
                                TextField("", text: $typed)
                                    .font(.inter(17))
                                    .textInputAutocapitalization(.characters)
                                    .autocorrectionDisabled(true)
                                    .padding(.horizontal, 14).frame(minHeight: 50)
                                    .background(Color.white).cornerRadius(12)
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(red: 203/255, green: 210/255, blue: 220/255), lineWidth: 1))
                                    .accessibilityLabel("Type \(word) to confirm")
                            }
                            if let e = error {
                                Text(e).font(.inter(16, .medium)).foregroundColor(redText)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Button(action: delete) {
                                Text(deleting ? "Deleting…" : "Delete my account").font(.inter(17, .semibold))
                                    .foregroundColor(redText)
                                    .frame(maxWidth: .infinity, minHeight: 52)
                                    .background(Color.white)
                                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(red, lineWidth: 1.5))
                                    .opacity(matches && !deleting ? 1 : 0.45)
                            }
                            .buttonStyle(.plain)
                            .disabled(!matches || deleting)
                        } else {
                            Text("Deleting your account needs signal.").font(.inter(16, .semibold)).foregroundColor(TC.navy)
                                .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                                .background(TC.page).cornerRadius(14)
                        }
                        Button("Keep my account") { dismiss() }
                            .font(.inter(17, .semibold)).foregroundColor(TC.navy)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .disabled(deleting)
                    } else if store.settingsFailed {
                        EmptyState(symbol: "exclamationmark.triangle", heading: "This didn't load",
                                   message: store.online ? "Thrive didn't answer. Try again in a moment." : "Deleting your account needs signal.") {
                            PrimaryButton(title: "Try again") { store.refreshSettings() }
                        }
                    } else {
                        SkeletonCards()
                    }
                }
                .padding(20)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.white.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { store.refreshSettings() }
    }

    /// Only lines that are true: a count that could not be read is left out
    /// rather than shown as nothing, and a zero is not worth listing.
    private func countLines(_ c: AppSettings.Counts) -> [String] {
        func line(_ n: Int?, _ one: String, _ many: String) -> String? {
            guard let n = n, n > 0 else { return nil }
            return "\(n) \(n == 1 ? one : many)"
        }
        return [line(c.savedJobs, "saved job", "saved jobs"),
                line(c.applications, "application", "applications"),
                line(c.conversations, "conversation", "conversations")].compactMap { $0 }
    }

    private func delete() {
        guard matches, !deleting else { return }
        // The keyboard covered "Keep my account" and the result line.
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        deleting = true
        error = nil
        store.deleteAccount(confirm: typed.trimmingCharacters(in: .whitespaces)) { message in
            deleting = false
            if let m = message { error = m; return }
            // Signed out, back on Jobs, told it is done (design S3).
            store.signOut(true)
        }
    }
}

// MARK: - Shared rows

private func groupHeading(_ title: String) -> some View {
    Text(title).font(.inter(17, .semibold)).foregroundColor(TC.ink2)
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 2)
}

private func group<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    VStack(spacing: 0) { content() }
        .background(Color.white).cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
}

private var rowDivider: some View {
    Divider().background(TC.hairline).padding(.leading, 16)
}

private func settingsRow(_ title: String, value: String? = nil, subline: String? = nil,
                         action: @escaping () -> Void) -> some View {
    Button(action: action) {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.inter(17, .medium)).foregroundColor(TC.navy)
                if let s = subline { Text(s).font(.inter(15)).foregroundColor(TC.muted).fixedSize(horizontal: false, vertical: true) }
            }
            Spacer(minLength: 8)
            if let v = value, !v.isEmpty {
                Text(v).font(.inter(16)).foregroundColor(TC.muted).lineLimit(1).truncationMode(.middle)
            }
            Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundColor(TC.soft)
        }
        .padding(.horizontal, 16).padding(.vertical, 12).frame(minHeight: 54)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
}

private func openIOSSettings() {
    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
}
