import XCTest

/// UI-tests van de echte OKKIE.-app (Capacitor-webview) in de iOS-simulator. Zie IOS-APP.md, "Automatische UI-tests".
/// Elke test start de app in testmodus (-OKKIEUITest, alleen in Debug): schone opslag in de simulator, vaste testdata
/// waar nodig, geen netwerk buiten de app (dus nooit de productie-API) en elke JavaScript-fout wordt een zichtbare
/// melding waarop de test faalt. Aantal en namen worden in de workflow gecontroleerd (tools/ios/check-tests.sh,
/// UITEST_MIN en UITEST_REQUIRED in .github/workflows/ios.yml).
final class OKKIEUITests: XCTestCase {
    private var app: XCUIApplication!
    private let wait: TimeInterval = 20

    override func setUp() {
        continueAfterFailure = false
    }

    override func tearDown() {
        if let app, app.state == .runningForeground {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = name
            shot.lifetime = .keepAlways
            add(shot)
            assertNoJSError(app)
        }
        super.tearDown()
    }

    // MARK: - Starten

    @discardableResult
    private func launch(fixture: Bool = false, offline: Bool = false, keepData: Bool = false, wipeWebKit: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        var args = ["-OKKIEUITest"]
        if offline { args.append("-OKKIEOffline") }
        if keepData { args.append("-OKKIEKeepData") }
        if wipeWebKit { args.append("-OKKIEWipeWebKit") }
        app.launchArguments = args
        if fixture { app.launchEnvironment["OKKIE_FIXTURE"] = Fixture.mirror }
        app.launch()
        self.app = app
        return app
    }

    /// Afsluiten zoals een gebruiker de app wegveegt. Eerst even wachten: WebKit schrijft localStorage met een kleine
    /// vertraging naar schijf en de app maakt dan haar duurzame kopie.
    private func closeApp(_ app: XCUIApplication) {
        sleep(3)
        app.terminate()
    }

    // MARK: - Zoeken en tikken

    /// Elk element in de webview (knop, schakelknop, link, tekst) met dit label, of waarvan het label zo begint.
    private func element(_ text: String, in app: XCUIApplication, exact: Bool = false) -> XCUIElement {
        let format = exact ? "label == %@" : "label == %@ OR label BEGINSWITH %@"
        return app.webViews.descendants(matching: .any).matching(NSPredicate(format: format, text, text + " ")).firstMatch
    }

    private func expectVisible(_ text: String, in app: XCUIApplication, _ file: StaticString = #filePath, _ line: UInt = #line) {
        let el = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        XCTAssertTrue(el.waitForExistence(timeout: wait), "verwacht op het scherm: \(text)", file: file, line: line)
    }

    private func expectGone(_ text: String, in app: XCUIApplication, _ file: StaticString = #filePath, _ line: UInt = #line) {
        let el = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: el)
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: wait), .completed, "hoort niet (meer) op het scherm: \(text)", file: file, line: line)
    }

    private func tap(_ label: String, in app: XCUIApplication, exact: Bool = false, _ file: StaticString = #filePath, _ line: UInt = #line) {
        let el = element(label, in: app, exact: exact)
        XCTAssertTrue(el.waitForExistence(timeout: wait), "niet gevonden om op te tikken: \(label)", file: file, line: line)
        var tries = 0
        while !el.isHittable && tries < 6 { app.webViews.firstMatch.swipeUp(); tries += 1 }
        XCTAssertTrue(el.isHittable, "niet aan te tikken: \(label)", file: file, line: line)
        el.tap()
    }

    private func assertNoJSError(_ app: XCUIApplication, _ file: StaticString = #filePath, _ line: UInt = #line) {
        let err = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'okkie-js-fout'")).firstMatch
        XCTAssertFalse(err.exists, "JavaScript-fout in de app: \(err.exists ? err.label : "")", file: file, line: line)
    }

    // MARK: - Flows

    private func onboard(_ app: XCUIApplication, name: String = "Testspeler") {
        let field = app.webViews.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: wait), "naamveld op het welkomstscherm")
        field.tap()
        field.typeText(name + "\n")
        expectVisible("Mijn statistieken", in: app)
    }

    /// Een toets van het scoretoetsenbord. Alleen echte knoppen en schakelknoppen (DOUBLE/TRIPLE hebben aria-pressed):
    /// na een pijl staat dezelfde tekst ook in het vakje "Pijl 1" en bij "Deze beurt"; tikken daarop is corrigeren.
    private func key(_ label: String, in app: XCUIApplication, _ file: StaticString = #filePath, _ line: UInt = #line) {
        let p = NSPredicate(format: "label == %@ AND elementType != %@", label, NSNumber(value: XCUIElement.ElementType.staticText.rawValue))
        let el = app.webViews.descendants(matching: .any).matching(p).firstMatch
        let deadline = Date().addingTimeInterval(wait)
        while Date() < deadline {
            if el.exists && el.isHittable { el.tap(); return }
            usleep(200_000)
        }
        XCTFail("toets niet gevonden: \(label)", file: file, line: line)
    }

    /// Eén pijl: "T20", "D10", "S20" of "M" (mis). Kort tikritme vanwege het spook-tikfilter van het toetsenbord.
    private func dart(_ code: String, in app: XCUIApplication) {
        if code == "M" {
            key("MIS", in: app)
        } else {
            let n = String(code.dropFirst())
            switch code.first {
            case "T": key("TRIPLE", in: app); key("T" + n, in: app)
            case "D": key("DOUBLE", in: app); key("D" + n, in: app)
            default: key(n, in: app)
            }
        }
        usleep(250_000)
    }

    private func startTraining(_ app: XCUIApplication) {
        tap("Trainen", in: app, exact: true)
        tap("Start scoretraining", in: app, exact: true)
        expectVisible("Beurt 1 van 10", in: app)
    }

    // MARK: - Tests

    /// Eerste installatie: de app start zonder crash en toont het welkomstscherm.
    func test01_EersteInstallatieWelkomstscherm() {
        let app = launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: wait), "app draait")
        expectVisible("Let's play darts", in: app)
        expectVisible("Trainingen ophalen", in: app)
        XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: wait), "naamveld")
    }

    /// Onboarding: naam invullen → startscherm met de speler en de vijf tabbladen.
    func test02_OnboardingNaarStartscherm() {
        let app = launch()
        onboard(app)
        expectVisible("Testspeler", in: app)
        expectVisible("Klaar voor je eerste training?", in: app)
        for tab in ["Home", "Trainen", "Wedstrijd", "Stats", "Meer"] {
            XCTAssertTrue(element(tab, in: app, exact: true).waitForExistence(timeout: wait), "tabblad \(tab)")
        }
    }

    /// Training starten, scores invoeren en afronden; na een herstart staat de training in de geschiedenis.
    func test03_TrainingStartenScoresInvoerenAfronden() {
        let app = launch()
        onboard(app)
        startTraining(app)
        // Beurt 1: 180, beurt 2: 3 × 20 = 60 → 240 punten uit 6 pijlen = 120,00 gemiddeld
        for c in ["T20", "T20", "T20"] { dart(c, in: app) }
        expectVisible("Beurt 2 van 10", in: app)
        for c in ["S20", "S20", "S20"] { dart(c, in: app) }
        expectVisible("240", in: app)
        tap("Stoppen", in: app, exact: true)
        tap("Bewaren", in: app, exact: true)
        expectVisible("120,00", in: app)
        assertNoJSError(app)
        closeApp(app)

        let again = launch(keepData: true)
        expectVisible("Mijn statistieken", in: again)
        tap("Meer", in: again, exact: true)
        tap("Geschiedenis", in: again)
        expectVisible("240 pnt", in: again)   // "240 pnt · 6 pijlen"
    }

    /// Gemiddelden, statistieken en badges met vaste testdata.
    func test04_GemiddeldenStatistiekenEnBadges() {
        let app = launch(fixture: true)
        expectVisible(Fixture.player, in: app)
        tap("Stats", in: app, exact: true)
        expectVisible("Statistieken", in: app)
        expectVisible("66,00", in: app)          // (600 + 720) punten / 60 pijlen × 3
        expectVisible("2 trainingen", in: app)
        expectVisible("72,00", in: app)          // beste training
        expectVisible("60,00", in: app)          // slechtste training
        expectVisible("Word ik beter?", in: app)
        expectVisible("10/39", in: app)          // badges: 10 van 39 verdiend (zie tools/ios/uitest-fixture.mjs)
        expectVisible("ONE HUNDRED AND EIGHTY", in: app)
    }

    /// Instellingen wijzigen en bewaren: de wijziging staat er na opnieuw openen nog; subscherm openen en terug.
    func test05_InstellingenWijzigenEnBewaren() {
        let app = launch(fixture: true)
        expectVisible(Fixture.player, in: app)
        tap("Meer", in: app, exact: true)
        expectVisible("Instellingen", in: app)
        let sound = app.webViews.switches.firstMatch      // eerste schakelaar: Geluidjes
        XCTAssertTrue(sound.waitForExistence(timeout: wait), "schakelaar Geluidjes")
        var tries = 0
        while !sound.isHittable && tries < 6 { app.webViews.firstMatch.swipeUp(); tries += 1 }
        let before = sound.value as? String ?? ""
        sound.tap()
        let changed = expectation(for: NSPredicate(format: "value != %@", before), evaluatedWith: sound)
        wait(for: [changed], timeout: wait)
        let after = sound.value as? String ?? ""
        closeApp(app)

        let again = launch(keepData: true)
        expectVisible(Fixture.player, in: again)
        tap("Meer", in: again, exact: true)
        let sound2 = again.webViews.switches.firstMatch
        XCTAssertTrue(sound2.waitForExistence(timeout: wait))
        XCTAssertEqual(sound2.value as? String, after, "instelling Geluidjes bewaard na opnieuw openen")
        tap("Geschiedenis", in: again)
        expectVisible("pnt", in: again)
        tap("Terug", in: again, exact: true)
        expectVisible("Instellingen", in: again)
    }

    /// Lopende training hervatten na het opnieuw openen van de app.
    func test06_LopendeTrainingHervattenNaHeropenen() {
        let app = launch(fixture: true)
        expectVisible(Fixture.player, in: app)
        startTraining(app)
        for c in ["S20", "S20", "S20"] { dart(c, in: app) }
        expectVisible("Beurt 2 van 10", in: app)
        closeApp(app)

        let again = launch(keepData: true)
        expectVisible("Bezig", in: again)
        tap("Verder", in: again, exact: true)
        expectVisible("Beurt 2 van 10", in: again)
        expectVisible("3/30", in: again)
        dart("T20", in: again)
        expectVisible("120", in: again)          // 60 + 60
    }

    /// Training annuleren zonder op te slaan: niets erbij in de statistieken.
    func test07_TrainingAnnulerenZonderOpslaan() {
        let app = launch(fixture: true)
        expectVisible(Fixture.player, in: app)
        startTraining(app)
        for c in ["T20", "T20", "T20"] { dart(c, in: app) }
        tap("Stoppen", in: app, exact: true)
        tap("Weggooien", in: app, exact: true)
        expectVisible("Pijlen weggooien?", in: app)
        tap("Weggooien", in: app, exact: true)
        expectGone("Pijlen weggooien?", in: app)
        tap("Stats", in: app, exact: true)
        expectVisible("2 trainingen", in: app)
        expectVisible("66,00", in: app)
    }

    /// Offline trainen: trainen en bewaren werkt zonder internet en telt mee in de statistieken.
    func test08_OfflineTrainen() {
        let app = launch(fixture: true, offline: true)
        expectVisible(Fixture.player, in: app)
        startTraining(app)
        for c in ["S20", "S19", "M"] { dart(c, in: app) }
        tap("Stoppen", in: app, exact: true)
        tap("Bewaren", in: app, exact: true)
        expectVisible("39,00", in: app)
        tap("Stats", in: app, exact: true)
        expectVisible("3 trainingen", in: app)
    }

    /// Bestaande gegevens blijven na een update. XCUITest kan geen oudere build installeren; dit bootst na wat er bij
    /// een update gebeurt: dezelfde app-container met de gegevens van eerder, en daarna (zoals iOS kan doen) een
    /// gewiste webviewopslag waarbij alles uit de duurzame kopie terugkomt.
    func test09_GegevensBehoudenNaUpdate() {
        let app = launch(fixture: true)
        expectVisible(Fixture.player, in: app)
        tap("Stats", in: app, exact: true)
        expectVisible("2 trainingen", in: app)
        closeApp(app)

        let restarted = launch(keepData: true)
        expectVisible(Fixture.player, in: restarted)
        tap("Stats", in: restarted, exact: true)
        expectVisible("2 trainingen", in: restarted)
        closeApp(restarted)

        let wiped = launch(keepData: true, wipeWebKit: true)
        expectVisible(Fixture.player, in: wiped)
        tap("Stats", in: wiped, exact: true)
        expectVisible("2 trainingen", in: wiped)
        expectVisible("66,00", in: wiped)
    }

    /// Pagina's in een map openen echt (geen wit scherm): uitleg, en Darters zonder internet met een nette melding.
    func test10_UitlegEnDartersPaginaOpenen() {
        let app = launch()
        tap("Hoe werkt het? Uitleg in 2 minuten", in: app)
        expectVisible("Zo werkt", in: app)
        app.terminate()

        let offline = launch(fixture: true, offline: true)
        expectVisible(Fixture.player, in: offline)
        tap("Open Darters", in: offline, exact: true)
        expectVisible("werkt gewoon", in: offline)    // "… trainen werkt gewoon."
        tap("Terug naar app", in: offline, exact: true)
        expectVisible("Mijn statistieken", in: offline)
    }
}
