#!/usr/bin/env bash
# Laat de CI-stap FALEN tenzij minimaal het verwachte aantal XCUITests echt is uitgevoerd, zonder gefaalde of
# overgeslagen tests. Een groene build is daarmee zelf het bewijs. Overgenomen uit tijd-gezinsapp
# (scripts/check-tests.sh, modus xcode; zelfde eigenaar).
#   check-tests.sh <TestResults.xcresult> <minimum> [max_overgeslagen]
#   UITEST_REQUIRED="test01_A,test02_B"  (optioneel) deze tests moeten bij naam bestaan én geslaagd zijn.
# Exitcodes: 3 = xcresulttool faalde, 4 = onbekend formaat, 5 = gefaalde tests, 6 = resultaat niet "Passed",
#            7 = essentieel scenario ontbreekt of niet geslaagd,
#            200+N = N overgeslagen (te veel), 100+N = maar N tests in totaal (te weinig).
set -euo pipefail
file="$1"; min="$2"; maxskip="${3:-0}"
T="${TMPDIR:-/tmp}"; SUM="$T/xc-summary.json"; TESTS="$T/xc-tests.json"; ERR="$T/xc-err.txt"
if ! xcrun xcresulttool get test-results summary --path "$file" > "$SUM" 2>"$ERR"; then
  cat "$ERR"; exit 3
fi
head -c 4000 "$SUM"; echo
if [ -n "${UITEST_REQUIRED:-}" ]; then
  xcrun xcresulttool get test-results tests --path "$file" > "$TESTS" 2>"$ERR" || { cat "$ERR"; exit 3; }
fi
python3 - "$min" "$maxskip" "$SUM" "$TESTS" <<'PY'
import json, os, sys
s = json.load(open(sys.argv[3])); m = int(sys.argv[1]); maxskip = int(sys.argv[2])
if "totalTestCount" not in s: print("onverwacht xcresult-formaat, sleutels:", sorted(s)); sys.exit(4)
total, passed, failed, skipped = (int(s.get(k, 0)) for k in ("totalTestCount", "passedTests", "failedTests", "skippedTests"))
line = f"UI-tests: {total} tests, {passed} geslaagd, {failed} gefaald, {skipped} overgeslagen (minimaal {m}, max. {maxskip} overgeslagen); resultaat {s.get('result')}"
print(line)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(f"- {line}\n")
if failed: sys.exit(5)
if skipped > maxskip: sys.exit(min(255, 200 + skipped))
if total < m or passed != total - skipped: sys.exit(min(199, 100 + total))
if s.get("result") != "Passed": sys.exit(6)
req = [r.strip() for r in os.environ.get("UITEST_REQUIRED", "").split(",") if r.strip()]
if req:
    found = {}
    def walk(n):
        if n.get("nodeType") == "Test Case":
            found[n.get("name", "").split("(")[0].split("/")[-1]] = n.get("result")
        for c in n.get("children", []) or []: walk(c)
    for n in json.load(open(sys.argv[4])).get("testNodes", []): walk(n)
    bad = [f"{r}: {found.get(r, 'ontbreekt')}" for r in req if found.get(r) != "Passed"]
    print(f"essentiële scenario's: {len(req) - len(bad)}/{len(req)} geslaagd")
    if bad: print("NIET in orde:", "; ".join(bad)); sys.exit(7)
PY
