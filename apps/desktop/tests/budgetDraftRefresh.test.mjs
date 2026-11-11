import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/budgets/domain/BudgetDraftRefresh.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
});
const { BudgetDraftRefresh } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function matrix({ year = 2026, currency = "AUD", currentMonth = "2026-10", targets = {} } = {}) {
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  const categories = ["income", "food", "rent", "health", "savings"].map(id => ({
    id,
    budget: Object.fromEntries(months.map(month => [month, targets[id]?.[month] ?? 0])),
    budget_entered: Object.fromEntries(months.map(month => [month, Object.hasOwn(targets[id] || {}, month)]))
  }));
  return { base_currency: currency, current_month: currentMonth, months, categories };
}

test("initial refresh creates every fresh cell from saved plans including explicit zero", () => {
  const fresh = matrix({ targets: { food: { "2026-11": 100 }, savings: { "2026-12": 0 } } });
  const result = BudgetDraftRefresh.merge(undefined, {}, fresh);
  assert.deepEqual(Object.keys(result), fresh.categories.map(row => row.id));
  assert.ok(Object.values(result).every(values => Object.keys(values).length === 12));
  assert.equal(result.food["2026-11"], "100");
  assert.equal(result.food["2026-12"], "");
  assert.equal(result.savings["2026-12"], "0");
});

test("untouched saved values and equivalent number formatting adopt fresh server changes", () => {
  const previous = matrix({ targets: { food: { "2026-11": 100 }, savings: { "2026-11": 0 } } });
  const fresh = matrix({ targets: { food: { "2026-11": 150 }, health: { "2026-11": 25 }, savings: { "2026-11": 80 } } });
  const result = BudgetDraftRefresh.merge(previous, {
    food: { "2026-11": "100.00" }, health: { "2026-11": "" }, savings: { "2026-11": "0.00" }
  }, fresh);
  assert.equal(result.food["2026-11"], "150");
  assert.equal(result.health["2026-11"], "25");
  assert.equal(result.savings["2026-11"], "80");
});

test("cleared targets, explicit zero, manual amounts and accepted suggestions remain drafts", () => {
  const previous = matrix({ targets: { food: { "2026-11": 100 } } });
  const fresh = matrix({ targets: { food: { "2026-11": 150 }, rent: { "2026-11": 50 } } });
  const result = BudgetDraftRefresh.merge(previous, {
    food: { "2026-11": "" }, rent: { "2026-11": "0" },
    health: { "2026-11": "77.77" }, savings: { "2026-11": "21.56" }
  }, fresh);
  assert.equal(result.food["2026-11"], "");
  assert.equal(result.rent["2026-11"], "0");
  assert.equal(result.health["2026-11"], "77.77");
  assert.equal(result.savings["2026-11"], "21.56");
});

test("invalid nonempty drafts survive refresh without becoming a saved zero", () => {
  const previous = matrix();
  for (const raw of ["unfinished", "-", "NaN", "Infinity"]) {
    const result = BudgetDraftRefresh.merge(previous, { food: { "2026-11": raw } }, matrix());
    assert.equal(result.food["2026-11"], raw);
  }
});

test("month rollover drops newly past drafts while protecting future zero and accepted plans", () => {
  const previous = matrix({ targets: { food: { "2026-10": 50 } } });
  const fresh = matrix({ currentMonth: "2026-11", targets: { food: { "2026-10": 100 } } });
  const result = BudgetDraftRefresh.merge(previous, {
    food: { "2026-10": "900", "2026-11": "75.25" },
    rent: { "2026-11": "0" }, savings: { "2026-12": "21.56" }
  }, fresh);
  assert.equal(result.food["2026-10"], "100");
  assert.equal(result.food["2026-11"], "75.25");
  assert.equal(result.rent["2026-11"], "0");
  assert.equal(result.savings["2026-12"], "21.56");
});

test("merging the latest in-flight edits retains typing that arrived after a refresh began", () => {
  const previous = matrix({ targets: { food: { "2026-11": 100 } } });
  const fresh = matrix({ targets: { food: { "2026-11": 150 } } });
  const atRequestStart = { food: { "2026-11": "100" } };
  const latest = { food: { "2026-11": "127.40" }, health: { "2026-11": "0" } };
  assert.equal(BudgetDraftRefresh.merge(previous, atRequestStart, fresh).food["2026-11"], "150");
  const merged = BudgetDraftRefresh.merge(previous, latest, fresh);
  assert.equal(merged.food["2026-11"], "127.40");
  assert.equal(merged.health["2026-11"], "0");
});

test("missing old rows, old months and undefined drafts never masquerade as unsaved edits", () => {
  const previous = matrix();
  previous.categories = previous.categories.filter(row => row.id !== "health");
  previous.months = previous.months.filter(month => month !== "2026-12");
  const fresh = matrix({ targets: { food: { "2026-11": 125, "2026-12": 150 }, health: { "2026-11": 25 } } });
  const result = BudgetDraftRefresh.merge(previous, {
    food: { "2026-11": undefined, "2026-12": "777" }, health: { "2026-11": "888" }
  }, fresh);
  assert.equal(result.food["2026-11"], "125");
  assert.equal(result.food["2026-12"], "150");
  assert.equal(result.health["2026-11"], "25");
});

test("a different year or currency uses fresh saved values without leaking old drafts", () => {
  const previous = matrix();
  const drafts = { food: { "2026-11": "999", "2027-01": "888" } };
  const nextYear = BudgetDraftRefresh.merge(previous, drafts, matrix({ year: 2027,
    targets: { food: { "2027-01": 125 } } }));
  assert.equal(nextYear.food["2027-01"], "125");
  assert.equal(nextYear.food["2026-11"], undefined);
  const otherCurrency = BudgetDraftRefresh.merge(previous, drafts, matrix({ currency: "USD",
    targets: { food: { "2026-11": 50 } } }));
  assert.equal(otherCurrency.food["2026-11"], "50");
});

test("refresh does not mutate source matrices or draft maps", () => {
  const previous = matrix();
  const fresh = matrix({ targets: { food: { "2026-11": 150 } } });
  const drafts = { food: { "2026-11": "77.77" } };
  const before = JSON.stringify({ previous, fresh, drafts });
  const result = BudgetDraftRefresh.merge(previous, drafts, fresh);
  assert.equal(JSON.stringify({ previous, fresh, drafts }), before);
  result.food["2026-11"] = "200";
  assert.equal(drafts.food["2026-11"], "77.77");
});

test("sparse changes exclude complete saved baselines and equivalent number formatting", () => {
  const previous = matrix({ targets: { food: { "2026-11": 1000 }, savings: { "2026-12": 0 } } });
  const fullBaseline = BudgetDraftRefresh.merge(undefined, {}, previous);
  fullBaseline.food["2026-11"] = "1000.00";
  fullBaseline.savings["2026-12"] = "0.00";
  assert.deepEqual(BudgetDraftRefresh.changes(previous, fullBaseline, "2026-10"), {});
  const fresh = matrix({ targets: { food: { "2026-11": 800 } } });
  assert.equal(BudgetDraftRefresh.merge(previous, fullBaseline, fresh).food["2026-11"], "800");
});

test("sparse changes retain zero, cleared, invalid and accepted drafts only for open known cells", () => {
  const previous = matrix({ targets: { food: { "2026-11": 100 } } });
  const edits = { food: { "2026-10": "999", "2026-11": "", "2027-01": "777" },
    rent: { "2026-11": "0" }, health: { "2026-11": "-" }, savings: { "2026-12": "21.56" },
    missing: { "2026-11": "888" } };
  const before = JSON.stringify({ previous, edits });
  assert.deepEqual(BudgetDraftRefresh.changes(previous, edits, "2026-11"), {
    food: { "2026-11": "" }, rent: { "2026-11": "0" },
    health: { "2026-11": "-" }, savings: { "2026-12": "21.56" }
  });
  assert.equal(JSON.stringify({ previous, edits }), before);
  assert.deepEqual(BudgetDraftRefresh.changes(undefined, edits, "2026-11"), {});
});
