import { BudgetsView } from "./BudgetsView";
import { useBudgetsWorkspace } from "../hooks/useBudgetsWorkspace";

export function Budgets({ active = true }: { active?: boolean }) {
  const viewModel = useBudgetsWorkspace(active);
  return <BudgetsView model={viewModel} />;
}
