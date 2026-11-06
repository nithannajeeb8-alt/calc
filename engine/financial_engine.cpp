#include "financial_engine.h"
#include "merchant_catalog.inc"

/*
 * PocketWise Alpha 2 financial kernel.
 * No DOM, storage, locale, filesystem, or network dependencies.
 * All monetary values cross the boundary as integer paise.
 */

extern "C" unsigned char __heap_base;

namespace {
static unsigned int heap_cursor = 0;
static const unsigned int MAX_ROWS = 1000000U;
static const unsigned int MAX_SPLIT = 200U;
static const long long MAX_SAFE_MINOR = 9007199254740991LL;
static const int TYPE_INCOME = 1;
static const int TYPE_EXPENSE = 2;
static const int TYPE_REFUND = 3;
static const int TYPE_BORROWED = 4;
static const int TYPE_LENT = 5;
static const int TYPE_REPAY_IN = 6;
static const int TYPE_REPAY_OUT = 7;
static const int TYPE_TRANSFER = 8;

bool addChecked(long long &target, long long value) {
  long long result = 0;
#if defined(__has_builtin)
#if __has_builtin(__builtin_add_overflow)
  if (__builtin_add_overflow(target, value, &result)) return false;
  target = result;
  return true;
#endif
#endif
  if ((value > 0 && target > 9223372036854775807LL - value) ||
      (value < 0 && target < (-9223372036854775807LL - 1LL) - value)) return false;
  target += value;
  return true;
}

bool subtractChecked(long long &target, long long value) {
  if (value == (-9223372036854775807LL - 1LL)) return false;
  return addChecked(target, -value);
}

bool validTotal(long long total) {
  return total >= 0 && total <= MAX_SAFE_MINOR;
}

bool safeResult(long long value) {
  return value >= -MAX_SAFE_MINOR && value <= MAX_SAFE_MINOR;
}

bool addTo(PWFinancialResult *out, unsigned int index, long long value) {
  return addChecked(out->values[index], value);
}


bool multiplyDivideRound(long long amount, unsigned int numerator,
                         unsigned int denominator, long long &output) {
  if (amount < 0 || !denominator) return false;
  const long long quotient = amount / (long long)denominator;
  const long long remainder = amount % (long long)denominator;
  if (numerator && quotient > MAX_SAFE_MINOR / (long long)numerator) return false;
  const long long whole = quotient * (long long)numerator;
  const unsigned long long partial = (unsigned long long)remainder * numerator;
  const unsigned long long rounded = (partial + denominator / 2U) / denominator;
  if (rounded > (unsigned long long)MAX_SAFE_MINOR || whole > MAX_SAFE_MINOR - (long long)rounded) return false;
  output = whole + (long long)rounded;
  return true;
}

}

extern "C" unsigned int pw_alloc(unsigned int size) {
  if (size == 0U) size = 1U;
  if (heap_cursor == 0U) {
    const unsigned int base = (unsigned int)(unsigned long)&__heap_base;
    heap_cursor = (base + 7U) & ~7U;
  }
  const unsigned int aligned = (size + 7U) & ~7U;
  if (aligned < size || heap_cursor > 0xFFFFFFFFU - aligned) return 0U;
  const unsigned int result = heap_cursor;
  heap_cursor += aligned;
  return result;
}

extern "C" void pw_reset(void) {
  heap_cursor = 0U;
}

extern "C" int pw_aggregate(const PWTransactionInput *transactions,
                              unsigned int count,
                              PWFinancialResult *result) {
  if (!result || (count > 0U && !transactions) || count > MAX_ROWS) return 1;
  for (unsigned int i = 0; i < 23U; ++i) result->values[i] = 0LL;
  result->transaction_count = count;
  result->status = 0U;

  for (unsigned int i = 0; i < count; ++i) {
    const PWTransactionInput &tx = transactions[i];
    const long long amount = tx.amount_minor;
    bool ok = true;

    switch (tx.type_code) {
      case TYPE_INCOME:
        ok = addTo(result, 0U, amount) && addTo(result, 7U, amount) && addTo(result, 8U, amount);
        if (tx.cash_flow_bucket == 1) ok = ok && addTo(result, 9U, amount);
        else ok = ok && addTo(result, 10U, amount);
        break;
      case TYPE_EXPENSE:
        ok = addTo(result, 1U, amount) && subtractChecked(result->values[7U], amount) && subtractChecked(result->values[8U], amount);
        if (tx.cash_flow_bucket == 4) ok = ok && addTo(result, 16U, amount);
        else if (tx.cash_flow_bucket == 5) ok = ok && addTo(result, 17U, amount);
        else if (tx.cash_flow_bucket == 6) ok = ok && addTo(result, 18U, amount);
        else ok = ok && addTo(result, 15U, amount);
        break;
      case TYPE_REFUND:
        ok = addTo(result, 2U, amount) && addTo(result, 7U, amount) && addTo(result, 8U, amount) && addTo(result, 11U, amount);
        break;
      case TYPE_BORROWED:
        ok = addTo(result, 3U, amount) && addTo(result, 8U, amount) && addTo(result, 13U, amount);
        break;
      case TYPE_LENT:
        ok = addTo(result, 4U, amount) && subtractChecked(result->values[8U], amount) && addTo(result, 20U, amount);
        break;
      case TYPE_REPAY_IN:
        ok = addTo(result, 5U, amount) && addTo(result, 8U, amount) && addTo(result, 12U, amount);
        break;
      case TYPE_REPAY_OUT:
        ok = addTo(result, 6U, amount) && subtractChecked(result->values[8U], amount) && addTo(result, 19U, amount);
        break;
      case TYPE_TRANSFER:
        ok = addTo(result, 22U, amount);
        break;
      default:
        /* Unknown transaction types remain counted, matching the JS API. */
        break;
    }

    if (!ok) {
      result->status = 2U;
      return 2;
    }
  }

  return 0;
}

extern "C" int pw_equal_split(long long total_minor, unsigned int count, long long *output) {
  if (!output || !validTotal(total_minor) || count < 1U || count > MAX_SPLIT) return 1;
  const long long base = total_minor / (long long)count;
  const unsigned int remainder = (unsigned int)(total_minor % (long long)count);
  for (unsigned int i = 0; i < count; ++i) output[i] = base + (i < remainder ? 1LL : 0LL);
  return 0;
}

extern "C" int pw_percentage_split(long long total_minor, const int *basis_points,
                                      unsigned int count, long long *output) {
  if (!output || !basis_points || !validTotal(total_minor) || count < 1U || count > MAX_SPLIT) return 1;
  int remainders[MAX_SPLIT];
  bool awarded[MAX_SPLIT];
  long long basis_total = 0;
  long long floor_total = 0;
  for (unsigned int i = 0; i < count; ++i) {
    if (basis_points[i] < 0 || basis_points[i] > 10000) return 2;
    basis_total += basis_points[i];
    if (basis_total > 10000LL) return 3;
    const long long quotient = total_minor / 10000LL;
    const long long remainder = total_minor % 10000LL;
    const long long fractional = remainder * (long long)basis_points[i];
    output[i] = quotient * (long long)basis_points[i] + fractional / 10000LL;
    remainders[i] = (int)(fractional % 10000LL);
    awarded[i] = false;
    if (!addChecked(floor_total, output[i])) return 4;
  }
  if (basis_total != 10000LL) return 3;
  const long long remaining = total_minor - floor_total;
  if (remaining < 0 || remaining > (long long)count) return 4;
  for (long long unit = 0; unit < remaining; ++unit) {
    unsigned int best = count;
    for (unsigned int i = 0; i < count; ++i) {
      if (awarded[i]) continue;
      if (best == count || remainders[i] > remainders[best]) best = i;
    }
    if (best == count) return 4;
    ++output[best];
    awarded[best] = true;
  }
  return 0;
}

extern "C" int pw_amount_split(long long total_minor, const long long *amounts,
                                  unsigned int count, long long *output) {
  if (!output || !amounts || !validTotal(total_minor) || count < 1U || count > MAX_SPLIT) return 1;
  long long sum = 0;
  for (unsigned int i = 0; i < count; ++i) {
    if (amounts[i] < 0 || amounts[i] > MAX_SAFE_MINOR) return 2;
    if (!addChecked(sum, amounts[i]) || sum > MAX_SAFE_MINOR) return 3;
    output[i] = amounts[i];
  }
  return sum == total_minor ? 0 : 4;
}

extern "C" int pw_sum_minor(const long long *values, unsigned int count, long long *output) {
  if (!output || (count > 0U && !values) || count > MAX_ROWS) return 1;
  long long sum = 0;
  for (unsigned int i = 0; i < count; ++i) {
    if (!addChecked(sum, values[i]) || !safeResult(sum)) return 2;
  }
  *output = sum;
  return 0;
}

extern "C" int pw_cash_delta_minor(long long amount_minor, int type_code, long long *output) {
  if (!output) return 1;
  long long delta = 0;
  switch (type_code) {
    case TYPE_INCOME: case TYPE_REFUND: case TYPE_BORROWED: case TYPE_REPAY_IN:
      delta = amount_minor; break;
    case TYPE_EXPENSE: case TYPE_LENT: case TYPE_REPAY_OUT:
      if (amount_minor == (-9223372036854775807LL - 1LL)) return 2;
      delta = -amount_minor; break;
    default:
      delta = 0; break;
  }
  if (!safeResult(delta)) return 2;
  *output = delta;
  return 0;
}

extern "C" int pw_account_balance(long long opening_minor, const PWBalanceInput *rows,
                                     unsigned int count, long long *output) {
  if (!output || (count > 0U && !rows) || count > MAX_ROWS || !safeResult(opening_minor)) return 1;
  long long balance = opening_minor;
  for (unsigned int i = 0; i < count; ++i) {
    const PWBalanceInput &row = rows[i];
    const bool from_account = (row.flags & 1U) != 0U;
    const bool to_account = (row.flags & 2U) != 0U;
    bool ok = true;
    if (row.type_code == TYPE_TRANSFER) {
      if (from_account) ok = subtractChecked(balance, row.amount_minor);
      if (ok && to_account) ok = addChecked(balance, row.amount_minor);
    } else if (from_account) {
      switch (row.type_code) {
        case TYPE_INCOME: case TYPE_REFUND: case TYPE_BORROWED: case TYPE_REPAY_IN:
          ok = addChecked(balance, row.amount_minor); break;
        case TYPE_EXPENSE: case TYPE_LENT: case TYPE_REPAY_OUT:
          ok = subtractChecked(balance, row.amount_minor); break;
        default: break;
      }
    }
    if (!ok || !safeResult(balance)) return 2;
  }
  *output = balance;
  return 0;
}

extern "C" int pw_debt_remaining(long long original_minor, const long long *repayments,
                                    unsigned int count, long long *output) {
  if (!output || (count > 0U && !repayments) || count > MAX_ROWS || !safeResult(original_minor)) return 1;
  long long remaining = original_minor;
  for (unsigned int i = 0; i < count; ++i) {
    if (!subtractChecked(remaining, repayments[i]) || !safeResult(remaining)) return 2;
  }
  *output = remaining > 0 ? remaining : 0;
  return 0;
}


extern "C" int pw_salary_allocate(long long base_minor, long long per_cycle_base_minor,
                                    unsigned int pay_cycles, unsigned int per_cycle_percent_denominator,
                                    const PWSalaryInput *rules, unsigned int count, PWSalaryOutput *outputs,
                                    long long *summary) {
  if (!summary || (count && (!rules || !outputs)) || count > 1000U ||
      base_minor < 0 || per_cycle_base_minor < 0 || !safeResult(base_minor) || !safeResult(per_cycle_base_minor) ||
      pay_cycles > 520U || per_cycle_percent_denominator < 10000U || per_cycle_percent_denominator > 5200000U) return 1;
  long long allocated = 0, fixed = 0, percentage = 0;
  for (unsigned int i = 0; i < count; ++i) {
    const PWSalaryInput &rule = rules[i];
    long long per_cycle = 0, period = 0;
    if (rule.mode_code == 1) {
      if (rule.value_scaled < -100000000LL || rule.value_scaled > 100000000LL || !addChecked(percentage, rule.value_scaled)) return 2;
      const unsigned int percent = rule.value_scaled > 0 ? (unsigned int)rule.value_scaled : 0U;
      if (!multiplyDivideRound(base_minor, percent, 10000U, period) ||
          !multiplyDivideRound(per_cycle_base_minor, percent, per_cycle_percent_denominator, per_cycle)) return 2;
    } else if (rule.mode_code == 0) {
      if (rule.value_scaled < 0 || !safeResult(rule.value_scaled)) return 2;
      per_cycle = rule.value_scaled;
      if (per_cycle > 0 && (long long)pay_cycles > MAX_SAFE_MINOR / per_cycle) return 2;
      period = per_cycle * (long long)pay_cycles;
      if (!addChecked(fixed, period)) return 2;
    } else return 1;
    if (!addChecked(allocated, period) || !safeResult(allocated)) return 2;
    outputs[i].period_minor = period;
    outputs[i].per_cycle_minor = per_cycle;
  }
  if (!safeResult(fixed)) return 2;
  summary[0] = allocated;
  summary[1] = fixed;
  summary[2] = percentage;
  return 0;
}

extern "C" int pw_category_buckets(const PWCategoryBucketInput *rows,
                                      unsigned int count, unsigned int group_count,
                                      unsigned int bucket_count, long long *output) {
  if (!output || (count && !rows) || count > MAX_ROWS || group_count > 5000U ||
      bucket_count < 1U || bucket_count > 12U) return 1;
  const unsigned int output_count = group_count * bucket_count * 2U;
  for (unsigned int i = 0; i < output_count; ++i) output[i] = 0LL;
  for (unsigned int i = 0; i < count; ++i) {
    const PWCategoryBucketInput &row = rows[i];
    if (row.group_index >= group_count || row.bucket_index >= bucket_count ||
        row.period_index > 1U || (row.sign != 1 && row.sign != -1)) return 1;
    long long delta = row.amount_minor;
    if (row.sign < 0) {
      if (delta == (-9223372036854775807LL - 1LL)) return 2;
      delta = -delta;
    }
    const unsigned int index = row.group_index * (bucket_count * 2U) +
                               row.period_index * bucket_count + row.bucket_index;
    if (!addChecked(output[index], delta) || !safeResult(output[index])) return 2;
  }
  return 0;
}

extern "C" int pw_cash_projection(long long opening_minor, const long long *deltas,
                                     unsigned int count, long long *output) {
  if (!output || (count && !deltas) || count > MAX_ROWS || !safeResult(opening_minor)) return 1;
  long long balance = opening_minor;
  long long minimum = balance;
  long long first_shortage = 0;
  long long first_index = -1;
  long long minimum_index = -1;
  for (unsigned int i = 0; i < count; ++i) {
    if (!addChecked(balance, deltas[i]) || !safeResult(balance)) return 2;
    if (balance < minimum) { minimum = balance; minimum_index = (long long)i; }
    if (balance < 0 && first_index < 0) {
      if (balance == (-9223372036854775807LL - 1LL)) return 2;
      first_shortage = -balance;
      first_index = (long long)i;
    }
  }
  output[0] = balance;
  output[1] = minimum;
  output[2] = first_shortage;
  output[3] = first_index;
  output[4] = minimum_index;
  return 0;
}

extern "C" int pw_budget_metrics(const PWBudgetCategoryInput *categories,
                                    unsigned int category_count,
                                    const PWBudgetTransactionInput *transactions,
                                    unsigned int transaction_count,
                                    unsigned int multiplier_numerator,
                                    unsigned int multiplier_denominator,
                                    long long configured_total_budget_minor,
                                    int has_configured_total_budget,
                                    long long *row_output,
                                    long long *summary_output) {
  if (!summary_output || !row_output || (category_count && !categories) ||
      (transaction_count && !transactions) || category_count > 5000U ||
      transaction_count > MAX_ROWS || multiplier_denominator == 0U ||
      multiplier_numerator > 4000000000U || multiplier_denominator > 5200000U ||
      !validTotal(configured_total_budget_minor) ||
      (has_configured_total_budget != 0 && has_configured_total_budget != 1)) return 1;

  /* Eight int64 slots per category. Slots 6/7 are private current/previous
     accumulators; the public result is slots 0..5. */
  for (unsigned int i = 0; i < category_count; ++i) {
    const PWBudgetCategoryInput &category = categories[i];
    if (!validTotal(category.monthly_budget_minor) || !validTotal(category.salary_allocation_minor)) return 1;
    for (unsigned int j = 0; j < 8U; ++j) row_output[i * 8U + j] = 0LL;
  }

  long long gross_expenses = 0LL;
  long long refunds = 0LL;
  long long actual_income = 0LL;
  for (unsigned int i = 0; i < transaction_count; ++i) {
    const PWBudgetTransactionInput &tx = transactions[i];
    if (!safeResult(tx.amount_minor) || tx.period_index > 1U ||
        (tx.type_code != TYPE_INCOME && tx.type_code != TYPE_EXPENSE && tx.type_code != TYPE_REFUND)) return 1;
    if (tx.category_index != 0xFFFFFFFFU && tx.category_index >= category_count) return 1;

    if (tx.period_index == 0U && tx.type_code == TYPE_INCOME) {
      if (!addChecked(actual_income, tx.amount_minor) || !safeResult(actual_income)) return 2;
      continue;
    }
    if (tx.type_code == TYPE_INCOME) continue;
    if (tx.period_index == 0U) {
      long long &total = tx.type_code == TYPE_EXPENSE ? gross_expenses : refunds;
      if (!addChecked(total, tx.amount_minor) || !safeResult(total)) return 2;
    }
    if (tx.category_index == 0xFFFFFFFFU) continue;
    const unsigned int slot = tx.period_index == 0U ? 6U : 7U;
    long long delta = tx.amount_minor;
    if (tx.type_code == TYPE_REFUND) {
      if (delta == (-9223372036854775807LL - 1LL)) return 2;
      delta = -delta;
    }
    long long &category_total = row_output[tx.category_index * 8U + slot];
    if (!addChecked(category_total, delta) || !safeResult(category_total)) return 2;
  }

  long long category_budget_total = 0LL;
  long long planned_total = 0LL;
  for (unsigned int i = 0; i < category_count; ++i) {
    const PWBudgetCategoryInput &category = categories[i];
    long long scaled_budget = 0LL;
    if (!multiplyDivideRound(category.monthly_budget_minor, multiplier_numerator,
                             multiplier_denominator, scaled_budget)) return 2;
    const long long planned = scaled_budget > 0 ? scaled_budget : category.salary_allocation_minor;
    long long spent = row_output[i * 8U + 6U];
    long long previous_spent = row_output[i * 8U + 7U];
    if (spent < 0) spent = 0;
    if (previous_spent < 0) previous_spent = 0;
    long long remaining = 0LL;
    if (!subtractChecked(remaining = planned, spent) || !safeResult(remaining) ||
        !addChecked(category_budget_total, scaled_budget) || !safeResult(category_budget_total) ||
        !addChecked(planned_total, planned) || !safeResult(planned_total)) return 2;
    row_output[i * 8U + 0U] = scaled_budget;
    row_output[i * 8U + 1U] = category.salary_allocation_minor;
    row_output[i * 8U + 2U] = planned;
    row_output[i * 8U + 3U] = spent;
    row_output[i * 8U + 4U] = previous_spent;
    row_output[i * 8U + 5U] = remaining;
  }

  long long total_budget = 0LL;
  if (has_configured_total_budget && configured_total_budget_minor > 0LL) {
    if (!multiplyDivideRound(configured_total_budget_minor, multiplier_numerator,
                             multiplier_denominator, total_budget)) return 2;
  } else {
    total_budget = planned_total;
  }
  long long net_spent = 0LL;
  if (!subtractChecked(net_spent = gross_expenses, refunds)) return 2;
  if (net_spent < 0LL) net_spent = 0LL;
  long long total_remaining = 0LL;
  if (!subtractChecked(total_remaining = total_budget, net_spent) || !safeResult(total_remaining)) return 2;

  summary_output[0] = gross_expenses;
  summary_output[1] = refunds;
  summary_output[2] = actual_income;
  summary_output[3] = total_budget;
  summary_output[4] = net_spent;
  summary_output[5] = total_remaining;
  summary_output[6] = category_budget_total;
  return 0;
}

extern "C" int pw_debt_amortize(const PWDebtPlanInput *debts,
                                   unsigned int debt_count,
                                   long long monthly_payment_minor,
                                   int strategy_code,
                                   PWDebtPlanOutput *outputs,
                                   long long *summary_output) {
  const unsigned int MAX_DEBTS = 2000U;
  const unsigned int MAX_MONTHS = 600U;
  const unsigned int MAX_APR_BPS = 10000000U;
  if (!summary_output || (debt_count && (!debts || !outputs)) || debt_count > MAX_DEBTS ||
      !validTotal(monthly_payment_minor) || monthly_payment_minor == 0LL ||
      (strategy_code != 0 && strategy_code != 1)) return 1;

  long long balances[MAX_DEBTS];
  long long accrued_interest[MAX_DEBTS];
  unsigned int rates[MAX_DEBTS];
  unsigned int order[MAX_DEBTS];
  for (unsigned int i = 0; i < debt_count; ++i) {
    if (!validTotal(debts[i].balance_minor) || debts[i].annual_rate_basis_points > MAX_APR_BPS) return 1;
    balances[i] = debts[i].balance_minor;
    accrued_interest[i] = 0LL;
    rates[i] = debts[i].annual_rate_basis_points;
    order[i] = i;
  }

  long long total_interest = 0LL;
  unsigned int months = 0U;
  int outcome = 1; /* 1: paid off, 2: unworkable payment, 3: 600 month limit */
  bool any_balance = false;
  for (unsigned int i = 0; i < debt_count; ++i) if (balances[i] > 0LL) any_balance = true;
  if (any_balance) {
    outcome = 3;
    for (months = 1U; months <= MAX_MONTHS; ++months) {
      long long month_interest = 0LL;
      bool remaining = false;
      for (unsigned int i = 0; i < debt_count; ++i) {
        if (balances[i] <= 0LL) continue;
        remaining = true;
        long long interest = 0LL;
        if (!multiplyDivideRound(balances[i], rates[i], 120000U, interest) ||
            !addChecked(balances[i], interest) || !safeResult(balances[i]) ||
            !addChecked(accrued_interest[i], interest) || !safeResult(accrued_interest[i]) ||
            !addChecked(month_interest, interest) || !safeResult(month_interest) ||
            !addChecked(total_interest, interest) || !safeResult(total_interest)) return 2;
      }
      if (!remaining) { outcome = 1; --months; break; }
      if (monthly_payment_minor <= month_interest) { outcome = 2; break; }

      /* In-place heap sort keeps large debt lists practical. Explicit index
         tie-breaking preserves the stable insertion-order behavior of Alpha 1. */
      unsigned int active = 0U;
      for (unsigned int i = 0; i < debt_count; ++i) if (balances[i] > 0LL) order[active++] = i;
      const auto comes_before = [&](unsigned int left, unsigned int right) -> bool {
        if (strategy_code == 1) {
          if (rates[left] != rates[right]) return rates[left] > rates[right];
          if (balances[left] != balances[right]) return balances[left] < balances[right];
        } else {
          if (balances[left] != balances[right]) return balances[left] < balances[right];
          if (rates[left] != rates[right]) return rates[left] > rates[right];
        }
        return left < right;
      };
      const auto sift_down = [&](unsigned int root, unsigned int count) {
        while (root <= (count > 1U ? (count - 2U) / 2U : 0U) && count > 1U) {
          unsigned int child = root * 2U + 1U;
          if (child + 1U < count && comes_before(order[child], order[child + 1U])) ++child;
          if (!comes_before(order[root], order[child])) break;
          const unsigned int temp = order[root]; order[root] = order[child]; order[child] = temp;
          root = child;
        }
      };
      for (unsigned int start = active / 2U; start > 0U; --start) sift_down(start - 1U, active);
      for (unsigned int end = active; end > 1U; --end) {
        const unsigned int temp = order[0]; order[0] = order[end - 1U]; order[end - 1U] = temp;
        sift_down(0U, end - 1U);
      }

      long long payment_left = monthly_payment_minor;
      for (unsigned int i = 0; i < active && payment_left > 0LL; ++i) {
        const unsigned int index = order[i];
        const long long paid = balances[index] < payment_left ? balances[index] : payment_left;
        balances[index] -= paid;
        payment_left -= paid;
      }

      bool finished = true;
      for (unsigned int i = 0; i < debt_count; ++i) if (balances[i] > 0LL) { finished = false; break; }
      if (finished) { outcome = 1; break; }
    }
    if (months > MAX_MONTHS) months = MAX_MONTHS;
  } else {
    months = 0U;
    outcome = 1;
  }

  for (unsigned int i = 0; i < debt_count; ++i) {
    outputs[i].balance_minor = balances[i];
    outputs[i].interest_minor = accrued_interest[i];
  }
  summary_output[0] = months;
  summary_output[1] = total_interest;
  summary_output[2] = outcome;
  return 0;
}

extern "C" int pw_ratio_round_minor(long long amount_minor, unsigned int numerator,
                                       unsigned int denominator, long long *output) {
  if (!output || !safeResult(amount_minor) || amount_minor < 0 || !denominator ||
      numerator > 4000000000U || denominator > 5200000U) return 1;
  long long value = 0;
  if (!multiplyDivideRound(amount_minor, numerator, denominator, value)) return 2;
  *output = value;
  return 0;
}

/* Freestanding byte helper required by some optimizing compiler builds. */
extern "C" void *memset(void *destination, int value, unsigned long size) {
  unsigned char *bytes = (unsigned char *)destination;
  for (unsigned long i = 0; i < size; ++i) bytes[i] = (unsigned char)value;
  return destination;
}

namespace {
inline char lowerAscii(char value) {
  return value >= 'A' && value <= 'Z' ? (char)(value + ('a' - 'A')) : value;
}

bool spanEquals(const char *text, unsigned int start, unsigned int length, const char *word) {
  unsigned int i = 0;
  while (word[i]) {
    if (i >= length || lowerAscii(text[start + i]) != lowerAscii(word[i])) return false;
    ++i;
  }
  return i == length;
}

bool containsMerchantGlyph(const char *text, unsigned int start, unsigned int length) {
  for (unsigned int i = 0; i < length; ++i) {
    const unsigned char c = (unsigned char)text[start + i];
    const char lower = lowerAscii((char)c);
    if ((lower >= 'a' && lower <= 'z') || c >= 0xC0U) return true;
  }
  return false;
}

bool spanContains(const char *text, unsigned int start, unsigned int length, char needle) {
  for (unsigned int i = 0; i < length; ++i) if (text[start + i] == needle) return true;
  return false;
}

bool isBoundary(char c) {
  return c == '\n' || c == '\r' || c == ',' || c == ';' || c == '|' || c == '\t';
}

bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }
bool isAsciiAlpha(char c) { c = lowerAscii(c); return c >= 'a' && c <= 'z'; }
bool isAsciiDigit(char c) { return c >= '0' && c <= '9'; }
bool isWordChar(char c) { return isAsciiAlpha(c) || isAsciiDigit(c) || c == '_'; }

bool containsPhrase(const char *text, unsigned int length, const char *phrase, unsigned int phrase_length) {
  if (phrase_length > length) return false;
  for (unsigned int i = 0; i + phrase_length <= length; ++i) {
    if (!spanEquals(text, i, phrase_length, phrase)) continue;
    const bool left_ok = i == 0U || !isWordChar(text[i - 1U]);
    const bool right_ok = i + phrase_length == length || !isWordChar(text[i + phrase_length]);
    if (left_ok && right_ok) return true;
  }
  return false;
}

bool tokenIs(const char *text, unsigned int start, unsigned int end, const char *word) {
  while (start < end && isSpace(text[start])) ++start;
  while (end > start && isSpace(text[end - 1U])) --end;
  return spanEquals(text, start, end - start, word);
}

bool tokenIsReference(const char *text, unsigned int start, unsigned int end) {
  unsigned int digits = 0;
  for (unsigned int i = start; i < end; ++i) {
    if (isAsciiDigit(text[i])) ++digits;
    else if (!isSpace(text[i]) && text[i] != '-') return false;
  }
  return digits >= 10U && digits <= 16U;
}

bool tokenIsBankCode(const char *text, unsigned int start, unsigned int end) {
  while (start < end && isSpace(text[start])) ++start;
  while (end > start && isSpace(text[end - 1U])) --end;
  const unsigned int length = end - start;
  if (length == 4U) {
    for (unsigned int i = start; i < end; ++i) if (!isAsciiAlpha(text[i])) return false;
    return true;
  }
  if (length == 11U) {
    for (unsigned int i = 0; i < 4U; ++i) if (!isAsciiAlpha(text[start + i])) return false;
    if (text[start + 4U] != '0') return false;
    for (unsigned int i = 5U; i < 11U; ++i) if (!isAsciiAlpha(text[start + i]) && !isAsciiDigit(text[start + i])) return false;
    return true;
  }
  return tokenIs(text, start, end, "bank") || tokenIs(text, start, end, "banking");
}

bool isStopWord(const char *text, unsigned int start, unsigned int length) {
  static const char *words[] = {
    "upi", "vpa", "id", "rrn", "utr", "ref", "reference", "transaction", "txn",
    "bank", "account", "a/c", "date", "time", "amount", "inr", "rs", "via",
    "using", "on", "at", "from", "status", "successful", "success", "completed",
    "debited", "credited", "paid", "sent", "payment", "transfer", "remark", "remarks",
    "avoid", "prevent", "ensure", "check", "verify", "view", "open", "close", "update",
    "continue", "enter", "select", "choose", "make", "keep", "your", "own", "my",
    "please", "account", "balance", "charges", "penalty", "fees", "fee", "from", "to"
  };
  for (unsigned int i = 0; i < sizeof(words) / sizeof(words[0]); ++i) {
    unsigned int word_length = 0;
    while (words[i][word_length]) ++word_length;
    if (spanEquals(text, start, length, words[i])) return true;
  }
  return false;
}

bool validMerchantSpan(const char *text, unsigned int start, unsigned int length) {
  while (length && isSpace(text[start])) { ++start; --length; }
  while (length && (text[start + length - 1] == ':' || text[start + length - 1] == '-' || isSpace(text[start + length - 1]))) --length;
  if (length < 2U || length > 120U || !containsMerchantGlyph(text, start, length)) return false;
  if (spanContains(text, start, length, '@')) return false; // a VPA is not a merchant name
  unsigned int first_end = start;
  while (first_end < start + length && !isSpace(text[first_end]) && text[first_end] != '/' && text[first_end] != ':') ++first_end;
  if (first_end > start && isStopWord(text, start, first_end - start)) return false;
  if (spanEquals(text, start, length, "self") || spanEquals(text, start, length, "own account") ||
      spanEquals(text, start, length, "your account") || spanEquals(text, start, length, "your own account") ||
      spanEquals(text, start, length, "my account") || spanEquals(text, start, length, "own account") ||
      spanEquals(text, start, length, "account") || spanEquals(text, start, length, "bank") ||
      spanEquals(text, start, length, "to your account") || spanEquals(text, start, length, "to own account")) return false;
  return true;
}

unsigned int trimCandidate(const char *text, unsigned int start, unsigned int end) {
  while (start < end && (isSpace(text[start]) || text[start] == ':' || text[start] == '-' || text[start] == '#')) ++start;
  while (end > start && (isSpace(text[end - 1]) || text[end - 1] == ':' || text[end - 1] == '-')) --end;
  if (start < end && spanEquals(text, start, end - start, "merchant")) return end;
  if (start < end && spanEquals(text, start, end - start, "payee")) return end;
  return start;
}

unsigned int scanMerchantEnd(const char *text, unsigned int length, unsigned int start) {
  unsigned int end = start;
  while (end < length && !isBoundary(text[end]) && text[end] != '/' && text[end] != '\\') {
    if (isSpace(text[end])) {
      unsigned int next = end;
      while (next < length && isSpace(text[next])) ++next;
      unsigned int token_end = next;
      while (token_end < length && isAsciiAlpha(text[token_end])) ++token_end;
      if (token_end > next && isStopWord(text, next, token_end - next)) break;
    }
    ++end;
  }
  while (end > start && isSpace(text[end - 1])) --end;
  return end;
}

bool extractAfterMarker(const char *text, unsigned int length, const char *marker,
                        unsigned int marker_length, unsigned int *candidate_start,
                        unsigned int *candidate_end) {
  if (marker_length > length) return false;
  for (unsigned int i = 0; i < length; ++i) {
    unsigned int text_pos = i;
    unsigned int pattern_pos = 0U;
    bool matched = true;
    while (pattern_pos < marker_length) {
      if (marker[pattern_pos] == ' ') {
        if (text_pos >= length || !isSpace(text[text_pos])) { matched = false; break; }
        while (pattern_pos < marker_length && marker[pattern_pos] == ' ') ++pattern_pos;
        while (text_pos < length && isSpace(text[text_pos])) ++text_pos;
        continue;
      }
      if (text_pos >= length || lowerAscii(text[text_pos]) != lowerAscii(marker[pattern_pos])) { matched = false; break; }
      ++text_pos;
      ++pattern_pos;
    }
    if (!matched) continue;
    if (i > 0U && isWordChar(text[i - 1U])) continue;
    unsigned int start = text_pos;
    while (start < length && (isSpace(text[start]) || text[start] == ':' || text[start] == '-' || text[start] == '#')) ++start;
    unsigned int end = start;
    while (end < length && !isBoundary(text[end])) {
      if (text[end] == '/' || text[end] == '\\') break;
      if (isSpace(text[end])) {
        unsigned int next = end;
        while (next < length && isSpace(text[next])) ++next;
        unsigned int word_end = next;
        while (word_end < length && ((text[word_end] >= 'A' && text[word_end] <= 'Z') || (text[word_end] >= 'a' && text[word_end] <= 'z') || text[word_end] == '/')) ++word_end;
        if (word_end > next && isStopWord(text, next, word_end - next)) break;
      }
      ++end;
    }
    if (end > start) {
      *candidate_start = start;
      *candidate_end = end;
      return true;
    }
  }
  return false;
}

bool hasPaymentAnchorBefore(const char *text, unsigned int position) {
  const unsigned int lookback = position > 96U ? position - 96U : 0U;
  const char *window = text + lookback;
  const unsigned int window_length = position - lookback;
  return containsPhrase(window, window_length, "upi", 3U) ||
         containsPhrase(window, window_length, "debited", 7U) ||
         containsPhrase(window, window_length, "credited", 8U) ||
         containsPhrase(window, window_length, "transfer", 8U) ||
         containsPhrase(window, window_length, "transferred", 11U) ||
         containsPhrase(window, window_length, "trf", 3U) ||
         containsPhrase(window, window_length, "payment", 7U) ||
         containsPhrase(window, window_length, "paid", 4U) ||
         containsPhrase(window, window_length, "sent", 4U) ||
         containsPhrase(window, window_length, "purchase", 8U) ||
         containsPhrase(window, window_length, "charged", 7U) ||
         containsPhrase(window, window_length, "spent", 5U);
}
}

extern "C" int pw_reliability_order(const PWProviderRouteInput *routes, unsigned int count,
                                      unsigned long long now_ms, unsigned int *ordered_indices) {
  if ((count && (!routes || !ordered_indices)) || count > 64U) return 1;
  bool selected[64];
  for (unsigned int i = 0; i < count; ++i) selected[i] = false;
  unsigned int written = 0U;
  for (unsigned int pass = 0; pass < count; ++pass) {
    int best_index = -1;
    long long best_score = (-9223372036854775807LL - 1LL);
    for (unsigned int i = 0; i < count; ++i) {
      const PWProviderRouteInput &route = routes[i];
      if (selected[i] || (route.flags & 7U) != 7U) continue;
      if (route.cooldown_until_ms > now_ms) continue;
      long long score = (long long)route.priority * 1000000LL;
      const unsigned int latency = route.average_latency_ms > 120000U ? 120000U : route.average_latency_ms;
      score -= (long long)latency * 2LL;
      score -= (long long)(route.consecutive_failures > 20U ? 20U : route.consecutive_failures) * 15000LL;
      if (route.last_outcome == 3U) score -= 25000LL; // quality failure gets a modest lasting penalty
      /* Prefer a route that previously rescued this capability while its primary provider is cooling down. */
      if (route.fallback_affinity) score += 100000000LL;
      if (best_index < 0 || score > best_score || (score == best_score && route.provider_id < routes[(unsigned int)best_index].provider_id)) {
        best_index = (int)i;
        best_score = score;
      }
    }
    if (best_index < 0) break;
    selected[(unsigned int)best_index] = true;
    ordered_indices[written++] = (unsigned int)best_index;
  }

  return (int)written;
}

extern "C" int pw_reliability_update(PWProviderHealth *health, unsigned int outcome,
                                       unsigned int latency_ms, unsigned long long now_ms,
                                       unsigned int base_cooldown_ms, unsigned int max_cooldown_ms) {
  if (!health || outcome > 7U || !base_cooldown_ms || max_cooldown_ms < base_cooldown_ms) return 1;
  health->last_outcome = outcome;
  if (latency_ms) {
    if (!health->average_latency_ms) health->average_latency_ms = latency_ms;
    else health->average_latency_ms = (unsigned int)(((unsigned long long)health->average_latency_ms * 3ULL + latency_ms) / 4ULL);
  }
  if (outcome == 0U) {
    if (health->success_count < 0xFFFFFFFFU) ++health->success_count;
    health->consecutive_failures = 0U;
    health->circuit_state = 0U;
    health->cooldown_until_ms = 0ULL;
    return 0;
  }
  if (health->failure_count < 0xFFFFFFFFU) ++health->failure_count;
  if (outcome == 4U) { // provider unsupported by this device/build capability profile
    health->circuit_state = 1U;
    health->cooldown_until_ms = now_ms + (unsigned long long)max_cooldown_ms;
    return 0;
  }
  if (outcome == 5U) { // permission denied: don't hammer the permission surface
    health->circuit_state = 1U;
    health->cooldown_until_ms = now_ms + (unsigned long long)(max_cooldown_ms < 900000U ? max_cooldown_ms : 900000U);
    return 0;
  }
  if (outcome == 7U) { // an attempt expired without a completion record (closed tab or crashed worker)
    if (health->consecutive_failures < 30U) ++health->consecutive_failures;
    unsigned long long cooldown = (unsigned long long)base_cooldown_ms * 4ULL;
    if (cooldown < 300000ULL) cooldown = 300000ULL;
    if (cooldown > max_cooldown_ms) cooldown = max_cooldown_ms;
    health->circuit_state = 1U;
    health->cooldown_until_ms = now_ms + cooldown;
    return 0;
  }
  if (health->consecutive_failures < 30U) ++health->consecutive_failures;
  unsigned long long multiplier = 1ULL << (health->consecutive_failures > 16U ? 16U : health->consecutive_failures - 1U);
  unsigned long long cooldown = (unsigned long long)base_cooldown_ms * multiplier;
  if (outcome == 2U && cooldown < (unsigned long long)base_cooldown_ms * 2ULL) cooldown = (unsigned long long)base_cooldown_ms * 2ULL;
  if (outcome == 3U && cooldown < 300000ULL) cooldown = 300000ULL;
  if (outcome == 6U && cooldown < 600000ULL) cooldown = 600000ULL;
  if (cooldown > max_cooldown_ms) cooldown = max_cooldown_ms;
  health->circuit_state = 1U;
  health->cooldown_until_ms = now_ms + cooldown;
  return 0;
}

extern "C" int pw_extract_merchant(const char *text, unsigned int text_length,
                                     char *output, unsigned int output_capacity,
                                     int *confidence_percent, int *direction) {
  if (!text || !output || output_capacity < 2U || !confidence_percent || !direction || text_length > 200000U) return 1;
  output[0] = '\0';
  *confidence_percent = 0;
  *direction = 0;
  if (!text_length) return 2;

  /* Direction is determined from explicit debit/credit evidence first. */
  for (unsigned int i = 0; i + 2U <= text_length; ++i) {
    if (*direction == 0 && spanEquals(text, i, 2U, "DR") && (i == 0U || text[i - 1U] == '/' || isSpace(text[i - 1U])) &&
        (i + 2U == text_length || text[i + 2U] == '/' || isSpace(text[i + 2U]))) *direction = 1;
    if (*direction == 0 && spanEquals(text, i, 2U, "CR") && (i == 0U || text[i - 1U] == '/' || isSpace(text[i - 1U])) &&
        (i + 2U == text_length || text[i + 2U] == '/' || isSpace(text[i + 2U]))) *direction = 2;
  }
  if (*direction == 0) {
    if (containsPhrase(text, text_length, "debited", 7U) || containsPhrase(text, text_length, "paid", 4U) ||
        containsPhrase(text, text_length, "sent", 4U) || containsPhrase(text, text_length, "purchase", 8U) ||
        containsPhrase(text, text_length, "transferred", 11U)) *direction = 1;
    else if (containsPhrase(text, text_length, "credited", 8U) || containsPhrase(text, text_length, "received", 8U) ||
             containsPhrase(text, text_length, "refund", 6U)) *direction = 2;
  }

  unsigned int candidate_start = 0U, candidate_end = 0U;
  int candidate_confidence = 0;

  /* UPI narrations are bank-specific, so use reference/type/VPA anchors rather
     than assuming every bank puts the beneficiary in exactly the same column.
     NPCI specifies the beneficiary name, bank/IFSC and UPI ID as key narration
     fields, but banks may vary token order and punctuation. */
  for (unsigned int i = 0; i + 3U < text_length && candidate_confidence == 0; ++i) {
    if (!spanEquals(text, i, 3U, "UPI")) continue;
    if (i > 0U && isWordChar(text[i - 1U])) continue;
    unsigned int starts[16], ends[16], segments = 0U;
    unsigned int cursor = i;
    while (cursor <= text_length && segments < 16U) {
      unsigned int end = cursor;
      while (end < text_length && text[end] != '/' && text[end] != '\n' && text[end] != '\r') ++end;
      starts[segments] = cursor; ends[segments] = end; ++segments;
      if (end >= text_length || text[end] != '/') break;
      cursor = end + 1U;
    }
    if (segments < 4U) continue;

    int type_index = -1, reference_index = -1, vpa_index = -1;
    for (unsigned int j = 1U; j < segments; ++j) {
      if (type_index < 0 && (tokenIs(text, starts[j], ends[j], "DR") || tokenIs(text, starts[j], ends[j], "CR"))) type_index = (int)j;
      if (reference_index < 0 && tokenIsReference(text, starts[j], ends[j])) reference_index = (int)j;
      if (vpa_index < 0 && spanContains(text, starts[j], ends[j] - starts[j], '@')) vpa_index = (int)j;
    }

    int name_index = -1;
    int confidence = 0;
    if (reference_index >= 0) {
      int next = reference_index + 1;
      if (next < (int)segments && (tokenIs(text, starts[next], ends[next], "DR") || tokenIs(text, starts[next], ends[next], "CR"))) ++next;
      if (next < (int)segments && (int)next == type_index) ++next;
      if (next < (int)segments) {
        if (tokenIsBankCode(text, starts[next], ends[next]) && next + 1 < (int)segments) name_index = next + 1;
        else if (vpa_index >= 0 && next == vpa_index) name_index = next - 1;
        else name_index = next;
        confidence = 90;
      }
    }
    if (vpa_index >= 0) {
      int before = vpa_index - 1;
      if (before > 0 && tokenIs(text, starts[before], ends[before], "bank") && tokenIsBankCode(text, starts[before - 1], ends[before - 1])) {
        name_index = before - 2;
        confidence = 88;
      } else if (before > 0 && tokenIsBankCode(text, starts[before], ends[before])) {
        name_index = before - 1;
        confidence = 92;
      } else if (before >= 0 && (name_index < 0 || name_index >= vpa_index)) {
        name_index = before;
        confidence = 82;
      }
    }
    if (name_index < 0 && type_index >= 0) {
      int next = type_index + 1;
      if (next < (int)segments && tokenIsReference(text, starts[next], ends[next])) ++next;
      if (next < (int)segments && tokenIsBankCode(text, starts[next], ends[next])) ++next;
      if (next < (int)segments) { name_index = next; confidence = 78; }
    }
    if (name_index >= 0 && name_index < (int)segments) {
      unsigned int st = starts[name_index], en = ends[name_index];
      while (st < en && isSpace(text[st])) ++st;
      while (en > st && isSpace(text[en - 1U])) --en;
      if (en - st > 3U && spanEquals(text, st, 3U, "TO")) {
        st += 3U;
        while (st < en && isSpace(text[st])) ++st;
      }
      if (validMerchantSpan(text, st, en - st) && !spanContains(text, st, en - st, '@')) {
        candidate_start = st; candidate_end = en; candidate_confidence = confidence;
      }
    }
  }

  if (candidate_confidence == 0) {
    static const char *markers[] = {
      "paid to", "payment to", "sent to", "transferred to", "debited to", "charged to",
      "received from", "credited by", "merchant:", "payee:", "beneficiary:", "recipient:", "to:"
    };
    static const unsigned int marker_lengths[] = { 7U, 11U, 7U, 14U, 10U, 10U, 13U, 10U, 9U, 6U, 12U, 10U, 3U };
    for (unsigned int i = 0; i < sizeof(markers) / sizeof(markers[0]); ++i) {
      unsigned int st = 0U, en = 0U;
      if (extractAfterMarker(text, text_length, markers[i], marker_lengths[i], &st, &en) && validMerchantSpan(text, st, en - st)) {
        candidate_start = st; candidate_end = en;
        candidate_confidence = (i < 6U ? 88 : i < 8U ? 84 : i < 12U ? 92 : 72);
        if (*direction == 0) {
          if (i == 6U || i == 7U) *direction = 2;
          else if (i < 6U) *direction = 1;
        }
        break;
      }
    }
  }

  /* Some receipts present a dedicated To: line without the verb. Match only
     at a line/field boundary, never arbitrary prose such as "to avoid fees". */
  if (candidate_confidence == 0) {
    for (unsigned int i = 0; i + 2U < text_length; ++i) {
      if (!spanEquals(text, i, 2U, "to")) continue;
      if (i != 0U && text[i - 1U] != '\n' && text[i - 1U] != '\r' && text[i - 1U] != '|' && text[i - 1U] != ';') continue;
      unsigned int st = i + 2U;
      while (st < text_length && (isSpace(text[st]) || text[st] == ':' || text[st] == '-')) ++st;
      unsigned int en = scanMerchantEnd(text, text_length, st);
      if (validMerchantSpan(text, st, en - st)) { candidate_start = st; candidate_end = en; candidate_confidence = 76; if (*direction == 0) *direction = 1; break; }
    }
  }

  /* Bank SMS formats often put the beneficiary after a plain "to <name>" token
     without the word "paid". Accept it only when a payment/debit/UPI anchor
     appears immediately before it; never treat arbitrary prose as a merchant. */
  if (candidate_confidence == 0) {
    for (unsigned int i = 1U; i + 2U < text_length; ++i) {
      if (!spanEquals(text, i, 2U, "to") || isWordChar(text[i - 1U]) ||
          (i + 2U < text_length && isWordChar(text[i + 2U]))) continue;
      if (!hasPaymentAnchorBefore(text, i)) continue;
      unsigned int st = i + 2U;
      while (st < text_length && (isSpace(text[st]) || text[st] == ':' || text[st] == '-')) ++st;
      unsigned int en = scanMerchantEnd(text, text_length, st);
      if (validMerchantSpan(text, st, en - st)) {
        candidate_start = st; candidate_end = en; candidate_confidence = 80;
        if (*direction == 0) *direction = 1;
        break;
      }
    }
  }

  if (candidate_confidence == 0) return 2;
  unsigned int start = candidate_start;
  unsigned int end = candidate_end;
  while (start < end && (isSpace(text[start]) || text[start] == ':' || text[start] == '-')) ++start;
  while (end > start && (isSpace(text[end - 1U]) || text[end - 1U] == ':' || text[end - 1U] == '-')) --end;
  if (end - start >= output_capacity) end = start + output_capacity - 1U;
  const unsigned int count = end - start;
  for (unsigned int i = 0; i < count; ++i) output[i] = text[start + i];
  output[count] = '\0';
  *confidence_percent = candidate_confidence;
  return 0;
}

namespace {
struct PWMerchantEntry { const char *pattern; const char *category; const char *canonical; };
#define PW_MERCHANT_ROW(pattern, category, canonical) { pattern, category, canonical },
static const PWMerchantEntry PW_MERCHANTS[] = { PW_MERCHANT_CATALOG(PW_MERCHANT_ROW) };
#undef PW_MERCHANT_ROW

unsigned int pwNormalize(const char *input, unsigned int length, char *output, unsigned int capacity) {
  if (!input || !output || capacity == 0U) return 0U;
  unsigned int used = 0U;
  bool pending_space = false;
  for (unsigned int i = 0U; i < length && input[i] != '\0'; ++i) {
    unsigned char ch = (unsigned char)input[i];
    /* Fold common two-byte Latin-1 accents (e.g. Café) to ASCII so display
       names, OCR output and bank descriptors share the same lookup key. */
    if (ch == 0xC3U && i + 1U < length && input[i + 1U] != '\0') {
      const unsigned char accent = (unsigned char)input[i + 1U];
      ++i;
      if ((accent >= 0x80U && accent <= 0x85U) || (accent >= 0xA0U && accent <= 0xA5U)) ch = 'a';
      else if (accent == 0x87U || accent == 0xA7U) ch = 'c';
      else if ((accent >= 0x88U && accent <= 0x8BU) || (accent >= 0xA8U && accent <= 0xABU)) ch = 'e';
      else if ((accent >= 0x8CU && accent <= 0x8FU) || (accent >= 0xACU && accent <= 0xAFU)) ch = 'i';
      else if (accent == 0x91U || accent == 0xB1U) ch = 'n';
      else if ((accent >= 0x92U && accent <= 0x96U) || (accent >= 0xB2U && accent <= 0xB6U)) ch = 'o';
      else if ((accent >= 0x99U && accent <= 0x9BU) || (accent >= 0xB9U && accent <= 0xBBU)) ch = 'u';
      else if (accent == 0x9DU || accent == 0xBDU || accent == 0xBFU || accent == 0xFFU) ch = 'y';
      else if (accent == 0x9FU) ch = 's';
      else ch = ' ';
    }
    if (ch >= 'A' && ch <= 'Z') ch = (unsigned char)(ch + ('a' - 'A'));
    const bool word = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (!word) { if (used) pending_space = true; continue; }
    if (pending_space && used + 1U < capacity) output[used++] = ' ';
    pending_space = false;
    if (used + 1U >= capacity) break;
    output[used++] = (char)ch;
  }
  while (used && output[used - 1U] == ' ') --used;
  output[used] = '\0';
  return used;
}

bool pwContainsNormalized(const char *haystack, unsigned int hay_len, const char *needle, unsigned int needle_len) {
  if (!haystack || !needle || !needle_len || needle_len > hay_len) return false;
  for (unsigned int i = 0U; i + needle_len <= hay_len; ++i) {
    if (i && haystack[i - 1U] != ' ') continue;
    if (i + needle_len < hay_len && haystack[i + needle_len] != ' ') continue;
    unsigned int j = 0U;
    while (j < needle_len && haystack[i + j] == needle[j]) ++j;
    if (j == needle_len) return true;
  }
  return false;
}

void pwCopyText(const char *source, char *target, unsigned int capacity) {
  if (!target || !capacity) return;
  unsigned int i = 0U;
  if (source) while (i + 1U < capacity && source[i]) { target[i] = source[i]; ++i; }
  target[i] = '\0';
}

bool pwLeap(int year) { return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0; }
int pwDaysInMonth(int year, int month) {
  static const int days[] = {0,31,28,31,30,31,30,31,31,30,31,30,31};
  if (month < 1 || month > 12) return 0;
  return month == 2 && pwLeap(year) ? 29 : days[month];
}
bool pwParseDate(int key, int &year, int &month, int &day) {
  if (key < 10101 || key > 99991231) return false;
  year = key / 10000; month = (key / 100) % 100; day = key % 100;
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= pwDaysInMonth(year, month);
}
int pwDaysFromCivil(int y, unsigned int m, unsigned int d) {
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned int yoe = (unsigned int)(y - era * 400);
  const unsigned int doy = (153U * (m + (m > 2 ? (unsigned int)-3 : 9U)) + 2U) / 5U + d - 1U;
  const unsigned int doe = yoe * 365U + yoe / 4U - yoe / 100U + doy;
  return era * 146097 + (int)doe - 719468;
}
void pwCivilFromDays(int z, int &y, unsigned int &m, unsigned int &d) {
  z += 719468;
  const int era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned int doe = (unsigned int)(z - era * 146097);
  const unsigned int yoe = (doe - doe/1460U + doe/36524U - doe/146096U) / 365U;
  y = (int)yoe + era * 400;
  const unsigned int doy = doe - (365U*yoe + yoe/4U - yoe/100U);
  const unsigned int mp = (5U*doy + 2U)/153U;
  d = doy - (153U*mp+2U)/5U + 1U;
  m = mp + (mp < 10U ? 3U : (unsigned int)-9);
  y += m <= 2U;
}

bool pwTextHasAllTokens(const char *haystack, unsigned int hay_len, const char *query, unsigned int query_len) {
  char token[64]; unsigned int ti = 0U;
  for (unsigned int i = 0U; i <= query_len; ++i) {
    char ch = i < query_len ? query[i] : ' ';
    if (ch == ' ') {
      if (ti) {
        if (!pwContainsNormalized(haystack, hay_len, token, ti)) return false;
        ti = 0U;
      }
    } else if (ti + 1U < sizeof(token)) token[ti++] = ch;
    else return false;
  }
  return true;
}
}

extern "C" int pw_merchant_lookup(const char *merchant, unsigned int merchant_length,
                                    char *category_output, unsigned int category_capacity,
                                    char *canonical_output, unsigned int canonical_capacity,
                                    int *confidence_percent) {
  if (!merchant || !category_output || !category_capacity || !canonical_output || !canonical_capacity || !confidence_percent || merchant_length > 4096U) return 1;
  char normalized[512];
  const unsigned int normalized_len = pwNormalize(merchant, merchant_length, normalized, sizeof(normalized));
  if (!normalized_len) return 2;
  for (unsigned int i = 0U; i < sizeof(PW_MERCHANTS)/sizeof(PW_MERCHANTS[0]); ++i) {
    char pattern[256];
    const unsigned int pattern_len = pwNormalize(PW_MERCHANTS[i].pattern, 255U, pattern, sizeof(pattern));
    if (!pattern_len || !pwContainsNormalized(normalized, normalized_len, pattern, pattern_len)) continue;
    pwCopyText(PW_MERCHANTS[i].category, category_output, category_capacity);
    pwCopyText(PW_MERCHANTS[i].canonical, canonical_output, canonical_capacity);
    *confidence_percent = pattern_len <= 4U ? 68 : 94;
    return 0;
  }
  return 2;
}

extern "C" int pw_contains_text(const char *text, unsigned int text_length,
                                  const char *needle, unsigned int needle_length) {
  if (!text || !needle || text_length > 200000U || needle_length > 512U) return 0;
  char normalized_text[1024]; char normalized_needle[128];
  unsigned int tlen = pwNormalize(text, text_length, normalized_text, sizeof(normalized_text));
  unsigned int nlen = pwNormalize(needle, needle_length, normalized_needle, sizeof(normalized_needle));
  if (tlen == 0U || nlen == 0U) return 0;
  /* Learned keywords may be part of a longer merchant phrase, so substring matching is intentional. */
  if (nlen > tlen) return 0;
  for (unsigned int i = 0U; i + nlen <= tlen; ++i) {
    unsigned int j = 0U; while (j < nlen && normalized_text[i+j] == normalized_needle[j]) ++j;
    if (j == nlen) return 1;
  }
  return 0;
}

extern "C" int pw_find_duplicate(const PWDuplicateRow *rows, unsigned int count,
                                   const PWDuplicateRow *candidate, int *match_index) {
  if ((!rows && count) || !candidate || !match_index || count > MAX_ROWS || candidate->amount_minor < 0) return 1;
  *match_index = -1;
  char candidate_name[256];
  unsigned int candidate_len = pwNormalize(candidate->merchant, 127U, candidate_name, sizeof(candidate_name));
  char candidate_category[32], candidate_canonical[128]; int candidate_confidence = 0;
  if (pw_merchant_lookup(candidate->merchant, 127U, candidate_category, sizeof(candidate_category), candidate_canonical, sizeof(candidate_canonical), &candidate_confidence) == 0)
    candidate_len = pwNormalize(candidate_canonical, 127U, candidate_name, sizeof(candidate_name));
  if (!candidate_len) return 2;
  for (unsigned int i = 0U; i < count; ++i) {
    if (rows[i].amount_minor != candidate->amount_minor || rows[i].date_key != candidate->date_key) continue;
    char row_name[256], row_category[32], row_canonical[128]; int row_confidence = 0;
    unsigned int row_len = pwNormalize(rows[i].merchant, 127U, row_name, sizeof(row_name));
    if (pw_merchant_lookup(rows[i].merchant, 127U, row_category, sizeof(row_category), row_canonical, sizeof(row_canonical), &row_confidence) == 0)
      row_len = pwNormalize(row_canonical, 127U, row_name, sizeof(row_name));
    if (row_len != candidate_len) continue;
    unsigned int j = 0U; while (j < row_len && row_name[j] == candidate_name[j]) ++j;
    if (j == row_len) { *match_index = (int)i; return 0; }
  }
  return 2;
}

extern "C" int pw_filter_transactions(const PWSearchRow *rows, unsigned int count,
                                        const PWSearchFilter *filter, unsigned char *matches) {
  if ((!rows && count) || !filter || (!matches && count) || count > MAX_ROWS) return 1;
  char query[128]; const unsigned int query_len = pwNormalize(filter->query, 127U, query, sizeof(query));
  char tag[64]; const unsigned int tag_len = pwNormalize(filter->tag, 63U, tag, sizeof(tag));
  for (unsigned int i = 0U; i < count; ++i) {
    const PWSearchRow &r = rows[i]; bool ok = true;
    if (filter->has_min && r.amount_minor < filter->min_minor) ok = false;
    if (filter->has_max && r.amount_minor > filter->max_minor) ok = false;
    if (filter->account_index >= 0 && r.account_index != filter->account_index) ok = false;
    if (filter->category_index >= 0 && r.category_index != filter->category_index) ok = false;
    if (filter->type_code && r.type_code != filter->type_code) ok = false;
    if (filter->date_from && r.date_key < filter->date_from) ok = false;
    if (filter->date_to && r.date_key > filter->date_to) ok = false;
    if (ok && query_len) {
      char search[512]; unsigned int slen = pwNormalize(r.search_text, 511U, search, sizeof(search));
      if (!pwTextHasAllTokens(search, slen, query, query_len)) ok = false;
    }
    if (ok && tag_len) {
      char tags[256]; unsigned int tlen = pwNormalize(r.tags, 255U, tags, sizeof(tags));
      if (!pwContainsNormalized(tags, tlen, tag, tag_len)) ok = false;
    }
    matches[i] = ok ? 1U : 0U;
  }
  return 0;
}

extern "C" int pw_next_recurrence(int date_key, int frequency_code, int anchor_day, int *next_date_key) {
  if (!next_date_key || frequency_code < 1 || frequency_code > 3) return 1;
  int year, month, day;
  if (!pwParseDate(date_key, year, month, day)) return 1;
  int next_year = year, next_month = month, next_day = day;
  if (frequency_code == 1) {
    int y; unsigned int m, d;
    pwCivilFromDays(pwDaysFromCivil(year, (unsigned int)month, (unsigned int)day) + 7, y, m, d);
    next_year = y; next_month = (int)m; next_day = (int)d;
  } else if (frequency_code == 2) {
    next_month++;
    if (next_month > 12) { next_month = 1; ++next_year; }
    int wanted = anchor_day >= 1 && anchor_day <= 31 ? anchor_day : day;
    int max_day = pwDaysInMonth(next_year, next_month);
    next_day = wanted < max_day ? wanted : max_day;
  } else {
    ++next_year;
    int wanted = anchor_day >= 1 && anchor_day <= 31 ? anchor_day : day;
    int max_day = pwDaysInMonth(next_year, next_month);
    next_day = wanted < max_day ? wanted : max_day;
  }
  *next_date_key = next_year * 10000 + next_month * 100 + next_day;
  return 0;
}
