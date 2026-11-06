'use strict';
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(process.argv[2] || path.join(__dirname, '../wasm/pocketwise-engine.wasm'));
const bytes = fs.readFileSync(file);
if (!WebAssembly.validate(bytes)) throw new Error(`Invalid WebAssembly binary: ${file}`);
const wasmModule = new WebAssembly.Module(bytes);
const exportNames = new Set(WebAssembly.Module.exports(wasmModule).map(item => item.name));
const required = [
  'memory', 'pw_alloc', 'pw_reset', 'pw_aggregate', 'pw_equal_split',
  'pw_percentage_split', 'pw_amount_split', 'pw_sum_minor',
  'pw_cash_delta_minor', 'pw_account_balance', 'pw_debt_remaining',
  'pw_salary_allocate', 'pw_category_buckets', 'pw_cash_projection',
  'pw_ratio_round_minor', 'pw_budget_metrics', 'pw_debt_amortize',
  'pw_reliability_order', 'pw_reliability_update', 'pw_extract_merchant'
];
for (const name of required) {
  if (!exportNames.has(name)) throw new Error(`Missing required Wasm export: ${name}`);
}

function readUleb(buffer, cursor) {
  let value = 0;
  let shift = 0;
  let byte;
  do {
    if (cursor.offset >= buffer.length || shift > 35) throw new Error('Malformed Wasm section length.');
    byte = buffer[cursor.offset++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return value >>> 0;
}

const cursor = { offset: 8 };
const customSections = [];
while (cursor.offset < bytes.length) {
  const sectionId = bytes[cursor.offset++];
  const sectionSize = readUleb(bytes, cursor);
  const sectionEnd = cursor.offset + sectionSize;
  if (sectionEnd > bytes.length) throw new Error('Wasm section extends beyond the file boundary.');
  if (sectionId === 0) {
    const nameLength = readUleb(bytes, cursor);
    if (cursor.offset + nameLength > sectionEnd) throw new Error('Malformed Wasm custom section name.');
    const name = bytes.subarray(cursor.offset, cursor.offset + nameLength).toString('utf8');
    customSections.push(name);
  }
  cursor.offset = sectionEnd;
}
const unsafeMetadata = customSections.filter(name =>
  /^(?:name|producers|sourceMappingURL|linking|dylink(?:\.|$)|\.debug_)/i.test(name)
);
if (unsafeMetadata.length) {
  throw new Error(`Wasm contains removable debug/link metadata: ${unsafeMetadata.join(', ')}`);
}

process.stdout.write(
  `Wasm audit passed: ${path.basename(file)}, ${bytes.length} bytes, ${exportNames.size} exports, ` +
  `${customSections.length} custom sections (${customSections.join(', ') || 'none'}).\n`
);
