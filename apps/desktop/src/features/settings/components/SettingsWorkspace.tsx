import { SettingsView } from "./SettingsView";
import { useSettingsWorkspace } from "../hooks/useSettingsWorkspace";
import type { SettingsWorkspaceProps } from "../hooks/useSettingsWorkspace";

export function Settings(props: SettingsWorkspaceProps) {
  const viewModel = useSettingsWorkspace(props);
  return <SettingsView model={viewModel} />;
}
