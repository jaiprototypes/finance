import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/features/budgets/components/BudgetNetSavings.tsx", import.meta.url), "utf8");
let code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX
} }).outputText;
code = code.replace("react/jsx-runtime", pathToFileURL(require.resolve("react/jsx-runtime")).href);
const { BudgetNetSavings } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const render = (cashFlow) => ["2026-10", "2026-11", "2026-12", "2026-11"].map((month) =>
  renderToStaticMarkup(React.createElement(BudgetNetSavings, {
    month, currentMonth: "2026-11", cashFlow, currency: "AUD",
    formatCurrency: (value) => `AUD ${value.toFixed(2)}`
  }))).join("");

test("net saved shows bank balances, hides future balances and never sums monthly snapshots", () => {
  const html = render({ savings_balance: 249, months: {
    "2026-10": { savings_closing: 20 }, "2026-11": { savings_closing: -53.59 },
    "2026-12": { savings_closing: 249 }
  } });
  assert.ok(html.includes("AUD 20.00"));
  assert.equal((html.match(/AUD 249.00/g) || []).length, 2); // Current month and latest balance.
  assert.ok(!html.includes("AUD -53.59") && !html.includes("AUD 269.00"));
  assert.ok(html.includes("—"));
});

test("unknown saver balances stay unavailable while a real zero is displayed", () => {
  assert.ok(!render({}).includes("AUD 0.00"));
  assert.ok(render({ savings_balance: 0 }).includes("AUD 0.00"));
});
