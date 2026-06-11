import { BudgetsView } from "./BudgetsView";
import { useBudgetsWorkspace } from "../hooks/useBudgetsWorkspace";

export function Budgets() {
  const viewModel = useBudgetsWorkspace();
  return <BudgetsView model={viewModel} />;
}
