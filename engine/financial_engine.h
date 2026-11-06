#ifndef POCKETWISE_FINANCIAL_ENGINE_H
#define POCKETWISE_FINANCIAL_ENGINE_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct PWTransactionInput {
  long long amount_minor;
  int type_code;
  int cash_flow_bucket;
} PWTransactionInput;

typedef struct PWFinancialResult {
  long long values[23];
  unsigned int transaction_count;
  unsigned int status;
} PWFinancialResult;

typedef struct PWBalanceInput {
  long long amount_minor;
  int type_code;
  unsigned int flags; /* bit 0: from/account match; bit 1: transfer destination match */
} PWBalanceInput;

typedef struct PWSalaryInput {
  long long value_scaled; /* fixed: paise; percentage: percent * 100 */
  int mode_code;          /* 0: fixed, 1: percentage */
  int reserved;
} PWSalaryInput;

typedef struct PWSalaryOutput {
  long long period_minor;
  long long per_cycle_minor;
} PWSalaryOutput;

typedef struct PWCategoryBucketInput {
  long long amount_minor;
  unsigned int group_index;
  unsigned int bucket_index;
  unsigned int period_index; /* 0: current, 1: previous */
  int sign;                  /* +1: expense, -1: refund */
} PWCategoryBucketInput;

typedef struct PWBudgetCategoryInput {
  long long monthly_budget_minor;
  long long salary_allocation_minor;
} PWBudgetCategoryInput;

typedef struct PWBudgetTransactionInput {
  long long amount_minor;
  unsigned int category_index; /* UINT32_MAX means uncategorised */
  unsigned int period_index;   /* 0: current, 1: previous */
  int type_code;               /* 1: income, 2: expense, 3: refund */
  unsigned int reserved;
} PWBudgetTransactionInput;

typedef struct PWDebtPlanInput {
  long long balance_minor;
  unsigned int annual_rate_basis_points; /* 12% APR = 1200 basis points */
  unsigned int reserved;
} PWDebtPlanInput;

typedef struct PWDebtPlanOutput {
  long long balance_minor;
  long long interest_minor;
} PWDebtPlanOutput;


typedef struct PWDuplicateRow {
  long long amount_minor;
  int date_key; /* YYYYMMDD */
  char merchant[128];
} PWDuplicateRow;

typedef struct PWSearchRow {
  long long amount_minor;
  int date_key; /* YYYYMMDD */
  int account_index;
  int category_index;
  int type_code;
  char search_text[512];
  char tags[256];
} PWSearchRow;

typedef struct PWSearchFilter {
  long long min_minor;
  long long max_minor;
  int has_min;
  int has_max;
  int account_index;  /* -1 means any */
  int category_index; /* -1 means any */
  int type_code;      /* 0 means any */
  int date_from;      /* 0 means any */
  int date_to;        /* 0 means any */
  char query[128];
  char tag[64];
} PWSearchFilter;

typedef struct PWProviderRouteInput {
  unsigned int provider_id;
  int priority;
  unsigned int flags; /* bit 0 supported, bit 1 currently available, bit 2 enabled */
  unsigned int consecutive_failures;
  unsigned int average_latency_ms;
  unsigned int last_outcome;
  unsigned long long cooldown_until_ms;
  unsigned int fallback_affinity; /* previously successful route from a cooled-down provider */
} PWProviderRouteInput;

typedef struct PWProviderHealth {
  unsigned int consecutive_failures;
  unsigned int success_count;
  unsigned int failure_count;
  unsigned int average_latency_ms;
  unsigned int last_outcome;
  unsigned int circuit_state; /* 0 closed, 1 open */
  unsigned long long cooldown_until_ms;
} PWProviderHealth;

unsigned int pw_alloc(unsigned int size);
void pw_reset(void);
int pw_aggregate(const PWTransactionInput *transactions,
                 unsigned int count,
                 PWFinancialResult *result);

/* Integer-paise allocation and balance kernels. Return zero on success. */
int pw_equal_split(long long total_minor, unsigned int count, long long *output);
int pw_percentage_split(long long total_minor, const int *basis_points,
                        unsigned int count, long long *output);
int pw_amount_split(long long total_minor, const long long *amounts,
                    unsigned int count, long long *output);
int pw_sum_minor(const long long *values, unsigned int count, long long *output);
int pw_cash_delta_minor(long long amount_minor, int type_code, long long *output);
int pw_account_balance(long long opening_minor, const PWBalanceInput *rows,
                       unsigned int count, long long *output);
int pw_debt_remaining(long long original_minor, const long long *repayments,
                      unsigned int count, long long *output);
int pw_salary_allocate(long long base_minor, long long per_cycle_base_minor,
                       unsigned int pay_cycles, unsigned int per_cycle_percent_denominator,
                       const PWSalaryInput *rules,
                       unsigned int count, PWSalaryOutput *outputs,
                       long long *summary); /* allocated, fixed, percentage * 100 */
int pw_category_buckets(const PWCategoryBucketInput *rows, unsigned int count,
                        unsigned int group_count, unsigned int bucket_count,
                        long long *output);
int pw_cash_projection(long long opening_minor, const long long *deltas,
                       unsigned int count, long long *output); /* ending, minimum, first shortage, index */
int pw_ratio_round_minor(long long amount_minor, unsigned int numerator,
                         unsigned int denominator, long long *output);
int pw_budget_metrics(const PWBudgetCategoryInput *categories, unsigned int category_count,
                      const PWBudgetTransactionInput *transactions, unsigned int transaction_count,
                      unsigned int multiplier_numerator, unsigned int multiplier_denominator,
                      long long configured_total_budget_minor, int has_configured_total_budget,
                      long long *row_output, long long *summary_output);
int pw_debt_amortize(const PWDebtPlanInput *debts, unsigned int debt_count,
                     long long monthly_payment_minor, int strategy_code,
                     PWDebtPlanOutput *outputs, long long *summary_output);

/* Adaptive provider routing. Storage is owned by the browser adapter; the
   deterministic decision and circuit-breaker arithmetic live in this core. */
int pw_reliability_order(const PWProviderRouteInput *routes, unsigned int count,
                         unsigned long long now_ms, unsigned int *ordered_indices);
int pw_reliability_update(PWProviderHealth *health, unsigned int outcome,
                          unsigned int latency_ms, unsigned long long now_ms,
                          unsigned int base_cooldown_ms, unsigned int max_cooldown_ms);

/* Conservative extraction of the payee/merchant from UPI and payment text.
   direction: 0 unknown, 1 outgoing/debit, 2 incoming/credit. */
int pw_extract_merchant(const char *text, unsigned int text_length,
                         char *output, unsigned int output_capacity,
                         int *confidence_percent, int *direction);

/* Merchant categorisation, learned-rule matching, import de-duplication,
   and activity filtering remain deterministic C++ domain operations. */
int pw_merchant_lookup(const char *merchant, unsigned int merchant_length,
                       char *category_output, unsigned int category_capacity,
                       char *canonical_output, unsigned int canonical_capacity,
                       int *confidence_percent);
int pw_contains_text(const char *text, unsigned int text_length,
                     const char *needle, unsigned int needle_length);
int pw_find_duplicate(const PWDuplicateRow *rows, unsigned int count,
                      const PWDuplicateRow *candidate, int *match_index);
int pw_filter_transactions(const PWSearchRow *rows, unsigned int count,
                           const PWSearchFilter *filter, unsigned char *matches);
int pw_next_recurrence(int date_key, int frequency_code, int anchor_day,
                       int *next_date_key);

#ifdef __cplusplus
}
#endif
#endif
