import UIKit
import WebKit
import Capacitor

/// SPIKE ONLY — spike/ios-session-share. NOT FOR THE APP STORE.
///
/// The question this build answers, on a real iPhone, before any native
/// screen is built: can native code use the sign-in the web pages created?
///
/// Sign-in stays on the web page (Google, Apple, LinkedIn, email). All four
/// end in the same place: the `sb-<ref>-auth-token` cookie on our site, in
/// this web view's cookie store. So the native screens never sign anyone in;
/// they READ that session. This probe checks the three things only a device
/// can prove:
///   1. the cookie is visible to native code after each kind of sign-in;
///   2. a native, signed-in database call works with the token in it;
///   3. sign-out (the cookie disappearing) is seen by native code.
///
/// IT NEVER SHOWS, LOGS OR STORES A TOKEN. It reports names, counts, an
/// expiry time and a masked email. Native NEVER refreshes the session: only
/// the web page refreshes, because a one-time refresh token used by two
/// parties signs the person out (refresh_token_already_used).
class ThriveBridgeViewController: CAPBridgeViewController, WKHTTPCookieStoreObserver {

    // Supabase's PUBLISHABLE key: designed to ship inside apps, safe in a
    // public repository. The user's own token decides what they can read
    // (row-level security), exactly as on the website.
    private let supabaseURL = "https://aaljufxcniacfggqiuls.supabase.co"
    private let publishableKey = "sb_publishable_eOLOA-ObeY-w7Uu8nv-42Q_LBgyQc7O"
    private let cookiePrefix = "sb-aaljufxcniacfggqiuls-auth-token"

    private var lastCookieChange: Date?
    private var sessionSeenAtLastChange: Bool?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.configuration.websiteDataStore.httpCookieStore.add(self)
        addProbeButton()
    }

    // MARK: - The button (spike build only)

    private func addProbeButton() {
        let button = UIButton(type: .system)
        button.setTitle("Session test", for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
        button.backgroundColor = UIColor(red: 1.0, green: 0.898, blue: 0.0, alpha: 1.0)
        button.setTitleColor(UIColor(red: 0.059, green: 0.090, blue: 0.165, alpha: 1.0), for: .normal)
        button.layer.cornerRadius = 22
        button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 18, bottom: 0, right: 18)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(runProbe), for: .touchUpInside)
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.heightAnchor.constraint(equalToConstant: 44),
            button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            button.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -90),
        ])
    }

    // MARK: - Sign-out detection

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        cookieStore.getAllCookies { [weak self] cookies in
            guard let self = self else { return }
            let present = !self.sessionCookies(cookies).isEmpty
            DispatchQueue.main.async {
                self.lastCookieChange = Date()
                self.sessionSeenAtLastChange = present
            }
        }
    }

    // MARK: - The probe

    @objc private func runProbe() {
        guard let store = webView?.configuration.websiteDataStore.httpCookieStore else {
            show(["FAIL: no web view"])
            return
        }
        store.getAllCookies { [weak self] cookies in
            guard let self = self else { return }
            var lines: [String] = []
            let found = self.sessionCookies(cookies)
            let names = found.map { $0.name.replacingOccurrences(of: self.cookiePrefix, with: "auth-token") }
            lines.append("1. Session cookie seen by native: \(found.isEmpty ? "NO" : "YES")")
            if !names.isEmpty { lines.append("   pieces: \(names.joined(separator: ", "))") }
            if let at = self.lastCookieChange {
                let f = DateFormatter(); f.dateFormat = "HH:mm:ss"
                lines.append("   last cookie change \(f.string(from: at)), session then: \(self.sessionSeenAtLastChange == true ? "present" : "gone")")
            }

            guard let session = self.decodeSession(found) else {
                lines.append("2. Could not read the session (signed out, or an unexpected format)")
                self.show(lines)
                return
            }
            let email = session["user"].flatMap { ($0 as? [String: Any])?["email"] as? String } ?? "?"
            lines.append("   signed in as \(self.mask(email))")
            if let exp = session["expires_at"] as? Double {
                let mins = Int((exp - Date().timeIntervalSince1970) / 60)
                lines.append("   token expires in \(mins) min\(mins < 0 ? "  (EXPIRED - the web page should refresh it)" : "")")
            }
            guard let token = session["access_token"] as? String else {
                lines.append("2. Session has no access token")
                self.show(lines)
                return
            }
            self.signedInCall(token: token) { status, count in
                lines.append("2. Native signed-in call (your saved jobs): HTTP \(status), count \(count)")
                lines.append(status == 200 || status == 206 ? "RESULT: PASS" : "RESULT: FAIL")
                self.show(lines)
            }
        }
    }

    private func sessionCookies(_ cookies: [HTTPCookie]) -> [HTTPCookie] {
        return cookies
            .filter { $0.domain.contains("thrivecareer.co.uk") }
            .filter { $0.name == cookiePrefix || $0.name.hasPrefix(cookiePrefix + ".") }
            .sorted { $0.name < $1.name }
    }

    /// @supabase/ssr writes the session as "base64-" + base64url(JSON), split
    /// over `.0`, `.1`, … when it is over the cookie size limit.
    private func decodeSession(_ cookies: [HTTPCookie]) -> [String: Any]? {
        if cookies.isEmpty { return nil }
        let single = cookies.first { $0.name == cookiePrefix }
        let chunks = cookies.filter { $0.name != cookiePrefix }
            .sorted { (Int($0.name.split(separator: ".").last ?? "") ?? 0) < (Int($1.name.split(separator: ".").last ?? "") ?? 0) }
        var raw = single?.value ?? chunks.map { $0.value }.joined()
        raw = raw.removingPercentEncoding ?? raw
        var jsonData: Data?
        if raw.hasPrefix("base64-") {
            var b64 = String(raw.dropFirst("base64-".count))
                .replacingOccurrences(of: "-", with: "+")
                .replacingOccurrences(of: "_", with: "/")
            while b64.count % 4 != 0 { b64 += "=" }
            jsonData = Data(base64Encoded: b64)
        } else {
            jsonData = raw.data(using: .utf8)
        }
        guard let data = jsonData,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }

    private func signedInCall(token: String, done: @escaping (Int, String) -> Void) {
        guard let url = URL(string: "\(supabaseURL)/rest/v1/saved_jobs?select=id") else { done(0, "-"); return }
        var req = URLRequest(url: url)
        req.setValue(publishableKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("count=exact", forHTTPHeaderField: "Prefer")
        req.setValue("0-0", forHTTPHeaderField: "Range")
        URLSession.shared.dataTask(with: req) { _, response, _ in
            let http = response as? HTTPURLResponse
            let range = http?.value(forHTTPHeaderField: "Content-Range") ?? "-"
            let count = range.split(separator: "/").last.map(String.init) ?? "-"
            done(http?.statusCode ?? 0, count)
        }.resume()
    }

    private func mask(_ email: String) -> String {
        guard let at = email.firstIndex(of: "@") else { return "?" }
        return String(email.prefix(1)) + "•••" + String(email[at...])
    }

    private func show(_ lines: [String]) {
        DispatchQueue.main.async {
            let alert = UIAlertController(title: "Session test (spike build)", message: lines.joined(separator: "\n"), preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            self.present(alert, animated: true)
        }
    }
}
