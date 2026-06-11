import { TransactionsView } from "./TransactionsView";
import { useTransactionsWorkspace } from "../hooks/useTransactionsWorkspace";
import type { TransactionsWorkspaceProps } from "../hooks/useTransactionsWorkspace";

export function Transactions(props: TransactionsWorkspaceProps) {
  const viewModel = useTransactionsWorkspace(props);
  return <TransactionsView model={viewModel} />;
}
