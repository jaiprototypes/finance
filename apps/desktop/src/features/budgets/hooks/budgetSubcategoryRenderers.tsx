import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from "react";

type StringMap = Record<string, string>;

export function createBudgetSubcategoryRenderers({
  addingMatrixSubcategoryFor,
  budgetCurrency,
  createMatrixSubcategory,
  deleteMatrixSubcategory,
  editingMatrixSubcategoryId,
  hasSubcategoryRows,
  isMatrixRowExpanded,
  matrixBusy,
  visibleMatrixMonths,
  matrixSubcategoryDrafts,
  matrixSubcategoryRenameValues,
  openMatrixDrilldown,
  renderMatrixMoney,
  saveMatrixSubcategoryRename,
  setAddingMatrixSubcategoryFor,
  setEditingMatrixSubcategoryId,
  setMatrixSubcategoryDrafts,
  setMatrixSubcategoryRenameValues
}: {
  addingMatrixSubcategoryFor: string | null;
  budgetCurrency: string;
  createMatrixSubcategory: (row: any) => void;
  deleteMatrixSubcategory: (row: any, subcategory: any) => void;
  editingMatrixSubcategoryId: string | null;
  hasSubcategoryRows: (row: any) => boolean;
  isMatrixRowExpanded: (rowId: string) => boolean;
  matrixBusy: boolean;
  visibleMatrixMonths: string[];
  matrixSubcategoryDrafts: StringMap;
  matrixSubcategoryRenameValues: StringMap;
  openMatrixDrilldown: (event: MouseEvent, row: any, month: string, options?: { subcategory?: any }) => void;
  renderMatrixMoney: (amount: number, currency?: string) => ReactNode;
  saveMatrixSubcategoryRename: (row: any, subcategory: any) => void;
  setAddingMatrixSubcategoryFor: Dispatch<SetStateAction<string | null>>;
  setEditingMatrixSubcategoryId: Dispatch<SetStateAction<string | null>>;
  setMatrixSubcategoryDrafts: Dispatch<SetStateAction<StringMap>>;
  setMatrixSubcategoryRenameValues: Dispatch<SetStateAction<StringMap>>;
}) {
  const renderSubcategoryRows = (row: any) => {
    if (!hasSubcategoryRows(row) || !isMatrixRowExpanded(String(row.id))) return null;
    return (row.subcategories || []).map((subcategory: any) => {
      const renameKey = String(subcategory.subcategory_id || "");
      // Provider allocations can be inspected, but are not editable taxonomy records.
      const readOnly = Boolean(row.read_only || subcategory.read_only);
      const isRenaming = !readOnly && Boolean(subcategory.subcategory_id) && editingMatrixSubcategoryId === renameKey;
      const actualTotal = visibleMatrixMonths.reduce(
        (sum, month) =>
          sum + Number((subcategory.type === "income" ? subcategory.income?.[month] : subcategory.expense?.[month]) || 0),
        0
      );
      return (
        <tr key={`subcategory-${row.id}-${subcategory.id}`} className="matrix-subrow">
          <td className="matrix-label-cell matrix-subcategory-label-cell">
            <div className="matrix-label-main">
              <span className="matrix-subcategory-indent">↳</span>
              {isRenaming ? (
                <>
                  <input
                    className="matrix-subcategory-input"
                    value={matrixSubcategoryRenameValues[renameKey] || ""}
                    onChange={(event) =>
                      setMatrixSubcategoryRenameValues((prev) => ({ ...prev, [renameKey]: event.target.value }))
                    }
                  />
                  <button
                    className="matrix-subcategory-action"
                    onClick={() => saveMatrixSubcategoryRename(row, subcategory)}
                    disabled={matrixBusy}
                  >
                    Save
                  </button>
                  <button
                    className="matrix-subcategory-action"
                    onClick={() => {
                      setEditingMatrixSubcategoryId(null);
                      setMatrixSubcategoryRenameValues((prev) => ({ ...prev, [renameKey]: subcategory.name || "" }));
                    }}
                    disabled={matrixBusy}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>{subcategory.name}</span>
                  {!readOnly && subcategory.subcategory_id && !subcategory.is_unassigned && (
                    <>
                      <button
                        className="matrix-subcategory-action"
                        onClick={() => {
                          setEditingMatrixSubcategoryId(renameKey);
                          setMatrixSubcategoryRenameValues((prev) => ({
                            ...prev,
                            [renameKey]: subcategory.name || ""
                          }));
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="matrix-subcategory-action"
                        onClick={() => deleteMatrixSubcategory(row, subcategory)}
                        disabled={matrixBusy}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </td>
          {visibleMatrixMonths.map((month) => {
            const actual = Number(
              (subcategory.type === "income" ? subcategory.income?.[month] : subcategory.expense?.[month]) || 0
            );
            return (
              <td
                key={`subcategory-${row.id}-${subcategory.id}-${month}`}
                className="matrix-cell matrix-cell-drillable matrix-subcategory-cell"
                onContextMenu={(event) => openMatrixDrilldown(event, row, month, { subcategory })}
                title="Right-click to inspect transactions behind this subcategory actual"
              >
                {actual !== 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}
              </td>
            );
          })}
          <td className="matrix-total-cell"><span className="muted">Actual average </span>{renderMatrixMoney(actualTotal / (visibleMatrixMonths.length || 1), budgetCurrency)}<span className="muted"> / month</span></td>
        </tr>
      );
    });
  };

  const renderInlineSubcategoryEditor = (row: any) => {
    if (row.read_only || addingMatrixSubcategoryFor !== String(row.id)) return null;
    return (
      <div className="matrix-inline-subcategory-editor">
        <input
          className="matrix-subcategory-input"
          placeholder={`Add ${row.name} subcategory`}
          value={matrixSubcategoryDrafts[String(row.id)] || ""}
          onChange={(event) =>
            setMatrixSubcategoryDrafts((prev) => ({ ...prev, [String(row.id)]: event.target.value }))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              createMatrixSubcategory(row);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setAddingMatrixSubcategoryFor(null);
            }
          }}
        />
        <button className="matrix-subcategory-action" onClick={() => createMatrixSubcategory(row)} disabled={matrixBusy}>
          Add
        </button>
        <button
          className="matrix-subcategory-action"
          onClick={() => {
            setAddingMatrixSubcategoryFor(null);
          }}
          disabled={matrixBusy}
        >
          Cancel
        </button>
      </div>
    );
  };

  return { renderInlineSubcategoryEditor, renderSubcategoryRows };
}
