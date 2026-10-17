import SwiftUI
import UIKit

// THE BRAND, NATIVELY (design: "Brand pass, 17 Oct").
//
// Inter is bundled (ios/App/App/Fonts, listed in Info.plist UIAppFonts) at the
// five weights the design uses, the same family the website loads. Design:
// "Don't ship to review without Inter 800."

extension Font {
    /// Inter at a given size and weight. Falls back to the system font only if
    /// the file failed to load, which a missing UIAppFonts entry would cause.
    static func inter(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .heavy, .black: name = "Inter-ExtraBold"
        case .bold: name = "Inter-Bold"
        case .semibold: name = "Inter-SemiBold"
        case .medium: name = "Inter-Medium"
        default: name = "Inter-Regular"
        }
        return .custom(name, size: size)
    }
}

enum ThriveTheme {
    static let navyUI = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1)

    /// Every system navigation bar (pushed screens): opaque navy in both the
    /// standard and scroll-edge states, white title, items and back chevron.
    static func applyNavigationBarAppearance() {
        let a = UINavigationBarAppearance()
        a.configureWithOpaqueBackground()
        a.backgroundColor = navyUI
        a.shadowColor = .clear
        let title = UIFont(name: "Inter-SemiBold", size: 17) ?? .systemFont(ofSize: 17, weight: .semibold)
        a.titleTextAttributes = [.foregroundColor: UIColor.white, .font: title]
        a.largeTitleTextAttributes = [.foregroundColor: UIColor.white]
        let item = UIBarButtonItemAppearance()
        let itemFont = UIFont(name: "Inter-Medium", size: 17) ?? .systemFont(ofSize: 17)
        item.normal.titleTextAttributes = [.foregroundColor: UIColor.white, .font: itemFont]
        a.buttonAppearance = item
        a.backButtonAppearance = item
        let bar = UINavigationBar.appearance()
        bar.standardAppearance = a
        bar.scrollEdgeAppearance = a
        bar.compactAppearance = a
        bar.tintColor = .white
    }
}

/// Soft chips on navy that wrap onto a new line when they run out of room
/// (H5: type, contract, age).
struct FlowChips: View {
    let items: [String]
    var body: some View {
        WrapLayout(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item).font(.inter(16, .semibold)).foregroundColor(.white)
                    .padding(.vertical, 8).padding(.horizontal, 10)
                    .background(Color.white.opacity(0.12)).cornerRadius(8)
            }
        }
    }
}

struct WrapLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + rowHeight)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}

/// H6: the short navy band on every other tab root. The large title in white
/// (Inter 800, 30), something on its right (Sign in), and one line under it in
/// the soft navy text: "updated 08:12", or the offline line with its icon.
struct NavyTitleBand<Trailing: View>: View {
    let title: String
    var line: String? = nil
    var offline = false
    @ViewBuilder var trailing: () -> Trailing
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center) {
                Text(title).font(.inter(30, .heavy)).tracking(-0.6).foregroundColor(.white)
                Spacer(minLength: 8)
                trailing()
            }
            .frame(minHeight: 52)
            if let line = line {
                HStack(alignment: .top, spacing: 8) {
                    if offline { Image(systemName: "wifi.slash") }
                    Text(line).fixedSize(horizontal: false, vertical: true)
                }
                .font(.inter(16, .medium))
                .foregroundColor(TC.bannerText)
            }
        }
        .padding(.horizontal, 20).padding(.top, 4).padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TC.navy.ignoresSafeArea(edges: .top))
    }
}
