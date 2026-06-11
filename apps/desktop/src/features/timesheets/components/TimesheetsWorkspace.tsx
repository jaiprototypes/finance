import { TimesheetsView } from "./TimesheetsView";
import { useTimesheetsWorkspace } from "../hooks/useTimesheetsWorkspace";
import type { TimesheetsWorkspaceProps } from "../hooks/useTimesheetsWorkspace";

export function Timesheets(props: TimesheetsWorkspaceProps) {
  const viewModel = useTimesheetsWorkspace(props);
  return <TimesheetsView model={viewModel} />;
}
