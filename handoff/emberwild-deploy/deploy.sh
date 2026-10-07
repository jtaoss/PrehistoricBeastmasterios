#!/usr/bin/env bash
# Run on the operations Linux host after extracting a reviewed release bundle.
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
verify() { (cd -- "$1" && sha256sum --check --strict --quiet manifest.sha256); }
action=${1:-verify}
if [[ "$action" == verify ]]; then verify "$bundle"; echo 'Release hashes verified.'; exit 0; fi
if [[ "$action" != publish && "$action" != rollback ]]; then echo 'Usage: deploy.sh verify | publish ROOT | rollback ROOT RELEASE_ID' >&2; exit 2; fi
root=${2:?Provide an absolute deployment directory, for example /srv/emberwild}
if [[ "$root" != /* || "$root" == / ]]; then echo 'Deployment root must be an absolute application directory.' >&2; exit 2; fi
mkdir -p -- "$root"
root=$(cd -- "$root" && pwd -P)
if [[ "$root" == "$bundle" || "$root" == "$bundle/"* ]]; then echo 'Deployment root must be outside the extracted bundle.' >&2; exit 2; fi
if [[ -e "$root/current" && ! -L "$root/current" ]]; then echo 'current must be a symlink; existing content was preserved.' >&2; exit 2; fi
if [[ "$action" == publish ]]; then
  verify "$bundle"
  id=$(cat -- "$bundle/VERSION")
else
  id=${3:?Provide the retained release ID to roll back to}
fi
if [[ ! "$id" =~ ^[a-f0-9]{16}$ ]]; then echo 'Invalid release ID.' >&2; exit 2; fi
target="$root/releases/$id"
if [[ "$action" == publish && ! -e "$target" ]]; then
  mkdir -p -- "$root/releases"
  # Copy into a unique candidate; a failed copy never changes the active release.
  candidate="$root/releases/.candidate-$id-$$"
  if [[ -e "$candidate" || -L "$candidate" ]]; then echo 'Candidate already exists.' >&2; exit 2; fi
  mkdir -- "$candidate"
  cp -a -- "$bundle/." "$candidate/"
  verify "$candidate"
  mv -T -- "$candidate" "$target"
fi
if [[ ! -d "$target/public" || -L "$target" ]]; then echo 'Release directory is missing or unexpected.' >&2; exit 2; fi
verify "$target"
if [[ "$action" == publish ]] && ! cmp -s -- "$bundle/manifest.sha256" "$target/manifest.sha256"; then
  echo 'The retained release differs from this bundle; nothing was activated.' >&2; exit 2
fi
next="$root/.current-next-$$"
if [[ -e "$next" || -L "$next" ]]; then echo 'Activation candidate already exists.' >&2; exit 2; fi
ln -s -- "releases/$id/public" "$next"
mv -T -- "$next" "$root/current"
echo "Activated $id. Earlier releases and the app's bundled mini-game were preserved."
