import Foundation
import WebKit

/// The signed-in session, as the WEB PAGE left it.
///
/// Native code never signs anyone in and never refreshes a session. Sign-in
/// stays on the web page (Google, Apple, LinkedIn, email), and all four end in
/// the `sb-<ref>-auth-token` cookie in the web view's cookie store. Native
/// reads that cookie. Only the web page refreshes it: a one-time refresh token
/// used by two parties signs the person out (refresh_token_already_used).
///
/// Proven on a real iPhone, 14–15 Oct 2026 (spike build 12): all four
/// sign-ins, sign-out, and an overnight wake, where the web page refreshed the
/// expired token itself about two minutes after the app woke.
///
/// NEVER log, show or store the token.
struct ThriveSession {
    let userId: String
    let accessToken: String
    let expiresAt: Double

    var isExpired: Bool { expiresAt <= Date().timeIntervalSince1970 + 30 }

    static let supabaseURL = "https://aaljufxcniacfggqiuls.supabase.co"
    // Supabase's PUBLISHABLE key: designed to ship inside apps. The user's
    // own token decides what they can read, exactly as on the website.
    static let publishableKey = "sb_publishable_eOLOA-ObeY-w7Uu8nv-42Q_LBgyQc7O"
    static let cookiePrefix = "sb-aaljufxcniacfggqiuls-auth-token"

    /// Reads the session from the cookie store. Nil when signed out or when the
    /// cookie cannot be read.
    static func read(from store: WKHTTPCookieStore, done: @escaping (ThriveSession?) -> Void) {
        store.getAllCookies { cookies in
            done(decode(sessionCookies(cookies)))
        }
    }

    static func sessionCookies(_ cookies: [HTTPCookie]) -> [HTTPCookie] {
        return cookies
            .filter { $0.domain.contains("thrivecareer.co.uk") }
            .filter { $0.name == cookiePrefix || $0.name.hasPrefix(cookiePrefix + ".") }
    }

    /// @supabase/ssr writes the session as "base64-" + base64url(JSON), split
    /// over `.0`, `.1`, … when it is over the cookie size limit.
    static func decode(_ cookies: [HTTPCookie]) -> ThriveSession? {
        if cookies.isEmpty { return nil }
        let single = cookies.first { $0.name == cookiePrefix }
        let chunks = cookies.filter { $0.name != cookiePrefix }
            .sorted { chunkIndex($0) < chunkIndex($1) }
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
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = obj["access_token"] as? String,
              let user = obj["user"] as? [String: Any],
              let userId = user["id"] as? String else { return nil }
        let expiresAt = (obj["expires_at"] as? Double) ?? 0
        return ThriveSession(userId: userId, accessToken: token, expiresAt: expiresAt)
    }

    private static func chunkIndex(_ cookie: HTTPCookie) -> Int {
        return Int(cookie.name.split(separator: ".").last ?? "") ?? 0
    }

    /// A signed-in GET against Supabase's REST API. Calls back on the main queue.
    func get(_ pathAndQuery: String, done: @escaping (Int, Data?) -> Void) {
        guard let url = URL(string: "\(ThriveSession.supabaseURL)/rest/v1/\(pathAndQuery)") else {
            DispatchQueue.main.async { done(0, nil) }
            return
        }
        var req = URLRequest(url: url)
        req.setValue(ThriveSession.publishableKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: req) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            DispatchQueue.main.async { done(status, data) }
        }.resume()
    }
}
