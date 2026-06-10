from collections.abc import Callable, Iterable

LedgerChangeHandler = Callable[..., dict[str, int] | None]

_ledger_change_handlers: list[LedgerChangeHandler] = []


def register_ledger_change_handler(handler: LedgerChangeHandler) -> None:
    if handler not in _ledger_change_handlers:
        _ledger_change_handlers.append(handler)


def emit_ledger_changed(
    session,
    *,
    invoice_ids: Iterable[int] | None = None,
    archived_invoice_ids: Iterable[int] | None = None,
) -> list[dict[str, int]]:
    results: list[dict[str, int]] = []
    for handler in _ledger_change_handlers:
        result = handler(
            session,
            invoice_ids=invoice_ids,
            archived_invoice_ids=archived_invoice_ids,
        )
        if result:
            results.append(result)
    return results
