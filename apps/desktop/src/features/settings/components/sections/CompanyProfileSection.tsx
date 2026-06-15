export function CompanyProfileSection({ model }: { model: any }) {
  const {
    BoxTitle,
    companyProfile,
    setCompanyProfile,
    setLogoPreviewFailed,
    logoPickError,
    save,
    pickLogo,
    customPreviewSrc,
    usingDefaultLogo,
    logoPreviewSrc
  } = model;

  return (
      <div className="panel">
        <BoxTitle title="Company profile (invoices)" />
        <div className="row">
          <input
            placeholder="Company name"
            value={companyProfile.company_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_name: e.target.value })}
          />
          <input
            placeholder="Legal name"
            value={companyProfile.company_legal_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_legal_name: e.target.value })}
          />
          <input
            placeholder="DBA / Trade name"
            value={companyProfile.company_dba}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_dba: e.target.value })}
          />
          <input
            placeholder="Email"
            value={companyProfile.company_email}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={companyProfile.company_phone}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_phone: e.target.value })}
          />
        </div>
        <div className="row">
          <input
            placeholder="Business type (e.g., Sole Proprietor)"
            value={companyProfile.company_entity_type}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_entity_type: e.target.value })}
          />
          <input
            placeholder="Tax ID (EIN or Sales Tax #)"
            value={companyProfile.company_tax_id}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_tax_id: e.target.value })}
          />
          <input
            placeholder="City/State"
            value={companyProfile.company_city_state}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_city_state: e.target.value })}
          />
        </div>
        <textarea
          placeholder="Address"
          value={companyProfile.company_address}
          onChange={(e) => setCompanyProfile({ ...companyProfile, company_address: e.target.value })}
          rows={2}
        />
        <input
          placeholder="Logo file path (PNG/JPG)"
          value={companyProfile.company_logo_path}
          onChange={(e) => setCompanyProfile({ ...companyProfile, company_logo_path: e.target.value })}
        />
        <div className="row">
          <button className="button-ghost" onClick={pickLogo}>
            Choose logo image
          </button>
          <button onClick={save}>Save company profile</button>
        </div>
        {logoPickError && <p className="form-error">{logoPickError}</p>}
        <div className="logo-preview">
          <img
            src={logoPreviewSrc}
            alt="Logo preview"
            onError={() => {
              if (customPreviewSrc) setLogoPreviewFailed(true);
            }}
          />
          <div>
            <div className="logo-preview-title">
              {usingDefaultLogo ? "Default logo preview" : "Custom logo preview"}
            </div>
            <div className="muted">
              {usingDefaultLogo
                ? "Using the bundled logo until a custom path is saved."
                : "Loaded from your local file path."}
            </div>
          </div>
        </div>
        <p className="muted">Use a local file path, e.g. /Users/you/Downloads/logo.png</p>
      </div>

  );
}
