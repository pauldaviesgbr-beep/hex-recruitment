import Foundation
import UIKit

/// The website's app-only endpoints (app/api/app/*). Everything shown on the
/// native screens comes from here already formatted by the website's own rules,
/// so pay, place, region and status labels cannot drift from the site.
///
/// NEVER log, show or store the access token.
enum ThriveAPI {
    static let base = "https://thrivecareer.co.uk/api/app"

    /// Design rule: skeletons for at most 10 seconds, then the error state.
    static let timeout: TimeInterval = 10

    enum Failure: Error { case signedOut, offline, server }

    static func get<T: Decodable>(_ path: String, token: String?, as type: T.Type,
                                  done: @escaping (Result<T, Failure>) -> Void) {
        send("GET", path, token: token) { result in
            switch result {
            case .failure(let f): done(.failure(f))
            case .success(let data):
                if let value = try? JSONDecoder().decode(T.self, from: data) {
                    done(.success(value))
                } else {
                    done(.failure(.server))
                }
            }
        }
    }

    static func send(_ method: String, _ path: String, token: String?,
                     json: [String: Any]? = nil,
                     done: @escaping (Result<Data, Failure>) -> Void) {
        guard let url = URL(string: base + path) else { done(.failure(.server)); return }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        req.httpMethod = method
        if let token = token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let json = json {
            req.httpBody = try? JSONSerialization.data(withJSONObject: json)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        URLSession.shared.dataTask(with: req) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let result: Result<Data, Failure>
            let offlineCodes: [URLError.Code] = [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed]
            if let urlError = error as? URLError, offlineCodes.contains(urlError.code) {
                result = .failure(.offline)
            } else if status == 401 {
                result = .failure(.signedOut)
            } else if status == 200, let data = data {
                result = .success(data)
            } else {
                result = .failure(.server)
            }
            DispatchQueue.main.async { done(result) }
        }.resume()
    }
}

// MARK: - Models (the JSON lib/appApi.ts returns)

struct AppRegion: Codable, Hashable {
    let key: String
    let label: String
}

struct AppRegionCount: Codable, Hashable, Identifiable {
    let key: String
    let label: String
    let count: Int
    var id: String { key }
}

struct AppJob: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let company: String
    let place: String
    let pay: String?
    let type: String?
    let postedAt: String?
    let postedLabel: String
    let isNew: Bool
    let isClosed: Bool
    let region: AppRegion?
    let about: String
    let responsibilities: [String]
    let requirements: [String]
    let benefits: [String]
    let url: String
    // Brand pass. Optional so a copy cached by an earlier build still decodes.
    let payShort: String?
    let payLong: String?
    let facts: [String]?
    // Build 17 review. Optional for the same reason.
    let town: String?
    let category: String?
    let aboutBlocks: [AboutBlock]?
}

struct AboutBlock: Codable, Hashable {
    let kind: String   // "heading" | "text"
    let text: String
}

struct AppProfile: Codable {
    let firstName: String?
    let jobTitle: String?
    // Native Profile (build 17 review, D6/D7). Optional: an older server
    // answer still decodes.
    let fullName: String?
    let town: String?
    let photoUrl: String?
    let isDiscoverable: Bool?
    let heldUntil: String?
    let complete: ProfileComplete?
    let cv: ProfileCV?
}

struct ProfileComplete: Codable, Equatable {
    let done: Int
    let total: Int
    let next: String?
}

struct ProfileCV: Codable, Equatable {
    let fileName: String
    let url: String?
    let added: String?
}

struct ShiftsResponse: Codable {
    let open: Int
}

struct JobsResponse: Codable {
    let total: Int
    let regions: [AppRegionCount]
    let jobs: [AppJob]
}

struct SavedItem: Codable, Hashable, Identifiable {
    let savedAt: String?
    let job: AppJob
    var id: String { job.id }
}

struct SavedResponse: Codable {
    let saved: [SavedItem]
}

struct AppStage: Codable, Hashable, Identifiable {
    let key: String
    let label: String
    let at: String?
    var id: String { key }
}

struct AppApplication: Codable, Hashable, Identifiable {
    let id: String
    let status: String
    let statusLabel: String
    let appliedAt: String?
    let stages: [AppStage]
    let title: String
    let company: String
    let employerId: String?
    let job: AppJob?
}

struct ApplicationsResponse: Codable {
    let applications: [AppApplication]
}

// MARK: - Dates, in the design's own wording

enum ThriveDates {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain = ISO8601DateFormatter()

    static func parse(_ s: String?) -> Date? {
        guard let s = s else { return nil }
        return iso.date(from: s) ?? isoPlain.date(from: s)
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        // en_US_POSIX, not en_GB: current iOS writes en-GB September as
        // "Sept", and the design asks for "Sep". Same day and month names
        // otherwise; the order comes from the pattern, not the locale.
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/London")
        f.dateFormat = pattern
        return f.string(from: date)
    }

    /// "08:12" today, "Mon 12 Oct, 18:40" before today. Never "just now".
    static func updated(_ date: Date) -> String {
        Calendar.current.isDateInToday(date) ? format(date, "HH:mm") : format(date, "EEE d MMM, HH:mm")
    }

    /// "today" or "9 Oct".
    static func day(_ date: Date?) -> String {
        guard let date = date else { return "" }
        return Calendar.current.isDateInToday(date) ? "today" : format(date, "d MMM")
    }

    /// "Fri 9 Oct".
    static func longDay(_ date: Date?) -> String {
        guard let date = date else { return "" }
        return format(date, "EEE d MMM")
    }

    static var deviceWord: String {
        #if targetEnvironment(macCatalyst)
        return "Mac"
        #else
        return UIDeviceIdiom.isPad ? "iPad" : "iPhone"
        #endif
    }
}

enum UIDeviceIdiom {
    static var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }
}
