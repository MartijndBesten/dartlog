#!/usr/bin/env python3
"""TestFlight-build (GitHub Actions): alleen de app-target in Release handmatig laten ondertekenen met het tijdelijke
App Store-profiel uit tools/ios/asc-signing.mjs. Op de opdrachtregel zou dat ook de Swift-pakketten raken.
Alleen in de runner; de repository houdt automatische ondertekening (handig in Xcode op een Mac)."""
import re
import sys

path, profile, team = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path, encoding='utf-8').read()
blocks = list(re.finditer(r'\t\t[0-9A-F]{24} /\* Release \*/ = \{\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = \{\n(.*?)\n\t\t\t\};', text, re.S))
target = [b for b in blocks if 'INFOPLIST_FILE = App/Info.plist;' in b.group(1)]
if len(target) != 1:
    sys.exit('App-target (Release) niet gevonden in project.pbxproj')
b = target[0]
settings = b.group(1)
settings = re.sub(r'\n\t\t\t\tCODE_SIGN_STYLE = \w+;', '', settings)
settings = re.sub(r'\n\t\t\t\t(CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER|DEVELOPMENT_TEAM)(\[[^\]]*\])? = [^;]*;', '', settings)
settings += ('\n\t\t\t\tCODE_SIGN_STYLE = Manual;'
             '\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";'
             f'\n\t\t\t\tDEVELOPMENT_TEAM = {team};'
             f'\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{profile}";')
text = text[:b.start(1)] + settings + text[b.end(1):]
open(path, 'w', encoding='utf-8').write(text)
print(f'App-target Release: handmatig ondertekenen met "{profile}" (team {team}).')
