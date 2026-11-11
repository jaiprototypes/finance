import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/budgets/domain/BudgetCashTimeline.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
});
const { BudgetCashTimeline } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const snapshot = (closing, extras = {}) => ({
  opening: 500, received: 200, paid: 300, pending: 0, closing, ...extras
});

test("bank cash is independent of a negative income and category result", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-10", state: "current", snapshot: snapshot(400),
    entries: [{ type: "income", actual: 200, reserved: 0 }, { type: "expense", actual: 300, reserved: 0 }]
  }]).months["2026-10"];
  assert.equal(cash.closing, 400);
  assert.equal(cash.projectedClosing, 400);
  assert.equal(cash.opening + cash.received - cash.paid, cash.closing);
});

test("opening funds and all receipts keep the original bank bridge", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-01", state: "past",
    snapshot: snapshot(250, { opening: 100, received: 1000, paid: 850 }), entries: []
  }]).months["2026-01"];
  assert.equal(cash.closing, 250);
  assert.equal(cash.planChange, 0);
});

test("current plans add only amounts not received, paid, or reserved", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-10", state: "current", snapshot: snapshot(50, { pending: -30 }),
    entries: [
      { type: "income", actual: 200, target: 300, reserved: 0 },
      { type: "expense", actual: 100, target: 180, reserved: 30 }
    ]
  }]).months["2026-10"];
  assert.equal(cash.planChange, 50);
  assert.equal(cash.projectedClosing, 100);
  assert.equal(cash.closing, 50);
});

test("a target already covered by a card reservation is not spent twice", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-10", state: "current", snapshot: snapshot(70, { pending: -30 }),
    entries: [{ type: "expense", actual: 100, target: 120, reserved: 30 }]
  }]).months["2026-10"];
  assert.equal(cash.projectedClosing, 70);
});

test("plans carry into later months without changing recorded bank cash", () => {
  const timeline = new BudgetCashTimeline([
    { month: "2026-10", state: "current", snapshot: snapshot(40),
      entries: [{ type: "income", actual: 100, target: 200, reserved: 0 }] },
    { month: "2026-11", state: "future", snapshot: snapshot(40),
      entries: [{ type: "expense", actual: 0, target: 25, reserved: 0 }] }
  ]);
  assert.equal(timeline.months["2026-10"].projectedClosing, 140);
  assert.equal(timeline.months["2026-11"].projectedClosing, 115);
  assert.equal(timeline.months["2026-11"].closing, 40);
});

test("past targets cannot change historical cash", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-01", state: "past", snapshot: snapshot(273.48),
    entries: [{ type: "income", actual: 200, target: 999999, reserved: 0 }]
  }]).months["2026-01"];
  assert.equal(cash.projectedClosing, 273.48);
});

test("unknown historical coverage stays unknown instead of displaying zero", () => {
  for (const missing of [undefined, snapshot(null)]) {
    const cash = new BudgetCashTimeline([{
      month: "2024-01", state: "future", snapshot: missing,
      entries: [{ type: "income", actual: 0, target: 500, reserved: 0 }]
    }]).months["2024-01"];
    assert.equal(cash.closing, null);
    assert.equal(cash.projectedClosing, null);
  }
});

test("a genuine zero balance remains known and a planned shortage stays signed", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-11", state: "future", snapshot: snapshot(0),
    entries: [{ type: "expense", actual: 0, target: 50, reserved: 0 }]
  }]).months["2026-11"];
  assert.equal(cash.closing, 0);
  assert.equal(cash.projectedClosing, -50);
});

test("transfer timing reconciles cash without becoming income or changing remaining plans", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-10", state: "current",
    snapshot: snapshot(150, { opening: 100, received: 200, paid: 100, transfer_adjustment: -50 }),
    entries: [{ type: "income", actual: 200, target: 250, reserved: 0 }]
  }]).months["2026-10"];
  assert.equal(cash.transferAdjustment, -50);
  assert.equal(cash.opening + cash.received - cash.paid + cash.transferAdjustment, cash.closing);
  assert.equal(cash.projectedClosing, 200);
  assert.equal(cash.planChange, 50);
});

test("older cash snapshots remain compatible when no transfer adjustment is present", () => {
  const cash = new BudgetCashTimeline([{
    month: "2026-10", state: "current", snapshot: snapshot(0), entries: []
  }]).months["2026-10"];
  assert.equal(cash.transferAdjustment, 0);
  assert.equal(cash.closing, 0);
});

test("savings allocations leave combined cash intact in current and future months", () => {
  const timeline = new BudgetCashTimeline([
    { month: "2026-10", state: "current", snapshot: snapshot(400), entries: [
      { type: "income", actual: 200, reserved: 0, target: 300 },
      { type: "expense", actual: 100, reserved: 0, target: 125 },
      { type: "expense", actual: 40, reserved: 10, target: 500, cashNeutral: true }
    ] },
    { month: "2027-01", state: "future", snapshot: snapshot(400), entries: [
      { type: "expense", actual: 0, reserved: 0, target: 1000, cashNeutral: true }
    ] }
  ]);
  for (const month of ["2026-10", "2027-01"]) {
    assert.equal(timeline.months[month].planChange, 75);
    assert.equal(timeline.months[month].projectedClosing, 475);
    assert.equal(timeline.months[month].closing, 400);
  }
});

test("savings withdrawals and explicit zero targets cannot create projected spending", () => {
  for (const state of ["current", "future"]) {
    const cash = new BudgetCashTimeline([{
      month: "2026-11", state, snapshot: snapshot(0),
      entries: [{ type: "expense", actual: -100, reserved: 0, target: 0, cashNeutral: true }]
    }]).months["2026-11"];
    assert.equal(cash.planChange, 0);
    assert.equal(cash.projectedClosing, 0);
  }
});

test("cash left updates with current plans while recorded bank cash stays intact", () => {
  const position = (target) => new BudgetCashTimeline([{
    month: "2026-11", state: "current", snapshot: snapshot(610.61),
    entries: [
      { type: "income", actual: 1162.31, target: 4648, reserved: 0 },
      { type: "expense", actual: 100, target, reserved: 20 }
    ]
  }]).months["2026-11"];
  assert.equal(position(4208.06).cashLeft.toFixed(2), "8.24");
  assert.equal(position(4308.06).cashLeft.toFixed(2), "-91.76");
  assert.equal(position(4308.06).closing, 610.61);
});

test("month rollover settles expired forecasts to observed cash and starts fresh plans", () => {
  const november = { month: "2026-11", state: "current", snapshot: snapshot(100),
    entries: [{ type: "income", actual: 0, target: 500, reserved: 0 }] };
  const december = { month: "2026-12", state: "future", snapshot: snapshot(100),
    entries: [{ type: "expense", actual: 0, target: 30, reserved: 0 }] };
  const forecast = new BudgetCashTimeline([november, december]).months;
  assert.equal(forecast["2026-11"].cashLeft, 600);
  assert.equal(forecast["2026-12"].cashLeft, 570);
  const refreshed = new BudgetCashTimeline([
    { ...november, state: "past", snapshot: snapshot(80) },
    { ...december, state: "current", snapshot: snapshot(80) }
  ]).months;
  assert.equal(refreshed["2026-11"].cashLeft, 80);
  assert.equal(refreshed["2026-12"].cashLeft, 50);
  assert.equal(refreshed["2026-12"].planChange, -30);
});
