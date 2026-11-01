import XCTest

/// App Store-screenshots van de echte app in de simulator, met fictieve demogegevens (ScreenshotFixture: Sem en Papa,
/// gegenereerd door tools/ios/appstore-fixture.mjs). Geen gewone UI-test: draait alleen in de workflow-taak
/// "App Store-screenshots" (`-only-testing:OKKIEUITests/AppStoreScreenshots`); de gewone UI-tests slaan deze klasse
/// over (`-skip-testing`). Testmodus (-OKKIEUITest, alleen Debug): geen netwerk buiten de app.
/// Uitvoer: bijlagen 1-home … 6-wedstrijd-501 (volledig scherm, PNG) in het xcresult.
final class AppStoreScreenshots: XCTestCase {
    private let wait: TimeInterval = 20

    override func setUp() {
        continueAfterFailure = true   // liever vijf goede plaatjes dan geen
    }

    private func launch(fixture: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = fixture ? ["-OKKIEUITest"] : ["-OKKIEUITest", "-OKKIEKeepData"]
        if fixture { app.launchEnvironment["OKKIE_FIXTURE"] = ScreenshotFixture.mirror }
        app.launch()
        return app
    }

    private func any(_ format: String, _ args: Any..., in app: XCUIApplication) -> XCUIElement {
        app.webViews.descendants(matching: .any).matching(NSPredicate(format: format, argumentArray: args)).firstMatch
    }

    private func see(_ text: String, in app: XCUIApplication) {
        XCTAssertTrue(any("label CONTAINS %@", text, in: app).waitForExistence(timeout: wait), "verwacht: \(text)")
    }

    private func tap(_ label: String, in app: XCUIApplication, prefix: Bool = false) {
        let el = prefix ? any("label BEGINSWITH %@", label, in: app) : any("label == %@", label, in: app)
        guard el.waitForExistence(timeout: wait) else { XCTFail("niet gevonden: \(label)"); return }
        var tries = 0
        while !el.isHittable && tries < 6 { app.webViews.firstMatch.swipeUp(); tries += 1 }
        el.tap()
        usleep(400_000)
    }

    private func key(_ label: String, in app: XCUIApplication) {
        let el = any("label == %@ AND elementType != %@", label, NSNumber(value: XCUIElement.ElementType.staticText.rawValue), in: app)
        let deadline = Date().addingTimeInterval(wait)
        while Date() < deadline {
            if el.exists && el.isHittable { el.tap(); usleep(250_000); return }
            usleep(200_000)
        }
        XCTFail("toets niet gevonden: \(label)")
    }

    private func dart(_ code: String, in app: XCUIApplication) {
        let n = String(code.dropFirst())
        switch code.first {
        case "T": key("TRIPLE", in: app); key("T" + n, in: app)
        case "D": key("DOUBLE", in: app); key("D" + n, in: app)
        default: key(n, in: app)
        }
    }

    private func shot(_ name: String) {
        sleep(2)   // animaties en vieringen laten uitlopen
        let a = XCTAttachment(data: XCUIScreen.main.screenshot().pngRepresentation, uniformTypeIdentifier: "public.png")
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    func testAppStoreScreenshots() {
        // 1. Startscherm met de demospeler
        var app = launch(fixture: true)
        see("Sem", in: app)
        see("Mijn statistieken", in: app)
        shot("1-home")

        // 2. Training bezig
        tap("Trainen", in: app)
        tap("Start scoretraining", in: app)
        see("Beurt 1 van 10", in: app)
        for c in ["T20", "S20", "S5", "S20", "T20", "S1", "T20", "T19"] { dart(c, in: app) }
        shot("2-training")

        // 3. Uitslag na 30 pijlen
        for i in 0..<22 { dart(["T20", "S20", "S20"][i % 3], in: app) }
        sleep(2)
        shot("3-uitslag")

        // Opnieuw openen met dezelfde gegevens (zoals een gebruiker de app later weer opent)
        sleep(3)
        app.terminate()
        app = launch(fixture: false)
        see("Sem", in: app)

        // 4. Statistieken
        tap("Stats", in: app)
        see("Statistieken", in: app)
        shot("4-statistieken")

        // 5. Trefferkaart
        let map = any("label CONTAINS %@", "Trefferkaart", in: app)
        if map.waitForExistence(timeout: wait) {
            var tries = 0
            while !map.isHittable && tries < 8 { app.webViews.firstMatch.swipeUp(); tries += 1 }
            app.webViews.firstMatch.swipeUp(velocity: .slow)
        }
        shot("5-trefferkaart")

        // 6. Wedstrijd 501
        tap("Wedstrijd", in: app)
        tap("Start ", in: app, prefix: true)
        for c in ["T20", "T20", "T20", "S20", "S20", "S20", "T20", "T19", "S18"] { dart(c, in: app) }
        shot("6-wedstrijd-501")
    }
}
