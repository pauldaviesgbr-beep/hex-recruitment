import SwiftUI

// THE JOBS HOME (design "Brand pass, 17 Oct": H1 signed out, H2 its end,
// H3 signed in). Paul: "we don't need all the jobs scrollable on the home
// page". So: a navy band with the lockup, a headline, search, Where and a
// yellow Search; then three jobs; then "See all", Shifts, and (signed out) the
// sign-up card. The full list is its own screen (JobsScreen, H4).

/// One dense job row (H1, H4, H6): title, pay in bold navy · place, age.
/// No type and no recruiter: they live on the job page.
struct DenseJobRow: View {
    @ObservedObject var store: ThriveStore
    let job: AppJob
    var showBookmark = true
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(job.title).font(.inter(17, .semibold)).foregroundColor(TC.navy)
                    .lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                payAndPlace
                Text(job.postedLabel).font(.inter(16)).foregroundColor(TC.muted)
            }
            Spacer(minLength: 0)
            if showBookmark { BookmarkButton(store: store, job: job).padding(.top, -10).padding(.trailing, -8) }
        }
        .padding(.vertical, 16).padding(.leading, 18).padding(.trailing, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .contentShape(Rectangle())
    }

    private var payAndPlace: Text {
        let pay = job.payShort ?? job.pay
        if let pay = pay {
            return Text(pay).font(.inter(16, .bold)).foregroundColor(TC.navy)
                + Text(" · \(job.place)").font(.inter(16)).foregroundColor(TC.ink2)
        }
        return Text(job.place).font(.inter(16)).foregroundColor(TC.ink2)
    }
}

/// Rows in a white rounded container, hairlines between them.
struct JobsContainer: View {
    @ObservedObject var store: ThriveStore
    let jobs: [AppJob]
    let open: (AppJob) -> Void
    var body: some View {
        VStack(spacing: 1) {
            ForEach(jobs) { job in
                Button { open(job) } label: { DenseJobRow(store: store, job: job) }
                    .buttonStyle(.plain)
            }
        }
        .background(TC.hairline)
        .cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
    }
}


struct HomeScreen: View {
    @ObservedObject var store: ThriveStore
    /// Push the full list (H4) with this search text.
    let openAll: (String) -> Void
    /// The full list filtered to temp work (H2's Shifts row).
    let openShifts: () -> Void
    let openJob: (AppJob) -> Void

    @State private var query = ""
    @State private var showWhere = false
    @State private var placeBeforeSheet: String?
    @State private var bandGone = false
    @FocusState private var searchFocused: Bool
    @AppStorage("thrive.a9Dismissed") private var a9Dismissed = false

    var body: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .top) {
                ScrollView {
                    VStack(spacing: 0) {
                        band
                            .id("top")
                            .background(GeometryReader { g in
                                // The band's bottom edge, read on every scroll. (A preference
                                // key did not reach onPreferenceChange on build 17: the
                                // compact bar never appeared.) onChange of the frame does.
                                let bottom = g.frame(in: .named("home")).maxY
                                Color.clear
                                    .onAppear { bandGone = bottom < 40 }
                                    .onChange(of: bottom) { newValue in
                                        let gone = newValue < 40
                                        if gone != bandGone { bandGone = gone }
                                    }
                            })
                        content
                            .frame(maxWidth: 640)
                            .frame(maxWidth: .infinity)
                            .background(TC.page)
                    }
                }
                .coordinateSpace(name: "home")
                .safeAreaInset(edge: .top, spacing: 0) {
                    // Paints the status bar area navy (the background extends
                    // into the safe area), so the band never slides under the clock.
                    Color.clear.frame(height: 0).background(TC.navy)
                }
                .refreshable { store.refreshJobs(); store.refreshHome() }
                // Navy behind the status bar and above the band, including the
                // pull-to-refresh overscroll. The content sets its own background.
                .background(alignment: .top) { TC.navy.frame(height: 500).ignoresSafeArea() }

                if bandGone {
                    compactBar {
                        withAnimation { proxy.scrollTo("top", anchor: .top) }
                        searchFocused = true
                    }
                }
            }
        }
        .background(TC.page)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            if store.jobs.isEmpty || store.jobsLoad != .loaded { store.refreshJobs() }
            store.refreshHome()
        }
        .sheet(isPresented: $showWhere, onDismiss: {
            // Picking a place opens the full list with every match (H1).
            if store.placeKey != placeBeforeSheet { openAll(query) }
        }) {
            WhereSheet(store: store, isPresented: $showWhere).presentationDetents([.medium, .large])
        }
    }

    // MARK: - The band

    private var headline: String {
        guard store.signedIn else { return "Hospitality jobs worth building a career on." }
        let hour = Calendar.current.component(.hour, from: Date())
        let part = hour < 12 ? "Morning" : (hour < 18 ? "Afternoon" : "Evening")
        if let name = store.profile?.firstName, !name.isEmpty { return "\(part), \(name)." }
        return "\(part)."
    }

    private var band: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image("ThriveLockupWhite").resizable().scaledToFit().frame(height: 30).accessibilityLabel("Thrive")
                Spacer()
                if !store.signedIn { SignInTopButton(store: store, onNavy: true) }
            }
            .frame(height: 52)

            Text(headline).font(.inter(28, .heavy)).tracking(-0.7).foregroundColor(.white)
                .lineSpacing(1).fixedSize(horizontal: false, vertical: true)

            if !store.jobs.isEmpty && store.online {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundColor(TC.muted)
                    TextField("Job title or keyword", text: $query)
                        .font(.inter(17))
                        .foregroundColor(TC.navy)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .submitLabel(.search)
                        .focused($searchFocused)
                        .onSubmit { openAll(query) }
                }
                .padding(.horizontal, 16).frame(height: 52)
                .background(Color.white).cornerRadius(14)

                HStack(spacing: 10) {
                    Button {
                        placeBeforeSheet = store.placeKey
                        showWhere = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "mappin")
                            Text(store.placeLabel ?? "All of the UK").font(.inter(17, .semibold)).lineLimit(1)
                            Spacer(minLength: 4)
                            Image(systemName: "chevron.down").font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white).padding(.horizontal, 16).frame(height: 52)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.4), lineWidth: 1))
                        .contentShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)

                    // The one yellow on this screen.
                    Button { openAll(query) } label: {
                        Text("Search").font(.inter(17, .bold)).foregroundColor(TC.navy)
                            .frame(width: 112, height: 52).background(TC.yellow).cornerRadius(14)
                    }
                    .buttonStyle(.plain)
                }
            }

            if !store.online {
                HStack(spacing: 8) {
                    Image(systemName: "wifi.slash")
                    Text("No signal · these are the \(store.jobs.count) jobs this \(ThriveDates.deviceWord) loaded at \(store.jobsUpdatedAt.map(ThriveDates.updated) ?? "an earlier time").")
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.inter(16, .medium)).foregroundColor(TC.bannerText)
            } else if !store.signedIn && !store.jobs.isEmpty {
                Text("\(store.jobs.count) jobs live · no account needed to look")
                    .font(.inter(16, .medium)).foregroundColor(TC.bannerText)
            }
        }
        .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TC.navy)
    }

    private func compactBar(searchTap: @escaping () -> Void) -> some View {
        HStack(spacing: 4) {
            Image("ThriveLockupWhite").resizable().scaledToFit().frame(height: 26).accessibilityLabel("Thrive")
            Spacer()
            Button(action: searchTap) {
                Image(systemName: "magnifyingglass").font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.white).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Search jobs")
            if !store.signedIn { SignInTopButton(store: store, onNavy: true) }
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
        .frame(maxWidth: .infinity)
        .background(TC.navy.ignoresSafeArea(edges: .top))
    }

    // MARK: - Below the band

    @ViewBuilder private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            if store.jobs.isEmpty {
                if store.jobsLoad == .failed {
                    EmptyState(symbol: "exclamationmark.triangle", symbolColour: TC.warning,
                               heading: "Thrive didn't answer",
                               message: "It's either our side or the connection. Your saved jobs and applications are on this \(ThriveDates.deviceWord) and still open.") {
                        PrimaryButton(title: "Try again") { store.refreshJobs() }
                        OutlineButton(title: "Open Saved") { store.selectTab(1) }
                    }
                } else {
                    SkeletonCards().padding(.top, 20)
                }
            } else {
                let forYou = store.signedIn ? store.forYou(placeKey: store.placeKey) : []
                if !forYou.isEmpty {
                    section("For you", subline: "Because your profile says \(store.profile?.jobTitle ?? "")", jobs: forYou)
                } else {
                    if store.signedIn && store.profile != nil && (store.profile?.jobTitle ?? "").isEmpty && !a9Dismissed {
                        thinProfileCard.padding(.top, 20)
                    }
                    section("New this week", subline: nil, jobs: Array(store.filteredJobs(query: "", placeKey: nil).prefix(3)))
                }

                // The end of the home (H2).
                Button { openAll("") } label: {
                    HStack(spacing: 8) {
                        Text("See all \(store.jobs.count) jobs").font(.inter(17, .bold))
                        Image(systemName: "chevron.right").font(.system(size: 15, weight: .bold))
                    }
                    .foregroundColor(.white).frame(maxWidth: .infinity, minHeight: 52)
                    .background(TC.navy).cornerRadius(14)
                }
                .buttonStyle(.plain)
                .padding(.top, 14)

                Text("Shifts").font(.inter(20, .heavy)).foregroundColor(TC.navy).padding(.top, 28).padding(.bottom, 12)
                shiftsRow

                if !store.signedIn {
                    signUpCard.padding(.top, 24)
                }
            }
        }
        .padding(.horizontal, 16).padding(.bottom, 32)
    }

    private func section(_ title: String, subline: String?, jobs: [AppJob]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.inter(20, .heavy)).foregroundColor(TC.navy)
                    if let s = subline { Text(s).font(.inter(16)).foregroundColor(TC.muted) }
                }
                Spacer()
                Button("See all") { openAll("") }
                    .font(.inter(16, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
            }
            JobsContainer(store: store, jobs: jobs, open: openJob)
        }
        .padding(.top, 22)
    }

    private var shiftsRow: some View {
        Button { openShifts() } label: {
            HStack(spacing: 14) {
                Image(systemName: "calendar").font(.system(size: 20, weight: .semibold)).foregroundColor(.white)
                    .frame(width: 44, height: 44).background(TC.navy).cornerRadius(10)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Short-notice and temp work").font(.inter(17, .semibold)).foregroundColor(TC.navy)
                    Text(shiftsLine).font(.inter(16)).foregroundColor(TC.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundColor(TC.muted)
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white).cornerRadius(16)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var shiftsLine: String {
        guard let n = store.shiftsOpen else { return "Short-notice shifts from local employers" }
        return n == 0 ? "None open right now" : "\(n) open now"
    }

    /// Signed out only. White button: Search already has this screen's yellow.
    private var signUpCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Save jobs and apply in a minute").font(.inter(20, .heavy)).foregroundColor(.white)
            Text("Your saved jobs and applications stay on this \(ThriveDates.deviceWord), even with no signal.")
                .font(.inter(16)).foregroundColor(TC.bannerText).fixedSize(horizontal: false, vertical: true)
            Button { store.requireSignIn() } label: {
                Text("Create a free account").font(.inter(17, .bold)).foregroundColor(TC.navy)
                    .frame(maxWidth: .infinity, minHeight: 52).background(Color.white).cornerRadius(14)
            }
            .buttonStyle(.plain).padding(.top, 4)
        }
        .padding(20).background(TC.navy).cornerRadius(16)
    }

    /// A9, restyled navy: a profile with no job title has nothing to match on.
    private var thinProfileCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text("Jobs picked for you").font(.inter(20, .heavy)).foregroundColor(.white)
                Spacer()
                Button { a9Dismissed = true } label: {
                    Image(systemName: "xmark").foregroundColor(.white).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Hide this")
                .padding(.top, -10).padding(.trailing, -10)
            }
            Text("Tell us what kind of work you do and the closest matches show here first.")
                .font(.inter(16)).foregroundColor(TC.bannerText).fixedSize(horizontal: false, vertical: true)
            Button { store.openWeb("/profile", "Jobs") } label: {
                Text("Add your job title").font(.inter(17, .bold)).foregroundColor(TC.navy)
                    .frame(maxWidth: .infinity, minHeight: 52).background(Color.white).cornerRadius(14)
            }
            .buttonStyle(.plain).padding(.top, 4)
        }
        .padding(20).background(TC.navy).cornerRadius(16)
    }
}

/// The Jobs tab: the home, and the full list (H4) when Search, Where or a
/// "See all" asks for it.
struct JobsTab: View {
    @ObservedObject var store: ThriveStore
    @State private var showAll = false
    @State private var allQuery = ""
    @State private var shiftsOnly = false
    @State private var path: [AppJob] = []

    var body: some View {
        if showAll {
            JobsScreen(store: store, initialQuery: allQuery, initialShiftsOnly: shiftsOnly, back: { showAll = false })
        } else {
            NavigationStack(path: $path) {
                HomeScreen(store: store,
                           openAll: { q in allQuery = q; shiftsOnly = false; showAll = true },
                           openShifts: { allQuery = ""; shiftsOnly = true; showAll = true },
                           openJob: { job in path.append(job) })
                    .navigationDestination(for: AppJob.self) { job in
                        JobDetailScreen(store: store, job: job, backTitle: "Jobs")
                    }
            }
        }
    }
}
