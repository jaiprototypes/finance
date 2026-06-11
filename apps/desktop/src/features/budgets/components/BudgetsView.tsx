import { BudgetCurrentMonthChartSection } from "./sections/BudgetCurrentMonthChartSection";
import { BudgetMatrixDrilldownSection } from "./sections/BudgetMatrixDrilldownSection";
import { BudgetMatrixTableSection } from "./sections/BudgetMatrixTableSection";
import { BudgetMatrixToolbarSection } from "./sections/BudgetMatrixToolbarSection";

export function BudgetsView({ model }: { model: any }) {
  const { SectionHeader } = model;

  return (
    <div className="section-stack">
      <SectionHeader title="Budgets" subtitle="Yearly forecast buckets with actuals and variance." />
      <div className="panel">
        <BudgetMatrixToolbarSection model={model} />
        <BudgetCurrentMonthChartSection model={model} />
        <BudgetMatrixTableSection model={model} />
        <BudgetMatrixDrilldownSection model={model} />
      </div>
    </div>
  );
}
