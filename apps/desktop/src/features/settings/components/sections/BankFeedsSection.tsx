export function BankFeedsSection({ model }: { model: any }) {
  const {
    BoxTitle,
    CollapsibleSection,
    formatCount,
    status,
    connectors,
    plaidStatus,
    plaidItems,
    plaidAccounts,
    plaidError,
    plaidSync,
    plaidBusy,
    plaidLinkBusy,
    upStatus,
    upAccounts,
    upError,
    upSync,
    upBusy,
    connectPlaid,
    updatePlaidItem,
    syncPlaid,
    syncUp,
    plaidItemNeedsLogin,
    bankFeedSummary
  } = model;

  return (
      <CollapsibleSection
        title="Bank feeds"
        summary={bankFeedSummary}
        defaultOpen={Boolean(plaidStatus?.configured || upStatus?.configured || plaidError || upError)}
      >
        {(!plaidStatus?.configured || !upStatus?.configured) && (
          <div className="form-notice">
            Public builds do not include bank connector credentials. Add private Plaid or Up Bank env files in the
            Finances app data folder, or export the matching environment variables before launching the app.
          </div>
        )}
        <div className="panel">
          <BoxTitle title="Bank feed (Plaid)" />
          {plaidError && <p className="form-error">{plaidError}</p>}
          {plaidStatus?.env && (
            <p className="muted">
              Environment: <strong>{String(plaidStatus.env)}</strong>
            </p>
          )}
          {!plaidStatus?.configured && (
            <p className="muted">
              Plaid is not configured. Add a plaid.env file to the app data folder with PLAID_CLIENT_ID, PLAID_SECRET,
              PLAID_ENV, and PLAID_REDIRECT_URI.
            </p>
          )}
          {plaidStatus?.configured && !plaidStatus?.redirect_uri_configured && (
            <p className="form-error">
              Plaid OAuth redirect is not configured. Set PLAID_REDIRECT_URI to reconnect OAuth institutions in the
              desktop app.
            </p>
          )}
          <div className="row">
            <button onClick={connectPlaid} disabled={!plaidStatus?.configured || plaidLinkBusy} type="button">
              {plaidLinkBusy ? "Connecting…" : plaidItems.length > 0 ? "Connect new institution" : "Connect checking account"}
            </button>
            <button
              className="button-ghost"
              onClick={syncPlaid}
              disabled={!plaidStatus?.configured || plaidBusy || plaidItems.length === 0}
              type="button"
            >
              {plaidBusy ? "Syncing…" : "Sync now"}
            </button>
            {plaidSync && (
              <span className="muted">
                Synced {plaidSync.added} added · {plaidSync.modified} updated · {plaidSync.removed} removed
                {plaidSync.accounts_created ? ` · ${formatCount(plaidSync.accounts_created)} account mapped` : ""}
              </span>
            )}
          </div>
          {Array.isArray(plaidSync?.errors) && plaidSync.errors.length > 0 && (
            <div className="form-notice">
              {plaidSync.errors.map((error: any, index: number) => (
                <div key={`${error.item_id || "plaid"}-${error.endpoint || index}`}>
                  {error.institution_name || "Plaid item"} {error.endpoint || "sync"}:{" "}
                  {error.message || "Plaid returned an error."}
                  {error.request_id ? ` (${error.request_id})` : ""}
                  {error.error_code === "ITEM_LOGIN_REQUIRED" && error.item_id ? (
                    <>
                      {" "}
                      <button
                        className="button-ghost button-small"
                        onClick={() => updatePlaidItem(error.item_id)}
                        disabled={!plaidStatus?.configured || plaidLinkBusy}
                        type="button"
                      >
                        Reconnect
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {plaidItems.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Connected items</h4>
              <table>
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plaidItems.map((item: any) => (
                    <tr key={item.item_id}>
                      <td>{item.institution_name || item.item_id}</td>
                      <td>{item.status === "login_required" ? "login required" : item.status}</td>
                      <td>{item.updated_at || ""}</td>
                      <td>
                        {item.status === "duplicate" ? (
                          <span className="muted">Inactive duplicate</span>
                        ) : (
                          <button
                            className="button-ghost button-small"
                            onClick={() => updatePlaidItem(item.item_id)}
                            disabled={!plaidStatus?.configured || plaidLinkBusy}
                            type="button"
                          >
                            {plaidItemNeedsLogin(item) ? "Reconnect" : "Add accounts"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plaidAccounts.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Checking accounts</h4>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mask</th>
                    <th>Type</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {plaidAccounts.map((account: any) => (
                    <tr key={account.plaid_account_id}>
                      <td>{account.name}</td>
                      <td>{account.mask}</td>
                      <td>{account.subtype || account.type}</td>
                      <td>{account.currency || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <BoxTitle title="Bank feed (Up Bank)" />
          {upError && <p className="form-error">{upError}</p>}
          {!upStatus?.configured && (
            <p className="muted">Up Bank is not configured. Add an up.env file to the app data folder with UP_API_KEY.</p>
          )}
          <div className="row">
            <button onClick={syncUp} disabled={!upStatus?.configured || upBusy}>
              {upBusy ? "Syncing…" : "Sync Up Bank"}
            </button>
            {upSync && (
              <span className="muted">
                Accounts {upSync.accounts?.accounts ?? 0} · Transactions +{upSync.transactions?.added ?? 0}
              </span>
            )}
          </div>
          {upAccounts.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Connected accounts</h4>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Currency</th>
                    <th>Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {upAccounts.map((account: any) => (
                    <tr key={account.up_account_id}>
                      <td>{account.name || account.up_account_id}</td>
                      <td>{account.account_type || ""}</td>
                      <td>{account.currency || ""}</td>
                      <td>{account.last_synced_at || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">Up Bank API is AUD-only. Transactions will import into your chart of accounts.</p>
        </div>
        <div className="panel">
          <BoxTitle title="Connectors" />
          <p className="muted">Optional bank-linking connectors are disabled by default.</p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((connector: any) => (
                <tr key={connector.name}>
                  <td>{connector.name}</td>
                  <td>{connector.enabled ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

  );
}
