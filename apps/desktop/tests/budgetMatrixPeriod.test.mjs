import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/budgets/domain/BudgetMatrixPeriod.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
});
const { BudgetMatrixPeriod } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const months = (year) => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
const row = (year, extras = {}) => ({
  id: "food", name: "Food", type: "expense", expense: { [`${year}-01`]: 25 },
  income: { [`${year}-01`]: 0 }, budget: { [`${year}-01`]: 100 },
  budget_entered: { [`${year}-01`]: true }, budget_target_id: { [`${year}-01`]: year },
  effective_budget: { [`${year}-01`]: 100 }, editable: { [`${year}-01`]: true },
  rollover: { [`${year}-01`]: 5 }, pending_expense: { [`${year}-01`]: 10 },
  total_expense: 25, total_income: 0, subcategories: [], ...extras
});
const matrix = (year, extras = {}) => ({
  year, months: months(year), current_month: "2026-10", base_currency: "AUD",
  categories: [row(year)], totals: { expense: { [`${year}-01`]: 25 } },
  prior_plan_context: { months: [`${year - 1}-12`], categories: [] },
  suggestion_history: [{ month: "2026-09", covered: true, expenses: { food: 50 } }],
  month_meta: { [`${year}-01`]: { state: "future" } },
  cash_flow: { cash_balance: 500, as_of: "2026-10-28", accounts: [{ account_id: 1 }],
    months: { [`${year}-01`]: { opening: 500, closing: 500, received: 0, paid: 0 } } },
  ...extras
});

test("a continuous August-January window has all six months without extending annual totals", () => {
  const primary = matrix(2026), following = matrix(2027);
  const period = new BudgetMatrixPeriod(primary, following);
  assert.equal(period.hasFollowing, true);
  assert.deepEqual(period.months.slice(7, 13), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(period.matrix.months, months(2026));
  assert.equal(period.matrix.year, 2026);
  assert.deepEqual(period.matrix.totals, primary.totals);
  assert.equal(period.categories[0].total_expense, 25);
});

test("future plans, zero targets, reservations and target IDs stay attached to their actual months", () => {
  const following = matrix(2027);
  following.categories[0].budget["2027-01"] = 0;
  following.categories[0].pending_income = { "2027-01": 7 };
  const merged = new BudgetMatrixPeriod(matrix(2026), following).categories[0];
  for (const field of ["budget", "budget_entered", "budget_target_id", "effective_budget", "editable", "rollover",
    "income", "expense", "pending_expense"]) {
    assert.equal(merged[field]["2027-01"], following.categories[0][field]["2027-01"], field);
  }
  assert.equal(merged.budget["2027-01"], 0);
  assert.equal(merged.budget_entered["2027-01"], true);
  assert.equal(merged.pending_income["2027-01"], 7);
  assert.equal(merged.expense["2026-01"], 25);
});

test("details use stable IDs across years and new-year-only details have zero primary annual totals", () => {
  const primary = matrix(2026), following = matrix(2027);
  primary.categories[0].subcategories = [{ id: "food:17", subcategory_id: 17, name: "Cafe", total_expense: 20,
    expense: { "2026-01": 20 }, income: { "2026-01": 0 } }];
  following.categories[0].subcategories = [{ id: "food:17", subcategory_id: 17, name: "Cafe", total_expense: 80,
    expense: { "2027-01": 80 }, income: { "2027-01": 0 } },
  { id: "food:18", subcategory_id: 18, name: "Restaurants", total_expense: 30, total_income: 0,
    expense: { "2027-01": 30 }, income: { "2027-01": 0 } }];
  const details = new BudgetMatrixPeriod(primary, following).categories[0].subcategories;
  assert.equal(details.length, 2);
  assert.deepEqual(details[0].expense, { "2027-01": 80, "2026-01": 20 });
  assert.equal(details[0].total_expense, 20);
  assert.equal(details[1].total_expense, 0);
  assert.equal(details[1].expense["2027-01"], 30);
});

test("a new-year-only bucket remains displayable without becoming a primary-year expense", () => {
  const following = matrix(2027, { categories: [row(2027, { id: "health", name: "Health", total_expense: 400 })] });
  const period = new BudgetMatrixPeriod(matrix(2026), following);
  assert.deepEqual(period.categories.map((entry) => entry.id), ["food", "health"]);
  assert.equal(period.categories[1].total_expense, 0);
  assert.equal(period.categories[1].expense["2027-01"], 25);
});

test("cash snapshots extend without adding account balances, prior plans or history a second time", () => {
  const primary = matrix(2026), following = matrix(2027);
  following.prior_plan_context = { months: ["2026-10"], categories: [{ id: "income" }] };
  const combined = new BudgetMatrixPeriod(primary, following).matrix;
  assert.equal(combined.cash_flow.cash_balance, 500);
  assert.notEqual(combined.cash_flow.cash_balance, primary.cash_flow.cash_balance + following.cash_flow.cash_balance);
  assert.deepEqual(combined.cash_flow.accounts, primary.cash_flow.accounts);
  assert.deepEqual(Object.keys(combined.cash_flow.months).sort(), ["2026-01", "2027-01"]);
  assert.deepEqual(combined.prior_plan_context, primary.prior_plan_context);
  assert.deepEqual(combined.suggestion_history, primary.suggestion_history);
  assert.deepEqual(combined.month_meta["2027-01"], { state: "future" });
});

test("different account observations or FX references cannot create an unexplained cross-year cash jump", () => {
  const anchored = (year) => matrix(year, { cash_flow: {
    fx: { aud_per_usd: 1.5 }, cash_balance: 500, as_of: "2026-10-28T10:00:00Z",
    accounts: [{ account_id: 1, currency: "AUD", anchor_balance: 500,
      as_of: "2026-10-28T10:00:00Z", coverage_status: "anchored_reconstruction" }],
    months: { [`${year}-01`]: { opening: 500, closing: 500 } }
  } });
  for (const change of [
    (cash) => { cash.accounts[0].anchor_balance = 490; },
    (cash) => { cash.accounts[0].as_of = "2026-10-28T11:00:00Z"; },
    (cash) => { cash.accounts[0].coverage_status = "missing_cash_metadata"; },
    (cash) => { cash.fx.aud_per_usd = 1.6; }
  ]) {
    const primary = anchored(2026), following = anchored(2027);
    change(following.cash_flow);
    assert.equal(BudgetMatrixPeriod.cashMatches(primary, following), false);
    assert.equal(new BudgetMatrixPeriod(primary, following).hasFollowing, false);
  }
});

test("account order does not affect compatibility and incomplete metadata cannot match a known snapshot", () => {
  const primary = matrix(2026), following = matrix(2027);
  const accounts = [{ account_id: 1, currency: "AUD", anchor_balance: 300, as_of: "2026-10-28" },
    { account_id: 2, currency: "USD", anchor_balance: 100, as_of: "2026-10-27" }];
  primary.cash_flow.accounts = accounts;
  following.cash_flow.accounts = [...accounts].reverse();
  assert.equal(BudgetMatrixPeriod.cashMatches(primary, following), true);
  assert.equal(new BudgetMatrixPeriod(primary, following).hasFollowing, true);
  assert.equal(BudgetMatrixPeriod.cashMatches(primary, { cash_flow: null }), false);
  const fallback = matrix(2027);
  fallback.cash_flow.cash_balance = 490;
  assert.equal(BudgetMatrixPeriod.cashMatches(matrix(2026), fallback), false);
  assert.equal(BudgetMatrixPeriod.cashMatches({}, {}), true);
});

test("January suggestions use the following open year's history when the primary calendar has closed", () => {
  const primary = matrix(2026, { current_month: "2027-01", suggestion_history: [] });
  const history = ["2026-10", "2026-11", "2026-12"].map((month) => ({
    month, covered: true, expenses: { food: 100 }
  }));
  const following = matrix(2027, { current_month: "2027-01", suggestion_history: history });
  const combined = new BudgetMatrixPeriod(primary, following).matrix;
  assert.deepEqual(combined.suggestion_history, history);
  assert.deepEqual(primary.suggestion_history, []);
  assert.deepEqual(combined.months, months(2026));
});

test("wrong-year, different-currency or stale planning boundaries do not mix reports", () => {
  const primary = matrix(2026);
  for (const following of [matrix(2028), matrix(2027, { base_currency: "USD" }),
    matrix(2027, { current_month: "2026-11" }), matrix(2027, { months: ["2026-12"] })]) {
    const period = new BudgetMatrixPeriod(primary, following);
    assert.equal(period.hasFollowing, false);
    assert.deepEqual(period.months, months(2026));
    assert.equal(period.categories[0].expense["2027-01"], undefined);
  }
});

test("primary values win overlaps and following-only stray keys cannot change the selected calendar", () => {
  const primary = matrix(2026), following = matrix(2027);
  following.categories[0].expense["2026-01"] = 9999;
  following.cash_flow.months["2026-01"] = { closing: 9999 };
  following.month_meta["2026-01"] = { state: "past" };
  const period = new BudgetMatrixPeriod(primary, following);
  assert.equal(period.categories[0].expense["2026-01"], 25);
  assert.equal(period.matrix.cash_flow.months["2026-01"].closing, 500);
  assert.equal(period.matrix.month_meta["2026-01"].state, "future");
});

test("constructing and changing output month maps never mutates source payloads", () => {
  const primary = matrix(2026), following = matrix(2027), original = JSON.stringify([primary, following]);
  const period = new BudgetMatrixPeriod(primary, following);
  period.categories[0].budget["2027-01"] = 800;
  period.matrix.months.pop();
  period.months.pop();
  assert.equal(JSON.stringify([primary, following]), original);
});

test("missing reports preserve the primary calendar or produce an empty period", () => {
  const primary = matrix(2026);
  assert.deepEqual(new BudgetMatrixPeriod(primary).months, months(2026));
  const empty = new BudgetMatrixPeriod(null, matrix(2027));
  assert.equal(empty.matrix, null);
  assert.deepEqual(empty.months, []);
  assert.deepEqual(empty.categories, []);
  const unknown = matrix(2026, { cash_flow: null });
  assert.equal(new BudgetMatrixPeriod(unknown, matrix(2027)).matrix.cash_flow, null);
});
