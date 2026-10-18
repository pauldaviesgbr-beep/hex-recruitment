import SwiftUI
import UIKit
import UserNotifications

// PUSH NOTIFICATIONS ON THE iPHONE (design C1–C4, S2).
//
// Two kinds only, both promised in S2: "Replies from employers" (a
// notifications row of type new_message, made by /api/notifications/notify
// 'message_sent') and "Changes to your applications". The server decides who
// is told and with what words; the dispatcher sends to device_tokens rows with
// platform 'ios' through APNs (lib/apns.ts).
//
// - Permission is asked only when the person taps a button for it (C1 after
//   an application, or Settings). Never at launch.
// - The device token goes to /api/push/register as this person; signing out
//   unregisters it first, so a shared phone stops getting someone else's.
// - A tap opens what the notification is about.

final class ThrivePush: NSObject, UNUserNotificationCenterDelegate {
    static let shared = ThrivePush()

    /// The APNs token, as hex, once iOS has given one.
    private(set) var deviceToken: String?
    /// Set by the root: the token arrived (or changed).
    var onToken: ((String) -> Void)?
    /// Set by the root: a notification was tapped. Held until the root is ready,
    /// because a tap can launch the app before anything is listening.
    var onTap: ((String) -> Void)? { didSet { if let link = pendingLink, let tap = onTap { pendingLink = nil; tap(link) } } }
    private var pendingLink: String?

    /// Called at launch: become the notification delegate, and refresh the
    /// token if permission was already given (tokens can change).
    func start() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().getNotificationSettings { s in
            guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func status(_ done: @escaping (UNAuthorizationStatus) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            DispatchQueue.main.async { done(s.authorizationStatus) }
        }
    }

    /// The system prompt (C2), only ever from a tap.
    func requestPermission(_ done: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async {
                if granted { UIApplication.shared.registerForRemoteNotifications() }
                done(granted)
            }
        }
    }

    func didRegister(_ token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        deviceToken = hex
        onToken?(hex)
    }

    // Shown while the app is open too: a reply arriving mid-browse is the
    // moment it matters most.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let link = response.notification.request.content.userInfo["link"] as? String ?? "/"
        DispatchQueue.main.async {
            if let tap = self.onTap { tap(link) } else { self.pendingLink = link }
        }
        completionHandler()
    }
}

// MARK: - Store: the server half

extension ThriveStore {
    /// Tell the server this iPhone can receive pushes for the signed-in person.
    func registerDeviceToken() {
        guard ThriveFeatures.pushReady, let device = ThrivePush.shared.deviceToken, let token = token(),
              let url = URL(string: "https://thrivecareer.co.uk/api/push/register") else { return }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["platform": "ios", "token": device])
        URLSession.shared.dataTask(with: req).resume()
    }

    /// Before signing out: this iPhone stops receiving this person's pushes.
    func unregisterDeviceToken() {
        guard let device = ThrivePush.shared.deviceToken, let token = token(),
              let url = URL(string: "https://thrivecareer.co.uk/api/push/unregister") else { return }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["token": device])
        URLSession.shared.dataTask(with: req).resume()
    }
}

// MARK: - C1: the ask, in context, after an application

/// Shown on Applications once there is something worth hearing about, and
/// only while iOS has never been asked. "Not now" hides it for good on this
/// iPhone; Settings › Notifications can still turn them on.
struct NotifyAskCard: View {
    @ObservedObject var store: ThriveStore
    @State private var status: UNAuthorizationStatus?
    @AppStorage("thrive.notifAskDismissed") private var dismissed = false

    var body: some View {
        Group {
            if ThriveFeatures.pushReady, status == .notDetermined, !dismissed {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Hear back straight away").font(.inter(17, .semibold)).foregroundColor(TC.navy)
                    Text("Get a notification when an employer replies or your application changes. Nothing else.")
                        .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        PrimaryButton(title: "Turn on", height: 46) {
                            ThrivePush.shared.requestPermission { _ in refresh() }
                        }
                        Button("Not now") { dismissed = true }
                            .font(.inter(17, .semibold)).foregroundColor(TC.navy)
                            .frame(minWidth: 100, minHeight: 46)
                    }
                }
                .padding(16)
                .background(Color.white).cornerRadius(16)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
                .padding(.horizontal, 16).padding(.top, 16)
            }
        }
        .onAppear(perform: refresh)
    }

    private func refresh() { ThrivePush.shared.status { status = $0 } }
}
