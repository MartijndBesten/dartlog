#!/usr/bin/env bash
# Controleert dat de UI-testmodus (SceneDelegate.swift, #if DEBUG) niet in een Release-build zit en dus in TestFlight
# of de App Store niet te activeren is. Tegenproef: in de Debug-build moeten de markeringen wél staan, anders bewijst
# de controle niets.
#   check-release.sh <Release-binary> <Debug-binary of -dylib> [meer Debug-kandidaten]
set -euo pipefail
rel="$1"; shift
MARKS='-OKKIEUITest|OKKIE_FIXTURE|okkie-js-fout|-OKKIEWipeWebKit'
if strings -a "$rel" | grep -E -- "$MARKS"; then echo "::error::Release-build bevat de UI-testmodus"; exit 1; fi
found=0
for dbg in "$@"; do
  [ -f "$dbg" ] || continue
  n=$(strings -a "$dbg" | grep -E -c -- "$MARKS" || true)
  echo "Debug ($dbg): $n markeringen"
  [ "$n" -gt 0 ] && found=1
done
[ "$found" = 1 ] || { echo "::error::Tegenproef mislukt: testmodus niet gevonden in de Debug-build"; exit 1; }
echo "Release-build zonder testmodus (gecontroleerd op: $MARKS); Debug-build bevat hem wel."
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- Release-build: geen UI-testmodus (tegenproef Debug: wel)" >> "$GITHUB_STEP_SUMMARY"
exit 0
