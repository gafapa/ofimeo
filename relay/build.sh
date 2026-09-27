#!/bin/sh
# Cross-compiles ofimeo-relay (static, no cgo) for every platform into dist/.
#   VERSION=1.0.0 ./build.sh          lean binaries
#   FULL=1 ./build.sh                 also ofimeo-relay-full-* with the web app
#                                     embedded (needs ../dist: npm run build)
set -eu
cd "$(dirname "$0")"
VERSION=${VERSION:-dev}
OUT=${OUT:-dist}
DATE=$(date -u +%Y-%m-%d)
LDFLAGS="-s -w -X main.version=$VERSION -X main.buildDate=$DATE"
TARGETS=${TARGETS:-"windows/amd64 windows/arm64 darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 linux/arm"}
mkdir -p "$OUT"

if [ "${FULL:-0}" = 1 ]; then
  [ -f ../dist/index.html ] || { echo "../dist/index.html not found: run npm run build first" >&2; exit 1; }
  rm -f webapp.zip
  python3 -m zipfile -c webapp.zip ../dist/
fi

for target in $TARGETS; do
  os=${target%/*}
  arch=${target#*/}
  ext=""
  [ "$os" = windows ] && ext=.exe
  name="ofimeo-relay-$os-$arch"
  [ "$arch" = arm ] && name="$name"v7
  echo "building $name$ext"
  CGO_ENABLED=0 GOOS=$os GOARCH=$arch GOARM=7 go build -trimpath -ldflags "$LDFLAGS" -o "$OUT/$name$ext" .
  if [ "${FULL:-0}" = 1 ]; then
    full="ofimeo-relay-full-${name#ofimeo-relay-}"
    echo "building $full$ext"
    CGO_ENABLED=0 GOOS=$os GOARCH=$arch GOARM=7 go build -tags embedapp -trimpath -ldflags "$LDFLAGS" -o "$OUT/$full$ext" .
  fi
done
ls -l "$OUT"
