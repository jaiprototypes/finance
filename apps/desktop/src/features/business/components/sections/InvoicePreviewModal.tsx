export function InvoicePreviewModal({ model }: { model: any }) {
  const {
    invoicePreview,
    closeInvoicePreview
  } = model;

  if (!invoicePreview) return null;

  return (
    <div className="modal-backdrop" onClick={closeInvoicePreview}>
      <div
        className="invoice-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${invoicePreview.title} PDF preview`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="invoice-preview-modal-head">
          <div>
            <strong>{invoicePreview.title}</strong>
            <p className="muted">Inline PDF review without downloading first.</p>
          </div>
          <div className="row">
            <a className="button-link" href={invoicePreview.url} download={invoicePreview.name}>
              Download PDF
            </a>
            <button className="button-ghost button-small" onClick={closeInvoicePreview} type="button">
              Close
            </button>
          </div>
        </div>
        <iframe className="invoice-preview-frame" src={invoicePreview.url} title={`${invoicePreview.title} PDF`} />
      </div>
    </div>
  );
}
