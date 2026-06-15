import { getFeatureData } from "../../shared/api/featureBoundary";

export type PlanningOverviewData = {
  budgetMatrix: any | null;
  netWorth: any | null;
  profiles: any[];
  rates: any[];
  recommendations: any[];
};

function loadErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function normalizePlanningOverview(data: any): PlanningOverviewData {
  return {
    budgetMatrix: data?.budget_matrix ?? null,
    netWorth: data?.net_worth ?? null,
    profiles: data?.debt_profiles || [],
    rates: data?.fx_rates || [],
    recommendations: data?.fx_recommendations || []
  };
}

async function getPlanningFallback(year: number): Promise<PlanningOverviewData> {
  const [budgetMatrix, netWorth, profiles, rates, recommendations] = await Promise.all([
    getFeatureData<any>(`/reports/budget-matrix?year=${year}`),
    getFeatureData<any>("/reports/net-worth"),
    getFeatureData<any[]>("/debts/profiles"),
    getFeatureData<any[]>("/fx/rates"),
    getFeatureData<any[]>("/fx/recommendations")
  ]);
  return { budgetMatrix, netWorth, profiles, rates, recommendations };
}

export async function getPlanningOverview(year: number): Promise<PlanningOverviewData> {
  let aggregateError: unknown = null;
  try {
    return normalizePlanningOverview(await getFeatureData<any>(`/planning?year=${year}`));
  } catch (err) {
    aggregateError = err;
  }

  try {
    return await getPlanningFallback(year);
  } catch (fallbackError) {
    throw new Error(
      `Aggregate /planning failed: ${loadErrorMessage(
        aggregateError,
        "unknown error"
      )}. Fallback planning reads failed: ${loadErrorMessage(fallbackError, "unknown error")}.`
    );
  }
}
