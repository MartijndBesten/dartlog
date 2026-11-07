#!/usr/bin/env bash
# Echte update in de iOS-simulator: de App Store-versie 1.8.0 (bron van build 29) met gegevens, daaroverheen de nieuwe
# versie installeren (zoals een App Store-update: zelfde app, container blijft), en controleren dat niets verloren gaat.
# Bewijs komt uit de webviewopslag zelf: de duurzame kopie wordt telkens weggegooid, zodat de app hem opnieuw moet
# schrijven uit wat er in localStorage staat.
#   upgrade-test.sh <Oud.app> <Nieuw.app> <uitmap>
set -euo pipefail
OLD="$1"; NEW="$2"; OUT="$3"; BUNDLE=nl.denckh.okkie
mkdir -p "$OUT"
# Elke simctl-stap met een tijdslimiet en zichtbaar in het log: een hangende stap faalt in plaats van te blijven wachten.
t() { local s=$1; shift; echo "+ $*" >&2; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }
DEV=$(t 120 tools/ios/pick-simulator.sh)
t 120 xcrun simctl boot "$DEV" 2>/dev/null || true
t 600 xcrun simctl bootstatus "$DEV" -b >/dev/null
t 120 xcrun simctl uninstall "$DEV" "$BUNDLE" 2>/dev/null || true
ver() { t 60 xcrun simctl appinfo "$DEV" "$BUNDLE" | grep -E 'CFBundleShortVersionString|CFBundleVersion' | tr -d ' ;"' | tr '\n' ' '; }
start() { # $1 = naam
  t 120 xcrun simctl launch --terminate-running-process "$DEV" "$BUNDLE" </dev/null >/dev/null
  sleep 20
  t 60 xcrun simctl io "$DEV" screenshot "$OUT/$1.png" >/dev/null 2>&1 || echo "(geen screenshot)"
  t 60 xcrun simctl terminate "$DEV" "$BUNDLE" || true
  sleep 2
}
newest() { ls -t "$KOPIE"/opslag-*.json 2>/dev/null | head -1; }

echo "== 1. Oude versie installeren en gegevens laten inlezen"
t 300 xcrun simctl install "$DEV" "$OLD"
echo "Geïnstalleerd: $(ver)"
DATA=$(t 60 xcrun simctl get_app_container "$DEV" "$BUNDLE" data); KOPIE="$DATA/Library/OKKIE"
mkdir -p "$KOPIE"
node tools/ios/upgrade-seed.mjs write "$KOPIE/opslag-a.json"
start 1-oud-ingelezen

echo "== 2. Bewijs dat de oude versie de gegevens in zijn eigen webviewopslag heeft"
rm -f "$KOPIE"/opslag-*.json
start 2-oud-herstart
test -n "$(newest)" || { echo "::error::oude versie schreef geen kopie: gegevens niet in de webviewopslag"; exit 1; }
node tools/ios/upgrade-seed.mjs verify "$(newest)"

echo "== 3. Update naar de nieuwe versie (installeren over de bestaande app heen)"
rm -f "$KOPIE"/opslag-*.json
t 300 xcrun simctl install "$DEV" "$NEW"
echo "Na update: $(ver)"
test "$(t 60 xcrun simctl get_app_container "$DEV" "$BUNDLE" data)" = "$DATA" || echo "(container verplaatst door simulator; inhoud wordt hieronder gecontroleerd)"
DATA=$(t 60 xcrun simctl get_app_container "$DEV" "$BUNDLE" data); KOPIE="$DATA/Library/OKKIE"
start 3-nieuw-na-update
test -n "$(newest)" || { echo "::error::nieuwe versie schreef geen kopie: webviewopslag leeg na de update"; exit 1; }
node tools/ios/upgrade-seed.mjs verify "$(newest)"

echo "== 4. Nieuwe versie nogmaals starten"
start 4-nieuw-herstart
node tools/ios/upgrade-seed.mjs verify "$(newest)"
for f in "$OUT"/*.png; do sips -Z 520 -s format jpeg -s formatOptions 55 "$f" --out "${f%.png}.jpg" >/dev/null; done
echo "Updatetest geslaagd: $(ver) bevat alle gegevens uit 1.8.0."
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- Updatetest 1.8.0 → $(ver): alle gegevens behouden" >> "$GITHUB_STEP_SUMMARY"
exit 0
