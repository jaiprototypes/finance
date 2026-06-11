import { BusinessView } from "./BusinessView";
import { useBusinessWorkspace } from "../hooks/useBusinessWorkspace";
import type { BusinessWorkspaceProps } from "../hooks/useBusinessWorkspace";

export function Business(props: BusinessWorkspaceProps) {
  const viewModel = useBusinessWorkspace(props);
  return <BusinessView model={viewModel} />;
}
