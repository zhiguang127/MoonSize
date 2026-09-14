#!/usr/bin/env bash
# Pinned official Linux x86_64 toolchain; does not modify global shell profiles.
set -euo pipefail
: "${MOON_HOME:?Set MOON_HOME to a dedicated toolchain directory}"
version='0.10.12%2B1634b282e'
download_dir="${RUNNER_TEMP:-/tmp}/moonsize-downloads"
mkdir -p "$download_dir" "$MOON_HOME/lib"
curl -fsSL "https://cli.moonbitlang.com/binaries/$version/moonbit-linux-x86_64.tar.gz" -o "$download_dir/moonbit.tar.gz"
curl -fsSL "https://cli.moonbitlang.com/cores/core-$version.tar.gz" -o "$download_dir/core.tar.gz"
printf '%s  %s\n' '9bbda7d342fa39654a65c23805e5ff5a3915a26b36627a2565a6b1a99d099e01' "$download_dir/moonbit.tar.gz" | sha256sum --check
printf '%s  %s\n' '784a12ce4e204a3a98a0b704a021f747b916412efacd4dfe2f4e5c27ae183ac1' "$download_dir/core.tar.gz" | sha256sum --check
tar xzf "$download_dir/moonbit.tar.gz" -C "$MOON_HOME"
tar xzf "$download_dir/core.tar.gz" -C "$MOON_HOME/lib"
export PATH="$MOON_HOME/bin:$PATH"
moon -C "$MOON_HOME/lib/core" bundle --all --warn-list -a
moon version --all
