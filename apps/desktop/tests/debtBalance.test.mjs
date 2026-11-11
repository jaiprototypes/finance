import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/debts/domain/DebtBalance.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
});
const { DebtBalance, formatDebtApr, debtInterestLabel } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("missing and explicitly unknown balances never become a zero debt", () => {
  assert.equal(new DebtBalance({}).actual, null);
  assert.equal(new DebtBalance({}, { balance: 0, balance_known: false }).actual, null);
  assert.equal(new DebtBalance({ tracking_account_id: 34 }, { balance: 0 }).actual, null);
});

test("a genuine observed zero balance remains known", () => {
  assert.equal(new DebtBalance({}, { display_balance: 0 }).actual, 0);
  assert.equal(new DebtBalance({}, undefined, { balance: 0 }).payoffAmount(false), 0);
});

test("the current confirmed Sallie balance overrides imported ledger amounts", () => {
  const balance = new DebtBalance({ balance_anchor_amount: 39182.64 }, { display_balance: -1000 }, {
    balance: 39182.64, estimated_balance: 39182.64, estimated_interest: 0, projected_balance: 39182.64,
  });
  assert.equal(balance.actual, 39182.64);
  assert.equal(balance.payoffAmount(false), 39182.64);
});

test("a credit limit cannot establish a balance and estimates require scenario consent", () => {
  const balance = new DebtBalance({ tracking_account_id: 34, credit_limit: 500 }, { display_balance: 0 }, {
    balance: null, estimated_balance: 485, estimated_interest: 3.1, projected_balance: 488.1,
  });
  assert.equal(balance.actual, null);
  assert.equal(balance.estimatedPrincipal, 485);
  assert.equal(balance.estimatedInterest, 3.1);
  assert.equal(balance.payoffAmount(false), null);
  assert.equal(balance.payoffAmount(true), 488.1);
});

test("a historical anchor is not silently presented as a current observed balance", () => {
  const balance = new DebtBalance({ balance_anchor_amount: 100, balance_anchor_date: "2026-10-01" }, { display_balance: -100 }, {
    balance: null, projected_balance: 101,
  });
  assert.equal(balance.actual, null);
  assert.equal(balance.payoffAmount(false), null);
  assert.equal(balance.payoffAmount(true), 101);
});

test("invalid tracking values remain unavailable instead of creating NaN or zero scenarios", () => {
  for (const invalid of [undefined, null, NaN, Infinity, "485"]) {
    const balance = new DebtBalance({}, { display_balance: 0 }, { balance: invalid, projected_balance: invalid });
    assert.equal(balance.actual, null);
    assert.equal(balance.payoffAmount(true), null);
  }
});

test("APR fractions and daily interest assumptions have unambiguous labels", () => {
  assert.equal(formatDebtApr(0.02), "2%");
  assert.equal(formatDebtApr(0.14), "14%");
  assert.equal(debtInterestLabel("daily"), "Daily compounding");
  assert.equal(debtInterestLabel("simple_daily"), "Simple daily accrual");
  assert.equal(debtInterestLabel("monthly"), "Monthly compounding");
});
