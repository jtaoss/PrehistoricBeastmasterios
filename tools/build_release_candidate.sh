#!/usr/bin/env bash
# Headless verify and archive builds for Prehistoric Beastmaster.
# verify: newest iOS Simulator, signing disabled.
# archive: generic iOS device, signing from the Release configuration unless overridden.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/PrehistoricBeastmaster.xcodeproj"
WORKSPACE="$ROOT/PrehistoricBeastmaster.xcworkspace"
SCHEME="${SCHEME:-PrehistoricBeastmaster}"
DERIVED_DATA="$ROOT/build/DerivedData"
SOURCE_PACKAGES="$DERIVED_DATA/SourcePackages"
LOG_DIR="$ROOT/build/logs"
ARCHIVE_PATH="$ROOT/build/PrehistoricBeastmaster.xcarchive"
APP_NAME="PrehistoricBeastmaster"

MODE="verify"
SKIP_RESOLVE=0
CLEAN_CACHE=0
SIGNING=""
TEAM=""
IDENTITY=""
PROFILE=""
ALLOW_PROVISIONING=0

if [[ -t 1 ]]; then
  RED=$'\033[31m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  CYAN=$'\033[36m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  RED=""
  GREEN=""
  YELLOW=""
  CYAN=""
  BOLD=""
  RESET=""
fi

info() { printf '%s\n' "${CYAN}[build]${RESET} $*"; }
ok() { printf '%s\n' "${GREEN}[build]${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}[build]${RESET} $*" >&2; }
fail() { printf '%s\n' "${RED}[build]${RESET} $*" >&2; }

usage() {
  cat <<'EOF'
Usage: tools/build_release_candidate.sh [options]

Options:
  --mode verify|archive       verify (default) or archive
  --skip-resolve              Do not run tools/resolve_dependencies.sh first
  --clean-cache               Pass --clean-cache to the resolver
  --signing automatic|manual  Override Release/Debug signing style
  --team ID                   DEVELOPMENT_TEAM
  --identity NAME             CODE_SIGN_IDENTITY
  --profile NAME              PROVISIONING_PROFILE_SPECIFIER
  --allow-provisioning-updates
                              Pass -allowProvisioningUpdates (archive only)
  -h, --help                  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift
      ;;
    --mode=*)
      MODE="${1#--mode=}"
      ;;
    --skip-resolve) SKIP_RESOLVE=1 ;;
    --clean-cache) CLEAN_CACHE=1 ;;
    --signing)
      SIGNING="${2:-}"
      shift
      ;;
    --signing=*)
      SIGNING="${1#--signing=}"
      ;;
    --team)
      TEAM="${2:-}"
      shift
      ;;
    --team=*)
      TEAM="${1#--team=}"
      ;;
    --identity)
      IDENTITY="${2:-}"
      shift
      ;;
    --identity=*)
      IDENTITY="${1#--identity=}"
      ;;
    --profile)
      PROFILE="${2:-}"
      shift
      ;;
    --profile=*)
      PROFILE="${1#--profile=}"
      ;;
    --allow-provisioning-updates) ALLOW_PROVISIONING=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1"; usage >&2; exit 2 ;;
  esac
  shift
done

case "$MODE" in
  verify|archive) ;;
  *) fail "Unsupported mode: $MODE"; usage >&2; exit 2 ;;
esac

case "$SIGNING" in
  ""|automatic|manual) ;;
  *) fail "Unsupported signing style: $SIGNING"; exit 2 ;;
esac

if ! command -v xcodebuild >/dev/null 2>&1; then
  fail "xcodebuild is not on PATH."
  exit 2
fi

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/${MODE}.log"
: >"$LOG_FILE"

xcode_args() {
  if [[ -d "$WORKSPACE" ]]; then
    printf '%s\n' -workspace
    printf '%s\n' "$WORKSPACE"
  else
    printf '%s\n' -project
    printf '%s\n' "$PROJECT"
  fi
}

report_conflicts() {
  local log="$1"
  [[ -f "$log" ]] || return 0
  local hits
  hits="$(grep -E -i "FirebaseCore|FirebaseAnalytics|GoogleUtilities|GoogleAppMeasurement|duplicate symbol|Multiple commands produce|Could not resolve package dependencies|Unable to find module dependency" "$log" | head -n 40 || true)"
  [[ -z "$hits" ]] && return 0
  printf '\n%s\n' "${BOLD}Dependency conflict excerpt${RESET}"
  printf '%s\n' "$hits"
  cat <<'EOF'

If FirebaseCore and GoogleUtilities appear together, one product is linked twice
or a static SPM slice is mixed with a dynamic pod. Link FirebaseAnalyticsCore
once and keep the GoogleUtilities pin from Package.resolved.
EOF
}

pick_simulator() {
  python3 - "$PROJECT" "$SCHEME" <<'PY'
import re, subprocess, sys
project, scheme = sys.argv[1], sys.argv[2]
proc = subprocess.run(
    ["xcodebuild", "-project", project, "-scheme", scheme, "-showdestinations"],
    capture_output=True, text=True,
)
text = (proc.stdout or "") + "\n" + (proc.stderr or "")
best = None
for line in text.splitlines():
    if "platform:iOS Simulator" not in line:
        continue
    if "placeholder" in line.lower():
        continue
    id_m = re.search(r"id:([^,}\s]+)", line)
    os_m = re.search(r"OS:([0-9]+(?:\.[0-9]+)*)", line)
    name_m = re.search(r"name:([^,}]+)", line)
    if not (id_m and os_m and name_m):
        continue
    name = name_m.group(1).strip()
    if not name.startswith("iPhone"):
        continue
    parts = tuple(int(piece) for piece in os_m.group(1).split("."))
    penalty = 1 if any(token in name for token in ("Pro", "Max", "Plus", "SE", "mini")) else 0
    cand = (parts, -penalty, name, id_m.group(1).strip(), os_m.group(1))
    if best is None or cand[:2] > best[:2]:
        best = cand
if best is None:
    sys.exit(2)
print("platform=iOS Simulator,id=%s" % best[3])
print("%s (iOS %s)" % (best[2], best[4]))
PY
}

summarize() {
  local code="$1"
  local seconds="$2"
  local destination="$3"
  local minutes=$((seconds / 60))
  local remain=$((seconds % 60))
  local result="Build Failed"
  local color="$RED"
  if [[ "$code" -eq 0 ]]; then
    result="Build Succeeded"
    color="$GREEN"
  fi
  printf '\n%s\n' "${BOLD}================================${RESET}"
  printf ' mode:        %s\n' "$MODE"
  printf ' destination: %s\n' "$destination"
  printf ' result:      %s%s%s\n' "$color" "$result" "$RESET"
  printf ' duration:    %dm%02ds\n' "$minutes" "$remain"
  printf ' log:         %s\n' "$LOG_FILE"
  printf '%s\n' "${BOLD}================================${RESET}"
}

validate_archive() {
  local app="$ARCHIVE_PATH/Products/Applications/${APP_NAME}.app"
  local binary="$app/$APP_NAME"
  local dsym="$ARCHIVE_PATH/dSYMs/${APP_NAME}.app.dSYM"
  local errors=0
  if [[ ! -d "$app" || ! -f "$app/Info.plist" || ! -x "$binary" ]]; then
    fail "Archive is missing ${APP_NAME}.app, its executable, or Info.plist"
    errors=1
  else
    ok "Archive contains ${APP_NAME}.app"
  fi
  if [[ ! -d "$dsym/Contents/Resources/DWARF" ]]; then
    fail "dSYM is missing at $dsym"
    errors=1
  else
    ok "dSYM bundle is present"
  fi
  if [[ "$errors" -ne 0 ]]; then
    return 1
  fi
  if ! command -v dwarfdump >/dev/null 2>&1 && ! xcrun --find dwarfdump >/dev/null 2>&1; then
    warn "dwarfdump is unavailable; skipped UUID comparison"
    return 0
  fi
  local app_ids dsym_ids missing=0
  app_ids="$(xcrun dwarfdump --uuid "$binary" | awk '{print $2}')"
  dsym_ids="$(xcrun dwarfdump --uuid "$dsym" | awk '{print $2}')"
  local uuid
  for uuid in $app_ids; do
    if ! printf '%s\n' "$dsym_ids" | grep -q "$uuid"; then
      fail "App UUID $uuid was not found in the dSYM"
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 || -z "$app_ids" ]]; then
    return 1
  fi
  ok "dSYM UUIDs match the app executable"
  return 0
}

signing_overrides() {
  if [[ "$MODE" == "verify" ]]; then
    echo CODE_SIGNING_ALLOWED=NO
    echo CODE_SIGNING_REQUIRED=NO
    echo CODE_SIGN_IDENTITY=-
    echo PROVISIONING_PROFILE_SPECIFIER=
    return 0
  fi
  if [[ "$SIGNING" == "automatic" ]]; then
    echo CODE_SIGN_STYLE=Automatic
    [[ -n "$TEAM" ]] && echo "DEVELOPMENT_TEAM=$TEAM"
    return 0
  fi
  if [[ "$SIGNING" == "manual" || -n "$TEAM" || -n "$IDENTITY" || -n "$PROFILE" ]]; then
    echo CODE_SIGN_STYLE=Manual
    [[ -n "$TEAM" ]] && echo "DEVELOPMENT_TEAM=$TEAM"
    [[ -n "$IDENTITY" ]] && echo "CODE_SIGN_IDENTITY=$IDENTITY"
    [[ -n "$PROFILE" ]] && echo "PROVISIONING_PROFILE_SPECIFIER=$PROFILE"
  fi
}

if [[ "$SKIP_RESOLVE" -eq 0 ]]; then
  info "Resolving dependencies"
  if [[ "$CLEAN_CACHE" -eq 1 ]]; then
    resolve_status=0
    "$ROOT/tools/resolve_dependencies.sh" --clean-cache || resolve_status=$?
  else
    resolve_status=0
    "$ROOT/tools/resolve_dependencies.sh" || resolve_status=$?
  fi
  if [[ "$resolve_status" -ne 0 ]]; then
    fail "Dependency resolution failed; build was not started"
    exit 1
  fi
fi

destination=""
destination_label=""
configuration="Debug"
build_action=(clean build)
if [[ "$MODE" == "verify" ]]; then
  picker="$(pick_simulator || true)"
  destination="$(printf '%s\n' "$picker" | awk 'NR==1 {print}')"
  destination_label="$(printf '%s\n' "$picker" | awk 'NR==2 {print}')"
  if [[ -z "$destination" ]]; then
    destination="generic/platform=iOS Simulator"
    destination_label="generic iOS Simulator"
    warn "No iPhone simulator destination was listed; using $destination"
  fi
  info "Simulator destination: ${destination_label}"
else
  configuration="Release"
  destination="generic/platform=iOS"
  destination_label="generic/platform=iOS"
  build_action=(archive)
  rm -rf "$ARCHIVE_PATH"
  info "Archiving to $ARCHIVE_PATH"
fi

overrides=()
while IFS= read -r setting; do
  [[ -n "$setting" ]] && overrides+=("$setting")
done < <(signing_overrides)

container=()
while IFS= read -r item; do
  [[ -n "$item" ]] && container+=("$item")
done < <(xcode_args)

started=$(date +%s)
set +e
if [[ "$MODE" == "verify" ]]; then
  xcodebuild "${build_action[@]}" \
    "${container[@]}" \
    -scheme "$SCHEME" \
    -configuration "$configuration" \
    -destination "$destination" \
    -derivedDataPath "$DERIVED_DATA" \
    -clonedSourcePackagesDirPath "$SOURCE_PACKAGES" \
    ${overrides[@]+"${overrides[@]}"} \
    2>&1 | tee "$LOG_FILE"
else
  archive_cmd=(
    xcodebuild "${build_action[@]}"
    "${container[@]}"
    -scheme "$SCHEME"
    -configuration "$configuration"
    -destination "$destination"
    -archivePath "$ARCHIVE_PATH"
    -derivedDataPath "$DERIVED_DATA"
    -clonedSourcePackagesDirPath "$SOURCE_PACKAGES"
  )
  if [[ ${#overrides[@]} -gt 0 ]]; then
    archive_cmd+=("${overrides[@]}")
  fi
  if [[ "$ALLOW_PROVISIONING" -eq 1 || "$SIGNING" == "automatic" ]]; then
    archive_cmd+=(-allowProvisioningUpdates)
  fi
  "${archive_cmd[@]}" 2>&1 | tee "$LOG_FILE"
fi
code=${PIPESTATUS[0]}
set -e
finished=$(date +%s)
elapsed=$((finished - started))

if [[ "$code" -eq 0 && "$MODE" == "archive" ]]; then
  if ! validate_archive; then
    code=1
  fi
fi

if [[ "$code" -ne 0 ]]; then
  printf '\n%s\n' "${BOLD}Last compiler errors${RESET}"
  grep -E -i "error:|fatal error:|xcodebuild: error:" "$LOG_FILE" | tail -n 30 || true
  report_conflicts "$LOG_FILE"
  fail "Build Failed"
else
  ok "Build Succeeded"
fi

summarize "$code" "$elapsed" "$destination_label"
exit "$code"
