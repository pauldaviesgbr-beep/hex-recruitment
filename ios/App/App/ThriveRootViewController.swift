import UIKit

/// The app's main screen: the website above, a real iOS tab bar below.
///
/// Step 2 of the native layer (design_handoff_ios_native_layer). The tabs open
/// today's web pages; native screens replace Jobs, Saved, Applications and the
/// Profile root from step 3.
///
/// THE WEB VIEW STOPS AT THE TOP OF THE TAB BAR rather than running underneath
/// it, so nothing the website pins to the bottom of the screen (an Apply
/// button, a composer) can be hidden behind the bar.
///
/// THE TAB SET COMES FROM A ROW, NEVER FROM user_metadata.role, which the user
/// can rewrite themselves. Employer = owns an employer_profiles row. Until that
/// is known the bar stays hidden: no bar is better than the wrong bar.
class ThriveRootViewController: UIViewController, UITabBarDelegate {

    private struct Tab {
        let title: String
        let symbol: String
        let path: String?          // nil = an action, not a page
        let matches: [String]      // path prefixes that highlight this tab
    }

    private enum Role { case candidate, employer }

    private static let candidateTabs: [Tab] = [
        Tab(title: "Jobs", symbol: "briefcase", path: "/jobs", matches: ["/jobs", "/job/"]),
        Tab(title: "Saved", symbol: "bookmark", path: "/saved-jobs", matches: ["/saved-jobs"]),
        Tab(title: "Applications", symbol: "doc.text", path: "/applications", matches: ["/applications"]),
        Tab(title: "Messages", symbol: "bubble.left", path: "/messages", matches: ["/messages"]),
        Tab(title: "Profile", symbol: "person", path: "/dashboard", matches: ["/dashboard", "/profile", "/settings"]),
    ]

    // The four employer slots settled on 12 Sept 2026: Home · Job ads ·
    // Applicants · More. More opens the website's existing side menu.
    private static let employerTabs: [Tab] = [
        Tab(title: "Home", symbol: "house", path: "/employer/dashboard", matches: ["/employer/dashboard"]),
        Tab(title: "Job ads", symbol: "briefcase", path: "/my-jobs", matches: ["/my-jobs", "/post-job"]),
        Tab(title: "Applicants", symbol: "person.2", path: "/applied", matches: ["/applied", "/pipeline"]),
        Tab(title: "More", symbol: "line.3.horizontal", path: nil, matches: []),
    ]

    // Pages where a tab bar makes no sense: signing in, signing up, onboarding.
    private static let noBarPrefixes = ["/login", "/register", "/signup", "/auth", "/welcome", "/reset-password"]

    private let bridge = ThriveBridgeViewController()
    private let tabBar = UITabBar()
    private var webBottomToBar: NSLayoutConstraint!
    private var webBottomToEdge: NSLayoutConstraint!

    private var tabs: [Tab] = []
    private var role: Role?
    private var roleUserId: String?
    private var signedIn = false
    private var currentPath = "/"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        addChild(bridge)
        bridge.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridge.view)
        bridge.didMove(toParent: self)

        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.delegate = self
        tabBar.tintColor = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1)               // #0F172A
        tabBar.unselectedItemTintColor = UIColor(red: 100/255, green: 116/255, blue: 139/255, alpha: 1) // #64748b
        view.addSubview(tabBar)

        webBottomToBar = bridge.view.bottomAnchor.constraint(equalTo: tabBar.topAnchor)
        webBottomToEdge = bridge.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        NSLayoutConstraint.activate([
            bridge.view.topAnchor.constraint(equalTo: view.topAnchor),
            bridge.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridge.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webBottomToEdge,
        ])
        setBarVisible(false)

        bridge.onCookiesChanged = { [weak self] in self?.refreshSession() }
        bridge.onPathChanged = { [weak self] path in
            self?.currentPath = path
            self?.updateBar()
        }
        refreshSession()
    }

    override var childForStatusBarStyle: UIViewController? { return bridge }
    override var childForStatusBarHidden: UIViewController? { return bridge }

    // MARK: - Session and role

    private func refreshSession() {
        guard let store = bridge.cookieStore else { return }
        ThriveSession.read(from: store) { [weak self] session in
            DispatchQueue.main.async { self?.apply(session) }
        }
    }

    private func apply(_ session: ThriveSession?) {
        guard let session = session else {
            signedIn = false
            role = nil
            roleUserId = nil
            updateBar()
            return
        }
        signedIn = true
        if roleUserId == session.userId, role != nil {
            updateBar()
            return
        }
        // An expired token gets a 401; the web page refreshes it and the cookie
        // change brings us back here. Until then the bar stays hidden.
        if session.isExpired { updateBar(); return }
        let userId = session.userId
        session.get("employer_profiles?select=id&user_id=eq.\(userId)&limit=1") { [weak self] status, data in
            guard let self = self else { return }
            guard status == 200, let data = data,
                  let rows = try? JSONSerialization.jsonObject(with: data) as? [Any] else {
                self.updateBar()   // unknown: stay hidden, try again on the next change
                return
            }
            self.role = rows.isEmpty ? .candidate : .employer
            self.roleUserId = userId
            self.updateBar()
        }
    }

    // MARK: - The bar

    private func updateBar() {
        let onNoBarPage = ThriveRootViewController.noBarPrefixes.contains { currentPath.hasPrefix($0) }
        guard signedIn, let role = role, !onNoBarPage else {
            setBarVisible(false)
            return
        }
        let wanted = role == .employer ? ThriveRootViewController.employerTabs : ThriveRootViewController.candidateTabs
        if wanted.map({ $0.title }) != tabs.map({ $0.title }) {
            tabs = wanted
            tabBar.items = tabs.enumerated().map { index, tab in
                UITabBarItem(title: tab.title, image: UIImage(systemName: tab.symbol), tag: index)
            }
        }
        let match = tabs.firstIndex { tab in tab.matches.contains { currentPath.hasPrefix($0) } }
        tabBar.selectedItem = match.flatMap { tabBar.items?[$0] }
        setBarVisible(true)
    }

    private func setBarVisible(_ visible: Bool) {
        tabBar.isHidden = !visible
        webBottomToBar.isActive = false
        webBottomToEdge.isActive = false
        (visible ? webBottomToBar : webBottomToEdge).isActive = true
        view.setNeedsLayout()
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.tag >= 0, item.tag < tabs.count else { return }
        let tab = tabs[item.tag]
        if let path = tab.path {
            bridge.go(to: path)
        } else {
            // "More" is not a page: open the menu and leave the highlight where it was.
            bridge.openSideMenu()
            updateBar()
        }
    }
}
