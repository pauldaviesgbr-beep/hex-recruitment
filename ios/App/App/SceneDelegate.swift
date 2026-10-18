import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // The main screen is built HERE in code, so Main.storyboard's class is
        // never used. (The 14 Oct spike build changed only the storyboard and
        // its button never appeared.) ThriveRootViewController holds the web
        // view (ThriveBridgeViewController) above a native tab bar.
        window?.rootViewController = ThriveRootViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // A universal link that launched the app (it was not running).
        if let url = connectionOptions.userActivities
            .first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb })?.webpageURL {
            (window?.rootViewController as? ThriveRootViewController)?.openUniversalLink(url)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        // A universal link while the app was running.
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL,
           (window?.rootViewController as? ThriveRootViewController)?.openUniversalLink(url) == true {
            return
        }
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
