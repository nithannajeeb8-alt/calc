#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${POCKETWISE_DIST_DIR:-$ROOT/dist}"

if [[ ! -f "$ROOT/package.json" ]]; then
  echo "package.json is missing; run this script from a complete PocketWise source package." >&2
  exit 1
fi
if ! node -e "require.resolve('terser')" >/dev/null 2>&1; then
  echo "Terser is required for the production build. Run 'npm install' once, then retry." >&2
  exit 2
fi

# Always compile and audit the C++ core before building a publishable package.
bash "$ROOT/scripts/build-wasm.sh"
(cd "$ROOT" && sha256sum wasm/pocketwise-engine.wasm > WASM-SHA256.txt)

# Test sources are intentionally omitted from clean deployment archives.
# Run the full regression suite from the maintainer source checkout before packaging.
if [[ -d "$ROOT/tests" ]]; then
  node --test "$ROOT"/tests/*.test.js
fi

rm -rf "$DIST"
mkdir -p "$DIST/wasm" "$DIST/assets"

copy_file() {
  local relative="$1"
  mkdir -p "$DIST/$(dirname "$relative")"
  cp "$ROOT/$relative" "$DIST/$relative"
}

# Static application files. Source, tests and internal build notes are intentionally excluded.
for relative in \
  index.html styles.css manifest.webmanifest share-target.html paddleocr-sandbox.html \
  LICENSE _headers WASM-SHA256.txt
  do copy_file "$relative"; done
cp -R "$ROOT/assets/icons" "$DIST/assets/"
cp "$ROOT/wasm/pocketwise-engine.wasm" "$DIST/wasm/pocketwise-engine.wasm"

# Minify each classic script independently. The app intentionally shares classic-script
# globals across these boundaries, so concatenating them into one bundle would be unsafe.
node "$ROOT/scripts/minify-runtime.js" "$ROOT" "$DIST"
node "$ROOT/scripts/minify-sandbox.js" "$ROOT/paddleocr-sandbox.html" "$DIST/paddleocr-sandbox.html"

if grep -RIl --include='*.js' 'sourceMappingURL=' "$DIST" >/dev/null 2>&1; then
  echo "A source-map reference remains in the production output." >&2
  exit 3
fi
node - "$DIST/paddleocr-sandbox.html" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const html = fs.readFileSync(process.argv[2], 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/i);
const hash = html.match(/'sha256-([^']+)'/);
if (!script || !hash) throw new Error('The production OCR sandbox script or its CSP hash is missing.');
const actual = crypto.createHash('sha256').update(script[1]).digest('base64');
if (actual !== hash[1]) throw new Error('The production OCR sandbox CSP hash does not match its minified script.');
NODE
if find "$DIST" -type f \( -name '*.map' -o -name '*.cpp' -o -name '*.h' -o -path '*/tests/*' \) | grep .; then
  echo "Development-only material leaked into the production output." >&2
  exit 4
fi

(
  cd "$DIST"
  find . -type f ! -name 'SHA256SUMS' -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)

echo "Production package created at: $DIST"
echo "Publish the CONTENTS of this folder, not the project root."
