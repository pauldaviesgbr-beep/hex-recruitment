import UIKit
import WebKit
import Capacitor

/// The Capacitor web view, held as a CHILD of ThriveRootViewController so the
/// native tab bar can sit underneath it.
///
/// It reports two things upwards and does nothing else native:
///   - the session changed (a cookie changed), so the tab set can follow it;
///   - the page changed, so the highlighted tab can follow it.
class ThriveBridgeViewController: CAPBridgeViewController, WKHTTPCookieStoreObserver {

    var onCookiesChanged: (() -> Void)?
    var onPathChanged: ((String) -> Void)?

    private var urlObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.configuration.websiteDataStore.httpCookieStore.add(self)
        urlObservation = webView?.observe(\.url, options: [.new]) { [weak self] view, _ in
            let path = view.url?.path ?? "/"
            DispatchQueue.main.async { self?.onPathChanged?(path) }
        }
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        DispatchQueue.main.async { [weak self] in self?.onCookiesChanged?() }
    }

    var cookieStore: WKHTTPCookieStore? {
        return webView?.configuration.websiteDataStore.httpCookieStore
    }

    /// Navigates the page. A full load for now; native screens replace these
    /// tabs from step 3.
    func go(to path: String) {
        guard let base = URL(string: "https://thrivecareer.co.uk"),
              let url = URL(string: path, relativeTo: base) else { return }
        _ = webView?.load(URLRequest(url: url))
    }

    /// Opens the website's own side menu (the employer "More" tab), by pressing
    /// its existing button. No website change is needed for this.
    func openSideMenu() {
        let js = "(function(){var b=document.querySelector('[aria-label=\"Open navigation\"]');if(b){b.click();return true}return false})()"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
