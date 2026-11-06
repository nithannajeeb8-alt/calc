#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/wasm/pocketwise-engine.wasm"
mkdir -p "$ROOT/wasm"

if command -v em++ >/dev/null 2>&1; then
  echo "Building PocketWise engine with Emscripten"
  em++ "$ROOT/engine/financial_engine.cpp" \
    -std=c++17 -O3 -g0 -fno-exceptions -fno-rtti -nostdlib \
    -sSTANDALONE_WASM=1 -sALLOW_MEMORY_GROWTH=1 -sASSERTIONS=0 \
    -Wl,--no-entry \
    -Wl,--export=pw_alloc -Wl,--export=pw_reset -Wl,--export=pw_aggregate \
    -Wl,--export=pw_equal_split -Wl,--export=pw_percentage_split -Wl,--export=pw_amount_split \
    -Wl,--export=pw_sum_minor -Wl,--export=pw_cash_delta_minor -Wl,--export=pw_account_balance -Wl,--export=pw_debt_remaining \
    -Wl,--export=pw_salary_allocate -Wl,--export=pw_category_buckets -Wl,--export=pw_cash_projection -Wl,--export=pw_ratio_round_minor -Wl,--export=pw_budget_metrics -Wl,--export=pw_debt_amortize \
    -Wl,--export=pw_reliability_order -Wl,--export=pw_reliability_update -Wl,--export=pw_extract_merchant \
    -Wl,--export=pw_merchant_lookup -Wl,--export=pw_contains_text -Wl,--export=pw_find_duplicate -Wl,--export=pw_filter_transactions -Wl,--export=pw_next_recurrence \
    -Wl,--export-memory \
    -Wl,--initial-memory=2097152 -Wl,--max-memory=268435456 -sSTACK_SIZE=131072 \
    -Wl,--strip-all -o "$OUT"
elif command -v clang++ >/dev/null 2>&1; then
  echo "Emscripten (em++) was not found; building the same freestanding WASM ABI with clang++ instead."
  clang++ --target=wasm32-unknown-unknown "$ROOT/engine/financial_engine.cpp" \
    -std=c++17 -O3 -g0 -nostdlib -fno-exceptions -fno-rtti \
    -Wl,--no-entry \
    -Wl,--export=pw_alloc -Wl,--export=pw_reset -Wl,--export=pw_aggregate \
    -Wl,--export=pw_equal_split -Wl,--export=pw_percentage_split -Wl,--export=pw_amount_split \
    -Wl,--export=pw_sum_minor -Wl,--export=pw_cash_delta_minor -Wl,--export=pw_account_balance -Wl,--export=pw_debt_remaining \
    -Wl,--export=pw_salary_allocate -Wl,--export=pw_category_buckets -Wl,--export=pw_cash_projection -Wl,--export=pw_ratio_round_minor -Wl,--export=pw_budget_metrics -Wl,--export=pw_debt_amortize \
    -Wl,--export=pw_reliability_order -Wl,--export=pw_reliability_update -Wl,--export=pw_extract_merchant \
    -Wl,--export=pw_merchant_lookup -Wl,--export=pw_contains_text -Wl,--export=pw_find_duplicate -Wl,--export=pw_filter_transactions -Wl,--export=pw_next_recurrence \
    -Wl,--export-memory \
    -Wl,--initial-memory=2097152 -Wl,--max-memory=268435456 -Wl,-z,stack-size=131072 \
    -Wl,--strip-all -o "$OUT"
else
  echo "Neither em++ nor a wasm-capable clang++ was found." >&2
  exit 1
fi

node "$ROOT/scripts/audit-wasm.js" "$OUT"
