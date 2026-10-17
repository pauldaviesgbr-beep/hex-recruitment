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

    /// "ONE NAVIGATION" (design, second addendum): while the app's own tab bar
    /// is showing, the website hides its header and hamburger. The flag lives in
    /// sessionStorage so that this script, which runs before any page draws, can
    /// put the class back on every page load: no flash of the website header.
    /// The CSS that acts on it is in app/globals.css (html.native-nav).
    private static let nativeNavScript = WKUserScript(
        source: "try{if(sessionStorage.getItem('thriveNativeNav')==='1'){document.documentElement.classList.add('native-nav')}}catch(e){}",
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true)

    /// Messages from the page (lib/nativeShell postToApp), e.g. how a provider
    /// sign-in started by the native sheet ended. Never carries a credential.
    var onPageMessage: (([String: Any]) -> Void)?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.configuration.userContentController.addUserScript(ThriveBridgeViewController.nativeNavScript)
        // A weak proxy: the content controller retains its handlers.
        webView?.configuration.userContentController.add(WeakMessageProxy(self), name: "thrive")
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

    private var nativeNavOn: Bool?

    /// Tell the page whether the app is providing the navigation right now.
    func setNativeNav(_ on: Bool, force: Bool = false) {
        if !force, nativeNavOn == on { return }
        nativeNavOn = on
        let v = on ? "1" : "0"
        let js = "try{sessionStorage.setItem('thriveNativeNav','\(v)');document.documentElement.classList.toggle('native-nav',\(on ? "true" : "false"))}catch(e){}"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    fileprivate func received(_ body: Any) {
        guard let dict = body as? [String: Any] else { return }
        DispatchQueue.main.async { [weak self] in self?.onPageMessage?(dict) }
    }

    enum AuthCallError: Error { case notReady, failed }

    /// Calls one of the page's sign-in functions (components/NativeAuthBridge:
    /// window.thriveAuth.<name>) and returns its answer. Arguments travel as
    /// real JavaScript values, never spliced into the script text, so nothing
    /// typed (a password with a quote in it) can change what runs.
    /// `args` keeps its order: it is the function's parameter list, in order.
    func callAuth(_ name: String, _ args: KeyValuePairs<String, Any>, done: @escaping (Result<[String: Any], AuthCallError>) -> Void) {
        guard let webView = webView else { done(.failure(.notReady)); return }
        let keys = args.map { $0.key }
        var values: [String: Any] = [:]
        for (k, v) in args { values[k] = v }
        let script = """
        if (!window.thriveAuth || typeof window.thriveAuth.\(name) !== 'function') { return { notReady: true } }
        return await window.thriveAuth.\(name)(\(keys.joined(separator: ", ")))
        """
        webView.callAsyncJavaScript(script, arguments: values, in: nil, in: .page) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let value):
                    guard let dict = value as? [String: Any] else { done(.failure(.failed)); return }
                    if dict["notReady"] as? Bool == true { done(.failure(.notReady)); return }
                    done(.success(dict))
                case .failure:
                    done(.failure(.failed))
                }
            }
        }
    }

    /// Opens the website's own side menu (the employer "More" tab), by pressing
    /// its existing button. No website change is needed for this.
    func openSideMenu() {
        let js = "(function(){var b=document.querySelector('[aria-label=\"Open navigation\"]');if(b){b.click();return true}return false})()"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}

/// WKUserContentController keeps a strong reference to its message handlers,
/// so the bridge is reached through this weak proxy to avoid a retain cycle.
private final class WeakMessageProxy: NSObject, WKScriptMessageHandler {
    private weak var target: ThriveBridgeViewController?
    init(_ target: ThriveBridgeViewController) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.received(message.body)
    }
}
