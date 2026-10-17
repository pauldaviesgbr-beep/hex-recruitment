import SwiftUI
import UIKit
import AVFoundation
import VisionKit
import PDFKit
import QuickLook

// THE NATIVE PROFILE TAB (build 17 review: D6/D7 in the brand-pass style) and
// SCAN A PAPER CV (design §D, D1–D5).
//
// Everything shown comes from /api/app/me/profile, which counts the profile
// the way the website's dashboard does. The three rows open the website's own
// pages under the navy bar. A scan is made into a PDF ON THE PHONE, kept in the
// app's private storage (never Photos) until it uploads or is discarded, and
// goes to the same bucket, path and profile columns as the website's upload.

enum ScanState: Equatable {
    case none
    case review                 // D3
    case uploading(Double)      // D3, the button becomes a progress bar
    case failed(offline: Bool)  // D5
}

// MARK: - Store: the switch and the scan

extension ThriveStore {

    static var pendingScanFile: URL { cacheDir.appendingPathComponent("pending-scan.pdf") }
    var hasWaitingScan: Bool { FileManager.default.fileExists(atPath: ThriveStore.pendingScanFile.path) }

    /// The dashboard switch's write. `done(false)` puts the switch back.
    func setDiscoverable(_ on: Bool, done: @escaping (Bool) -> Void) {
        guard let token = token() else { done(false); return }
        ThriveAPI.send("PUT", "/me/visibility", token: token, json: ["discoverable": on]) { [weak self] r in
            if case .success = r { done(true); self?.refreshProfile() } else { done(false) }
        }
    }

    /// D2 → D3: the document camera's pages become one PDF in private storage.
    func acceptScan(_ images: [UIImage]) {
        guard !images.isEmpty, let pdf = ThriveStore.makePDF(images) else { return }
        try? FileManager.default.createDirectory(at: ThriveStore.cacheDir, withIntermediateDirectories: true)
        do {
            try pdf.write(to: ThriveStore.pendingScanFile, options: [.atomic, .completeFileProtection])
        } catch { return }
        scanPages = images.map { $0.thumbnail(width: 360) }
        scan = .review
    }

    func discardScan() {
        scanUpload?.cancel(); scanUpload = nil; scanProgress = nil
        try? FileManager.default.removeItem(at: ThriveStore.pendingScanFile)
        scanPages = []
        scan = .none
    }

    var scanPageCount: Int {
        if !scanPages.isEmpty { return scanPages.count }
        return PDFDocument(url: ThriveStore.pendingScanFile)?.pageCount ?? 0
    }

    /// D3 "Add to my profile". 30 seconds without progress is a failure (D5):
    /// the request's timeout is an idle timeout, which is exactly that.
    func uploadScan() {
        guard let data = try? Data(contentsOf: ThriveStore.pendingScanFile) else { scan = .none; return }
        guard let token = token(), let url = URL(string: ThriveAPI.base + "/me/cv") else {
            scan = .failed(offline: !online); return
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/pdf", forHTTPHeaderField: "Content-Type")
        scan = .uploading(0)
        let task = URLSession.shared.uploadTask(with: req, from: data) { [weak self] _, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.scanProgress = nil
                self.scanUpload = nil
                if let e = error as? URLError, e.code == .cancelled {
                    if self.hasWaitingScan { self.scan = .review }
                    return
                }
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if status == 200 {
                    try? FileManager.default.removeItem(at: ThriveStore.pendingScanFile)
                    self.scanPages = []
                    self.scan = .none
                    self.cvAddedAt = Date()
                    self.refreshProfile()
                    self.askToReadCV(token: token)
                } else {
                    self.scan = .failed(offline: error != nil)
                }
            }
        }
        scanProgress = task.progress.observe(\.fractionCompleted) { [weak self] p, _ in
            DispatchQueue.main.async {
                guard let self = self, case .uploading = self.scan else { return }
                self.scan = .uploading(p.fractionCompleted)
            }
        }
        scanUpload = task
        task.resume()
    }

    /// As the website does after an upload: ask the site to read the CV, and
    /// never tell the person about it. A failure here is not their problem.
    private func askToReadCV(token: String) {
        guard let url = URL(string: "https://thrivecareer.co.uk/api/candidate/parse-cv") else { return }
        var req = URLRequest(url: url, timeoutInterval: 60)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: req).resume()
    }

    /// A4 pages, each scan drawn as a compressed JPEG so a two-page CV stays
    /// well under the server's 4 MB. Tries smaller if it does not.
    static func makePDF(_ images: [UIImage]) -> Data? {
        let page = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
        for (width, quality) in [(1240.0, 0.6), (1000.0, 0.5), (800.0, 0.4)] {
            let data = UIGraphicsPDFRenderer(bounds: page).pdfData { ctx in
                for image in images {
                    ctx.beginPage()
                    let scaled = image.thumbnail(width: CGFloat(width))
                    let jpeg = scaled.jpegData(compressionQuality: CGFloat(quality)).flatMap(UIImage.init(data:)) ?? scaled
                    let s = min(page.width / jpeg.size.width, page.height / jpeg.size.height)
                    let size = CGSize(width: jpeg.size.width * s, height: jpeg.size.height * s)
                    jpeg.draw(in: CGRect(x: (page.width - size.width) / 2, y: (page.height - size.height) / 2,
                                         width: size.width, height: size.height))
                }
            }
            if data.count < 3_800_000 { return data }
        }
        return nil
    }
}

extension UIImage {
    func thumbnail(width: CGFloat) -> UIImage {
        guard size.width > width else { return self }
        let target = CGSize(width: width, height: size.height * width / size.width)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}

// MARK: - The Profile tab

struct ProfileScreen: View {
    @ObservedObject var store: ThriveStore
    @State private var visible = false
    @State private var switchBusy = false
    @State private var switchFailed = false
    @State private var cameraRefused = false
    @State private var showCamera = false
    @State private var showScanSheet = false
    @State private var showReplace = false
    @State private var opening = false
    @State private var showSettings = false

    private var p: AppProfile? { store.profile }

    var body: some View {
        NavigationStack {
            content
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(isPresented: $showSettings) { SettingsScreen(store: store) }
        }
        .onChange(of: store.signedIn) { s in if !s { showSettings = false } }
    }

    private var content: some View {
        VStack(spacing: 0) {
            band
            ScrollView {
                VStack(spacing: 16) {
                    if let at = store.cvAddedAt, Date().timeIntervalSince(at) < 4 {
                        cvAddedBar(at)
                    }
                    if p == nil && store.profileLoad == .failed {
                        EmptyState(symbol: "exclamationmark.triangle", heading: "Your profile didn't load",
                                   message: store.online ? "Thrive didn't answer. Try again in a moment."
                                                         : "No signal. Your profile shows once this \(ThriveDates.deviceWord) is back online.") {
                            PrimaryButton(title: "Try again") { store.refreshProfile() }
                        }
                    } else if p == nil {
                        SkeletonCards()
                    } else {
                        visibilityGroup
                        cvCard
                        rowCard(title: "CV Builder",
                                subline: p?.cv == nil ? "Or write one here, step by step" : "Make a new version, step by step") {
                            store.openWeb("/cv-builder", "Profile")
                        }
                        VStack(spacing: 0) {
                            plainRow("Your details") { store.openWeb("/profile", "Profile") }
                            Divider().background(TC.hairline).padding(.leading, 16)
                            plainRow("Company reviews") { store.openWeb("/reviews", "Profile") }
                            Divider().background(TC.hairline).padding(.leading, 16)
                            plainRow("Settings") { showSettings = true }
                        }
                        .background(Color.white).cornerRadius(16)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
                    }
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .refreshable { store.refreshProfile() }
        }
        .background(TC.page.ignoresSafeArea())
        .onAppear {
            store.refreshProfile()
            visible = p?.isDiscoverable ?? false
            checkCamera()
        }
        .onChange(of: p?.isDiscoverable) { v in if !switchBusy { visible = v ?? false } }
        .fullScreenCover(isPresented: $showCamera) {
            DocumentCamera(done: { images in
                showCamera = false
                store.acceptScan(images)
                // One presentation at a time: the sheet waits for the camera to go.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { showScanSheet = store.scan != .none }
            }, cancel: { showCamera = false })
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showScanSheet) {
            ScanSheet(store: store, fullName: p?.fullName, close: { showScanSheet = false }, scanAgain: {
                showScanSheet = false
                store.discardScan()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { startScan() }
            })
        }
        .confirmationDialog("Replace your CV", isPresented: $showReplace, titleVisibility: .hidden) {
            if VNDocumentCameraViewController.isSupported { Button("Scan a paper CV") { startScan() } }
            Button("Upload a file") { store.openWeb("/profile?section=cv", "Profile") }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: Band: the photo, the name, "{title} · {town}"

    private var band: some View {
        HStack(spacing: 14) {
            avatar
            VStack(alignment: .leading, spacing: 4) {
                Text(p?.fullName ?? "Profile").font(.inter(26, .heavy)).tracking(-0.5)
                    .foregroundColor(.white).lineLimit(2)
                let line = [p?.jobTitle, p?.town].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !line.isEmpty {
                    Text(line).font(.inter(16, .medium)).foregroundColor(TC.bannerText).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TC.navy.ignoresSafeArea(edges: .top))
    }

    private var avatar: some View {
        let initials = (p?.fullName ?? "").split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined()
        return ZStack {
            Circle().fill(Color.white.opacity(0.12))
            if initials.isEmpty {
                Image(systemName: "person").font(.system(size: 24, weight: .semibold)).foregroundColor(.white)
            } else {
                Text(initials.uppercased()).font(.inter(20, .bold)).foregroundColor(.white)
            }
            if let s = p?.photoUrl, let url = URL(string: s) {
                AsyncImage(url: url) { phase in
                    phase.image?.resizable().scaledToFill()
                }
                .clipShape(Circle())
            }
        }
        .frame(width: 60, height: 60)
        .accessibilityHidden(true)
    }

    // MARK: "Employers can find you" and the profile bar

    private var held: Bool { p?.heldUntil != nil }

    private var visibilityGroup: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Toggle(isOn: Binding(get: { visible }, set: { flip($0) })) {
                    Text(held ? "Being checked" : "Employers can find you")
                        .font(.inter(17, .semibold)).foregroundColor(TC.navy)
                }
                .tint(TC.navy)
                .disabled(held || switchBusy)
                Text(visibilityNote).font(.inter(15)).foregroundColor(switchFailed ? TC.warning : TC.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            if let c = p?.complete, c.done < c.total {
                Divider().background(TC.hairline).padding(.leading, 16)
                Button { store.openWeb("/profile", "Profile") } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 8) {
                            (Text("\(c.done) of \(c.total)").font(.inter(16, .semibold)).foregroundColor(TC.navy)
                             + Text(c.next.map { " · \($0)" } ?? "").font(.inter(16)).foregroundColor(TC.ink2))
                            GeometryReader { g in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(TC.hairline)
                                    Capsule().fill(TC.navy).frame(width: g.size.width * CGFloat(c.done) / CGFloat(max(c.total, 1)))
                                }
                            }
                            .frame(height: 6)
                        }
                        Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundColor(TC.soft)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Profile \(c.done) of \(c.total) complete. \(c.next ?? "")")
            }
        }
        .background(Color.white).cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
    }

    private var visibilityNote: String {
        if switchFailed { return "That didn't save. Check your signal and try again." }
        if let until = ThriveDates.parse(p?.heldUntil) {
            return "We're checking this isn't a second profile. You'll be visible to employers by \(ThriveDates.longDay(until)), usually sooner."
        }
        return visible ? "Employers searching for staff can see your profile."
                       : "Your profile is hidden. Employers you apply to still see it."
    }

    private func flip(_ on: Bool) {
        switchFailed = false
        switchBusy = true
        visible = on
        store.setDiscoverable(on) { ok in
            switchBusy = false
            if !ok { visible = !on; switchFailed = true }
        }
    }

    // MARK: The CV card (D1, D4, D5, D7)

    @ViewBuilder private var cvCard: some View {
        if store.hasWaitingScan && !showScanSheet && store.scan != .review {
            waitingScanCard
        } else if let cv = p?.cv {
            hasCV(cv)
        } else {
            noCV
        }
    }

    private var noCV: some View {
        VStack(alignment: .leading, spacing: 12) {
            if cameraRefused {
                Text("Thrive can't use the camera").font(.inter(20, .bold)).foregroundColor(TC.navy)
                Text("Turn on Camera for Thrive in Settings to scan, or upload a CV file you already have.")
                    .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                PrimaryButton(title: "Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                OutlineButton(title: "Upload a file") { store.openWeb("/profile?section=cv", "Profile") }
            } else {
                Text("No CV on your profile").font(.inter(20, .bold)).foregroundColor(TC.navy)
                Text("Some employers need one before you can apply. Got it on paper? Scan it. It takes about a minute.")
                    .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                if VNDocumentCameraViewController.isSupported {
                    Button(action: startScan) {
                        HStack(spacing: 10) {
                            Image(systemName: "camera").font(.system(size: 18, weight: .semibold))
                            Text("Scan a paper CV").font(.inter(17, .semibold))
                        }
                        .foregroundColor(TC.navy).frame(maxWidth: .infinity, minHeight: 52)
                        .background(TC.yellow).cornerRadius(14)
                    }
                    .buttonStyle(.plain)
                }
                OutlineButton(title: "Upload a file") { store.openWeb("/profile?section=cv", "Profile") }
                if VNDocumentCameraViewController.isSupported {
                    Text("Uses your camera. Pages aren't saved to your Photos.")
                        .font(.inter(14)).foregroundColor(TC.muted)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white).cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.navy, lineWidth: 1.5))
    }

    private func hasCV(_ cv: ProfileCV) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your CV").font(.inter(20, .bold)).foregroundColor(TC.navy)
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "doc").font(.system(size: 24)).foregroundColor(TC.navy)
                VStack(alignment: .leading, spacing: 2) {
                    Text(cv.fileName).font(.inter(17, .semibold)).foregroundColor(TC.navy).lineLimit(2)
                    if let added = cv.added {
                        Text("added \(added)").font(.inter(16)).foregroundColor(TC.muted)
                    }
                }
            }
            HStack(spacing: 10) {
                OutlineButton(title: opening ? "Opening…" : "View") { view(cv) }
                    .disabled(cv.url == nil || opening)
                OutlineButton(title: "Replace") { showReplace = true }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white).cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
    }

    private var waitingScanCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Scan waiting to upload").font(.inter(20, .bold)).foregroundColor(TC.navy)
            Text("Your scan is kept inside Thrive on this \(ThriveDates.deviceWord), not in Photos, until it uploads or you discard it.")
                .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
            PrimaryButton(title: "Try again") {
                showScanSheet = true
                store.uploadScan()
            }
            Button("Discard scan") { store.discardScan() }
                .font(.inter(17, .semibold)).foregroundColor(TC.navy)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white).cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.warning, lineWidth: 1.5))
    }

    private func cvAddedBar(_ at: Date) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark").font(.system(size: 15, weight: .bold))
            Text("CV added to your profile").font(.inter(16, .medium))
            Spacer()
        }
        .foregroundColor(.white)
        .padding(.horizontal, 16).frame(minHeight: 48)
        .background(TC.navy).cornerRadius(14)
        .task(id: at) {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if store.cvAddedAt == at { store.cvAddedAt = nil }
        }
    }

    // MARK: Rows

    private func rowCard(title: String, subline: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.inter(17, .semibold)).foregroundColor(TC.navy)
                    Text(subline).font(.inter(16)).foregroundColor(TC.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundColor(TC.soft)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(Color.white).cornerRadius(16)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(TC.border, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func plainRow(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title).font(.inter(17, .medium)).foregroundColor(TC.navy)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundColor(TC.soft)
            }
            .padding(.horizontal, 16).frame(minHeight: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: Camera and viewer

    private func checkCamera() {
        let s = AVCaptureDevice.authorizationStatus(for: .video)
        cameraRefused = s == .denied || s == .restricted
    }

    /// Permissions only when needed: the first tap of Scan asks (design §B).
    private func startScan() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: showCamera = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    cameraRefused = !granted
                    if granted { showCamera = true }
                }
            }
        default: cameraRefused = true
        }
    }

    /// View opens the iOS viewer (Quick Look) on a copy in the temporary folder.
    private func view(_ cv: ProfileCV) {
        guard let s = cv.url, let url = URL(string: s) else { return }
        opening = true
        URLSession.shared.dataTask(with: url) { data, response, _ in
            DispatchQueue.main.async {
                opening = false
                guard let data = data, (response as? HTTPURLResponse)?.statusCode == 200 else { return }
                let safe = cv.fileName.replacingOccurrences(of: "/", with: "-")
                let file = FileManager.default.temporaryDirectory.appendingPathComponent(safe.isEmpty ? "CV.pdf" : safe)
                guard (try? data.write(to: file, options: .atomic)) != nil else { return }
                QuickLookPresenter.shared.present(file)
            }
        }.resume()
    }
}

/// Quick Look, presented from whatever is on top, with its own Done button.
final class QuickLookPresenter: NSObject, QLPreviewControllerDataSource {
    static let shared = QuickLookPresenter()
    private var file: URL?

    func present(_ url: URL) {
        file = url
        let ql = QLPreviewController()
        ql.dataSource = self
        guard var top = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController }).first else { return }
        while let next = top.presentedViewController { top = next }
        top.present(ql, animated: true)
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { file == nil ? 0 : 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        (file ?? URL(fileURLWithPath: "/")) as NSURL
    }
}

// MARK: - D2 the document camera, unmodified

struct DocumentCamera: UIViewControllerRepresentable {
    let done: ([UIImage]) -> Void
    let cancel: () -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: DocumentCamera
        init(_ parent: DocumentCamera) { self.parent = parent }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            parent.done((0..<scan.pageCount).map { scan.imageOfPage(at: $0) })
        }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { parent.cancel() }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { parent.cancel() }
    }
}

// MARK: - D3 Your scan, with D5 in the same sheet

struct ScanSheet: View {
    @ObservedObject var store: ThriveStore
    let fullName: String?
    let close: () -> Void
    let scanAgain: () -> Void

    private var fileName: String {
        let n = (fullName ?? "").trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? "CV.pdf" : "CV – \(n).pdf"
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Your scan").font(.inter(20, .heavy)).foregroundColor(TC.navy)
                Spacer()
                Button("Cancel") {
                    switch store.scan {
                    case .uploading: store.scanUpload?.cancel()
                    case .failed: close()          // kept: the Profile card shows it waiting
                    default: store.discardScan(); close()
                    }
                }
                .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
            }
            .padding(.horizontal, 20).padding(.top, 18).padding(.bottom, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    pages
                    VStack(alignment: .leading, spacing: 2) {
                        Text(fileName).font(.inter(17, .semibold)).foregroundColor(TC.navy)
                        let n = store.scanPageCount
                        if n > 0 { Text("\(n) \(n == 1 ? "page" : "pages")").font(.inter(16)).foregroundColor(TC.muted) }
                    }
                    if case .failed(let offline) = store.scan {
                        failedPanel(offline: offline)
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Where this goes").font(.inter(16, .semibold)).foregroundColor(TC.navy)
                            Text("Onto your Thrive profile, where your uploaded CVs are kept. Employers see it when you apply to them. It isn't saved to Photos, and it's removed from this \(ThriveDates.deviceWord) once it's uploaded.")
                                .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .background(TC.page).cornerRadius(14)
                    }
                }
                .padding(20)
            }
            actions.padding(.horizontal, 20).padding(.bottom, 16).padding(.top, 8)
        }
        .background(Color.white.ignoresSafeArea())
        .interactiveDismissDisabled(true)
        .onChange(of: store.scan) { s in if s == .none { close() } }
    }

    @ViewBuilder private var pages: some View {
        if store.scanPages.isEmpty {
            Image(systemName: "doc.text").font(.system(size: 40)).foregroundColor(TC.navy)
                .frame(maxWidth: .infinity, minHeight: 120)
                .background(TC.page).cornerRadius(6)
        } else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(Array(store.scanPages.enumerated()), id: \.offset) { i, img in
                    Image(uiImage: img).resizable().scaledToFill()
                        .frame(minWidth: 0, maxWidth: .infinity)
                        .aspectRatio(1 / 1.414, contentMode: .fit)
                        .clipped().cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(TC.border, lineWidth: 1))
                        .accessibilityLabel("Page \(i + 1)")
                }
            }
        }
    }

    private func failedPanel(offline: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 18, weight: .semibold)).foregroundColor(TC.warning)
            VStack(alignment: .leading, spacing: 4) {
                Text(offline ? "Not uploaded: no signal" : "Thrive didn't accept the file")
                    .font(.inter(17, .semibold)).foregroundColor(TC.navy)
                Text("Your scan is kept inside Thrive on this \(ThriveDates.deviceWord), not in Photos, until it uploads or you discard it.")
                    .font(.inter(16)).foregroundColor(TC.ink2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(TC.page).cornerRadius(14)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(TC.warning, lineWidth: 1))
    }

    @ViewBuilder private var actions: some View {
        switch store.scan {
        case .uploading(let fraction):
            VStack(spacing: 8) {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 14).fill(TC.hairline)
                        RoundedRectangle(cornerRadius: 14).fill(TC.navy)
                            .frame(width: max(28, g.size.width * CGFloat(fraction)))
                    }
                }
                .frame(height: 52)
                .accessibilityLabel("Uploading, \(Int(fraction * 100)) percent")
                Button("Cancel upload") { store.scanUpload?.cancel() }
                    .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
            }
        case .failed:
            VStack(spacing: 8) {
                PrimaryButton(title: "Try again") { store.uploadScan() }
                Button("Discard scan") { store.discardScan(); close() }
                    .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
            }
        default:
            // P5: side by side on iPad; stacked on a phone.
            ViewThatFits {
                HStack(spacing: 12) {
                    OutlineButton(title: "Scan again", action: scanAgain)
                    PrimaryButton(title: "Add to my profile", yellow: true) { store.uploadScan() }
                }
                .frame(minWidth: 480)
                VStack(spacing: 8) {
                    PrimaryButton(title: "Add to my profile", yellow: true) { store.uploadScan() }
                    Button("Scan again", action: scanAgain)
                        .font(.inter(17, .semibold)).foregroundColor(TC.navy).frame(minHeight: 44)
                }
            }
        }
    }
}
