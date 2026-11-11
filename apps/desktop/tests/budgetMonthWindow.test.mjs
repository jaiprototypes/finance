import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/budgets/domain/BudgetMonthWindow.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
});
const { BudgetMonthWindow } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const months = Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`);
const following = Array.from({ length: 12 }, (_, index) => `2027-${String(index + 1).padStart(2, "0")}`);

test("a year starts with six display months while keeping the full input intact", () => {
  const original = [...months];
  const window = new BudgetMonthWindow(months);
  assert.deepEqual(window.months, months.slice(0, 6));
  assert.equal(window.startIndex, 0);
  assert.equal(window.maxStartIndex, 11);
  window.months.pop();
  assert.deepEqual(months, original);
});

test("the display window slides one month at a time through the calendar year", () => {
  for (let start = 0; start <= 11; start += 1) {
    const window = new BudgetMonthWindow(months, start);
    assert.equal(window.startIndex, start);
    assert.equal(window.months.length, 6);
    assert.deepEqual(window.months, [...months, ...following].slice(start, start + 6));
  }
});

test("the primary year's starting month clamps at January and December", () => {
  assert.deepEqual(new BudgetMonthWindow(months, -1).months, months.slice(0, 6));
  const end = new BudgetMonthWindow(months, 999);
  assert.equal(end.startIndex, 11);
  assert.deepEqual(end.months, ["2026-12", ...following.slice(0, 5)]);
});

test("partial or empty periods do not create blank display columns", () => {
  const partial = new BudgetMonthWindow(months.slice(0, 3), 6);
  assert.equal(partial.maxStartIndex, 0);
  assert.deepEqual(partial.months, months.slice(0, 3));
  assert.deepEqual(new BudgetMonthWindow([], 5).months, []);
  assert.equal(BudgetMonthWindow.defaultStart([], "2026-10"), 0);
});

test("invalid and fractional navigation values produce valid month boundaries", () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(new BudgetMonthWindow(months, invalid).startIndex, 0);
  }
  assert.equal(new BudgetMonthWindow(months, 2.8).startIndex, 2);
});

test("current-year defaults follow the current half-year", () => {
  for (const month of ["2026-01", "2026-06"]) {
    assert.equal(BudgetMonthWindow.defaultStart(months, month), 0);
  }
  for (const month of ["2026-07", "2026-10", "2026-12"]) {
    assert.equal(BudgetMonthWindow.defaultStart(months, month), 6);
  }
});

test("future years start in January and earlier years show their latest months", () => {
  assert.equal(BudgetMonthWindow.defaultStart(months, "2025-10"), 0);
  assert.equal(BudgetMonthWindow.defaultStart(months, "2027-01"), 6);
});

test("August and December windows continue through the following calendar year", () => {
  assert.deepEqual(new BudgetMonthWindow(months, 7).months,
    ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(new BudgetMonthWindow(months, 11).months,
    ["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"]);
});

test("next and previous arrows move continuously across primary-year boundaries", () => {
  assert.deepEqual(BudgetMonthWindow.move("2026", 11, 1), { year: "2027", startIndex: 0 });
  assert.deepEqual(BudgetMonthWindow.move("2026", 0, -1), { year: "2025", startIndex: 11 });
  assert.deepEqual(BudgetMonthWindow.move("2026", 6, 1), { year: "2026", startIndex: 7 });
  assert.deepEqual(BudgetMonthWindow.move("2026", 7, -1), { year: "2026", startIndex: 6 });
});

test("following-year source data does not add extra starting months or shift the primary-year default", () => {
  const combined = [...months, ...following];
  const window = new BudgetMonthWindow(combined, 11);
  assert.equal(window.maxStartIndex, 11);
  assert.deepEqual(window.months, ["2026-12", ...following.slice(0, 5)]);
  assert.equal(BudgetMonthWindow.defaultStart(combined, "2027-01"), 6);
});

test("following January at the right edge starts the window in the previous August", () => {
  assert.deepEqual(BudgetMonthWindow.endingAt("2027-01"), { year: "2026", startIndex: 7 });
});

test("following June at the right edge starts the primary year in January", () => {
  assert.deepEqual(BudgetMonthWindow.endingAt("2027-06"), { year: "2027", startIndex: 0 });
});
