'use strict';
const fs = require('node:fs');
const path = require('node:path');
const terser = require('terser');

const [rootArg, distArg] = process.argv.slice(2);
if (!rootArg || !distArg) throw new Error('Usage: node scripts/minify-runtime.js <project-root> <dist-root>');
const root = path.resolve(rootArg);
const dist = path.resolve(distArg);
const runtimeFiles = [
  'theme-init.js',
  'first-run-onboarding.js',
  'reliability-store.js',
  'system-orchestrator.js',
  'viewport-guard.js',
  'pwa.js',
  'clipboard-import.js',
  'paddleocr-pwa.js',
  'rupee-ocr.js',
  'receipt-ocr-parser.js',
  'finance-analytics.js',
  'receipt-media.js',
  'app.js',
  'onboarding.js',
  'statement-parser.js',
  'xlsx-reader.js',
  'local-ai.js',
  'local-ai-worker.js',
  'local-ai-cache-recovery.js',
  'statement-import.js',
  'sw.js',
  'wasm/pocketwise-engine.js',
  'wasm/financial-core-bootstrap.js',
  'wasm/shared-costs-api.js'
];

(async () => {
  for (const relative of runtimeFiles) {
    const sourcePath = path.join(root, relative);
    const outputPath = path.join(dist, relative);
    if (!fs.existsSync(sourcePath)) throw new Error(`Required runtime source is missing: ${relative}`);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const result = await terser.minify(source, {
      compress: true,
      mangle: true,
      keep_fnames: true,
      keep_classnames: true,
      format: { comments: false, ascii_only: false },
      sourceMap: false
    });
    if (result.error) throw result.error;
    if (!result.code) throw new Error(`Minifier returned empty output for ${relative}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${result.code}\n`, 'utf8');
  }
  process.stdout.write(`Minified ${runtimeFiles.length} runtime JavaScript files (file boundaries preserved).\n`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
