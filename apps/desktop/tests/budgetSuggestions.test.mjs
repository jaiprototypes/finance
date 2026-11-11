import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/budgets/domain/BudgetSuggestions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
});
const { BudgetSuggestions } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const income = { id: "income", type: "income" };
const food = { id: "food", type: "expense" };
const rent = { id: "rent", type: "expense" };
const history = (expenses, month = "2026-09", covered = true) => ({ month, covered, expenses });
const recommend = (options = {}) => new BudgetSuggestions({
  months: ["2026-11"], currentMonth: "2026-10", rows: [income, food, rent],
  edits: { income: { "2026-11": "1000" } },
  history: [history({ food: 200, rent: 500 })], ...options
}).months["2026-11"];

test("only explicit, complete positive income plans activate recommendations", () => {
  for (const raw of [undefined, "", " ", "0", "-1", "invalid"]) {
    const result = recommend({ edits: { income: { "2026-11": raw } } });
    assert.equal(result.enabled, false);
    assert.deepEqual(result.suggestions, {});
  }
  const partial = recommend({ rows: [income, { id: "support", type: "income" }, food],
    edits: { income: { "2026-11": "1000" } } });
  assert.equal(partial.enabled, false);
  const complete = recommend({ rows: [income, { id: "support", type: "income" }, food],
    edits: { income: { "2026-11": "1000" }, support: { "2026-11": "0" } } });
  assert.equal(complete.enabled, true);
});

test("saved income targets activate suggestions and surplus stays unallocated", () => {
  const result = recommend({ rows: [{ ...income, budget_entered: { "2026-11": true },
    budget: { "2026-11": 1000 } }, food, rent], edits: {} });
  assert.equal(result.suggestions.food.amount, 200);
  assert.equal(result.suggestions.rent.amount, 500);
  assert.equal(result.availableLeft, 300);
});

test("manual amounts and explicit zero are preserved and reserve their share first", () => {
  const result = recommend({ edits: { income: { "2026-11": "600" },
    rent: { "2026-11": "500" }, food: { "2026-11": "0" } } });
  assert.deepEqual(result.suggestions, {});
  assert.equal(result.committed, 500);
  assert.equal(result.availableLeft, 100);
});

test("current-month spending and pending reservations are floors, not extra suggested spending", () => {
  const result = new BudgetSuggestions({ months: ["2026-10"], currentMonth: "2026-10",
    rows: [income, { ...food, expense: { "2026-10": 120 }, pending_expense: { "2026-10": 30 } }, rent],
    edits: { income: { "2026-10": "600" }, rent: { "2026-10": "400" } },
    history: [history({ food: 250 })]
  }).months["2026-10"];
  assert.equal(result.committed, 550);
  assert.equal(result.suggestions.food.amount, 200);
  assert.equal(result.availableLeft, 0);
  assert.equal(result.committed + result.suggestions.food.amount - 150, result.income);
});

test("tight budgets scale historical demand proportionally with deterministic whole-cent totals", () => {
  const result = recommend({ rows: [income, food, rent, { id: "health", type: "expense" }],
    edits: { income: { "2026-11": "1" } },
    history: [history({ food: 1, rent: 1, health: 1 })] });
  assert.deepEqual(Object.fromEntries(Object.entries(result.suggestions).map(([id, suggestion]) =>
    [id, suggestion.amount])), { food: .34, rent: .33, health: .33 });
  assert.equal(Math.round(Object.values(result.suggestions).reduce((sum, item) => sum + item.amount, 0) * 100), 100);
  assert.equal(result.availableLeft, 0);
});

test("the latest three covered completed months include zeros and exclude partial or unknown months", () => {
  const result = recommend({ history: [history({ food: 900 }, "2026-05"),
    history({ food: 300 }, "2026-06"), history({ food: 0 }, "2026-07"),
    history({ food: 999 }, "2026-08", false), history({ food: 300 }, "2026-09"),
    history({ food: 9999 }, "2026-10"), history({ food: 9999 }, "2026-12")] });
  assert.deepEqual(result.historyMonths, ["2026-06", "2026-07", "2026-09"]);
  assert.equal(result.suggestions.food.historicalAverage, 200);
  assert.equal(result.suggestions.food.amount, 200);
});

test("refunds reduce signed historical averages without creating negative spending recommendations", () => {
  const result = recommend({ history: [history({ food: 200, rent: -100 }, "2026-07"),
    history({ food: -50, rent: -100 }, "2026-08"), history({ food: 0, rent: 0 }, "2026-09")] });
  assert.equal(result.suggestions.food.amount, 50);
  assert.equal(result.suggestions.rent, undefined);
});

test("missing history never invents an equal split or suggests spending the entire income", () => {
  const result = recommend({ history: [history({ food: 500 }, "2026-09", false)] });
  assert.deepEqual(result.historyMonths, []);
  assert.deepEqual(result.suggestions, {});
  assert.equal(result.availableLeft, 1000);
});

test("overcommitted plans report the excess and add no suggestions", () => {
  const result = recommend({ edits: { income: { "2026-11": "100" }, rent: { "2026-11": "200" } } });
  assert.equal(result.enabled, true);
  assert.equal(result.overcommitted, 100);
  assert.deepEqual(result.suggestions, {});
  assert.equal(result.available, 0);
});

test("blank drafts clear saved targets while invalid drafts stop recommendations without overwriting them", () => {
  const rows = [income, { ...food, budget_entered: { "2026-11": true }, budget: { "2026-11": 900 } }, rent];
  const cleared = recommend({ rows, edits: { income: { "2026-11": "1000" }, food: { "2026-11": "" } } });
  assert.equal(cleared.suggestions.food.amount, 200);
  const invalid = recommend({ rows, edits: { income: { "2026-11": "1000" }, food: { "2026-11": "oops" } } });
  assert.equal(invalid.enabled, false);
  assert.equal(invalid.disabledReason, "invalid-expense-plan");
  assert.deepEqual(invalid.suggestions, {});
});

test("future-year suggestions reuse observed history and never suggest editing past months", () => {
  const forecasts = new BudgetSuggestions({ months: ["2026-09", "2027-01"], currentMonth: "2026-10",
    rows: [income, food], edits: { income: { "2027-01": "500" } },
    history: [history({ food: 150 })] });
  assert.equal(forecasts.months["2026-09"], undefined);
  assert.equal(forecasts.months["2027-01"].suggestions.food.amount, 150);
});

test("preview generation does not mutate plans, actuals or source history", () => {
  const options = { months: ["2026-11"], currentMonth: "2026-10", rows: [income, food, rent],
    edits: { income: { "2026-11": "1000" } }, history: [history({ food: 200, rent: 500 })] };
  const before = JSON.stringify(options);
  new BudgetSuggestions(options);
  assert.equal(JSON.stringify(options), before);
});
