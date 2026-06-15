import { BudgetActualReportSection } from "./sections/BudgetActualReportSection";
import { BusinessPnlReportSection } from "./sections/BusinessPnlReportSection";
import { CashflowReportSection } from "./sections/CashflowReportSection";
import { CategorySpendReportSection } from "./sections/CategorySpendReportSection";
import { CheckingCashSection } from "./sections/CheckingCashSection";
import { ExpenseAnalysisReportSection } from "./sections/ExpenseAnalysisReportSection";
import { ForecastReportSection } from "./sections/ForecastReportSection";
import { TimesheetReportSection } from "./sections/TimesheetReportSection";

export function ReportsView({ model }: { model: any }) {
  const { SectionHeader } = model;

  return (
    <div className="page">
      <SectionHeader title="Insights" subtitle="Personal cash, business cash, cashflow, category spend, and P&L." />
      <CheckingCashSection model={model} />
      <CashflowReportSection model={model} />
      <BudgetActualReportSection model={model} />
      <ForecastReportSection model={model} />
      <CategorySpendReportSection model={model} />
      <ExpenseAnalysisReportSection model={model} />
      <BusinessPnlReportSection model={model} />
      <TimesheetReportSection model={model} />
    </div>
  );
}
