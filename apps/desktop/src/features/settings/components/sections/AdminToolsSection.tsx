export function AdminToolsSection({ model }: { model: any }) {
  const {
    BoxTitle,
    CollapsibleSection,
    lockEnabled,
    setLockEnabled,
    password,
    setPassword,
    categories,
    categoryForm,
    setCategoryForm,
    save,
    seed,
    reset,
    createCategory,
    adminSummary
  } = model;

  return (
      <CollapsibleSection
        title="Admin tools"
        summary={adminSummary}
        defaultOpen={false}
      >
        <div className="panel">
          <BoxTitle title="Security & demo data" />
          <label className="row">
            <input type="checkbox" checked={lockEnabled} onChange={(e) => setLockEnabled(e.target.checked)} />
            <span>Enable app lock</span>
          </label>
          <input
            type="password"
            placeholder="Set/replace password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="row">
            <button onClick={save}>Save settings</button>
            <button onClick={seed}>Seed demo data</button>
            <button onClick={reset}>Reset demo data</button>
          </div>
        </div>
        <div className="panel">
          <BoxTitle title="Categories" />
          <div className="row">
            <input
              placeholder="Category name"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            />
            <label className="row">
              <input
                type="checkbox"
                checked={categoryForm.personal_allowed}
                onChange={(e) => setCategoryForm({ ...categoryForm, personal_allowed: e.target.checked })}
              />
              <span>Personal</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={categoryForm.business_allowed}
                onChange={(e) => setCategoryForm({ ...categoryForm, business_allowed: e.target.checked })}
              />
              <span>Business</span>
            </label>
            <input
              placeholder="Tax code"
              value={categoryForm.tax_code}
              onChange={(e) => setCategoryForm({ ...categoryForm, tax_code: e.target.value })}
            />
            <button onClick={createCategory}>Add category</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Personal</th>
                <th>Business</th>
                <th>Tax code</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat: any) => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>{cat.personal_allowed ? "Yes" : "No"}</td>
                  <td>{cat.business_allowed ? "Yes" : "No"}</td>
                  <td>{cat.tax_code || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

  );
}
