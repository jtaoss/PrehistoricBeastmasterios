#!/bin/bash
# Read-only pre-install gate for manually signed device builds. A top-level
# codesign --verify --deep can succeed despite an unsigned root debug dylib.
# Check every Mach-O file explicitly, including Xcode's *.debug.dylib and
# __preview.dylib, then verify the enclosing app's sealed resources.
set -euo pipefail

if [[ $# -ne 1 || ! -d "$1" || "$1" != *.app ]]; then
    echo "Usage: bash scripts/verify-device-signatures.sh /absolute/path/Game.app" >&2
    exit 2
fi
pbmApp=$(cd "$1" && pwd -P)
pbmTeam=$(/usr/bin/codesign -dvv "$pbmApp" 2>&1 | /usr/bin/sed -n 's/^TeamIdentifier=//p')
if [[ -z "$pbmTeam" || "$pbmTeam" == "not set" ]]; then
    echo "FAIL: app has no development/distribution signing team" >&2
    exit 1
fi

pbmCount=0
while IFS= read -r -d '' pbmFile; do
    case "$(/usr/bin/file -b "$pbmFile")" in
        *Mach-O*)
            /usr/bin/codesign --verify --strict "$pbmFile"
            pbmFileTeam=$(/usr/bin/codesign -dvv "$pbmFile" 2>&1 | /usr/bin/sed -n 's/^TeamIdentifier=//p')
            if [[ "$pbmFileTeam" != "$pbmTeam" ]]; then
                echo "FAIL: nested code has a different or missing team: ${pbmFile#"$pbmApp"/}" >&2
                exit 1
            fi
            pbmCount=$((pbmCount + 1))
            ;;
    esac
done < <(/usr/bin/find "$pbmApp" -type f -print0)

if [[ $pbmCount -eq 0 ]]; then
    echo "FAIL: no native executables found" >&2
    exit 1
fi
/usr/bin/codesign --verify --deep --strict "$pbmApp"
echo "PASS: $pbmCount native code files signed by team $pbmTeam; app seal verified"
