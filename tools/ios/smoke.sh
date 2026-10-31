#!/usr/bin/env bash
# Rooktest van de echte iPhone-app in de iOS-simulator (GitHub Actions, macOS). Zie IOS-APP.md.
#  1. Starten met een duurzame kopie maar lege webviewopslag: de app moet de speler terugzetten (log + scherm).
#  2. Kopie weggooien, opnieuw starten: de app moet zelf een nieuwe kopie schrijven.
#  3. Webviewopslag wissen (zoals iOS kan doen), opnieuw starten: alles komt terug uit de kopie.
# Geen enkele JavaScript-fout toegestaan. Schermafbeeldingen gaan als artefact mee en (klein) als base64 in het log.
set -euo pipefail
APP_PATH="$1"; OUT="${2:-smoke}"; BUNDLE=nl.denckh.okkie
mkdir -p "$OUT"
DEV=$(xcrun simctl list devices available -j | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
  const all = Object.entries(d).filter(([rt]) => /iOS/.test(rt)).flatMap(([rt, l]) => l.map(x => ({ ...x, rt })));
  const pick = all.filter(x => /^iPhone \d+ Pro$/.test(x.name)).sort((a, b) => b.rt.localeCompare(a.rt, undefined, { numeric: true }))[0] || all.find(x => /iPhone/.test(x.name));
  console.error("Simulator:", pick.name, pick.rt); console.log(pick.udid);')
xcrun simctl boot "$DEV" || true
xcrun simctl bootstatus "$DEV" -b
xcrun simctl install "$DEV" "$APP_PATH"
DATA=$(xcrun simctl get_app_container "$DEV" "$BUNDLE" data)
KOPIE="$DATA/Library/OKKIE"

run() { # $1 = naam
  local log="$OUT/$1.log"
  xcrun simctl launch --console-pty --terminate-running-process "$DEV" "$BUNDLE" > "$log" 2>&1 &
  local pid=$!
  sleep 20
  xcrun simctl io "$DEV" screenshot "$OUT/$1.png" >/dev/null
  xcrun simctl terminate "$DEV" "$BUNDLE" || true
  sleep 2; kill "$pid" 2>/dev/null || true
  echo "::group::Console $1"; grep -a "⚡️" "$log" | cut -c1-300 || true; echo "::endgroup::"
  sips -Z 520 -s format jpeg -s formatOptions 55 "$OUT/$1.png" --out "$OUT/$1.jpg" >/dev/null
  echo "SCREENSHOT-$1-BEGIN"; base64 -i "$OUT/$1.jpg" | fold -w 900; echo "SCREENSHOT-$1-END"
  # Verwacht en onschuldig: de map OKKIE bestaat bij een eerste start nog niet (OS-PLUG-FILE-0008, "does not exist").
  if grep -aE "⚡️ +\[error\]|JS ERROR" "$log" | grep -v "OKKIE. kopie" | grep -v "does not exist" ; then echo "::error::JavaScript-fout in $1"; exit 1; fi
}
need() { grep -aq "$2" "$OUT/$1.log" || { echo "::error::$1: verwacht in log: $2"; exit 1; }; }

echo "== 1. Terugzetten uit de kopie (lege webviewopslag)"
mkdir -p "$KOPIE"
node tools/ios/seed-mirror.mjs "$KOPIE/opslag-a.json"
run 1-terugzetten
need 1-terugzetten "OKKIE. opslag teruggezet uit kopie"

echo "== 2. App schrijft zelf een kopie"
rm -f "$KOPIE"/opslag-*.json
run 2-kopie-schrijven
ls -la "$KOPIE"
test -s "$KOPIE/opslag-b.json" || test -s "$KOPIE/opslag-a.json" || { echo "::error::geen kopie geschreven"; exit 1; }
grep -q '"Simulator"' "$KOPIE"/opslag-*.json || { echo "::error::kopie mist de speler"; exit 1; }

echo "== 3. Webviewopslag gewist (zoals iOS kan doen)"
find "$DATA/Library" -maxdepth 3 -iname "*WebKit*" -print
rm -rf "$DATA/Library/WebKit" "$DATA/Library/Caches"
run 3-na-wissen
need 3-na-wissen "OKKIE. opslag teruggezet uit kopie"
echo "Rooktest geslaagd: starten, terugzetten, kopie schrijven en herstel na wissen werken in de echte app."
