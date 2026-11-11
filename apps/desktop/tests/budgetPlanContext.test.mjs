import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadDomain(name) {
  const source = await readFile(new URL(`../src/features/budgets/domain/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { BudgetPlanContext } = await loadDomain("BudgetPlanContext");
const { BudgetCashTimeline } = await loadDomain("BudgetCashTimeline");
const row = (extras = {}) => ({
  id: "income", type: "income", budget: { "2026-10": 1000 },
  budget_entered: { "2026-10": true }, income: { "2026-10": 200 },
  pending_income: { "2026-10": 100 }, ...extras
});
const context = (categories, months = ["2026-10"]) => ({ months, categories });
const carry = (inputs) => new BudgetCashTimeline([...inputs, {
  month: "2027-01", state: "future", entries: [],
  snapshot: { opening: 50, received: 0, paid: 0, closing: 50, pending: 0 }
}]).months["2027-01"];

test("future-year cash carries only unfulfilled earlier income and spending plans", () => {
  const plans = new BudgetPlanContext([context([row(), row({
    id: "rent", type: "expense", budget: { "2026-10": 500 },
    expense: { "2026-10": 100 }, pending_expense: { "2026-10": 150 }
  })])], {}, "AUD", "2026-10", "2027-01");
  const cash = carry(plans.inputs);
  assert.equal(cash.planChange, 450);
  assert.equal(cash.projectedClosing, 500);
  assert.equal(cash.closing, 50);
});

test("past plans and selected-year plans are excluded from earlier-year carry", () => {
  const plans = new BudgetPlanContext([context([row()], ["2026-09", "2026-10", "2027-01"])],
    {}, "AUD", "2026-10", "2027-01");
  assert.deepEqual(plans.inputs.map(({ month }) => month), ["2026-10"]);
  assert.equal(plans.inputs[0].state, "current");
});

test("unsaved plans in a visited year carry into later years without duplication", () => {
  const cached = context([row()], ["2026-10", "2026-11"]);
  const latest = context([row({ income: { "2026-10": 300 } })]);
  const drafts = { "2026:AUD": { income: { "2026-11": "1200" } } };
  const plans = new BudgetPlanContext([cached, latest], drafts, "AUD", "2026-10", "2027-01");
  assert.deepEqual(plans.inputs.map(({ month }) => month), ["2026-10", "2026-11"]);
  assert.equal(plans.inputs[0].entries.length, 1);
  assert.equal(carry(plans.inputs).planChange, 1800);
});

test("blank drafts remove saved plans and another currency draft cannot override them", () => {
  const blank = new BudgetPlanContext([context([row()])],
    { "2026:AUD": { income: { "2026-10": "" } } }, "AUD", "2026-10", "2027-01");
  assert.equal(carry(blank.inputs).planChange, 0);
  const otherCurrency = new BudgetPlanContext([context([row()])],
    { "2026:USD": { income: { "2026-10": "9999" } } }, "AUD", "2026-10", "2027-01");
  assert.equal(carry(otherCurrency.inputs).planChange, 700);
});

test("explicit zero plans and signed refunds keep their cash projection meaning", () => {
  const plans = new BudgetPlanContext([context([row({ id: "rent", type: "expense",
    expense: { "2026-10": -100 }, pending_expense: {} })])],
    { "2026:AUD": { rent: { "2026-10": "0" } } }, "AUD", "2026-10", "2027-01");
  assert.equal(plans.inputs[0].entries[0].target, 0);
  assert.equal(carry(plans.inputs).planChange, -100);
});

test("prior-year savings plans remain allocations without reducing future combined cash", () => {
  const savings = row({ id: "savings", type: "expense", cash_neutral: true,
    budget: { "2026-10": 1000, "2026-11": 2000 },
    budget_entered: { "2026-10": true, "2026-11": true },
    expense: { "2026-10": 100 }, pending_expense: { "2026-10": 25 } });
  const plans = new BudgetPlanContext([context([row(), savings], ["2026-10", "2026-11"])],
    {}, "AUD", "2026-10", "2027-01");
  const savingsEntries = plans.inputs.map(input => input.entries.find(entry => entry.cashNeutral));
  assert.deepEqual(savingsEntries.map(entry => entry.target), [1000, 2000]);
  assert.equal(carry(plans.inputs).planChange, 700);
  assert.equal(carry(plans.inputs).projectedClosing, 750);
});

test("unsaved savings targets and zero after withdrawals keep future carry unchanged", () => {
  const savings = row({ id: "savings", type: "expense", cash_neutral: true,
    expense: { "2026-10": -100 }, pending_expense: {} });
  for (const target of ["2000", "0"]) {
    const plans = new BudgetPlanContext([context([savings])],
      { "2026:AUD": { savings: { "2026-10": target } } }, "AUD", "2026-10", "2027-01");
    assert.equal(plans.inputs[0].entries[0].target, Number(target));
    assert.equal(plans.inputs[0].entries[0].cashNeutral, true);
    assert.equal(carry(plans.inputs).planChange, 0);
    assert.equal(carry(plans.inputs).projectedClosing, 50);
  }
});
