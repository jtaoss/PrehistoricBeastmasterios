#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! /usr/bin/shasum -a 256 -c scripts/emberwild-resources.sha256 --status; then
  echo 'error: Emberwild iOS resources are stale. Run pnpm install --frozen-lockfile && pnpm build:ios in prototypes/emberwild before building.' >&2
  exit 1
fi
# Hashes detect changed/missing files; the inventory also rejects untracked old
# resources and newly added sources that have not been packaged yet.
actual_resources=$(/usr/bin/find PrehistoricBeastmaster/Resources/game -type f ! -name .DS_Store | LC_ALL=C /usr/bin/sort)
expected_resources=$(/usr/bin/awk '$2 ~ /^PrehistoricBeastmaster\/Resources\/game\// {print $2}' scripts/emberwild-resources.sha256 | LC_ALL=C /usr/bin/sort)
if [ "$actual_resources" != "$expected_resources" ]; then
  echo 'error: Packaged game inventory differs from the verified build. Review extra/missing resources, then rebuild Emberwild.' >&2
  exit 1
fi
actual_source=$({ /usr/bin/find prototypes/emberwild -maxdepth 1 -type f \( -name '*.mjs' -o -name '*.js' -o -name '*.css' -o -name '*.html' \) ! -name 'generate-*'; /usr/bin/find prototypes/emberwild/assets -type f ! -name .DS_Store; } | LC_ALL=C /usr/bin/sort)
expected_source=$(/usr/bin/awk '$2 ~ /^prototypes\/emberwild\// && $2 !~ /\/(package.json|pnpm-lock.yaml)$/ {print $2}' scripts/emberwild-resources.sha256 | LC_ALL=C /usr/bin/sort)
if [ "$actual_source" != "$expected_source" ]; then
  echo 'error: Source inventory changed. Rebuild Emberwild before compiling iOS.' >&2
  exit 1
fi
if [ -n "$(/usr/bin/find PrehistoricBeastmaster/Resources/game prototypes/emberwild/assets -type l -print)" ]; then
  echo 'error: Unexpected symlink in game resources.' >&2
  exit 1
fi
