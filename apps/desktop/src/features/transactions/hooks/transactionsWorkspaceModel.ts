import { formatCount } from "../../../shared/financeUi";

export function buildTransactionsWorkspaceModel({
  categories,
  filters,
  registerPage,
  registerPageSize,
  transactions
}: {
  categories: any[];
  filters: { search: string; account_id: string; category_id: string };
  registerPage: number;
  registerPageSize: number;
  transactions: any[];
}) {
  const subcategoriesForCategory = (categoryId: string) => {
    const selected = categories.find((category) => String(category.id) === categoryId);
    return selected?.subcategories || [];
  };

  const formatSplitCategoryLabel = (split: any) =>
    split.subcategory_name
      ? `${split.category_name || "Uncategorized"} / ${split.subcategory_name}`
      : split.category_name || "Uncategorized";

  const reviewTransactions = transactions.filter((txn) =>
    ["pending", "imported"].includes(txn.reconciliation_state || "imported")
  );
  const reviewTotal = reviewTransactions.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
  const uncategorizedReviewTransactions = reviewTransactions.filter((txn) => !txn.splits || txn.splits.length === 0);
  const filtered = transactions.filter((txn) => {
    const matchesSearch =
      !filters.search ||
      `${txn.description} ${txn.payee || ""}`.toLowerCase().includes(filters.search.toLowerCase());
    const matchesAccount =
      filters.account_id === "all" || String(txn.account_id) === filters.account_id;
    const matchesCategory =
      filters.category_id === "all" ||
      (txn.splits || []).some((split: any) => String(split.category_id) === filters.category_id);
    return matchesSearch && matchesAccount && matchesCategory;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / registerPageSize));
  const startIndex = filtered.length === 0 ? 0 : (registerPage - 1) * registerPageSize + 1;
  const endIndex = Math.min(registerPage * registerPageSize, filtered.length);
  const pagedFiltered = filtered.slice((registerPage - 1) * registerPageSize, registerPage * registerPageSize);
  const summarizeTxnCategory = (txn: any) => {
    const splits = txn.splits || [];
    if (!splits.length) return "Uncategorized";
    if (splits.length === 1) return formatSplitCategoryLabel(splits[0]);
    return `${formatSplitCategoryLabel(splits[0])} +${formatCount(splits.length - 1)}`;
  };

  return {
    endIndex,
    filtered,
    formatSplitCategoryLabel,
    pagedFiltered,
    reviewTotal,
    reviewTransactions,
    startIndex,
    subcategoriesForCategory,
    summarizeTxnCategory,
    totalPages,
    uncategorizedReviewTransactions
  };
}
