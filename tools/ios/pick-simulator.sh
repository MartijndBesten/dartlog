#!/usr/bin/env bash
# Geeft de UDID van de nieuwste beschikbare "iPhone NN Pro"-simulator (anders de eerste iPhone). Gebruikt door
# tools/ios/smoke.sh en de UI-tests in .github/workflows/ios.yml, zodat beide op hetzelfde toestel draaien.
set -euo pipefail
xcrun simctl list devices available -j | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
  const all = Object.entries(d).filter(([rt]) => /iOS/.test(rt)).flatMap(([rt, l]) => l.map(x => ({ ...x, rt })));
  const pick = all.filter(x => /^iPhone \d+ Pro$/.test(x.name)).sort((a, b) => b.rt.localeCompare(a.rt, undefined, { numeric: true }))[0] || all.find(x => /iPhone/.test(x.name));
  console.error("Simulator:", pick.name, pick.rt); console.log(pick.udid);'
