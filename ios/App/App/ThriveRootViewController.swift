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
        Tab(title: "Profile", symbol: "person", path: "/dashboard", matches: ["/dashboard", "/profile", "/settings"], native: 5),
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
    private let webTitle = UILabel()
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

        ThriveTheme.applyNavigationBarAppearance()
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
        store.openWeb = { [weak self] path, title in self?.openWebFromNative(path, backTitle: title) }
        store.selectTab = { [weak self] index in self?.selectTab(index) }
        // S1 Sign out and S3 Delete: the website's /signout page signs out
        // properly (it revokes the session, not only forgets it); the cookie
        // change then clears the phone. Back to Jobs, as a signed-out person.
        store.signOut = { [weak self] deleted in
            guard let self = self else { return }
            self.bridge.go(to: "/signout")
            self.showNative(0)
            guard deleted else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                let alert = UIAlertController(title: "Your account has been deleted.", message: nil, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                var top: UIViewController = self
                while let next = top.presentedViewController { top = next }
                top.present(alert, animated: true)
            }
        }
        store.$hideTabBar.receive(on: DispatchQueue.main).sink { [weak self] _ in
            DispatchQueue.main.async { self?.updateBar() }
        }.store(in: &cancellables)

        // THE SIGN-IN SHEET (ThriveSignIn.swift). Native to look at; the website
        // does the signing in, on the page hidden behind the native screens.
        store.callAuth = { [weak self] name, args, done in
            guard let self = self else { done(nil); return }
            self.bridge.callAuth(name, args) { result in
                switch result {
                case .success(let answer): done(answer)
                case .failure(.notReady):
                    // The hidden page has not loaded the site yet: load the
                    // login page (which carries the auth bridge) and try once more.
                    self.bridge.go(to: "/login")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                        self.bridge.callAuth(name, args) { retry in
                            if case .success(let answer) = retry { done(answer) } else { done(nil) }
                        }
                    }
                case .failure: done(nil)
                }
            }
        }
        // A provider opens the system browser sheet, and iOS presents one sheet
        // at a time, so ours steps aside first (keeping the waiting action) and
        // comes back if that sign-in is cancelled or fails.
        store.startProvider = { [weak self] provider in
            guard let self = self else { return }
            let go = { self.bridge.go(to: "/login?native_start=\(provider)") }
            if let sheet = self.signInSheet {
                self.signInSheet = nil
                sheet.dismiss(animated: true, completion: go)
            } else {
                go()
            }
        }
        bridge.onPageMessage = { [weak self] message in
            guard let self = self, message["event"] as? String == "signin-ended", self.session == nil else { return }
            self.store.providerOutcome = (how: message["how"] as? String ?? "failed", message: message["message"] as? String)
            // The new sheet reads the outcome as it opens (a @Published value
            // is delivered to a new subscriber straight away).
            self.presentSignIn()
        }
        store.$signInRequested.receive(on: DispatchQueue.main).sink { [weak self] requested in
            guard requested else { return }
            self?.store.signInRequested = false
            self?.presentSignIn()
        }.store(in: &cancellables)

        bridge.onCookiesChanged = { [weak self] in self?.refreshSession() }
        bridge.onPathChanged = { [weak self] path in self?.pathChanged(path) }
        refreshSession()
    }

    // Brand pass: navy above the content on every screen, so the status bar
    // is always light. Web pages inside the app sit under a navy bar too, so
    // the web page no longer decides the status bar.
    override var preferredStatusBarStyle: UIStatusBarStyle { return .lightContent }

    // MARK: - Native screens

    private func buildNativeHosts() {
        let screens: [AnyView] = [
            AnyView(JobsTab(store: store)),   // the home (H1–H3) and the full list (H4)
            AnyView(SavedScreen(store: store)),
            AnyView(ApplicationsScreen(store: store)),
            // 3 and 4: Messages and Profile while SIGNED OUT (design G9). Signed
            // in, those two tabs are still the website.
            AnyView(SignedOutTab(store: store, title: "Messages", symbol: "bubble.left",
                                 heading: "Sign in to message employers",
                                 message: "Your conversations with employers about the jobs you apply for show here.")),
            AnyView(SignedOutTab(store: store, title: "Profile", symbol: "person",
                                 heading: "Sign in to build your profile",
                                 message: "Your CV and details, ready to send with every application.")),
            // 5: Profile SIGNED IN (build 17 review, D6/D7), native.
            AnyView(ProfileScreen(store: store)),
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
        setBackBarVisible(true)
        setNeedsStatusBarAppearanceUpdate()
        updateBar()
    }

    /// Apply or Message, from a native screen: the web page inside the app,
    /// with a native back to where they came from.
    /// What the navy bar's back says over a web page opened from a native
    /// screen ("Settings", "Profile"); nil falls back to the tab's name.
    private var webBackTitle: String?

    private func openWebFromNative(_ path: String, backTitle: String? = nil) {
        let from = nativeIndex
        webBackTitle = backTitle
        bridge.go(to: path)
        showWeb(openedFrom: from)
    }

    private func selectTab(_ index: Int) {
        guard index >= 0, index < tabs.count else { return }
        // Signed out (G1, G9): every candidate tab is native. Jobs is the board;
        // the other four explain what is inside and offer sign-in. Their host
        // indices are the tab indices.
        if session == nil {
            showNative(index)
            return
        }
        let tab = tabs[index]
        if let n = tab.native, role == .candidate {
            showNative(n)
        } else if let path = tab.path {
            bridge.go(to: path)
            showWeb(openedFrom: nil)
        }
    }

    // MARK: - The sign-in sheet (G2)

    private weak var signInSheet: UIViewController?

    private func presentSignIn() {
        guard signInSheet == nil, session == nil else { return }
        let host = UIHostingController(rootView: SignInSheet(store: store, close: { [weak self] in
            self?.dismissSignIn(cancelled: true)
        }))
        // A large sheet on a phone; a 540pt form sheet on iPad (P10).
        host.modalPresentationStyle = UIDeviceIdiom.isPad ? .formSheet : .pageSheet
        host.preferredContentSize = CGSize(width: 540, height: 720)
        if let sheet = host.sheetPresentationController {
            sheet.detents = [.large()]
            sheet.prefersGrabberVisible = true
        }
        signInSheet = host
        // Present from whatever is on top (a Where sheet may already be up).
        var top: UIViewController = self
        while let next = top.presentedViewController { top = next }
        top.present(host, animated: true)
    }

    private func dismissSignIn(cancelled: Bool = false) {
        if cancelled { store.pendingAfterSignIn = nil }
        signInSheet?.dismiss(animated: true)
        signInSheet = nil
    }

    /// G1: "the action completes after sign-in" — the job is saved, or the
    /// apply sheet opens.
    private func finishPendingAction() {
        guard let action = store.pendingAfterSignIn else { return }
        store.pendingAfterSignIn = nil
        switch action {
        case .save(let job):
            if !store.isSaved(job.id) { store.toggleSave(job) }
        case .apply(let job):
            openWebFromNative("/job/\(job.id)?apply=1")
        }
    }

    // MARK: - Back bar

    private func buildBackBar() {
        backBar.translatesAutoresizingMaskIntoConstraints = false
        backBar.backgroundColor = ThriveTheme.navyUI
        content.addSubview(backBar)

        backButton.translatesAutoresizingMaskIntoConstraints = false
        backButton.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        backButton.titleLabel?.font = UIFont(name: "Inter-Medium", size: 17) ?? .systemFont(ofSize: 17)
        backButton.tintColor = .white
        backButton.setTitleColor(.white, for: .normal)

        webTitle.translatesAutoresizingMaskIntoConstraints = false
        webTitle.font = UIFont(name: "Inter-SemiBold", size: 17) ?? .systemFont(ofSize: 17, weight: .semibold)
        webTitle.textColor = .white
        webTitle.textAlignment = .center
        backBar.addSubview(webTitle)
        backButton.contentHorizontalAlignment = .leading
        backButton.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        backBar.addSubview(backButton)


        NSLayoutConstraint.activate([
            backBar.topAnchor.constraint(equalTo: content.topAnchor),
            backBar.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            backBar.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            backBar.bottomAnchor.constraint(equalTo: content.safeAreaLayoutGuide.topAnchor, constant: 44),
            backButton.leadingAnchor.constraint(equalTo: backBar.leadingAnchor, constant: 8),
            backButton.bottomAnchor.constraint(equalTo: backBar.bottomAnchor),
            backButton.heightAnchor.constraint(equalToConstant: 44),
            backButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
            webTitle.centerXAnchor.constraint(equalTo: backBar.centerXAnchor),
            webTitle.centerYAnchor.constraint(equalTo: backButton.centerYAnchor),
            webTitle.widthAnchor.constraint(lessThanOrEqualTo: backBar.widthAnchor, multiplier: 0.6),
        ])
        backBar.isHidden = true
    }

    private func setBackBarVisible(_ visible: Bool) {
        if let from = webOpenedFrom, visible {
            let title = webBackTitle ?? ["Jobs", "Saved", "Applications", "Messages", "Profile", "Profile"][min(max(from, 0), 5)]
            backButton.setTitle(" \(title)", for: .normal)
        }
        // A web TAB (Messages, Profile, the employer pages) has no back: its
        // navy bar carries its title instead (design E2).
        backButton.isHidden = webOpenedFrom == nil
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
        // They may have changed their details or uploaded a CV.
        if from == 5 { store.refreshProfile() }
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
            }
            session = nil
            role = nil
            roleUserId = nil
            store.signedIn = false
            tabs = ThriveRootViewController.candidateTabs
            // G1: signed out, the app is native Jobs, not a sign-in wall. A web
            // page opened from a native screen (the terms, say) is left alone.
            // Signed in, Profile is host 5; signed out it is host 4.
            if nativeIndex == 5 { showNative(4) }
            else if nativeIndex == nil && webOpenedFrom == nil { showNative(0) } else { updateBar() }
            return
        }
        let previousToken = session?.accessToken
        session = newSession
        store.signedIn = true
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
                self.store.refreshAll()
                self.tabs = ThriveRootViewController.candidateTabs
                self.dismissSignIn()
                // G2: an existing candidate goes back to the screen they came
                // from. Messages was a placeholder while signed out and is the
                // website signed in; Profile is native either way (host 4 out,
                // host 5 in, through the tab). First launch: Jobs (A1).
                let back = self.nativeIndex
                if let b = back, b >= 3 { self.selectTab(b) } else { self.showNative(back ?? 0) }
                self.finishPendingAction()
            } else if self.role == .employer && previous != .employer {
                // G8: an employer gets the four employer tabs, all website.
                self.dismissSignIn()
                self.store.pendingAfterSignIn = nil
                self.tabs = ThriveRootViewController.employerTabs
                if self.nativeIndex != nil {
                    self.bridge.go(to: "/employer/dashboard")
                    self.showWeb(openedFrom: nil)
                } else {
                    self.updateBar()
                }
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
            // The website's own dashboard is the Profile tab's old page: the
            // app shows its native Profile instead (build 17 review: "Drop the
            // TODAY card, the Recommended cards…").
            if path == "/dashboard" || path.hasPrefix("/dashboard?") {
                showNative(5)
                return
            }
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
        // Signed out, the bar shows the candidate tabs (G1). Signed in, it waits
        // for the role, which comes from a row, never from user_metadata.
        guard session == nil || role != nil, !onNoBarPage else {
            setBarVisible(false)
            bridge.setNativeNav(false, force: true)
            // Sign-in pages and the like: no app navigation, so no navy bar.
            if nativeIndex == nil && webOpenedFrom == nil { setBackBarVisible(false) }
            return
        }
        if nativeIndex == nil && backBar.isHidden { setBackBarVisible(true) }
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
            // Hosts 3 and 4 (signed-out Messages and Profile) sit at their tab index.
            match = (n == 3 || n == 4) ? n : tabs.firstIndex { $0.native == n }
        } else if let from = webOpenedFrom {
            match = tabs.firstIndex { $0.native == from }
        } else {
            match = tabs.firstIndex { tab in tab.matches.contains { currentPath.hasPrefix($0) } }
        }
        tabBar.selectedItem = match.flatMap { tabBar.items?[$0] }
        // The navy bar over a web tab names it.
        webTitle.text = (nativeIndex == nil && webOpenedFrom == nil) ? match.map { tabs[$0].title } : nil
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
