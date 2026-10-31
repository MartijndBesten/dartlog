#!/usr/bin/env bash
# Kies de nieuwste Xcode 26 die géén bèta is: Apple weigert uploads die met een bèta-Xcode zijn gebouwd.
set -euo pipefail
pick=$(ls -d /Applications/Xcode_26*.app 2>/dev/null | grep -viE 'beta' | sort -V | tail -1 || true)
if [ -n "$pick" ]; then sudo xcode-select -s "$pick"; fi
xcodebuild -version
if xcodebuild -version | grep -qi beta; then echo "::error::Geselecteerde Xcode is een bèta; upload zou worden geweigerd."; exit 1; fi
