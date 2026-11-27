#!/usr/bin/env bash
# Snapvere by Brendigo
# Native compile and targeted read-safety tests. Never publishes a public installer.
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'macOS native validation requires a Mac.' >&2
  exit 1
fi

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
for tool in xcode-select node npm cargo rustc; do
  command -v "$tool" >/dev/null || {
    printf 'Missing required tool: %s\n' "$tool" >&2
    exit 1
  }
done
xcode-select -p >/dev/null
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'
host="$(rustc -vV | sed -n 's/^host: //p')"
case "$host" in
  aarch64-apple-darwin|x86_64-apple-darwin) ;;
  *) printf 'Unsupported native Rust host: %s\n' "$host" >&2; exit 1 ;;
esac
printf 'Checking shared Snapvere source on %s\n' "$host"

cd "$root/apps/desktop"
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run test:unit
cd src-tauri
cargo check --locked --all-targets --target "$host"
cargo check --locked --all-targets --target "$host" --features pro
cargo test --locked --target "$host" --lib pinned_directory::macos_read::tests
cargo test --locked --target "$host" --lib --features pro pinned_directory::macos_read::tests
cargo test --locked --target "$host" --lib macos_permissions::tests
cargo test --locked --target "$host" --lib --features pro macos_permissions::tests
printf '%s\n' 'Compile and targeted filesystem tests passed. Native permissions, capture, recovery, parity and distribution remain unverified.'
