export function ClientDirectorySection({ model }: { model: any }) {
  const {
    Fragment,
    BoxTitle,
    RowDisclosureButton,
    formatAmount,
    formatCount,
    clients,
    showArchivedClients,
    setShowArchivedClients,
    expandedClientId,
    activeClients,
    archivedClients,
    clientCurrentCounts,
    clientArchivedCounts,
    canDeleteClientRecord,
    openInvoiceComposer,
    openArchiveIntake,
    startEditClient,
    deleteClient,
    restoreClient,
    clientLiveBalance,
    clientHistoricalBalance,
    toggleClientDetails
  } = model;

  return (
      <div className="panel">
        <BoxTitle title="Client directory" />
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Activity</th>
              <th>Receivables</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {activeClients.length === 0 && (
              <tr>
                <td colSpan={4}>No active clients yet.</td>
              </tr>
            )}
            {activeClients.map((client) => {
              const isExpanded = expandedClientId === client.id;
              const liveCount = clientCurrentCounts[client.id] || 0;
              const archivedCount = clientArchivedCounts[client.id] || 0;
              const deleteLabel = canDeleteClientRecord(client.id) ? "Delete client" : "Archive client";
              const liveBalance = Number(clientLiveBalance[client.id] || 0);
              const archiveBalance = Number(clientHistoricalBalance[client.id] || 0);
              const totalBalance = liveBalance + archiveBalance;
              return (
                <Fragment key={client.id}>
                  <tr>
                    <td>
                      <div className="table-compact-title">{client.name}</div>
                      <div className="table-compact-meta">{client.email || client.phone || "No direct contact on file."}</div>
                    </td>
                    <td>
                      <div className="table-compact-title">
                        {formatCount(liveCount)} live · {formatCount(archivedCount)} archived
                      </div>
                      <div className="table-compact-meta">
                        {client.notes ? "Notes on file" : "No client notes"}
                      </div>
                    </td>
                    <td>
                      <div className="table-compact-title">{formatAmount(totalBalance)}</div>
                      <div className="table-compact-meta">
                        Live {formatAmount(liveBalance)} · Archive {formatAmount(archiveBalance)}
                      </div>
                    </td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleClientDetails(client.id)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={4}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">Contact record</div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Email:</strong> {client.email || "—"}
                              </div>
                              <div>
                                <strong>Phone:</strong> {client.phone || "—"}
                              </div>
                              <div>
                                <strong>Address:</strong> {client.address || "—"}
                              </div>
                              <div>
                                <strong>Notes:</strong> {client.notes || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="table-detail-card">
                            <div className="table-detail-title">Client actions</div>
                            <div className="row">
                              <button className="button-ghost button-small" onClick={() => startEditClient(client)}>
                                Edit
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => openInvoiceComposer(client.id)}
                              >
                                New invoice
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => openArchiveIntake(client.id)}
                              >
                                Import history
                              </button>
                              <button className="button-small" onClick={() => deleteClient(client.id)}>
                                {deleteLabel}
                              </button>
                            </div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Live receivables:</strong> {formatAmount(liveBalance)}
                              </div>
                              <div>
                                <strong>Historical balance:</strong> {formatAmount(archiveBalance)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {archivedClients.length > 0 && (
          <div className="archived-client-toggle">
            <button className="button-ghost" onClick={() => setShowArchivedClients(!showArchivedClients)}>
              {showArchivedClients ? "Hide archived clients" : `Show archived clients (${archivedClients.length})`}
            </button>
          </div>
        )}
        {showArchivedClients && archivedClients.length > 0 && (
          <div className="archived-client-list">
            <div className="table-detail-title">Archived clients</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {archivedClients.map((client) => (
                  <tr key={`arch-${client.id}`}>
                    <td>{client.name}</td>
                    <td>{client.email || ""}</td>
                    <td>{client.phone || ""}</td>
                    <td>
                      <button className="button-ghost button-small" onClick={() => restoreClient(client)}>
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

  );
}
