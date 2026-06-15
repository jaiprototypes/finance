import { useEffect, useState } from "react";
import {
  WorkspaceInsightCard,
  currentMonthLabel,
  formatCount,
  formatCurrency,
  formatMonthYearLabel,
  formatRemainingSummary,
  formatTimestampLabel,
  toNumber
} from "../../../shared/financeUi";
import { getPlanningOverview, type PlanningOverviewData } from "../api";

function loadErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function emptyPlanningData(): PlanningOverviewData {
  return {
    budgetMatrix: null,
    netWorth: null,
    profiles: [],
    rates: [],
    recommendations: []
  };
}

export function PlanningWorkspaceOverview({
  activePageId,
  onSelect
}: {
  activePageId: string;
  onSelect: (pageId: string) => void;
}) {
  const [planningData, setPlanningData] = useState<PlanningOverviewData>(emptyPlanningData);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [planningLoading, setPlanningLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const currentYear = new Date().getFullYear();
    setPlanningLoading(true);
    setPlanningError(null);
    getPlanningOverview(currentYear)
      .then((data) => {
        if (!cancelled) setPlanningData(data);
      })
      .catch((err) => {
        if (!cancelled) setPlanningError(loadErrorMessage(err, "Unable to load planning data."));
      })
      .finally(() => {
        if (!cancelled) setPlanningLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { budgetMatrix, netWorth, profiles, rates, recommendations } = planningData;
  const currentBudgetMonth = budgetMatrix?.current_month || currentMonthLabel();
  const currentBudgetMeta = budgetMatrix?.month_meta?.[currentBudgetMonth] || null;
  const planningCurrency = budgetMatrix?.base_currency || netWorth?.base_currency || "USD";
  const overspentCount = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type !== "income")
    .filter((row: any) => {
      const target = Number(row.budget?.[currentBudgetMonth] || 0);
      const hasBudget = Boolean(row.budget_entered?.[currentBudgetMonth]) || target > 0.005;
      const spent = Number(row.expense?.[currentBudgetMonth] || 0);
      return hasBudget && spent - target > 0.005;
    }).length;
  const balanceMap = new Map<number, number>();
  (netWorth?.accounts || []).forEach((row: any) =>
    balanceMap.set(row.account_id, Number(row.display_balance_base ?? row.balance_base ?? row.balance ?? 0))
  );
  const debtTotal = profiles.reduce((sum, profile) => sum + Math.abs(balanceMap.get(profile.account_id) || 0), 0);
  const minimumPaymentTotal = profiles.reduce((sum, profile) => sum + Number(profile.min_payment || 0), 0);
  const latestRate = [...rates].sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))[0];
  const latestRateValue = toNumber(latestRate?.aud_per_usd);
  const latestRecommendation = recommendations[0];
  const activeCopy =
    {
      budgets: "Keep the forward plan and actual variance side by side so cash pressure is obvious.",
      debts: "Update balances and payment links here before testing avalanche or snowball scenarios.",
      fx: "Treat FX as a planning input only. It should inform decisions, not mutate the books."
    }[activePageId] || "Use one planning workspace for budgets, debt pressure, and FX context.";

  return (
    <div className="workspace-overview">
      <div className="workspace-overview-copy">
        <div className="workspace-overview-title">Planning control view</div>
        <p className="workspace-overview-note">{activeCopy}</p>
        {planningLoading && <p className="muted">Loading planning data...</p>}
        {planningError && <p className="form-error">Planning data failed to load. {planningError}</p>}
      </div>
      <div className="workspace-overview-grid">
        <WorkspaceInsightCard
          title="Budget month"
          value={formatRemainingSummary(currentBudgetMeta?.remaining_to_allocate, planningCurrency)}
          meta={
            currentBudgetMeta
              ? `${formatMonthYearLabel(currentBudgetMonth)} · income ${formatCurrency(
                  currentBudgetMeta.effective_income,
                  planningCurrency
                )} · expense ${formatCurrency(currentBudgetMeta.effective_expense, planningCurrency)}`
              : "No budget month loaded"
          }
          pageId="budgets"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Budget hotspots"
          value={formatCount(overspentCount)}
          meta={
            currentBudgetMonth
              ? `${formatMonthYearLabel(currentBudgetMonth)} categories over plan`
              : "Waiting for budget data"
          }
          pageId="budgets"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Debt load"
          value={formatCurrency(debtTotal, planningCurrency)}
          meta={
            profiles.length > 0
              ? `${formatCount(profiles.length)} tracked debts · minimums ${formatCurrency(
                  minimumPaymentTotal,
                  planningCurrency
                )}`
              : "No debt profiles yet"
          }
          pageId="debts"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="FX watch"
          value={latestRateValue === null ? "—" : latestRateValue.toFixed(4)}
          meta={
            latestRecommendation
              ? `Latest guidance ${formatTimestampLabel(latestRecommendation.created_at)} · ${
                  latestRecommendation.risk_profile || "neutral"
                }`
              : latestRate
                ? `${latestRate.date} · AUD per USD`
                : "No local FX snapshot yet"
          }
          pageId="fx"
          activePageId={activePageId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
