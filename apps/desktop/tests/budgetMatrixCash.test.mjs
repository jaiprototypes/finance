import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let source = transpile(await readFile(new URL("../src/features/budgets/hooks/budgetMatrixModel.ts", import.meta.url), "utf8"));
// Formatting is outside this cash integration check; every financial domain stays real.
source = source.replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\.\/\.\.\/\.\.\/shared\/financeUi";/,
  `const MATRIX_BREAKDOWN_COLORS = ["teal"];
   const buildConicGradient = () => "none";
   const currentMonthLabel = () => "2027-01";
   const monthStateLabel = (month, current) => month < current ? "past" : month > current ? "future" : "current";`);
for (const name of ["BudgetCashTimeline", "BudgetMonthWindow", "BudgetPlanContext", "BudgetSuggestions", "BudgetDraftRefresh", "BudgetMatrixPeriod"]) {
  const domain = transpile(await readFile(new URL(`../src/features/budgets/domain/${name}.ts`, import.meta.url), "utf8"));
  source = source.replace(`../domain/${name}`, moduleUrl(domain));
}
const { buildBudgetMatrixModel } = await import(moduleUrl(source));

const month = "2027-01";
const income = (target, actual = 0, pending = 0) => ({
  id: "income", type: "income", income: { [month]: actual }, pending_income: { [month]: pending },
  budget: target === undefined ? {} : { [month]: target }, budget_entered: { [month]: target !== undefined }
});
const cached = (row) => ({ year: 2027, base_currency: "AUD", months: [month], categories: [row] });
const fresh = (priorRows) => {
  const months = Array.from({ length: 12 }, (_, index) => `2028-${String(index + 1).padStart(2, "0")}`);
  return {
    year: 2028, base_currency: "AUD", current_month: month, months, categories: [],
    month_meta: Object.fromEntries(months.map((key) => [key, { state: "future" }])),
    cash_flow: { months: Object.fromEntries(months.map((key) => [key,
      { opening: 600, received: 0, paid: 0, closing: 600, pending: 0 }])) },
    prior_plan_context: { months: priorRows.length ? [month] : [], categories: priorRows }
  };
};
const model = (old, raw, priorRows) => buildBudgetMatrixModel({
  budgetMatrix: fresh(priorRows), matrixEdits: {}, priorMatrices: [cached(old)],
  priorDrafts: { "2027:AUD": { [old.id]: { [month]: raw } } }
});

test("fresh prior-year targets replace unchanged saved cells in the cache", () => {
  const result = model(income(1000), "1000", [income(800, 500)]);
  assert.equal(result.cashPositions["2028-01"].planChange, 300);
  assert.equal(result.cashPositions["2028-12"].projectedClosing, 900);
});

test("a removed saved target cannot survive in cached earlier-year rows", () => {
  for (const rows of [[], [income(undefined, 500)]]) {
    const result = model(income(1000, 200), "1000", rows);
    assert.equal(result.cashPositions["2028-01"].planChange, 0);
    assert.equal(result.cashPositions["2028-12"].projectedClosing, 600);
  }
});

test("unsaved earlier-year income deducts newly received and pending amounts once", () => {
  const result = model(income(undefined), "1000", [income(undefined, 500, 100)]);
  assert.equal(result.cashPositions["2028-01"].planChange, 400);
  assert.equal(result.cashPositions["2028-12"].projectedClosing, 1000);
});

test("deleted actuals cannot remain in the cached scaffolding for an unsaved target", () => {
  const result = model(income(undefined, 500), "1000", []);
  assert.equal(result.cashPositions["2028-01"].planChange, 1000);
  assert.equal(result.cashPositions["2028-12"].projectedClosing, 1600);
});

test("explicit zero and cleared earlier-year drafts override fresh saved targets", () => {
  for (const raw of ["0", ""]) {
    const result = model(income(1000), raw, [income(800, 100)]);
    assert.equal(result.cashPositions["2028-01"].planChange, 0);
  }
});

test("genuine savings drafts remain cash neutral after prior-year refresh", () => {
  const savings = { id: "savings", type: "expense", cash_neutral: true,
    budget: {}, budget_entered: {}, expense: {} };
  const result = model(savings, "999999", [savings]);
  assert.equal(result.cashPositions["2028-12"].projectedClosing, 600);
});
