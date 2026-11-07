#!/usr/bin/env bash
# Rooktest Android-app in de emulator (.github/workflows/android.yml): installeren, starten, controleren dat het
# welkomstscherm van OKKIE. verschijnt en de app niet crasht; daarna terugknop (mag de app niet laten crashen).
# Uitvoer (schermafdrukken, UI-dump, logcat) in android-smoke/.
set -euo pipefail
APK="$1"
PKG=nl.denckh.okkie
OUT=android-smoke
mkdir -p "$OUT"
adb wait-for-device
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
found=""
for i in $(seq 1 30); do
  sleep 2
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1 || true
  if grep -q "Let's play darts\|Let&apos;s play darts" "$OUT/ui.xml" 2>/dev/null; then found=yes; break; fi
done
adb exec-out screencap -p > "$OUT/start.png" || true
adb logcat -d > "$OUT/logcat.txt" || true
if [ -z "$found" ]; then echo "✖ welkomstscherm niet gevonden"; exit 1; fi
echo "✔ welkomstscherm met \"Let's play darts\" zichtbaar"
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then echo "✖ crash in logcat"; grep -A20 "FATAL EXCEPTION" "$OUT/logcat.txt"; exit 1; fi
adb shell pidof "$PKG" >/dev/null && echo "✔ app draait"
# Terugknop op het welkomstscherm: app naar de achtergrond (geen crash).
adb shell input keyevent KEYCODE_BACK
sleep 2
adb logcat -d > "$OUT/logcat-na-terug.txt" || true
if grep -q "FATAL EXCEPTION" "$OUT/logcat-na-terug.txt"; then echo "✖ crash na terugknop"; exit 1; fi
echo "✔ terugknop zonder crash"
