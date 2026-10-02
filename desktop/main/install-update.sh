#!/bin/sh
# Main supplies literal arguments. Never evaluate release metadata as shell code.
set -eu
pid=$1
target=$2
workspace=$3
log=$4
staged="$workspace/Game Dev Forge.app"
backup="$workspace/previous.app"
exec >>"$log" 2>&1
restore_on_failure() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ "$result" -ne 0 ]; then
    echo "Update failed; restoring previous application."
    if [ -d "$backup" ]; then
      if [ -e "$target" ]; then /bin/mv "$target" "$workspace/failed.app"; fi
      /bin/mv "$backup" "$target"
    fi
    if ! /bin/kill -0 "$pid" 2>/dev/null; then /usr/bin/open -n "$target" || true; fi
  fi
  exit "$result"
}
trap restore_on_failure EXIT
trap 'exit 1' HUP INT TERM
echo "Waiting for application to exit."
seconds=0
while /bin/kill -0 "$pid" 2>/dev/null; do
  seconds=$((seconds + 1))
  if [ "$seconds" -ge 120 ]; then echo "Application did not exit; update cancelled."; exit 1; fi
  /bin/sleep 1
done
/usr/bin/codesign --verify --deep --strict "$staged"
/bin/mv "$target" "$backup"
/bin/mv "$staged" "$target"
/usr/bin/open -n "$target"
echo "Update installed. Previous application retained at $backup"
