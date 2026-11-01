import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        #if DEBUG
        UITestMode.prepareStorage()
        #endif

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = OKKIEBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// De gewone Capacitor-webview. Alleen in een Debug-build en alleen als de XCUITests de app starten met
/// `-OKKIEUITest` komt er een testscript bij (zie UITestMode); in Release (TestFlight, App Store) is dit gelijk aan
/// CAPBridgeViewController.
class OKKIEBridgeViewController: CAPBridgeViewController {
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        #if DEBUG
        UITestMode.install(into: configuration)
        #endif
        return configuration
    }
}

#if DEBUG
/// Testmodus voor de XCUITests (ios/App/OKKIEUITests, IOS-APP.md). Nooit in Release.
///  -OKKIEUITest        schone start (webviewopslag en duurzame kopie gewist) en geen enkel netwerkverzoek buiten de
///                      app: fetch, XMLHttpRequest, sendBeacon en WebSocket naar een ander adres mislukken direct,
///                      zoals zonder internet. De productie-API wordt dus nooit benaderd.
///  -OKKIEOffline       daarnaast navigator.onLine = false (gedrag zonder internet).
///  -OKKIEKeepData      niet wissen (herstart met de gegevens van de vorige start).
///  OKKIE_FIXTURE (env) vaste testdata als duurzame kopie (Library/OKKIE/opslag-a.json, formaat js/native.js).
/// JavaScript-fouten en onafgehandelde promises worden zichtbaar gemaakt als element met label "okkie-js-fout: …",
/// zodat een test faalt op elke fout.
enum UITestMode {
    static var args: [String] { ProcessInfo.processInfo.arguments }
    static var isActive: Bool { args.contains("-OKKIEUITest") }

    static func prepareStorage() {
        guard isActive else { return }
        let fm = FileManager.default
        guard let library = fm.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        if !args.contains("-OKKIEKeepData") {
            for name in ["WebKit", "Caches", "OKKIE", "Cookies"] {
                try? fm.removeItem(at: library.appendingPathComponent(name))
            }
        }
        if let fixture = ProcessInfo.processInfo.environment["OKKIE_FIXTURE"], !fixture.isEmpty {
            let folder = library.appendingPathComponent("OKKIE")
            try? fm.createDirectory(at: folder, withIntermediateDirectories: true)
            try? fixture.write(to: folder.appendingPathComponent("opslag-a.json"), atomically: true, encoding: .utf8)
        }
    }

    static func install(into configuration: WKWebViewConfiguration) {
        guard isActive else { return }
        let offline = args.contains("-OKKIEOffline") ? "true" : "false"
        let source = """
        (function () {
          var OFFLINE = \(offline);
          var local = function (u) {
            try { var x = new URL(String(u && u.url || u), location.href); return x.origin === location.origin || x.protocol === 'data:' || x.protocol === 'blob:'; }
            catch (e) { return true; }
          };
          var blocked = function () { return new TypeError('Load failed'); };
          var origFetch = window.fetch;
          window.fetch = function (input, init) { return local(input) ? origFetch.apply(this, arguments) : Promise.reject(blocked()); };
          var open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function (m, u) { this.__okkieBlocked = !local(u); return open.apply(this, arguments); };
          XMLHttpRequest.prototype.send = function () {
            if (!this.__okkieBlocked) return send.apply(this, arguments);
            var xhr = this; setTimeout(function () { xhr.dispatchEvent(new ProgressEvent('error')); if (xhr.onerror) xhr.onerror(new ProgressEvent('error')); }, 0);
          };
          if (navigator.sendBeacon) { var beacon = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, d) { return local(u) ? beacon(u, d) : false; }; }
          var WS = window.WebSocket;
          if (WS) window.WebSocket = function (u, p) { if (!local(u)) throw new DOMException('Geblokkeerd in de UI-test', 'SecurityError'); return new WS(u, p); };
          if (OFFLINE) { try { Object.defineProperty(Navigator.prototype, 'onLine', { get: function () { return false; }, configurable: true }); } catch (e) {} }
          var show = function (msg) {
            var add = function () {
              var d = document.createElement('div');
              d.setAttribute('role', 'alert'); d.setAttribute('aria-label', 'okkie-js-fout: ' + String(msg).slice(0, 200));
              d.textContent = 'JS-fout: ' + String(msg).slice(0, 200);
              d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#b00020;color:#fff;font:12px sans-serif;padding:4px';
              document.documentElement.appendChild(d);
            };
            if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
          };
          window.addEventListener('error', function (e) { show(e.message || 'onbekende fout'); });
          window.addEventListener('unhandledrejection', function (e) { show('promise: ' + (e.reason && (e.reason.message || e.reason) || 'onbekend')); });
        })();
        """
        configuration.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    }
}
#endif
