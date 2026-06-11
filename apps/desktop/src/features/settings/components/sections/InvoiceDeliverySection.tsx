export function InvoiceDeliverySection({ model }: { model: any }) {
  const {
    BoxTitle,
    CollapsibleSection,
    password,
    emailSettings,
    setEmailSettings,
    emailTestStatus,
    emailTestError,
    save,
    sendEmailTest
  } = model;

  return (
      <CollapsibleSection
        title="Invoice delivery"
        summary="SMTP configuration for invoice sending and test emails."
        defaultOpen={Boolean(emailSettings.smtp_username || emailTestError || emailTestStatus)}
      >
        <div className="panel">
          <BoxTitle title="Invoice email (SMTP)" />
          {emailTestStatus && <p className="muted">{emailTestStatus}</p>}
          {emailTestError && <p className="form-error">{emailTestError}</p>}
          <div className="row">
            <input
              placeholder="SMTP host"
              value={emailSettings.smtp_host}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_host: e.target.value })}
            />
            <input
              placeholder="Port"
              value={emailSettings.smtp_port}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_port: e.target.value })}
            />
            <input
              placeholder="Username"
              value={emailSettings.smtp_username}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_username: e.target.value })}
            />
          </div>
          <div className="row">
            <input
              type="password"
              placeholder="Password (App Password)"
              value={emailSettings.smtp_password}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_password: e.target.value })}
            />
            <input
              placeholder="From name"
              value={emailSettings.smtp_from_name}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_from_name: e.target.value })}
            />
            <input
              placeholder="From email"
              value={emailSettings.smtp_from_email}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_from_email: e.target.value })}
            />
          </div>
          <div className="row">
            <label className="row">
              <input
                type="checkbox"
                checked={emailSettings.smtp_use_tls}
                onChange={(e) =>
                  setEmailSettings({
                    ...emailSettings,
                    smtp_use_tls: e.target.checked,
                    smtp_use_ssl: e.target.checked ? false : emailSettings.smtp_use_ssl
                  })
                }
              />
              <span>Use STARTTLS</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={emailSettings.smtp_use_ssl}
                onChange={(e) =>
                  setEmailSettings({
                    ...emailSettings,
                    smtp_use_ssl: e.target.checked,
                    smtp_use_tls: e.target.checked ? false : emailSettings.smtp_use_tls
                  })
                }
              />
              <span>Use SSL (port 465)</span>
            </label>
            <button onClick={save}>Save email settings</button>
            <button className="button-ghost" onClick={sendEmailTest}>
              Send test email
            </button>
          </div>
          <p className="muted">For Gmail: smtp.gmail.com · port 587 · STARTTLS · App Password required.</p>
        </div>
      </CollapsibleSection>

  );
}
