import XCTest

/// UI-tests van de echte OKKIE.-app (Capacitor-webview) in de iOS-simulator. Zie IOS-APP.md, "Automatische UI-tests".
/// Elke test start de app in testmodus (-OKKIEUITest, alleen in Debug): schone opslag, geen netwerk buiten de app
/// (dus nooit de productie-API) en elke JavaScript-fout wordt een zichtbare melding waarop de test faalt.
/// Het aantal tests wordt in de workflow gecontroleerd (tools/ios/check-tests.sh, minimum in .github/workflows/ios.yml).
final class OKKIEUITests: XCTestCase {
    private var app: XCUIApplication!
    private let wait: TimeInterval = 20

    override func setUp() {
        continueAfterFailure = false
    }

    override func tearDown() {
        if let app, app.state == .runningForeground {
            assertNoJSError(app)
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
        }
        super.tearDown()
    }

    // MARK: - Hulpmiddelen

    @discardableResult
    private func launch(fixture: Bool = false, offline: Bool = false, keepData: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-OKKIEUITest"] + (offline ? ["-OKKIEOffline"] : []) + (keepData ? ["-OKKIEKeepData"] : [])
        if fixture { app.launchEnvironment["OKKIE_FIXTURE"] = Fixture.mirror }
        app.launch()
        self.app = app
        return app
    }

    /// Elk element (knop, tekst, link) in de webview waarvan het label de tekst bevat.
    private func element(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    private func button(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.webViews.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    private func expectVisible(_ text: String, in app: XCUIApplication, _ file: StaticString = #filePath, _ line: UInt = #line) {
        XCTAssertTrue(element(text, in: app).waitForExistence(timeout: wait), "verwacht op het scherm: \(text)", file: file, line: line)
    }

    private func tap(_ label: String, in app: XCUIApplication, _ file: StaticString = #filePath, _ line: UInt = #line) {
        let b = button(label, in: app)
        XCTAssertTrue(b.waitForExistence(timeout: wait), "knop niet gevonden: \(label)", file: file, line: line)
        b.tap()
    }

    private func assertNoJSError(_ app: XCUIApplication, _ file: StaticString = #filePath, _ line: UInt = #line) {
        let err = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'okkie-js-fout'")).firstMatch
        XCTAssertFalse(err.exists, "JavaScript-fout in de app: \(err.exists ? err.label : "")", file: file, line: line)
    }

    /// Welkomstscherm: naam invullen en starten.
    private func onboard(_ app: XCUIApplication, name: String = "Testspeler") {
        let field = app.webViews.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: wait), "naamveld op het welkomstscherm")
        field.tap()
        field.typeText(name + "\n")
        expectVisible("Mijn statistieken", in: app)
    }

    /// Eén pijl intikken: "T20", "D10", "S20" of "M" (mis). Kort tikritme vanwege het spook-tikfilter (35 ms).
    private func dart(_ code: String, in app: XCUIApplication) {
        if code == "M" { tap("MIS", in: app); return }
        let n = String(code.dropFirst())
        switch code.first {
        case "T": tap("TRIPLE", in: app); tap("T" + n, in: app)
        case "D": tap("DOUBLE", in: app); tap("D" + n, in: app)
        default: tap(n, in: app)
        }
        usleep(150_000)
    }

    // MARK: - Tests

    /// 1. Nieuwe installatie: de app start zonder crash en toont het welkomstscherm met naamveld.
    func test01_StartZonderCrashWelkomstscherm() {
        let app = launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: wait), "app draait")
        expectVisible("Let's play darts", in: app)
        XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: wait), "naamveld")
        expectVisible("Trainingen ophalen", in: app)
    }

    /// 2. Onboarding: naam invullen → startscherm met de speler en de hoofdtabbladen.
    func test02_OnboardingNaarStartscherm() {
        let app = launch()
        onboard(app)
        expectVisible("Testspeler", in: app)
        for tab in ["Home", "Trainen", "Wedstrijd", "Stats", "Meer"] {
            XCTAssertTrue(button(tab, in: app).waitForExistence(timeout: wait), "tabblad \(tab)")
        }
    }

    /// 3. Training starten, scores invoeren en afronden; na een herstart staat de training er nog.
    func test03_TrainingStartenScoresInvoerenAfronden() {
        let app = launch()
        onboard(app)
        tap("Trainen", in: app)
        tap("Start scoretraining", in: app)
        // Beurt 1: 180, beurt 2: 3 × 20 = 60 → 240 punten uit 6 pijlen = 120,00 gemiddeld
        for c in ["T20", "T20", "T20"] { dart(c, in: app) }
        expectVisible("180", in: app)
        for c in ["S20", "S20", "S20"] { dart(c, in: app) }
        expectVisible("240", in: app)
        tap("Stoppen", in: app)
        tap("Bewaren", in: app)
        expectVisible("120,00", in: app)
        assertNoJSError(app)

        // Herstart met dezelfde gegevens: de training is bewaard.
        app.terminate()
        let again = launch(keepData: true)
        expectVisible("Mijn statistieken", in: again)
        tap("Meer", in: again)
        tap("Geschiedenis", in: again)
        expectVisible("240 pnt", in: again)   // geschiedenis: "240 pnt · 6 pijlen"
    }

    /// 4. Statistieken met vaste testdata: gemiddelde, beste/slechtste training en hoogste beurt kloppen.
    func test04_StatistiekenMetVasteTestdata() {
        let app = launch(fixture: true)
        expectVisible(Fixture.player, in: app)
        tap("Stats", in: app)
        expectVisible("Statistieken", in: app)
        expectVisible("66,00", in: app)          // (600 + 720) punten / 60 pijlen × 3
        expectVisible("2 trainingen", in: app)
        expectVisible("72,00", in: app)          // beste training
        expectVisible("60,00", in: app)          // slechtste training
        expectVisible("Word ik beter?", in: app)
    }

    /// 5. Instellingen (Meer) openen, een instelling wijzigen, een subscherm openen en terug.
    func test05_InstellingenOpenenEnTerug() {
        let app = launch(fixture: true)
        expectVisible(Fixture.player, in: app)
        tap("Meer", in: app)
        expectVisible("Instellingen", in: app)
        let sound = app.webViews.switches.firstMatch
        XCTAssertTrue(sound.waitForExistence(timeout: wait), "schakelaar Geluidjes")
        let before = sound.value as? String
        sound.tap()
        let flipped = NSPredicate(format: "value != %@", before ?? "")
        wait(for: [expectation(for: flipped, evaluatedWith: sound)], timeout: wait)
        tap("Licht", in: app)
        tap("Donker", in: app)
        tap("Geschiedenis", in: app)
        expectVisible("Geschiedenis", in: app)
        tap("Terug", in: app)
        expectVisible("Instellingen", in: app)
        tap("Home", in: app)
        expectVisible("Mijn statistieken", in: app)
    }

    /// 6. Zonder internet: app start met bestaande gegevens, trainen en bewaren werkt, Darters meldt netjes dat het
    ///    niet bereikbaar is (geen crash, geen JavaScript-fout).
    func test06_ZonderInternet() {
        let app = launch(fixture: true, offline: true)
        expectVisible(Fixture.player, in: app)
        tap("Trainen", in: app)
        tap("Start scoretraining", in: app)
        for c in ["S20", "S19", "M"] { dart(c, in: app) }
        expectVisible("39", in: app)
        tap("Stoppen", in: app)
        tap("Bewaren", in: app)
        expectVisible("39,00", in: app)
        tap("Home", in: app)
        let darters = app.webViews.links.matching(NSPredicate(format: "label CONTAINS 'Darters'")).firstMatch
        XCTAssertTrue(darters.waitForExistence(timeout: wait), "link naar Darters")
        darters.tap()
        expectVisible("werkt gewoon", in: app)   // "… Probeer het later opnieuw; trainen werkt gewoon."
    }
}
