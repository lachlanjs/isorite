#!/bin/sh
# Install isorite as one executable (M21), checked against the release's SHA256SUMS:
#   curl -fsSL https://github.com/lachlanjs/isorite/releases/latest/download/install.sh | sh
#   sh install.sh [--version 0.9.0] [--dir ~/.local/bin] [--url <the executable's address>] [--sha256 <its sum>]
# Every address it fetches is printed first, so it can be fetched by hand instead. --url names the executable on a
# mirror; its SHA256SUMS is looked for beside it, or give --sha256. Run again, it replaces the executable.
set -eu

version="" dir="${HOME}/.local/bin" url="" want=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version) version="${2#v}"; shift 2 ;;
    --dir) dir="$2"; shift 2 ;;
    --url) url="$2"; shift 2 ;;
    --sha256) want="$2"; shift 2 ;;
    *) echo "install.sh: don't know $1" >&2; exit 2 ;;
  esac
done

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  *) echo "install.sh: for Linux and macOS; on Windows, install.ps1" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "install.sh: no executable for $(uname -m); npm i -g isorite works wherever Node 24 does" >&2; exit 1 ;;
esac
name="isorite-${os}-${arch}"

if [ -z "$url" ]; then
  if [ -n "$version" ]; then base="https://github.com/lachlanjs/isorite/releases/download/v${version}"
  else base="https://github.com/lachlanjs/isorite/releases/latest/download"; fi
  url="${base}/${name}"
fi
sums="${url%/*}/SHA256SUMS"

fetch() { # <address> <file>
  echo "  fetching $1"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q "$1" -O "$2"
  else echo "install.sh: needs curl or wget" >&2; exit 1; fi
}
sum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "isorite: installing ${name} into ${dir}"
if [ -z "$want" ]; then
  if ! fetch "$sums" "$tmp/SHA256SUMS"; then
    echo "install.sh: no SHA256SUMS at $sums: give the executable's sum with --sha256" >&2; exit 1
  fi
  want="$(grep " ${name}\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
  [ -n "$want" ] || { echo "install.sh: $sums doesn't list ${name}" >&2; exit 1; }
fi
fetch "$url" "$tmp/isorite"
got="$(sum "$tmp/isorite")"
if [ "$got" != "$want" ]; then
  echo "install.sh: ${url} is not the file expected: its SHA-256 is ${got}, not ${want}. Nothing was installed." >&2
  exit 1
fi
mkdir -p "$dir"
chmod +x "$tmp/isorite"
mv "$tmp/isorite" "$dir/isorite"
echo "isorite: $("$dir/isorite" --version) is ${dir}/isorite (SHA-256 ${got})"
case ":${PATH}:" in *":${dir}:"*) ;; *) echo "  ${dir} is not on your PATH: add it, as export PATH=\"${dir}:\$PATH\"" ;; esac
echo "  next: isorite doctor, then isorite model (search by meaning) and isorite opencode (the terminal)"
