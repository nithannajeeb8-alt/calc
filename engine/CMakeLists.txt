cmake_minimum_required(VERSION 3.16)
project(PocketWiseFinancialEngine LANGUAGES CXX)

add_executable(pocketwise-engine financial_engine.cpp)
set_target_properties(pocketwise-engine PROPERTIES
  CXX_STANDARD 17
  CXX_STANDARD_REQUIRED YES
  CXX_EXTENSIONS NO
  OUTPUT_NAME "pocketwise-engine"
  SUFFIX ".wasm"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/../wasm"
)
target_compile_options(pocketwise-engine PRIVATE -O3 -fno-exceptions -fno-rtti)
target_link_options(pocketwise-engine PRIVATE
  "-sSTANDALONE_WASM=1"
  "-sALLOW_MEMORY_GROWTH=1"
  "-Wl,--no-entry"
  "-Wl,--export=pw_alloc"
  "-Wl,--export=pw_reset"
  "-Wl,--export=pw_aggregate"
  "-Wl,--export=pw_equal_split"
  "-Wl,--export=pw_percentage_split"
  "-Wl,--export=pw_amount_split"
  "-Wl,--export=pw_sum_minor"
  "-Wl,--export=pw_cash_delta_minor"
  "-Wl,--export=pw_account_balance"
  "-Wl,--export=pw_debt_remaining"
  "-Wl,--export=pw_salary_allocate"
  "-Wl,--export=pw_category_buckets"
  "-Wl,--export=pw_cash_projection"
  "-Wl,--export=pw_ratio_round_minor"
  "-Wl,--export=pw_budget_metrics"
  "-Wl,--export=pw_debt_amortize"
  "-Wl,--export-memory"
  "-Wl,--initial-memory=2097152"
  "-Wl,--max-memory=268435456"
  "-Wl,--strip-all"
)
