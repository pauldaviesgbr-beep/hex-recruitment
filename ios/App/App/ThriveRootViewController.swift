import UIKit
import SwiftUI
import Combine

/// The app's main screen: a real iOS tab bar, native screens for Jobs, Saved
/// and Applications, and the website for everything else.
///
/// Steps 2 and 3 of the native layer (design_handoff_ios_native_layer).
///
/// - Candidates: Jobs, Saved and Applications are NATIVE (ThriveNativeViews),
///   fed by the website's app endpoints and cached on the phone. Messages and
///   Profile stay web. A web page opened FROM a native screen (Apply, Message)
///   gets a native back button that returns to it.
/// - Employers: all four tabs are web pages, as before.
/// - Signed out: the website, with no bar.
///
/// THE WEB VIEW STOPS AT THE TOP OF THE TAB BAR rather than running underneath
/// it, so nothing the website pins to the bottom of the screen can be hidden.
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
        let native: Int?           // index of the native screen, if any
    }

    private enum Role { case candidate, employer }

    private static let candidateTabs: [Tab] = [
        Tab(title: "Jobs", symbol: "briefcase", path: "/jobs", matches: ["/jobs", "/job/"], native: 0),
        Tab(title: "Saved", symbol: "bookmark", path: "/saved-jobs", matches: ["/saved-jobs"], native: 1),
        Tab(title: "Applications", symbol: "doc.text", path: "/applications", matches: ["/applications"], native: 2),
        Tab(title: "Messages", symbol: "bubble.left", path: "/messages", matches: ["/messages"], native: nil),
        Tab(title: "Profile", symbol: "person", path: "/dashboard", matches: ["/dashboard", "/profile", "/settings"], native: nil),
    ]

    // The four employer slots settled on 12 Sept 2026: Home · Job ads ·
    // Applicants · More. More opens the website's existing side menu.
    private static let employerTabs: [Tab] = [
        Tab(title: "Home", symbol: "house", path: "/employer/dashboard", matches: ["/employer/dashboard"], native: nil),
        Tab(title: "Job ads", symbol: "briefcase", path: "/my-jobs", matches: ["/my-jobs", "/post-job"], native: nil),
        Tab(title: "Applicants", symbol: "person.2", path: "/applied", matches: ["/applied", "/pipeline"], native: nil),
        Tab(title: "More", symbol: "line.3.horizontal", path: nil, matches: [], native: nil),
    ]

    // Pages where a tab bar makes no sense: signing in, signing up, onboarding.
    private static let noBarPrefixes = ["/login", "/register", "/signup", "/auth", "/welcome", "/reset-password"]

    private let bridge = ThriveBridgeViewController()
    private let tabBar = UITabBar()
    private let content = UIView()
    private let backBar = UIView()
    private let backButton = UIButton(type: .system)
    private var contentBottomToBar: NSLayoutConstraint!
    private var contentBottomToEdge: NSLayoutConstraint!
    private var webTopToContent: NSLayoutConstraint!
    private var webTopToBackBar: NSLayoutConstraint!

    let store = ThriveStore()
    private var nativeHosts: [UIViewController] = []
    private var cancellables = Set<AnyCancellable>()

    private var tabs: [Tab] = []
    private var role: Role?
    private var roleUserId: String?
    private var session: ThriveSession?
    private var currentPath = "/"

    /// Which native screen is showing, or nil when the website is.
    private var nativeIndex: Int?
    /// The native tab a web page was opened from (shows the back bar).
    private var webOpenedFrom: Int?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)

        addChild(bridge)
        bridge.view.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(bridge.view)
        bridge.didMove(toParent: self)

        buildBackBar()
        buildNativeHosts()

        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.delegate = self
        tabBar.tintColor = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1)               // #0F172A
        tabBar.unselectedItemTintColor = UIColor(red: 100/255, green: 116/255, blue: 139/255, alpha: 1) // #64748b
        view.addSubview(tabBar)

        contentBottomToBar = content.bottomAnchor.constraint(equalTo: tabBar.topAnchor)
        contentBottomToEdge = content.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        webTopToContent = bridge.view.topAnchor.constraint(equalTo: content.topAnchor)
        webTopToBackBar = bridge.view.topAnchor.constraint(equalTo: backBar.bottomAnchor)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: view.topAnchor),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            contentBottomToEdge,
            webTopToContent,
            bridge.view.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            bridge.view.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            bridge.view.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        setBarVisible(false)

        store.token = { [weak self] in
            guard let s = self?.session, !s.isExpired else { return nil }
            return s.accessToken
        }
        store.openWeb = { [weak self] path, _ in self?.openWebFromNative(path) }
        store.selectTab = { [weak self] index in self?.selectTab(index) }
        store.$hideTabBar.receive(on: DispatchQueue.main).sink { [weak self] _ in
            DispatchQueue.main.async { self?.updateBar() }
        }.store(in: &cancellables)

        bridge.onCookiesChanged = { [weak self] in self?.refreshSession() }
        bridge.onPathChanged = { [weak self] path in self?.pathChanged(path) }
        refreshSession()
    }

    override var childForStatusBarStyle: UIViewController? { return nativeIndex == nil ? bridge : nil }
    override var childForStatusBarHidden: UIViewController? { return nativeIndex == nil ? bridge : nil }
    override var preferredStatusBarStyle: UIStatusBarStyle { return .darkContent }

    // MARK: - Native screens

    private func buildNativeHosts() {
        let screens: [AnyView] = [
            AnyView(JobsScreen(store: store)),
            AnyView(SavedScreen(store: store)),
            AnyView(ApplicationsScreen(store: store)),
        ]
        for screen in screens {
            let host = UIHostingController(rootView: screen)
            host.view.translatesAutoresizingMaskIntoConstraints = false
            host.view.backgroundColor = UIColor(red: 246/255, green: 247/255, blue: 249/255, alpha: 1)
            host.view.isHidden = true
            addChild(host)
            content.addSubview(host.view)
            NSLayoutConstraint.activate([
                host.view.topAnchor.constraint(equalTo: content.topAnchor),
                host.view.leadingAnchor.constraint(equalTo: content.leadingAnchor),
                host.view.trailingAnchor.constraint(equalTo: content.trailingAnchor),
                host.view.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            ])
            host.didMove(toParent: self)
            nativeHosts.append(host)
        }
    }

    private func showNative(_ index: Int) {
        nativeIndex = index
        webOpenedFrom = nil
        for (i, host) in nativeHosts.enumerated() { host.view.isHidden = i != index }
        bridge.view.isHidden = true
        setBackBarVisible(false)
        setNeedsStatusBarAppearanceUpdate()
        updateBar()
    }

    private func showWeb(openedFrom: Int?) {
        nativeIndex = nil
        webOpenedFrom = openedFrom
        nativeHosts.forEach { $0.view.isHidden = true }
        bridge.view.isHidden = false
        setBackBarVisible(openedFrom != nil)
        setNeedsStatusBarAppearanceUpdate()
        updateBar()
    }

    /// Apply or Message, from a native screen: the web page inside the app,
    /// with a native back to where they came from.
    private func openWebFromNative(_ path: String) {
        let from = nativeIndex
        bridge.go(to: path)
        showWeb(openedFrom: from)
    }

    private func selectTab(_ index: Int) {
        guard index >= 0, index < tabs.count else { return }
        let tab = tabs[index]
        if let n = tab.native, role == .candidate {
            showNative(n)
        } else if let path = tab.path {
            bridge.go(to: path)
            showWeb(openedFrom: nil)
        }
    }

    // MARK: - Back bar

    private func buildBackBar() {
        backBar.translatesAutoresizingMaskIntoConstraints = false
        backBar.backgroundColor = .white
        content.addSubview(backBar)

        backButton.translatesAutoresizingMaskIntoConstraints = false
        backButton.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backButton.titleLabel?.font = UIFont.systemFont(ofSize: 17)
        backButton.tintColor = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1)
        backButton.contentHorizontalAlignment = .leading
        backButton.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        backBar.addSubview(backButton)

        let hairline = UIView()
        hairline.translatesAutoresizingMaskIntoConstraints = false
        hairline.backgroundColor = UIColor(red: 238/255, green: 240/255, blue: 244/255, alpha: 1)
        backBar.addSubview(hairline)

        NSLayoutConstraint.activate([
            backBar.topAnchor.constraint(equalTo: content.topAnchor),
            backBar.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            backBar.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            backBar.bottomAnchor.constraint(equalTo: content.safeAreaLayoutGuide.topAnchor, constant: 44),
            backButton.leadingAnchor.constraint(equalTo: backBar.leadingAnchor, constant: 8),
            backButton.bottomAnchor.constraint(equalTo: backBar.bottomAnchor),
            backButton.heightAnchor.constraint(equalToConstant: 44),
            backButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
            hairline.leadingAnchor.constraint(equalTo: backBar.leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: backBar.trailingAnchor),
            hairline.bottomAnchor.constraint(equalTo: backBar.bottomAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 1),
        ])
        backBar.isHidden = true
    }

    private func setBackBarVisible(_ visible: Bool) {
        if let from = webOpenedFrom, visible {
            let title = ["Jobs", "Saved", "Applications"][min(from, 2)]
            backButton.setTitle(" \(title)", for: .normal)
        }
        backBar.isHidden = !visible
        webTopToContent.isActive = false
        webTopToBackBar.isActive = false
        (visible ? webTopToBackBar : webTopToContent).isActive = true
        view.setNeedsLayout()
    }

    @objc private func backTapped() {
        guard let from = webOpenedFrom else { return }
        showNative(from)
        // They may have just applied or sent a message.
        store.refreshApplications()
        store.refreshSaved()
    }

    // MARK: - Session and role

    private func refreshSession() {
        guard let store = bridge.cookieStore else { return }
        ThriveSession.read(from: store) { [weak self] session in
            DispatchQueue.main.async { self?.apply(session) }
        }
    }

    private func apply(_ newSession: ThriveSession?) {
        guard let newSession = newSession else {
            if session != nil || role != nil {
                // Signed out: clear everything the phone holds (design rule).
                store.clearForSignOut()
                if nativeIndex != nil { showWeb(openedFrom: nil) }
            }
            session = nil
            role = nil
            roleUserId = nil
            updateBar()
            return
        }
        let previousToken = session?.accessToken
        session = newSession
        if roleUserId == newSession.userId, role != nil {
            // A fresh token (the web page refreshed it): send any saves waiting on it.
            if newSession.accessToken != previousToken { store.syncPending() }
            updateBar()
            return
        }
        // An expired token gets a 401; the web page refreshes it and the cookie
        // change brings us back here. Until then the bar stays hidden.
        if newSession.isExpired { updateBar(); return }
        let userId = newSession.userId
        newSession.get("employer_profiles?select=id&user_id=eq.\(userId)&limit=1") { [weak self] status, data in
            guard let self = self else { return }
            guard status == 200, let data = data,
                  let rows = try? JSONSerialization.jsonObject(with: data) as? [Any] else {
                self.updateBar()   // unknown: stay hidden, try again on the next change
                return
            }
            let previous = self.role
            self.role = rows.isEmpty ? .candidate : .employer
            self.roleUserId = userId
            if self.role == .candidate && previous != .candidate {
                // Design A1: Jobs, native, is the first screen after sign-in.
                self.store.refreshAll()
                self.tabs = ThriveRootViewController.candidateTabs
                self.showNative(0)
            } else {
                self.updateBar()
            }
        }
    }

    private func pathChanged(_ path: String) {
        currentPath = path
        // The website itself navigated to a page a native screen now owns (a
        // menu link, a redirect after applying): show the native screen.
        if role == .candidate, nativeIndex == nil {
            let owned: [(String, Int)] = [("/saved-jobs", 1), ("/applications", 2)]
            if path == "/jobs" || path.hasPrefix("/jobs?") {
                showNative(0)
                return
            }
            if let hit = owned.first(where: { path.hasPrefix($0.0) }) {
                showNative(hit.1)
                return
            }
        }
        updateBar()
    }

    // MARK: - The bar

    private func updateBar() {
        let onNoBarPage = nativeIndex == nil &&
            ThriveRootViewController.noBarPrefixes.contains { currentPath.hasPrefix($0) }
        guard session != nil, let role = role, !onNoBarPage else {
            setBarVisible(false)
            bridge.setNativeNav(false, force: true)
            return
        }
        // The app is providing navigation: the website hides its own.
        bridge.setNativeNav(true, force: true)
        let wanted = role == .employer ? ThriveRootViewController.employerTabs : ThriveRootViewController.candidateTabs
        if wanted.map({ $0.title }) != (tabBar.items ?? []).map({ $0.title ?? "" }) {
            tabs = wanted
            tabBar.items = tabs.enumerated().map { index, tab in
                UITabBarItem(title: tab.title, image: UIImage(systemName: tab.symbol), tag: index)
            }
        }
        let match: Int?
        if let n = nativeIndex {
            match = tabs.firstIndex { $0.native == n }
        } else if let from = webOpenedFrom {
            match = tabs.firstIndex { $0.native == from }
        } else {
            match = tabs.firstIndex { tab in tab.matches.contains { currentPath.hasPrefix($0) } }
        }
        tabBar.selectedItem = match.flatMap { tabBar.items?[$0] }
        // The bar hides on job detail so Apply is never covered (design A2).
        setBarVisible(!(nativeIndex != nil && store.hideTabBar))
    }

    private func setBarVisible(_ visible: Bool) {
        tabBar.isHidden = !visible
        contentBottomToBar.isActive = false
        contentBottomToEdge.isActive = false
        (visible ? contentBottomToBar : contentBottomToEdge).isActive = true
        view.setNeedsLayout()
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard item.tag >= 0, item.tag < tabs.count else { return }
        let tab = tabs[item.tag]
        if tab.path == nil {
            // "More" is not a page: open the menu and leave the highlight where it was.
            bridge.openSideMenu()
            updateBar()
            return
        }
        selectTab(item.tag)
    }
}
