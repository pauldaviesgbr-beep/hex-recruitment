import Foundation
import Network
import UIKit

/// What the native screens show, and the copy kept on the phone.
///
/// - Jobs, Saved and Applications are cached in the app's PRIVATE storage
///   (Application Support), each with the time it was last fetched, so Saved
///   and Applications open with no signal (design §B, the case to Apple).
/// - A save made with no signal is shown at once and sent when signal returns.
/// - Signing out clears all of it.
///
/// The token comes from the web page's session cookie and is never stored here.
final class ThriveStore: ObservableObject {

    enum Load { case idle, loading, loaded, failed }

    @Published var jobs: [AppJob] = []
    @Published var regions: [AppRegionCount] = []
    @Published var jobsUpdatedAt: Date?
    @Published var jobsLoad: Load = .idle

    @Published var saved: [SavedItem] = []
    @Published var savedUpdatedAt: Date?
    @Published var savedLoad: Load = .idle

    @Published var applications: [AppApplication] = []
    @Published var applicationsUpdatedAt: Date?
    @Published var applicationsLoad: Load = .idle

    @Published var online = true
    @Published var hideTabBar = false

    // MARK: Signed out (design G1, G9) and the sign-in sheet (G2)

    /// Set by the root from the web page's session cookie.
    @Published var signedIn = false
    /// Raised to open the native sign-in sheet; the root presents it.
    @Published var signInRequested = false

    /// What to finish once they have signed in (G1: "the action completes").
    enum PendingAction { case save(AppJob), apply(AppJob) }
    var pendingAfterSignIn: PendingAction?

    /// Signing in is asked for only when it is needed: the bookmark, Apply,
    /// or the button on an account tab. Never on its own.
    func requireSignIn(then action: PendingAction? = nil) {
        pendingAfterSignIn = action
        signInRequested = true
    }

    /// Supplied by the root: the page's sign-in functions, and a provider start.
    var callAuth: (_ name: String, _ args: KeyValuePairs<String, Any>, _ done: @escaping ([String: Any]?) -> Void) -> Void = { _, _, done in done(nil) }
    var startProvider: (_ provider: String) -> Void = { _ in }
    /// How a provider sign-in ended, from the page: ("cancelled" | "failed", message?).
    @Published var providerOutcome: (how: String, message: String?)?

    /// The "Where" choice, remembered on the device between launches (A6).
    @Published var placeKey: String? {
        didSet { UserDefaults.standard.set(placeKey, forKey: "thrive.where") }
    }

    /// Saves made but not yet confirmed by the server: jobId → saved?
    private var pending: [String: Bool] = [:]

    /// Supplied by the root: the current access token, or nil when signed out
    /// or expired (the web page refreshes it; we never do).
    var token: () -> String? = { nil }
    /// Supplied by the root: open a web page inside the app, with a native back.
    var openWeb: (_ path: String, _ backTitle: String) -> Void = { _, _ in }
    /// Supplied by the root: switch tab (0 Jobs, 1 Saved, 2 Applications…).
    var selectTab: (Int) -> Void = { _ in }

    private let monitor = NWPathMonitor()

    init() {
        placeKey = UserDefaults.standard.string(forKey: "thrive.where")
        pending = (UserDefaults.standard.dictionary(forKey: "thrive.pendingSaves") as? [String: Bool]) ?? [:]
        loadCache()
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self = self else { return }
                let was = self.online
                self.online = path.status == .satisfied
                if self.online && !was { self.refreshAll() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "thrive.network"))
    }

    // MARK: - Loading

    func refreshAll() {
        refreshJobs()
        refreshSaved()
        refreshApplications()
        syncPending()
    }

    func refreshJobs() {
        jobsLoad = .loading
        ThriveAPI.get("/jobs", token: nil, as: JobsResponse.self) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let r):
                self.jobs = r.jobs
                self.regions = r.regions
                self.jobsUpdatedAt = Date()
                self.jobsLoad = .loaded
                // A remembered place that no longer has jobs is dropped, so the
                // board never opens on zero (A5: places with 0 jobs are left out).
                if let key = self.placeKey, !r.regions.contains(where: { $0.key == key }) { self.placeKey = nil }
                self.writeCache()
            case .failure:
                self.jobsLoad = .failed
            }
        }
    }

    func refreshSaved() {
        guard let token = token() else { return }
        savedLoad = .loading
        ThriveAPI.get("/me/saved", token: token, as: SavedResponse.self) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let r):
                // Keep a pending save visible until the server has it.
                var items = r.saved.filter { self.pending[$0.job.id] != false }
                for (id, want) in self.pending where want && !items.contains(where: { $0.job.id == id }) {
                    if let local = self.saved.first(where: { $0.job.id == id }) { items.insert(local, at: 0) }
                }
                self.saved = items
                self.savedUpdatedAt = Date()
                self.savedLoad = .loaded
                self.writeCache()
            case .failure:
                self.savedLoad = .failed
            }
        }
    }

    func refreshApplications() {
        guard let token = token() else { return }
        applicationsLoad = .loading
        ThriveAPI.get("/me/applications", token: token, as: ApplicationsResponse.self) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let r):
                self.applications = r.applications
                self.applicationsUpdatedAt = Date()
                self.applicationsLoad = .loaded
                self.writeCache()
            case .failure:
                self.applicationsLoad = .failed
            }
        }
    }

    // MARK: - Saving

    func isSaved(_ jobId: String) -> Bool {
        if let p = pending[jobId] { return p }
        return saved.contains { $0.job.id == jobId }
    }

    /// Design A1: a light haptic, the job is in the offline set at once, and the
    /// save goes to the server now or when signal returns.
    func toggleSave(_ job: AppJob) {
        guard signedIn else { requireSignIn(then: .save(job)); return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let want = !isSaved(job.id)
        pending[job.id] = want
        if want {
            if !saved.contains(where: { $0.job.id == job.id }) {
                saved.insert(SavedItem(savedAt: ISO8601DateFormatter().string(from: Date()), job: job), at: 0)
            }
        } else {
            saved.removeAll { $0.job.id == job.id }
        }
        persistPending()
        writeCache()
        syncPending()
    }

    func syncPending() {
        guard online, let token = token() else { return }
        for (id, want) in pending {
            ThriveAPI.send(want ? "PUT" : "DELETE", "/me/saved/\(id)", token: token) { [weak self] result in
                guard let self = self else { return }
                if case .success = result, self.pending[id] == want {
                    self.pending[id] = nil
                    self.persistPending()
                }
            }
        }
    }

    private func persistPending() {
        UserDefaults.standard.set(pending, forKey: "thrive.pendingSaves")
    }

    // MARK: - Sign-out

    /// Design rule: sign-out clears the offline cache and anything waiting.
    func clearForSignOut() {
        jobs = []; regions = []; jobsUpdatedAt = nil; jobsLoad = .idle
        saved = []; savedUpdatedAt = nil; savedLoad = .idle
        applications = []; applicationsUpdatedAt = nil; applicationsLoad = .idle
        pending = [:]
        persistPending()
        try? FileManager.default.removeItem(at: ThriveStore.cacheDir)
    }

    // MARK: - The copy on the phone

    private struct Cache: Codable {
        var jobs: [AppJob]
        var regions: [AppRegionCount]
        var jobsUpdatedAt: Date?
        var saved: [SavedItem]
        var savedUpdatedAt: Date?
        var applications: [AppApplication]
        var applicationsUpdatedAt: Date?
    }

    private static var cacheDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("thrive-cache", isDirectory: true)
    }
    private static var cacheFile: URL { cacheDir.appendingPathComponent("native.json") }

    private func writeCache() {
        let c = Cache(jobs: jobs, regions: regions, jobsUpdatedAt: jobsUpdatedAt,
                      saved: saved, savedUpdatedAt: savedUpdatedAt,
                      applications: applications, applicationsUpdatedAt: applicationsUpdatedAt)
        guard let data = try? JSONEncoder().encode(c) else { return }
        try? FileManager.default.createDirectory(at: ThriveStore.cacheDir, withIntermediateDirectories: true)
        // Private to the app, excluded from backups, protected while locked.
        try? data.write(to: ThriveStore.cacheFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var url = ThriveStore.cacheFile
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    private func loadCache() {
        guard let data = try? Data(contentsOf: ThriveStore.cacheFile),
              let c = try? JSONDecoder().decode(Cache.self, from: data) else { return }
        jobs = c.jobs; regions = c.regions; jobsUpdatedAt = c.jobsUpdatedAt
        saved = c.saved; savedUpdatedAt = c.savedUpdatedAt
        applications = c.applications; applicationsUpdatedAt = c.applicationsUpdatedAt
    }

    // MARK: - What the Jobs list shows

    var placeLabel: String? {
        guard let key = placeKey else { return nil }
        return regions.first { $0.key == key }?.label ?? jobs.first { $0.region?.key == key }?.region?.label
    }

    func filteredJobs(query: String, placeKey: String?) -> [AppJob] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return jobs.filter { job in
            (placeKey == nil || job.region?.key == placeKey) &&
            (q.isEmpty || job.title.lowercased().contains(q) || job.place.lowercased().contains(q)
                       || job.company.lowercased().contains(q))
        }
    }

    /// Counts for the Where sheet: the live list, or the cached jobs offline.
    var whereCounts: [AppRegionCount] {
        if online && !regions.isEmpty { return regions }
        var counts: [String: AppRegionCount] = [:]
        for j in jobs {
            guard let r = j.region else { continue }
            let n = (counts[r.key]?.count ?? 0) + 1
            counts[r.key] = AppRegionCount(key: r.key, label: r.label, count: n)
        }
        return counts.values.sorted { $0.count != $1.count ? $0.count > $1.count : $0.label < $1.label }
    }
}
