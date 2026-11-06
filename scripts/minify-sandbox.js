'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const terser = require('terser');

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error('Usage: node scripts/minify-sandbox.js <source-html> <output-html>');
const input = fs.readFileSync(path.resolve(inputArg), 'utf8');
const matches = [...input.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/gi)];
if (matches.length !== 1) throw new Error(`Expected exactly one isolated module script, found ${matches.length}.`);
const match = matches[0];

(async () => {
  const result = await terser.minify(match[1], {
    module: true,
    compress: true,
    mangle: true,
    keep_fnames: true,
    keep_classnames: true,
    format: { comments: false, ascii_only: false },
    sourceMap: false
  });
  if (!result.code) throw new Error('Terser returned empty OCR sandbox module code.');
  const digest = crypto.createHash('sha256').update(result.code).digest('base64');
  let output = input.slice(0, match.index) + `<script type="module">${result.code}</script>` + input.slice(match.index + match[0].length);
  const hashPattern = /'sha256-[^']+'/g;
  const hashes = [...output.matchAll(hashPattern)];
  if (hashes.length !== 1) throw new Error(`Expected exactly one sandbox CSP script hash, found ${hashes.length}.`);
  output = output.replace(hashPattern, `'sha256-${digest}'`);
  fs.mkdirSync(path.dirname(path.resolve(outputArg)), { recursive: true });
  fs.writeFileSync(path.resolve(outputArg), output, 'utf8');
  process.stdout.write('Minified isolated OCR sandbox module and recalculated its CSP hash.\n');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
