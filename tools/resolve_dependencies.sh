#!/usr/bin/env bash
# Resolve Prehistoric Beastmaster package dependencies from the command line.
# SPM is the project default. CocoaPods is used only when a Podfile is present.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/PrehistoricBeastmaster.xcodeproj"
WORKSPACE="$ROOT/PrehistoricBeastmaster.xcworkspace"
SCHEME="${SCHEME:-PrehistoricBeastmaster}"
DERIVED_DATA="$ROOT/build/DerivedData"
SOURCE_PACKAGES="$DERIVED_DATA/SourcePackages"
LOG_DIR="$ROOT/build/logs"
LOG_FILE="$LOG_DIR/resolve.log"
RESOLVED_FILE="$PROJECT/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"

CLEAN_CACHE=0
ALLOW_LOCK_UPDATE=0

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

info() { printf '%s\n' "${CYAN}[resolve]${RESET} $*"; }
ok() { printf '%s\n' "${GREEN}[resolve]${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}[resolve]${RESET} $*" >&2; }
fail() { printf '%s\n' "${RED}[resolve]${RESET} $*" >&2; }

usage() {
  cat <<'EOF'
Usage: tools/resolve_dependencies.sh [options]

Detect Swift Package Manager and/or CocoaPods, then resolve dependencies.

Options:
  --clean-cache         Delete this project's DerivedData and SourcePackages first
  --allow-lock-update   CocoaPods: keep going if Podfile.lock changes
  -h, --help            Show this help

Exit codes:
  0  resolved
  1  resolver failed
  2  project or required tool is missing
  3  Podfile.lock drifted
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean-cache) CLEAN_CACHE=1 ;;
    --allow-lock-update) ALLOW_LOCK_UPDATE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1"; usage >&2; exit 2 ;;
  esac
  shift
done

HAS_SPM=0
HAS_PODS=0
if [[ -f "$RESOLVED_FILE" ]] || grep -q "XCRemoteSwiftPackageReference" "$PROJECT/project.pbxproj" 2>/dev/null; then
  HAS_SPM=1
fi
if [[ -f "$ROOT/Podfile" ]]; then
  HAS_PODS=1
fi

if [[ "$HAS_SPM" -eq 0 && "$HAS_PODS" -eq 0 ]]; then
  fail "No Package.resolved, Swift package reference, or Podfile was found."
  exit 2
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  fail "xcodebuild is not on PATH. Install Xcode and run xcode-select -s /Applications/Xcode.app."
  exit 2
fi

mkdir -p "$LOG_DIR"
: >"$LOG_FILE"

xcode_container() {
  if [[ -d "$WORKSPACE" ]]; then
    printf '%s\n' -workspace "$WORKSPACE"
  else
    printf '%s\n' -project "$PROJECT"
  fi
}

clean_package_cache() {
  info "Clearing DerivedData and SourcePackages"
  rm -rf "$DERIVED_DATA" "$ROOT/build/SourcePackages"
  local match
  match="$HOME/Library/Developer/Xcode/DerivedData/${SCHEME}-"*
  # shellcheck disable=SC2086
  rm -rf $match
  ok "Package cache removed"
}

print_locked_pins() {
  [[ -f "$RESOLVED_FILE" ]] || return 0
  python3 - "$RESOLVED_FILE" <<'PY' || true
import json, sys
wanted = {
    "firebase-ios-sdk",
    "googleutilities",
    "googleappmeasurement",
    "nanopb",
    "promises",
    "facebook-ios-sdk",
}
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as exc:
    print(f"  (could not read Package.resolved: {exc})")
    raise SystemExit(0)
print("Locked package versions:")
for pin in data.get("pins", []):
    identity = pin.get("identity", "")
    if identity not in wanted:
        continue
    state = pin.get("state", {})
    version = state.get("version") or state.get("revision", "?")
    print(f"  {identity} {version}")
PY
}

report_conflicts() {
  local log="$1"
  [[ -f "$log" ]] || return 0
  local pattern="FirebaseCore|FirebaseAnalytics|GoogleUtilities|GoogleAppMeasurement|nanopb|Promises|FBLPromises|duplicate symbol|Multiple commands produce|Unable to find module dependency|Could not resolve package dependencies"
  local hits
  hits="$(grep -E -i "$pattern" "$log" | head -n 40 || true)"
  if [[ -z "$hits" ]]; then
    return 0
  fi
  printf '\n%s\n' "${BOLD}Dependency conflict excerpt${RESET}"
  printf '%s\n' "$hits"
  echo
  print_locked_pins
  cat <<'EOF'

Standard linkage check:
  Keep a single GoogleUtilities/FirebaseCore graph. This app links FirebaseCore and
  FirebaseAnalyticsCore from firebase-ios-sdk (SPM, static-friendly). Do not also
  link FirebaseAnalytics, and do not mix those products with dynamic use_frameworks!.
  Re-run with --clean-cache after changing the lockfile.
EOF
}

resolve_spm() {
  info "Swift Package Manager detected"
  info "Resolving $SCHEME"
  local container_flag container_path
  container_flag="$(xcode_container | awk 'NR==1 {print; exit}')"
  container_path="$(xcode_container | awk 'NR==2 {print; exit}')"
  set +e
  xcodebuild -resolvePackageDependencies \
    "$container_flag" "$container_path" \
    -scheme "$SCHEME" \
    -derivedDataPath "$DERIVED_DATA" \
    -clonedSourcePackagesDirPath "$SOURCE_PACKAGES" \
    2>&1 | tee -a "$LOG_FILE"
  local code=${PIPESTATUS[0]}
  set -e
  if [[ "$code" -ne 0 ]] || grep -E -q "Could not resolve package dependencies|xcodebuild: error:" "$LOG_FILE"; then
    fail "SPM resolution failed (exit ${code})"
    report_conflicts "$LOG_FILE"
    return 1
  fi
  if [[ -d "$SOURCE_PACKAGES/checkouts/firebase-ios-sdk" || -d "$DERIVED_DATA/SourcePackages/checkouts/firebase-ios-sdk" ]]; then
    ok "firebase-ios-sdk checkout is present"
  else
    warn "xcodebuild succeeded, but firebase-ios-sdk checkout was not found under $SOURCE_PACKAGES"
  fi
  ok "SPM resolution finished"
  return 0
}

resolve_pods() {
  info "CocoaPods detected"
  if ! command -v pod >/dev/null 2>&1; then
    fail "Podfile exists but pod is not installed."
    return 2
  fi
  local lock="$ROOT/Podfile.lock"
  local before=""
  if [[ -f "$lock" ]]; then
    before="$(shasum -a 256 "$lock" | awk '{print $1}')"
    info "Podfile.lock sha256 ${before}"
  else
    warn "Podfile.lock is missing. pod install will create one."
  fi
  set +e
  (cd "$ROOT" && pod install --repo-update) 2>&1 | tee -a "$LOG_FILE"
  local code=${PIPESTATUS[0]}
  set -e
  if [[ "$code" -ne 0 ]]; then
    fail "pod install failed (exit ${code})"
    report_conflicts "$LOG_FILE"
    return 1
  fi
  if [[ -n "$before" && -f "$lock" ]]; then
    local after
    after="$(shasum -a 256 "$lock" | awk '{print $1}')"
    if [[ "$before" != "$after" ]]; then
      warn "Podfile.lock changed (${before} -> ${after})"
      if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git -C "$ROOT" diff -- Podfile.lock | tee -a "$LOG_FILE" || true
      fi
      if [[ "$ALLOW_LOCK_UPDATE" -eq 0 ]]; then
        fail "Podfile.lock drifted. Review the diff or pass --allow-lock-update."
        report_conflicts "$LOG_FILE"
        return 3
      fi
      warn "Continuing because --allow-lock-update was set"
    else
      ok "Podfile.lock is unchanged"
    fi
  fi
  ok "CocoaPods install finished"
  return 0
}

if [[ "$CLEAN_CACHE" -eq 1 ]]; then
  clean_package_cache
fi

status=0
if [[ "$HAS_SPM" -eq 1 ]]; then
  resolve_spm || status=$?
fi
if [[ "$status" -eq 0 && "$HAS_PODS" -eq 1 ]]; then
  resolve_pods || status=$?
fi

if [[ "$status" -eq 0 ]]; then
  ok "Dependencies resolved. Log: $LOG_FILE"
else
  fail "Dependency resolution failed. Log: $LOG_FILE"
fi
exit "$status"
