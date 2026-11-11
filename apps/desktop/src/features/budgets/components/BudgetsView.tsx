import { BudgetCellLimitNotice } from "./BudgetCellLimitNotice";
import { BudgetCellSchedule } from "./BudgetCellSchedule";
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
        {model.cellLimitNotice && <BudgetCellLimitNotice model={model} />}
        {model.cellSchedule && <BudgetCellSchedule key={`${model.cellSchedule.rowId}-${model.cellSchedule.month}`} model={model} />}
      </div>
    </div>
  );
}
