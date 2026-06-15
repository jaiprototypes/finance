import { ReportsView } from "./ReportsView";
import { useReportsWorkspace } from "../hooks/useReportsWorkspace";

export function Reports() {
  const viewModel = useReportsWorkspace();
  return <ReportsView model={viewModel} />;
}
