import SwiftUI

// The native candidate screens: Jobs, job detail, Saved, Applications and
// application detail (design_handoff_ios_native_layer, §A, §B and the 14 Oct
// addendum). Every list is a NavigationSplitView, so it is a push stack on a
// phone and two panes at ≥768px on iPad, from one piece of code.
//
// FONTS: Bricolage Grotesque and Inter are not bundled in the app yet, so the
// system font stands in at the design's sizes and weights.

// MARK: - Tokens (all already in the brand; see the handoff's token table)

enum TC {
    static let navy = Color(red: 15/255, green: 23/255, blue: 42/255)       // #0F172A
    static let yellow = Color(red: 1, green: 229/255, blue: 0)               // #FFE500
    static let ink2 = Color(red: 51/255, green: 65/255, blue: 85/255)        // #334155
    static let muted = Color(red: 100/255, green: 116/255, blue: 139/255)    // #64748b
    static let soft = Color(red: 148/255, green: 163/255, blue: 184/255)     // #94a3b8
    static let border = Color(red: 223/255, green: 227/255, blue: 234/255)   // #DFE3EA
    static let hairline = Color(red: 238/255, green: 240/255, blue: 244/255) // #EEF0F4
    static let page = Color(red: 246/255, green: 247/255, blue: 249/255)     // #F6F7F9
    static let bannerText = Color(red: 220/255, green: 227/255, blue: 237/255) // #DCE3ED
    static let warning = Color(red: 180/255, green: 83/255, blue: 9/255)     // #B45309
}

/// Pill colours from the website's own stepper (app/applications/page.module.css).
func statusColours(_ status: String) -> (bg: Color, fg: Color) {
    func hex(_ v: UInt32) -> Color {
        Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
    switch status {
    case "viewed": return (hex(0xdbeafe), hex(0x1e40af))
    case "shortlisted", "hired": return (hex(0xdcfce7), hex(0x166534))
    case "interview": return (hex(0xfef3c7), hex(0x92400e))
    case "offer": return (TC.yellow, TC.navy)
    case "rejected": return (hex(0xfee2e2), hex(0xb91c1c))
    default: return (hex(0xf1f5f9), hex(0x334155))
    }
}

// MARK: - Shared pieces

struct LargeTitle: View {
    let title: String
    let subline: String?
    /// Something on the title's own row, right-aligned (e.g. "Sign in"),
    /// so it does not cost a row of its own above the title.
    var trailing: AnyView? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.system(size: 32, weight: .bold)).tracking(-0.8).foregroundColor(TC.navy)
                Spacer(minLength: 8)
                if let trailing = trailing { trailing }
            }
            if let s = subline, !s.isEmpty {
                Text(s).font(.system(size: 16)).foregroundColor(TC.ink2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20).padding(.top, 4).padding(.bottom, 14)
    }
}

/// The navy "No signal" banner (A3, B4, B7).
struct NavyBanner: View {
    let heading: String
    let message: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "wifi.slash").font(.system(size: 20, weight: .semibold)).foregroundColor(.white)
            VStack(alignment: .leading, spacing: 4) {
                Text(heading).font(.system(size: 17, weight: .semibold)).foregroundColor(.white)
                Text(message).font(.system(size: 16)).foregroundColor(TC.bannerText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 14).padding(.horizontal, 16)
        .background(TC.navy).cornerRadius(14)
        .padding(.horizontal, 16).padding(.bottom, 10)
    }
}

struct PrimaryButton: View {
    let title: String
    var yellow = false
    var height: CGFloat = 52
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 17, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: height)
                .foregroundColor(yellow ? TC.navy : .white)
                .background(yellow ? TC.yellow : TC.navy).cornerRadius(14)
        }.buttonStyle(.plain)
    }
}

struct OutlineButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 17, weight: .semibold)).foregroundColor(TC.navy)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(TC.navy, lineWidth: 1.5))
        }.buttonStyle(.plain)
    }
}

/// Empty and error states (A4, B1, B5).
struct EmptyState<Buttons: View>: View {
    let symbol: String
    var symbolColour: Color = TC.navy
    let heading: String
    let message: String
    @ViewBuilder let buttons: () -> Buttons
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: symbol).font(.system(size: 28, weight: .semibold)).foregroundColor(symbolColour)
            Text(heading).font(.system(size: 22, weight: .semibold)).foregroundColor(TC.navy)
            Text(message).font(.system(size: 16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 10) { buttons() }.padding(.top, 6)
        }
        .padding(20)
        .frame(maxWidth: 640, alignment: .leading)
    }
}

/// Three skeleton cards: the loading state. No spinner anywhere.
struct SkeletonCards: View {
    @State private var dim = false
    var body: some View {
        VStack(spacing: 10) {
            ForEach(0..<3, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 10) {
                    RoundedRectangle(cornerRadius: 6).fill(TC.hairline).frame(height: 18).frame(maxWidth: 240)
                    RoundedRectangle(cornerRadius: 6).fill(TC.hairline).frame(height: 14).frame(maxWidth: 180)
                    RoundedRectangle(cornerRadius: 6).fill(TC.hairline).frame(height: 14).frame(maxWidth: 120)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16).background(Color.white).cornerRadius(16)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
            }
        }
        .padding(.horizontal, 16)
        .opacity(dim ? 0.55 : 1)
        .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever()) { dim = true } }
    }
}

extension View {
    /// A card row inside a List: no separator, page background, 16px sides.
    func cardRow() -> some View {
        self.listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
    }
    func plainRow() -> some View {
        self.listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
    }
}

struct Card<Content: View>: View {
    var selected = false
    var closed = false
    @ViewBuilder let content: () -> Content
    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.white)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(selected ? TC.navy : (closed ? TC.soft : TC.border),
                            style: StrokeStyle(lineWidth: selected ? 1.5 : 1, dash: closed ? [5, 4] : []))
            )
    }
}

struct BookmarkButton: View {
    @ObservedObject var store: ThriveStore
    let job: AppJob
    var body: some View {
        let on = store.isSaved(job.id)
        Button { store.toggleSave(job) } label: {
            Image(systemName: on ? "bookmark.fill" : "bookmark")
                .font(.system(size: 22, weight: .regular)).foregroundColor(TC.navy)
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(on ? "Remove from saved" : "Save this job")
    }
}

func jobMeta(_ job: AppJob) -> String {
    [job.pay, job.type, job.postedLabel.isEmpty ? nil : job.postedLabel].compactMap { $0 }.joined(separator: " · ")
}

struct JobCard: View {
    @ObservedObject var store: ThriveStore
    let job: AppJob
    var selected = false
    var showBookmark = true
    var body: some View {
        // TEXT-LED, LIKE THE WEBSITE'S NEW CARDS (design handoff 17): the role,
        // then pay as the second-loudest thing, then a quiet line saying who
        // and how fresh. "Full time" is left to the job page: 115 of 119 live
        // jobs say it, so on a card it tells nobody anything.
        Card(selected: selected) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 6) {
                    if job.isNew {
                        Text("NEW").font(.system(size: 13, weight: .semibold)).tracking(0.8).foregroundColor(TC.navy)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(TC.hairline).cornerRadius(6)
                    }
                    Text(job.title).font(.system(size: 18, weight: .semibold)).foregroundColor(TC.navy)
                        .fixedSize(horizontal: false, vertical: true)
                    payAndPlace
                    Text([job.company, job.postedLabel].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 16)).foregroundColor(TC.muted)
                }
                Spacer(minLength: 0)
                if showBookmark { BookmarkButton(store: store, job: job).padding(.top, -10).padding(.trailing, -10) }
            }
        }
    }

    private var payAndPlace: Text {
        if let pay = job.pay {
            return Text(pay).font(.system(size: 17, weight: .bold)).foregroundColor(TC.navy)
                + Text(" · \(job.place)").font(.system(size: 16)).foregroundColor(TC.ink2)
        }
        return Text(job.place).font(.system(size: 16)).foregroundColor(TC.ink2)
    }
}

// MARK: - A · Jobs

struct JobsScreen: View {
    @ObservedObject var store: ThriveStore
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var query = ""
    @State private var selection: String?
    @State private var showWhere = false

    private var list: [AppJob] { store.filteredJobs(query: store.online ? query : "", placeKey: store.placeKey) }

    private var subline: String {
        if let place = store.placeLabel { return "\(list.count) \(list.count == 1 ? "job" : "jobs") in \(place)" }
        guard !store.jobs.isEmpty else { return "" }
        return "\(store.jobs.count) hospitality jobs live in the UK"
    }

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationTitle("Jobs")
                .toolbar(.hidden, for: .navigationBar)
                .navigationSplitViewColumnWidth(min: 340, ideal: 400, max: 420)
        } detail: {
            NavigationStack {
                if let id = selection, let job = store.jobs.first(where: { $0.id == id }) {
                    JobDetailScreen(store: store, job: job, backTitle: "Jobs")
                } else {
                    Color.white
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .onAppear {
            if store.jobs.isEmpty || store.jobsLoad != .loaded { store.refreshJobs() }
            openFirstOnPad()
        }
        .onChange(of: store.jobs.count) { _ in openFirstOnPad() }
        .sheet(isPresented: $showWhere) {
            WhereSheet(store: store, isPresented: $showWhere)
                .presentationDetents([.medium, .large])
        }
    }

    private func openFirstOnPad() {
        if hSize == .regular, selection == nil { selection = list.first?.id }
    }

    private var sidebar: some View {
        List(selection: $selection) {
            LargeTitle(title: "Jobs", subline: subline,
                       trailing: store.signedIn ? nil : AnyView(SignInTopButton(store: store)))
                .padding(.top, 8).plainRow()

            if !store.online || (store.jobsLoad == .failed && !store.jobs.isEmpty) {
                NavyBanner(
                    heading: store.online ? "Thrive didn't answer" : "No signal",
                    message: "These are the \(store.jobs.count) jobs this \(ThriveDates.deviceWord) loaded at \(store.jobsUpdatedAt.map(ThriveDates.updated) ?? "an earlier time"). Some may have closed since."
                ).plainRow()
            }

            if store.online && !store.jobs.isEmpty {
                searchAndWhere.plainRow()
                if !store.signedIn { SignedOutPromptCard(store: store).plainRow() }
            } else if !store.jobs.isEmpty {
                whereButton.padding(.horizontal, 16).padding(.bottom, 10).plainRow()
            }

            if store.jobs.isEmpty {
                if store.jobsLoad == .failed {
                    EmptyState(symbol: "exclamationmark.triangle", symbolColour: TC.warning,
                               heading: "Thrive didn't answer",
                               message: "It's either our side or the connection. Your saved jobs and applications are on this \(ThriveDates.deviceWord) and still open.") {
                        PrimaryButton(title: "Try again") { store.refreshJobs() }
                        OutlineButton(title: "Open Saved") { store.selectTab(1) }
                    }.plainRow()
                } else {
                    SkeletonCards().plainRow()
                }
            } else if list.isEmpty {
                noResults.plainRow()
            } else {
                ForEach(list) { job in
                    JobCard(store: store, job: job, selected: hSize == .regular && selection == job.id,
                            showBookmark: hSize != .regular)
                        .tag(job.id)
                        .cardRow()
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(TC.page)
        .refreshable { store.refreshJobs() }
    }

    private var searchAndWhere: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(TC.muted)
                TextField("Job title or place", text: $query)
                    .font(.system(size: 17))
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
                    .submitLabel(.search)
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundColor(TC.muted).frame(width: 44, height: 44)
                    }.buttonStyle(.borderless).accessibilityLabel("Clear search")
                }
            }
            .padding(.leading, 14)
            .frame(minHeight: 48)
            .background(Color.white).cornerRadius(12)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(TC.border, lineWidth: 1))
            whereButton
        }
        .padding(.horizontal, 16).padding(.bottom, 10)
    }

    @ViewBuilder private var whereButton: some View {
        if let place = store.placeLabel {
            // A6: navy, pin + place, and a separate ✕ segment that clears it.
            HStack(spacing: 0) {
                Button { showWhere = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "mappin.and.ellipse")
                        Text(place).font(.system(size: 16, weight: .semibold))
                        Spacer(minLength: 0)
                    }
                    .foregroundColor(.white).padding(.horizontal, 14).frame(minHeight: 44)
                }.buttonStyle(.borderless)
                Rectangle().fill(Color.white.opacity(0.25)).frame(width: 1, height: 28)
                Button { store.placeKey = nil } label: {
                    Image(systemName: "xmark").foregroundColor(.white).frame(width: 44, height: 44)
                }.buttonStyle(.borderless).accessibilityLabel("Show jobs anywhere in the UK")
            }
            .background(TC.navy).cornerRadius(12)
        } else {
            Button { showWhere = true } label: {
                HStack(spacing: 8) {
                    Text("Anywhere in the UK").font(.system(size: 16, weight: .semibold))
                    Image(systemName: "chevron.down").font(.system(size: 14, weight: .semibold))
                    Spacer(minLength: 0)
                }
                .foregroundColor(TC.navy).padding(.horizontal, 14).frame(minHeight: 44)
                .background(Color.white).cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(TC.navy, lineWidth: 1.5))
            }.buttonStyle(.borderless)
        }
    }

    /// A7: only possible with text + place.
    @ViewBuilder private var noResults: some View {
        let q = query.trimmingCharacters(in: .whitespaces)
        let place = store.placeLabel ?? ""
        let elsewhere = store.filteredJobs(query: q, placeKey: nil).count
        let inPlace = store.filteredJobs(query: "", placeKey: store.placeKey).count
        let where_ = store.online ? "" : " on this \(ThriveDates.deviceWord)"
        EmptyState(symbol: "magnifyingglass",
                   heading: elsewhere == 0 ? "No \"\(q)\" jobs right now" : "No \"\(q)\" jobs in \(place)",
                   message: elsewhere == 0
                       ? "There are \(inPlace) other jobs in \(place)\(where_)."
                       : "There are \(elsewhere) elsewhere in the UK\(where_), and \(inPlace) other jobs in \(place).") {
            if elsewhere > 0 { PrimaryButton(title: "See the \(elsewhere) in the UK") { store.placeKey = nil } }
            OutlineButton(title: "See all \(inPlace) in \(place)") { query = "" }
        }
    }
}

/// A5: the Where sheet. Places come from the live jobs, by count, none at zero.
struct WhereSheet: View {
    @ObservedObject var store: ThriveStore
    @Binding var isPresented: Bool
    @State private var filter = ""

    var body: some View {
        let all = store.whereCounts
        let shown = filter.isEmpty ? all : all.filter { $0.label.lowercased().contains(filter.lowercased()) }
        VStack(spacing: 0) {
            HStack {
                Text("Where").font(.system(size: 20, weight: .semibold)).foregroundColor(TC.navy)
                Spacer()
                Button("Done") { isPresented = false }.font(.system(size: 17, weight: .semibold)).frame(minHeight: 44)
            }
            .padding(.horizontal, 20).padding(.top, 14)
            if !store.online {
                Text("From the \(store.jobs.count) jobs on this \(ThriveDates.deviceWord)")
                    .font(.system(size: 16)).foregroundColor(TC.muted)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20)
            }
            TextField("Town or city", text: $filter)
                .font(.system(size: 17)).padding(.horizontal, 14).frame(minHeight: 48)
                .background(Color.white).cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(TC.border, lineWidth: 1))
                .padding(.horizontal, 16).padding(.vertical, 10)
            List {
                if filter.isEmpty {
                    row(label: "Anywhere in the UK", count: store.jobs.count, key: nil)
                }
                ForEach(shown) { r in row(label: r.label, count: r.count, key: r.key) }
            }
            .listStyle(.plain)
        }
    }

    private func row(label: String, count: Int, key: String?) -> some View {
        let picked = store.placeKey == key
        return Button {
            store.placeKey = key
            isPresented = false
        } label: {
            HStack {
                Text(label).font(.system(size: 17, weight: picked ? .semibold : .regular)).foregroundColor(TC.navy)
                Text("\(count)").font(.system(size: 16)).foregroundColor(TC.muted)
                Spacer()
                if picked { Image(systemName: "checkmark").foregroundColor(TC.navy) }
            }
            .frame(minHeight: 52).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - A2 · Job detail

struct JobDetailScreen: View {
    @ObservedObject var store: ThriveStore
    let job: AppJob
    let backTitle: String
    var savedAt: Date? = nil
    @Environment(\.horizontalSizeClass) private var hSize

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(job.title).font(.system(size: hSize == .regular ? 32 : 30, weight: .bold)).tracking(-0.75)
                        .foregroundColor(TC.navy).fixedSize(horizontal: false, vertical: true)
                    Text("\(job.company) · \(job.place)").font(.system(size: 17, weight: .medium)).foregroundColor(TC.ink2)
                        .padding(.top, 8)
                    Text(detailMeta).font(.system(size: 16)).foregroundColor(TC.muted).padding(.top, 4)
                    if job.isClosed {
                        Text("This job has closed").font(.system(size: 16, weight: .semibold)).foregroundColor(TC.warning)
                            .padding(.top, 8)
                    }
                    if hSize == .regular { applyArea.frame(width: 240).padding(.top, 16) }

                    Rectangle().fill(TC.hairline).frame(height: 1).padding(.vertical, 18)

                    section("About the job", text: job.about)
                    bullets("What you'll be doing", job.responsibilities)
                    bullets("What they're looking for", job.requirements)
                    bullets("What you get", job.benefits)
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(.horizontal, hSize == .regular ? 32 : 20)
                .padding(.top, 8).padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if hSize != .regular {
                applyArea
                    .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 12)
                    .frame(maxWidth: .infinity)
                    .background(Color.white.overlay(Rectangle().fill(TC.hairline).frame(height: 1), alignment: .top))
            }
        }
        .background(Color.white)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                if let url = URL(string: job.url) {
                    ShareLink(item: url, subject: Text(job.title), message: Text("\(job.title) at \(job.company)")) {
                        Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                    }.accessibilityLabel("Share this job")
                }
                BookmarkButton(store: store, job: job)
            }
        }
        .onAppear { if hSize != .regular { store.hideTabBar = true } }
        .onDisappear { store.hideTabBar = false }
    }

    private var detailMeta: String {
        let posted = job.postedLabel.isEmpty ? nil : (["Today", "Yesterday"].contains(job.postedLabel)
            ? "Posted \(job.postedLabel.lowercased())" : "Posted \(job.postedLabel)")
        return [job.pay, job.type, posted].compactMap { $0 }.joined(separator: " · ")
    }

    /// Apply, or the sentence that replaces it. Never a greyed-out button.
    @ViewBuilder private var applyArea: some View {
        if job.isClosed {
            Text("This job has closed, so it can't take applications.")
                .font(.system(size: 16)).foregroundColor(TC.ink2).frame(maxWidth: .infinity, alignment: .leading)
        } else if !store.online {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "wifi.slash").foregroundColor(TC.navy)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Applying needs signal").font(.system(size: 17, weight: .semibold)).foregroundColor(TC.navy)
                    Text(store.isSaved(job.id)
                         ? "This job stays in Saved\(savedAt.map { ". Saved on this \(ThriveDates.deviceWord) at \(ThriveDates.updated($0))" } ?? "")."
                         : "Save it and it stays on this \(ThriveDates.deviceWord) until you have signal.")
                        .font(.system(size: 16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(16).background(TC.page).cornerRadius(14)
        } else {
            PrimaryButton(title: "Apply", yellow: true) {
                if store.signedIn { store.openWeb("/job/\(job.id)?apply=1", backTitle) }
                else { store.requireSignIn(then: .apply(job)) }
            }
        }
    }

    @ViewBuilder private func section(_ heading: String, text: String) -> some View {
        if !text.isEmpty {
            Text(heading).font(.system(size: 20, weight: .semibold)).foregroundColor(TC.navy).padding(.bottom, 8)
            Text(text).font(.system(size: 16)).lineSpacing(5).foregroundColor(TC.navy)
                .fixedSize(horizontal: false, vertical: true).padding(.bottom, 20)
        }
    }

    @ViewBuilder private func bullets(_ heading: String, _ items: [String]) -> some View {
        if !items.isEmpty {
            Text(heading).font(.system(size: 20, weight: .semibold)).foregroundColor(TC.navy).padding(.bottom, 8)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 10) {
                        Text("•").font(.system(size: 16)).foregroundColor(TC.muted)
                        Text(item).font(.system(size: 16)).foregroundColor(TC.navy).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }.padding(.bottom, 20)
        }
    }
}

// MARK: - B1–B3 · Saved

struct SavedScreen: View {
    @ObservedObject var store: ThriveStore
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var selection: String?

    var body: some View {
        if store.signedIn { signedInBody } else {
            SignedOutTab(store: store, title: "Saved", symbol: "bookmark",
                         heading: "Sign in to see your saved jobs",
                         message: "Saved jobs stay on this \(ThriveDates.deviceWord), so you can read them with no signal.")
        }
    }

    private var signedInBody: some View {
        NavigationSplitView {
            sidebar
                .navigationTitle("Saved")
                .toolbar(.hidden, for: .navigationBar)
                .navigationSplitViewColumnWidth(min: 340, ideal: 400, max: 420)
        } detail: {
            NavigationStack {
                if let id = selection, let item = store.saved.first(where: { $0.job.id == id }) {
                    JobDetailScreen(store: store, job: item.job, backTitle: "Saved", savedAt: ThriveDates.parse(item.savedAt))
                } else {
                    Color.white
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .onAppear {
            store.refreshSaved()
            if hSize == .regular, selection == nil { selection = store.saved.first?.id }
        }
    }

    private var subline: String {
        "On this \(ThriveDates.deviceWord)" + (store.savedUpdatedAt.map { " · updated \(ThriveDates.updated($0))" } ?? "")
    }

    private var sidebar: some View {
        List(selection: $selection) {
            LargeTitle(title: "Saved", subline: store.saved.isEmpty ? nil : subline).plainRow()
            if !store.online && !store.saved.isEmpty {
                NavyBanner(heading: "No signal",
                           message: "These are the \(store.saved.count) jobs saved on this \(ThriveDates.deviceWord). Some may have closed since.")
                    .plainRow()
            }
            if store.saved.isEmpty {
                if store.savedLoad == .loading && store.savedUpdatedAt == nil {
                    SkeletonCards().plainRow()
                } else {
                    EmptyState(symbol: "bookmark", heading: "Nothing saved yet",
                               message: "Tap the bookmark on any job. Saved jobs stay on this \(ThriveDates.deviceWord), so you can read them in a basement kitchen with no signal.") {
                        OutlineButton(title: store.jobs.isEmpty ? "Browse jobs" : "Browse \(store.jobs.count) jobs") { store.selectTab(0) }
                    }.plainRow()
                }
            } else {
                ForEach(store.saved) { item in
                    Card(selected: hSize == .regular && selection == item.id, closed: item.job.isClosed) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.job.title).font(.system(size: 18, weight: .semibold))
                                .foregroundColor(item.job.isClosed ? TC.ink2 : TC.navy)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("\(item.job.company) · \(item.job.place)").font(.system(size: 16)).foregroundColor(TC.ink2)
                            if item.job.isClosed {
                                Text("This job has closed").font(.system(size: 16, weight: .semibold)).foregroundColor(TC.warning)
                            } else {
                                Text("Saved \(ThriveDates.day(ThriveDates.parse(item.savedAt)))")
                                    .font(.system(size: 16)).foregroundColor(TC.muted)
                            }
                        }
                    }
                    .tag(item.id)
                    .cardRow()
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) { store.toggleSave(item.job) } label: { Label("Remove", systemImage: "bookmark.slash") }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(TC.page)
        .refreshable { store.refreshSaved() }
    }
}

// MARK: - B4–B7 · Applications

struct ApplicationsScreen: View {
    @ObservedObject var store: ThriveStore
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var selection: String?

    var body: some View {
        if store.signedIn { signedInBody } else {
            SignedOutTab(store: store, title: "Applications", symbol: "doc.text",
                         heading: "Sign in to see your applications",
                         message: "Every job you apply for shows here, with what the employer has done with it.")
        }
    }

    private var signedInBody: some View {
        NavigationSplitView {
            sidebar
                .navigationTitle("Applications")
                .toolbar(.hidden, for: .navigationBar)
                .navigationSplitViewColumnWidth(min: 340, ideal: 400, max: 420)
        } detail: {
            NavigationStack {
                if let id = selection, let app = store.applications.first(where: { $0.id == id }) {
                    ApplicationDetailScreen(store: store, application: app)
                } else {
                    Color.white
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .onAppear {
            store.refreshApplications()
            if hSize == .regular, selection == nil { selection = store.applications.first?.id }
        }
    }

    private var sidebar: some View {
        List(selection: $selection) {
            LargeTitle(title: "Applications", subline: nil).plainRow()
            if !store.online && !store.applications.isEmpty {
                NavyBanner(heading: "No signal",
                           message: "Statuses as of \(store.applicationsUpdatedAt.map(ThriveDates.updated) ?? "an earlier time"). An employer may have replied since.")
                    .plainRow()
            }
            if store.applications.isEmpty {
                if store.applicationsLoad == .loading && store.applicationsUpdatedAt == nil {
                    SkeletonCards().plainRow()
                } else {
                    EmptyState(symbol: "doc.text", heading: "No applications yet",
                               message: "When you apply, the job shows here with what the employer has done with it. You can check it without signal.") {
                        OutlineButton(title: store.jobs.isEmpty ? "Browse jobs" : "Browse \(store.jobs.count) jobs") { store.selectTab(0) }
                    }.plainRow()
                }
            } else {
                ForEach(store.applications) { app in
                    Card(selected: hSize == .regular && selection == app.id) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(app.title).font(.system(size: 18, weight: .semibold)).foregroundColor(TC.navy)
                                .fixedSize(horizontal: false, vertical: true)
                            Text([app.company, app.job?.place].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.system(size: 16)).foregroundColor(TC.ink2)
                            HStack(spacing: 10) {
                                StatusPill(status: app.status, label: app.statusLabel)
                                Text("Applied \(ThriveDates.day(ThriveDates.parse(app.appliedAt)))")
                                    .font(.system(size: 16)).foregroundColor(TC.muted)
                            }.padding(.top, 2)
                        }
                    }
                    .tag(app.id)
                    .cardRow()
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(TC.page)
        .refreshable { store.refreshApplications() }
    }
}

struct StatusPill: View {
    let status: String
    let label: String
    var body: some View {
        let c = statusColours(status)
        Text(label).font(.system(size: 16, weight: .semibold)).foregroundColor(c.fg)
            .padding(.vertical, 7).padding(.horizontal, 10).background(c.bg).cornerRadius(8)
    }
}

struct ApplicationDetailScreen: View {
    @ObservedObject var store: ThriveStore
    let application: AppApplication
    @Environment(\.horizontalSizeClass) private var hSize

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if !store.online && hSize != .regular {
                        NavyBanner(heading: "No signal",
                                   message: "As of \(store.applicationsUpdatedAt.map(ThriveDates.updated) ?? "an earlier time"). They may have replied since.")
                            .padding(.horizontal, -16)
                    }
                    Text(application.title).font(.system(size: hSize == .regular ? 32 : 30, weight: .bold)).tracking(-0.75)
                        .foregroundColor(TC.navy).fixedSize(horizontal: false, vertical: true)
                    Text([application.company, application.job?.place].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 17, weight: .medium)).foregroundColor(TC.ink2).padding(.top, 8)
                    Text(datesLine).font(.system(size: 16)).foregroundColor(TC.muted).padding(.top, 4)
                    if application.job?.isClosed == true {
                        Text("This job has closed").font(.system(size: 16, weight: .semibold)).foregroundColor(TC.warning).padding(.top, 6)
                    }
                    if hSize == .regular { buttons.frame(width: 240).padding(.top, 16) }

                    stages.padding(.top, 20)
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(.horizontal, hSize == .regular ? 32 : 20).padding(.top, 8).padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if hSize != .regular {
                buttons.padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Color.white.overlay(Rectangle().fill(TC.hairline).frame(height: 1), alignment: .top))
            }
        }
        .background(Color.white)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .navigationDestination(for: AppJob.self) { job in
            JobDetailScreen(store: store, job: job, backTitle: "Applications")
        }
    }

    private var datesLine: String {
        var parts = ["Applied \(ThriveDates.longDay(ThriveDates.parse(application.appliedAt)))"]
        if let u = store.applicationsUpdatedAt { parts.append("updated \(ThriveDates.updated(u))") }
        return parts.joined(separator: " · ")
    }

    /// "Where it's at": only the stages actually reached, newest in its colour.
    private var stages: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Where it's at").font(.system(size: 18, weight: .semibold)).foregroundColor(TC.navy)
            ForEach(Array(application.stages.enumerated()), id: \.offset) { index, stage in
                let newest = index == application.stages.count - 1
                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(newest ? statusColours(application.status).fg : TC.navy).frame(width: 28, height: 28)
                        Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(stage.label).font(.system(size: 16, weight: .semibold)).foregroundColor(TC.navy)
                        if let d = ThriveDates.parse(stage.at) {
                            Text(ThriveDates.longDay(d)).font(.system(size: 16)).foregroundColor(TC.muted)
                        }
                    }
                }
            }
            if store.online {
                Text("Nothing since. If they take it further, you'll see it here and in Messages.")
                    .font(.system(size: 16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(TC.page).cornerRadius(16)
    }

    private var buttons: some View {
        VStack(spacing: 10) {
            if store.online {
                PrimaryButton(title: "Message \(application.company)") {
                    if let employer = application.employerId {
                        store.openWeb("/messages?candidate=\(employer)", "Applications")
                    } else {
                        store.openWeb("/messages", "Applications")
                    }
                }
            } else {
                (Text("Messaging needs signal. ").fontWeight(.semibold)
                 + Text(application.job != nil ? "The job is saved on this \(ThriveDates.deviceWord), so you can still read it." : ""))
                    .font(.system(size: 16)).foregroundColor(TC.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let job = application.job {
                NavigationLink(value: job) {
                    Text("View the job").font(.system(size: 17, weight: .semibold)).foregroundColor(TC.navy)
                        .frame(maxWidth: .infinity, minHeight: 52).background(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(TC.navy, lineWidth: 1.5))
                }.buttonStyle(.plain)
            }
        }
    }
}
