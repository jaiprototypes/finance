type BudgetNetSavingsProps = {
  month?: string;
  currentMonth: string;
  cashFlow: any;
  currency: string;
  formatCurrency: (amount: number, currency: string) => string;
  label?: string;
};

/** Show the connected saver balance inside its Savings cell, separately from the plan. */
export function BudgetNetSavings({
  month, currentMonth, cashFlow, currency, formatCurrency, label = ""
}: BudgetNetSavingsProps) {
  const value = !month || month > currentMonth ? null : month === currentMonth
    ? cashFlow?.savings_balance : cashFlow?.months?.[month]?.savings_closing;
  const amount = typeof value === "number" && Number.isFinite(value)
    ? formatCurrency(value, currency) : "—";
  return (
    <div className="muted" title="Net saved: balance held in all connected personal savers">
      {label}<strong>{amount}</strong>
    </div>
  );
}
