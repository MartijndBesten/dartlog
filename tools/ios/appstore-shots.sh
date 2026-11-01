#!/usr/bin/env bash
# App Store-screenshots uit de simulator (macOS, Xcode 26). Per formaat een eigen simulator met nette statusbalk
# (9:41, vol), dan de XCUITest AppStoreScreenshots (fictieve demogegevens, geen netwerk) en de PNG's uit het xcresult.
#   tools/ios/appstore-shots.sh <uitvoermap>
# Uitvoer: <map>/6.9/*.png (1320×2868) en <map>/6.5/*.png (1242×2688 of 1284×2778). Faalt bij een verkeerd formaat
# of minder dan 6 plaatjes per formaat.
set -euo pipefail
OUT=${1:?uitvoermap}
mkdir -p "$OUT"
RUNTIME=$(xcrun simctl list runtimes available -j | node -e '
  const r = JSON.parse(require("fs").readFileSync(0, "utf8")).runtimes.filter(x => x.platform === "iOS" && x.isAvailable);
  r.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })); console.log(r[0].identifier);')
echo "Runtime: $RUNTIME"
TYPES=$(xcrun simctl list devicetypes -j)
pick_type() {   # eerste beschikbare apparaatnaam uit de lijst
  for name in "$@"; do
    id=$(echo "$TYPES" | node -e 'const n=process.argv[1];const t=JSON.parse(require("fs").readFileSync(0,"utf8")).devicetypes.find(x=>x.name===n);if(t)console.log(t.identifier)' "$name")
    if [ -n "$id" ]; then echo "$name|$id"; return 0; fi
  done
  return 1
}

shoot() {   # <map> <toegestane formaten, bv. "1320x2868"> <apparaatnamen…>
  local dir=$1 sizes=$2; shift 2
  local pick name type udid
  pick=$(pick_type "$@") || { echo "::error::Geen simulator voor $dir ($*)"; exit 1; }
  name=${pick%%|*}; type=${pick##*|}
  udid=$(xcrun simctl create "Shots $dir" "$type" "$RUNTIME")
  echo "== $dir: $name ($udid)"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl status_bar "$udid" override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
  xcrun simctl ui "$udid" appearance dark || true
  set +e
  xcodebuild test -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination "id=$udid" \
    -derivedDataPath build -resultBundlePath "$OUT/shots-$dir.xcresult" -only-testing:OKKIEUITests/AppStoreScreenshots \
    CODE_SIGNING_ALLOWED=NO > "$OUT/shots-$dir.log" 2>&1
  local status=$?
  set -e
  grep -E "error:|Test Case .*(passed|failed)|\*\* TEST" "$OUT/shots-$dir.log" | cut -c1-300 || true
  [ $status -eq 0 ] || echo "::warning::Screenshot-test $dir eindigde met $status; plaatjes worden toch gecontroleerd"
  mkdir -p "$OUT/raw-$dir" "$OUT/$dir"
  xcrun xcresulttool export attachments --path "$OUT/shots-$dir.xcresult" --output-path "$OUT/raw-$dir"
  # manifest.json: per test de bijlagen met suggestedHumanReadableName (bv. "1-home_0_<uuid>.png") en exportedFileName
  node -e '
    const fs = require("fs"), path = require("path"); const dir = process.argv[1], dest = process.argv[2];
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    for (const t of m) for (const a of t.attachments || []) {
      const n = (a.suggestedHumanReadableName || "").match(/^(\d-[a-z0-9-]+)/);
      if (n) fs.copyFileSync(path.join(dir, a.exportedFileName), path.join(dest, n[1] + ".png"));
    }' "$OUT/raw-$dir" "$OUT/$dir"
  local count=0 bad=0
  for f in "$OUT/$dir"/*.png; do
    [ -e "$f" ] || continue
    w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}'); h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
    count=$((count + 1))
    if [[ " $sizes " == *" ${w}x${h} "* ]]; then echo "ok   $dir/$(basename "$f") ${w}x${h}"; else echo "FOUT $dir/$(basename "$f") ${w}x${h} (verwacht $sizes)"; bad=1; fi
  done
  echo "- $dir ($name): $count plaatjes" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  xcrun simctl shutdown "$udid" || true
  [ $bad -eq 0 ] && [ $count -ge 6 ] || { echo "::error::$dir: $count plaatjes, formaat fout=$bad"; exit 1; }
}

shoot 6.9 "1320x2868" "iPhone 17 Pro Max" "iPhone 16 Pro Max"
shoot 6.5 "1242x2688 1284x2778" "iPhone 11 Pro Max" "iPhone 14 Plus" "iPhone 13 Pro Max" "iPhone 12 Pro Max"
