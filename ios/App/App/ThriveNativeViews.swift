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
    // Design R3 (build 17 review).
    switch status {
    case "viewed", "shortlisted": return (hex(0xE0EBFF), hex(0x1D4ED8))
    case "interview", "offer", "hired": return (TC.navy, .white)
    case "rejected", "withdrawn": return (hex(0xF6F7F9), hex(0x64748B))
    default: return (hex(0xEEF0F4), hex(0x334155))
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
                Text(title).font(.inter(32, .bold)).tracking(-0.8).foregroundColor(TC.navy)
                Spacer(minLength: 8)
                if let trailing = trailing { trailing }
            }
            if let s = subline, !s.isEmpty {
                Text(s).font(.inter(16)).foregroundColor(TC.ink2)
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
                Text(heading).font(.inter(17, .semibold)).foregroundColor(.white)
                Text(message).font(.inter(16)).foregroundColor(TC.bannerText)
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
            Text(title).font(.inter(17, .semibold))
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
            Text(title).font(.inter(17, .semibold)).foregroundColor(TC.navy)
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
            Text(heading).font(.inter(22, .semibold)).foregroundColor(TC.navy)
            Text(message).font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
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
                    .stroke(selected ? TC.navy : TC.border, lineWidth: selected ? 1.5 : 1)
            )
            // H6: a closed job carries a 3px warning edge on the left.
            .overlay(alignment: .leading) {
                if closed { Rectangle().fill(TC.warning).frame(width: 3).padding(.vertical, 1) }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct BookmarkButton: View {
    @ObservedObject var store: ThriveStore
    let job: AppJob
    var tint: Color = TC.navy
    var body: some View {
        let on = store.isSaved(job.id)
        Button { store.toggleSave(job) } label: {
            Image(systemName: on ? "bookmark.fill" : "bookmark")
                .font(.inter(22, .regular)).foregroundColor(tint)
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
                        Text("NEW").font(.inter(13, .semibold)).tracking(0.8).foregroundColor(TC.navy)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(TC.hairline).cornerRadius(6)
                    }
                    Text(job.title).font(.inter(18, .semibold)).foregroundColor(TC.navy)
                        .fixedSize(horizontal: false, vertical: true)
                    payAndPlace
                    Text([job.company, job.postedLabel].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.inter(16)).foregroundColor(TC.muted)
                }
                Spacer(minLength: 0)
                if showBookmark { BookmarkButton(store: store, job: job).padding(.top, -10).padding(.trailing, -10) }
            }
        }
    }

    private var payAndPlace: Text {
        if let pay = job.pay {
            return Text(pay).font(.inter(17, .bold)).foregroundColor(TC.navy)
                + Text(" · \(job.place)").font(.inter(16)).foregroundColor(TC.ink2)
        }
        return Text(job.place).font(.inter(16)).foregroundColor(TC.ink2)
    }
}

// MARK: - A · Jobs

struct JobsScreen: View {
    @ObservedObject var store: ThriveStore
    /// H4 is opened from the home with its search text, and goes back to it.
    var initialQuery: String = ""
    /// Opened from the home's Shifts row: temp work only (the Shifts chip toggles it).
    var initialShiftsOnly = false
    /// Opened from "See similar jobs": one category, with a chip to clear it.
    var initialCategory: String? = nil
    var back: (() -> Void)? = nil
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var query = ""
    @State private var seeded = false
    @State private var shiftsOnly = false
    @State private var category: String?
    @State private var selection: String?
    @State private var showWhere = false

    private var list: [AppJob] {
        let all = store.filteredJobs(query: store.online ? query : "", placeKey: store.placeKey)
        // Temp work, as the website's /temp-work counts it: adverts marked Temporary.
        let temp = shiftsOnly ? all.filter { ($0.facts ?? []).contains("Temporary") } : all
        return category.map { c in temp.filter { $0.category == c } } ?? temp
    }

    private var subline: String {
        if let place = store.placeLabel { return "\(list.count) \(list.count == 1 ? "job" : "jobs") in \(place)" }
        guard !store.jobs.isEmpty else { return "" }
        return "\(store.jobs.count) hospitality jobs live in the UK"
    }

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationTitle("All jobs")
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
            if !seeded { query = initialQuery; shiftsOnly = initialShiftsOnly; category = initialCategory; seeded = true }
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

    /// H4's count line: "119 jobs · newest first", or "14 jobs in London".
    private var countLine: String {
        let n = category != nil
            ? "\(list.count) similar \(list.count == 1 ? "job" : "jobs")"
            : shiftsOnly
            ? "\(list.count) temp \(list.count == 1 ? "job" : "jobs")"
            : "\(list.count) \(list.count == 1 ? "job" : "jobs")"
        if let place = store.placeLabel { return "\(n) in \(place)" }
        return "\(n) · newest first"
    }

    private var sidebar: some View {
        VStack(spacing: 0) {
        allJobsHeader
        List(selection: $selection) {
            if !store.jobs.isEmpty && !list.isEmpty {
                Text(countLine).font(.inter(16, .medium)).foregroundColor(TC.ink2)
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .plainRow()
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
            } else if list.isEmpty && shiftsOnly && query.isEmpty && store.placeKey == nil {
                // F1: none open. No example shifts and no "notify me".
                EmptyState(symbol: "calendar", heading: "No shifts open right now",
                           message: "Short-notice and temp shifts from local employers appear here, with the day and hours up front.") {
                    OutlineButton(title: "See \(store.jobs.count) jobs") { shiftsOnly = false }
                }.plainRow()
            } else if list.isEmpty {
                noResults.plainRow()
            } else {
                // H4: the dense list, edge to edge, white, hairlines between.
                ForEach(list) { job in
                    DenseJobRow(store: store, job: job, showBookmark: hSize != .regular)
                        .overlay(alignment: .leading) {
                            if hSize == .regular && selection == job.id { Rectangle().fill(TC.navy).frame(width: 3) }
                        }
                        .tag(job.id)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.white)
                        .listRowSeparatorTint(TC.hairline)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.white)
        .refreshable { store.refreshJobs() }
        }
    }

    /// H4's navy header: back to the home, the title, search, then Where and
    /// Shifts as chips. Offline, the banner is a line here (H6's rule).
    private var allJobsHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                Text("All jobs").font(.inter(17, .semibold)).foregroundColor(.white)
                HStack {
                    if let back = back {
                        Button(action: back) {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold))
                                Text("Jobs").font(.inter(17, .medium))
                            }
                            .foregroundColor(.white).frame(minHeight: 44)
                        }
                        .accessibilityLabel("Back to Jobs")
                    }
                    Spacer()
                }
            }
            .frame(height: 44)

            if store.online && !store.jobs.isEmpty { searchField }

            if !store.jobs.isEmpty {
                HStack(spacing: 10) {
                    whereButton
                    // H4: Shifts toggles a filter. On, it is a soft white chip with a tick.
                    Button { shiftsOnly.toggle() } label: {
                        HStack(spacing: 6) {
                            if shiftsOnly { Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)) }
                            Text("Shifts").font(.inter(16, .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 16).frame(minHeight: 44)
                        .background(shiftsOnly ? Color.white.opacity(0.12) : Color.clear)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(shiftsOnly ? 0 : 0.4), lineWidth: 1))
                        .cornerRadius(12)
                        .contentShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(shiftsOnly ? .isSelected : [])
                    if category != nil {
                        Button { category = nil } label: {
                            HStack(spacing: 6) {
                                Text("Similar").font(.inter(16, .semibold))
                                Image(systemName: "xmark").font(.system(size: 13, weight: .bold))
                            }
                            .foregroundColor(.white).padding(.horizontal, 14).frame(minHeight: 44)
                            .background(Color.white.opacity(0.12)).cornerRadius(12)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Show all jobs, not only similar ones")
                    }
                    Spacer(minLength: 0)
                }
            }

            if !store.online || (store.jobsLoad == .failed && !store.jobs.isEmpty) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "wifi.slash")
                    Text("\(store.online ? "Thrive didn't answer" : "No signal") · these are the \(store.jobs.count) jobs this \(ThriveDates.deviceWord) loaded at \(store.jobsUpdatedAt.map(ThriveDates.updated) ?? "an earlier time"). Some may have closed since.")
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.inter(16, .medium)).foregroundColor(TC.bannerText)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 16).padding(.bottom, 14)
        .background(TC.navy.ignoresSafeArea(edges: .top))
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundColor(TC.muted)
            TextField("Job title or keyword", text: $query)
                .font(.inter(17))
                .foregroundColor(TC.navy)
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
    }

    /// Where, as a chip on navy (H4). A picked place is a soft white chip with
    /// its own ✕; this screen has no yellow (the home's Search has it).
    @ViewBuilder private var whereButton: some View {
        if let place = store.placeLabel {
            HStack(spacing: 0) {
                Button { showWhere = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "mappin")
                        Text(place).font(.inter(16, .semibold)).lineLimit(1)
                    }
                    .foregroundColor(.white).padding(.leading, 14).padding(.trailing, 6).frame(minHeight: 44)
                }.buttonStyle(.borderless)
                Button { store.placeKey = nil } label: {
                    Image(systemName: "xmark").font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white).frame(width: 40, height: 44)
                }.buttonStyle(.borderless).accessibilityLabel("Show jobs anywhere in the UK")
            }
            .background(Color.white.opacity(0.12)).cornerRadius(12)
        } else {
            Button { showWhere = true } label: {
                HStack(spacing: 6) {
                    Text("All of the UK").font(.inter(16, .semibold))
                    Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold))
                }
                .foregroundColor(.white).padding(.horizontal, 14).frame(minHeight: 44)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.4), lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 12))
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
                Text("Where").font(.inter(20, .semibold)).foregroundColor(TC.navy)
                Spacer()
                Button("Done") { isPresented = false }.font(.inter(17, .semibold)).frame(minHeight: 44)
            }
            .padding(.horizontal, 20).padding(.top, 14)
            if !store.online {
                Text("From the \(store.jobs.count) jobs on this \(ThriveDates.deviceWord)")
                    .font(.inter(16)).foregroundColor(TC.muted)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20)
            }
            TextField("Town or city", text: $filter)
                .font(.inter(17)).padding(.horizontal, 14).frame(minHeight: 48)
                .background(Color.white).cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(TC.border, lineWidth: 1))
                .padding(.horizontal, 16).padding(.vertical, 10)
            List {
                if filter.isEmpty {
                    row(label: "All of the UK", count: store.jobs.count, key: nil)
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
                Text(label).font(.inter(17, picked ? .semibold : .regular)).foregroundColor(TC.navy)
                Text("\(count)").font(.inter(16)).foregroundColor(TC.muted)
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
    @Environment(\.dismiss) private var dismiss
    @State private var headerGone = false

    var body: some View {
        VStack(spacing: 0) {
            DetailTopBar(title: headerGone ? job.title : nil,
                         backTitle: backTitle,
                         back: hSize == .regular ? nil : { dismiss() }) {
                if let url = URL(string: job.url) {
                    ShareLink(item: url, subject: Text(job.title), message: Text("\(job.title) at \(job.company)")) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 20, weight: .medium))
                            .foregroundColor(.white).frame(width: 44, height: 44)
                    }.accessibilityLabel("Share this job")
                }
                BookmarkButton(store: store, job: job, tint: .white)
            }
            ScrollView {
                VStack(spacing: 0) {
                // H5: the website's dark header, made native. Title, who and
                // where, pay written out large, then the facts as soft chips.
                VStack(alignment: .leading, spacing: 10) {
                    Text(job.title).font(.inter(26, .heavy)).tracking(-0.5)
                        .foregroundColor(.white).fixedSize(horizontal: false, vertical: true)
                    Text("\(job.company) · \(job.place)").font(.inter(16, .medium)).foregroundColor(TC.bannerText)
                    if let pay = job.payLong ?? job.pay {
                        Text(pay).font(.inter(22, .heavy)).foregroundColor(.white).padding(.top, 2)
                    }
                    if !chips.isEmpty {
                        FlowChips(items: chips).padding(.top, 2)
                    }
                    if job.isClosed {
                        Text("This job has closed").font(.inter(16, .semibold)).foregroundColor(Color(red: 1, green: 0.78, blue: 0.5))
                    }
                    if hSize == .regular { applyArea.frame(width: 240).padding(.top, 6) }
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(.horizontal, hSize == .regular ? 32 : 20)
                .padding(.top, 8).padding(.bottom, 22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TC.navy)
                .background(GeometryReader { g in
                    // Once the header has gone, its title moves into the bar.
                    let bottom = g.frame(in: .named("jobdetail")).maxY
                    Color.clear.onChange(of: bottom) { v in
                        let gone = v < 8
                        if gone != headerGone { withAnimation(.easeOut(duration: 0.15)) { headerGone = gone } }
                    }
                })

                VStack(alignment: .leading, spacing: 0) {
                    aboutSection
                    bullets("What you'll be doing", job.responsibilities)
                    bullets("What they're looking for", job.requirements)
                    bullets("What you get", job.benefits)
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(.horizontal, hSize == .regular ? 32 : 20)
                .padding(.top, 22).padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white)
                }
            }
            .coordinateSpace(name: "jobdetail")
            .background(alignment: .top) { TC.navy.frame(height: 400) }
            if hSize != .regular {
                applyArea
                    .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 12)
                    .frame(maxWidth: .infinity)
                    .background(Color.white.overlay(Rectangle().fill(TC.hairline).frame(height: 1), alignment: .top))
            }
        }
        .background(Color.white)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { if hSize != .regular { store.hideTabBar = true } }
        .onDisappear { store.hideTabBar = false }
    }

    /// Type, contract and age (H5).
    private var chips: [String] {
        var c = job.facts ?? (job.type.map { [$0] } ?? [])
        if !job.postedLabel.isEmpty { c.append(job.postedLabel) }
        return c
    }

    /// Apply, or the sentence that replaces it. Never a greyed-out button.
    @ViewBuilder private var applyArea: some View {
        if job.isClosed {
            // Build 17 review: a panel, and somewhere to go next.
            VStack(alignment: .leading, spacing: 12) {
                Text("This job has closed, so it can't take applications.")
                    .font(.inter(16, .semibold)).foregroundColor(TC.navy).fixedSize(horizontal: false, vertical: true)
                if job.category != nil {
                    OutlineButton(title: "See similar jobs") { store.showSimilar(to: job) }
                }
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(TC.page).cornerRadius(14)
        } else if !store.online {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "wifi.slash").foregroundColor(TC.navy)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Applying needs signal").font(.inter(17, .semibold)).foregroundColor(TC.navy)
                    Text(store.isSaved(job.id)
                         ? "This job stays in Saved\(savedAt.map { ". Saved on this \(ThriveDates.deviceWord) at \(ThriveDates.updated($0))" } ?? "")."
                         : "Save it and it stays on this \(ThriveDates.deviceWord) until you have signal.")
                        .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(16).background(TC.page).cornerRadius(14)
        } else {
            PrimaryButton(title: "Apply now", yellow: true) {
                if store.signedIn { store.openWeb("/job/\(job.id)?apply=1", backTitle) }
                else { store.requireSignIn(then: .apply(job)) }
            }
        }
    }

    /// "About the job", with the advert's own subheadings as headings
    /// (build 17 review), including on closed jobs.
    @ViewBuilder private var aboutSection: some View {
        if let blocks = job.aboutBlocks, !blocks.isEmpty {
            Text("About the job").font(.inter(19, .heavy)).foregroundColor(TC.navy).padding(.bottom, 8)
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, b in
                if b.kind == "heading" {
                    Text(b.text).font(.inter(19, .heavy)).foregroundColor(TC.navy)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 10).padding(.bottom, 6)
                } else {
                    Text(b.text).font(.inter(16)).lineSpacing(6).foregroundColor(TC.ink2)
                        .fixedSize(horizontal: false, vertical: true).padding(.bottom, 10)
                }
            }
            Color.clear.frame(height: 10)
        } else {
            section("About the job", text: job.about)
        }
    }

    @ViewBuilder private func section(_ heading: String, text: String) -> some View {
        if !text.isEmpty {
            Text(heading).font(.inter(19, .heavy)).foregroundColor(TC.navy).padding(.bottom, 8)
            Text(text).font(.inter(16)).lineSpacing(6).foregroundColor(TC.ink2)
                .fixedSize(horizontal: false, vertical: true).padding(.bottom, 20)
        }
    }

    @ViewBuilder private func bullets(_ heading: String, _ items: [String]) -> some View {
        if !items.isEmpty {
            Text(heading).font(.inter(19, .heavy)).foregroundColor(TC.navy).padding(.bottom, 8)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 10) {
                        Text("•").font(.inter(16)).foregroundColor(TC.muted)
                        Text(item).font(.inter(16)).lineSpacing(4).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
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

    private var bandLine: String? {
        if store.saved.isEmpty { return nil }
        if !store.online {
            return "No signal · these are the \(store.saved.count) jobs saved on this \(ThriveDates.deviceWord). Some may have closed since."
        }
        let n = "\(store.saved.count) \(store.saved.count == 1 ? "job" : "jobs") on this \(ThriveDates.deviceWord)"
        return n + (store.savedUpdatedAt.map { " · updated \(ThriveDates.updated($0))" } ?? "")
    }

    private var sidebar: some View {
        VStack(spacing: 0) {
        NavyTitleBand(title: "Saved", line: bandLine, offline: !store.online) { EmptyView() }
        if store.saved.isEmpty {
            ScrollView {
                if store.savedLoad == .loading && store.savedUpdatedAt == nil {
                    SkeletonCards().padding(.top, 16)
                } else {
                    EmptyState(symbol: "bookmark", heading: "Nothing saved yet",
                               message: "Tap the bookmark on any job. Saved jobs stay on this \(ThriveDates.deviceWord), so you can read them in a basement kitchen with no signal.") {
                        OutlineButton(title: store.jobs.isEmpty ? "Browse jobs" : "Browse \(store.jobs.count) jobs") { store.selectTab(0) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .background(TC.page)
            .refreshable { store.refreshSaved() }
        } else {
            // R2: one rounded container, 16pt below the band; the R1 row with
            // the pay and the advert's age; swipe left removes, and so does the
            // filled bookmark, with Undo.
            List(selection: $selection) {
                Section {
                    ForEach(store.saved) { item in
                        DenseJobRow(store: store, job: item.job, showBookmark: hSize != .regular)
                            .tag(item.id)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.white)
                            .listRowSeparatorTint(TC.hairline)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) { store.toggleSave(item.job) } label: { Label("Remove", systemImage: "bookmark.slash") }
                            }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .environment(\.defaultMinListHeaderHeight, 16)
            .scrollContentBackground(.hidden)
            .background(TC.page)
            .refreshable { store.refreshSaved() }
            .overlay(alignment: .bottom) { UndoBar(store: store) }
        }
        }
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
            markVisit()
            store.refreshApplications()
            if hSize == .regular, selection == nil { selection = store.applications.first?.id }
        }
    }

    private var bandLine: String? {
        if store.applications.isEmpty { return nil }
        if !store.online {
            return "No signal · statuses as of \(store.applicationsUpdatedAt.map(ThriveDates.updated) ?? "an earlier time"). An employer may have replied since."
        }
        return store.applicationsUpdatedAt.map { "Updated \(ThriveDates.updated($0))" }
    }

    private var sidebar: some View {
        VStack(spacing: 0) {
        NavyTitleBand(title: "Applications", line: bandLine, offline: !store.online) { EmptyView() }
        // C1: the notification ask, once there is an application to hear about.
        if !store.applications.isEmpty { NotifyAskCard(store: store) }
        if store.applications.isEmpty {
            ScrollView {
                if store.applicationsLoad == .loading && store.applicationsUpdatedAt == nil {
                    SkeletonCards().padding(.top, 16)
                } else {
                    EmptyState(symbol: "doc.text", heading: "No applications yet",
                               message: "When you apply, the job shows here with what the employer has done with it. You can check it without signal.") {
                        OutlineButton(title: store.jobs.isEmpty ? "Browse jobs" : "Browse \(store.jobs.count) jobs") { store.selectTab(0) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .background(TC.page)
            .refreshable { store.refreshApplications() }
        } else {
            // R3: one rounded container. Title; "{employer} · {date}" (plus
            // "· closed"); the status pill on the right; a navy dot on a row
            // whose status changed since the last visit.
            List(selection: $selection) {
                Section {
                    ForEach(store.applications) { app in
                        ApplicationRow(app: app, changed: changedIds.contains(app.id))
                            .tag(app.id)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.white)
                            .listRowSeparatorTint(TC.hairline)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .environment(\.defaultMinListHeaderHeight, 16)
            .scrollContentBackground(.hidden)
            .background(TC.page)
            .refreshable { store.refreshApplications() }
        }
        }
    }

    /// Statuses as they were at the last visit, kept on the phone. A row is
    /// "changed" when its status differs from what was seen then.
    @State private var changedIds: Set<String> = []
    private static let seenKey = "thrive.applicationStatusesSeen"

    private func markVisit() {
        let seen = (UserDefaults.standard.dictionary(forKey: ApplicationsScreen.seenKey) as? [String: String]) ?? [:]
        changedIds = Set(store.applications.filter { seen[$0.id] != nil && seen[$0.id] != $0.status }.map { $0.id })
        var now: [String: String] = [:]
        for a in store.applications { now[a.id] = a.status }
        UserDefaults.standard.set(now, forKey: ApplicationsScreen.seenKey)
    }
}

struct StatusPill: View {
    let status: String
    let label: String
    var body: some View {
        let c = statusColours(status)
        // "Rejected" is the website's word; the app says what it means.
        Text(status == "rejected" ? "Not taken forward" : label)
            .font(.inter(14, .semibold)).foregroundColor(c.fg)
            .padding(.vertical, 7).padding(.horizontal, 9).background(c.bg).cornerRadius(7)
            .fixedSize()
    }
}

struct ApplicationDetailScreen: View {
    @ObservedObject var store: ThriveStore
    let application: AppApplication
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            DetailTopBar(backTitle: "Applications", back: hSize == .regular ? nil : { dismiss() }) { EmptyView() }
            ScrollView {
                VStack(spacing: 0) {
                // B6 in H5's navy header block (build 17 review).
                VStack(alignment: .leading, spacing: 8) {
                    Text(application.title).font(.inter(26, .heavy)).tracking(-0.5)
                        .foregroundColor(.white).fixedSize(horizontal: false, vertical: true)
                    Text([application.company, application.job?.town ?? application.job?.place].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.inter(16, .medium)).foregroundColor(TC.bannerText)
                    Text(datesLine).font(.inter(16)).foregroundColor(TC.bannerText)
                    if application.job?.isClosed == true {
                        Text("This job has closed").font(.inter(16, .semibold)).foregroundColor(Color(red: 1, green: 0.78, blue: 0.5))
                    }
                    if !store.online {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "wifi.slash")
                            Text("As of \(store.applicationsUpdatedAt.map(ThriveDates.updated) ?? "an earlier time"). They may have replied since.")
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .font(.inter(16, .medium)).foregroundColor(TC.bannerText)
                    }
                    if hSize == .regular { buttons.frame(width: 240).padding(.top, 8) }
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(.horizontal, hSize == .regular ? 32 : 20).padding(.top, 8).padding(.bottom, 22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TC.navy)

                VStack(alignment: .leading, spacing: 0) {
                    stages
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(.horizontal, hSize == .regular ? 32 : 20).padding(.top, 20).padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white)
                }
            }
            .background(alignment: .top) { TC.navy.frame(height: 400) }
            if hSize != .regular {
                buttons.padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Color.white.overlay(Rectangle().fill(TC.hairline).frame(height: 1), alignment: .top))
            }
        }
        .background(Color.white)
        .toolbar(.hidden, for: .navigationBar)
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
            Text("Where it's at").font(.inter(18, .semibold)).foregroundColor(TC.navy)
            ForEach(Array(application.stages.enumerated()), id: \.offset) { index, stage in
                let newest = index == application.stages.count - 1
                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(newest ? statusColours(application.status).fg : TC.navy).frame(width: 28, height: 28)
                        Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(stage.label).font(.inter(16, .semibold)).foregroundColor(TC.navy)
                        if let d = ThriveDates.parse(stage.at) {
                            Text(ThriveDates.longDay(d)).font(.inter(16)).foregroundColor(TC.muted)
                        }
                    }
                }
            }
            if store.online {
                Text("Nothing since. If they take it further, you'll see it here and in Messages.")
                    .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
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
                    .font(.inter(16)).foregroundColor(TC.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let job = application.job {
                NavigationLink(value: job) {
                    Text("View the job").font(.inter(17, .semibold)).foregroundColor(TC.navy)
                        .frame(maxWidth: .infinity, minHeight: 52).background(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(TC.navy, lineWidth: 1.5))
                }.buttonStyle(.plain)
            }
        }
    }
}


/// "Removed from Saved · Undo" for four seconds after a removal (R2).
struct UndoBar: View {
    @ObservedObject var store: ThriveStore
    var body: some View {
        if let removed = store.lastUnsaved, Date().timeIntervalSince(removed.at) < 4 {
            HStack(spacing: 12) {
                Text("Removed from Saved").font(.inter(16, .medium)).foregroundColor(.white)
                Spacer()
                Button("Undo") {
                    store.lastUnsaved = nil
                    if !store.isSaved(removed.job.id) { store.toggleSave(removed.job) }
                }
                .font(.inter(16, .bold)).foregroundColor(.white).frame(minWidth: 44, minHeight: 44)
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
            .background(TC.navy).cornerRadius(14)
            .padding(.horizontal, 16).padding(.bottom, 12)
            .task(id: removed.at) {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                if store.lastUnsaved?.at == removed.at { store.lastUnsaved = nil }
            }
        }
    }
}


/// One application row (R3).
struct ApplicationRow: View {
    let app: AppApplication
    let changed: Bool
    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            if changed {
                Circle().fill(TC.navy).frame(width: 8, height: 8).accessibilityLabel("Changed")
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(app.title).font(.inter(17, .semibold)).foregroundColor(TC.navy).lineLimit(2)
                (Text([app.company, ThriveDates.day(ThriveDates.parse(app.appliedAt))].filter { !$0.isEmpty }.joined(separator: " · "))
                    .foregroundColor(TC.ink2)
                 + Text(app.job?.isClosed == true ? " · closed" : "").foregroundColor(TC.warning))
                    .font(.inter(16))
            }
            Spacer(minLength: 8)
            StatusPill(status: app.status, label: app.statusLabel)
        }
        .padding(.vertical, 12).padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .contentShape(Rectangle())
    }
}
