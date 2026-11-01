#!/usr/bin/env bash
# Laat de CI-stap FALEN tenzij minimaal het verwachte aantal XCUITests echt is uitgevoerd, zonder gefaalde of
# overgeslagen tests. Een groene build is daarmee zelf het bewijs. Overgenomen uit tijd-gezinsapp
# (scripts/check-tests.sh, modus xcode; zelfde eigenaar).
#   check-tests.sh <TestResults.xcresult> <minimum> [max_overgeslagen]
# Exitcodes: 3 = xcresulttool faalde, 4 = onbekend formaat, 5 = gefaalde tests, 6 = resultaat niet "Passed",
#            200+N = N overgeslagen (te veel), 100+N = maar N tests in totaal (te weinig).
set -euo pipefail
file="$1"; min="$2"; maxskip="${3:-0}"
if ! xcrun xcresulttool get test-results summary --path "$file" > /tmp/xc-summary.json 2>/tmp/xc-err.txt; then
  cat /tmp/xc-err.txt; exit 3
fi
head -c 4000 /tmp/xc-summary.json; echo
python3 - "$min" "$maxskip" <<'PY'
import json, os, sys
s = json.load(open("/tmp/xc-summary.json")); m = int(sys.argv[1]); maxskip = int(sys.argv[2])
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
PY
