export function AutomationRulesSection({ model }: { model: any }) {
  const {
    Fragment,
    BoxTitle,
    CollapsibleSection,
    DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
    formatCount,
    categories,
    llmSettings,
    setLlmSettings,
    merchantForm,
    setMerchantForm,
    merchantEditingId,
    merchantEditForm,
    setMerchantEditForm,
    merchantApplyExisting,
    setMerchantApplyExisting,
    merchantStatus,
    merchantError,
    merchantPage,
    setMerchantPage,
    merchantPageSize,
    setMerchantPageSize,
    rules,
    ruleForm,
    setRuleForm,
    knowledge,
    knowledgeForm,
    setKnowledgeForm,
    createMerchant,
    saveMerchantEdit,
    startMerchantEdit,
    cancelMerchantEdit,
    deleteMerchant,
    sortedMerchants,
    merchantTotalPages,
    merchantStartIndex,
    merchantEndIndex,
    pagedMerchants,
    createRule,
    toggleRule,
    deleteRule,
    createKnowledge,
    toggleKnowledge,
    deleteKnowledge,
    automationSummary
  } = model;

  return (
      <CollapsibleSection
        title="Automation + rules"
        summary={automationSummary}
        defaultOpen={llmSettings.local_ai_enabled}
      >
        <div className="panel">
          <BoxTitle title="Local AI assistant" />
          <label className="row">
            <input
              type="checkbox"
              checked={llmSettings.local_ai_enabled}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_enabled: e.target.checked })}
            />
            <span>Enable local assistant commentary and categorization support</span>
          </label>
          <div className="row">
            <input
              placeholder="Local AI base URL"
              value={llmSettings.local_ai_base_url}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_base_url: e.target.value })}
            />
            <input
              placeholder="Local AI model"
              value={llmSettings.local_ai_model}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_model: e.target.value })}
            />
          </div>
          <div className="row">
            <input
              type="number"
              min={1}
              placeholder="Timeout seconds"
              value={String(llmSettings.local_ai_timeout_seconds)}
              onChange={(e) =>
                setLlmSettings({
                  ...llmSettings,
                  local_ai_timeout_seconds: Math.max(1, Number(e.target.value) || DEFAULT_LOCAL_AI_TIMEOUT_SECONDS)
                })
              }
            />
            <input
              placeholder="Retrieval backend"
              value={llmSettings.embedding_model}
              onChange={(e) => setLlmSettings({ ...llmSettings, embedding_model: e.target.value })}
            />
          </div>
          <p className="muted">
            Local AI must point to a loopback service such as Ollama or LM Studio running on this machine.
            It never becomes the source of truth for balances, budgets, debt math, or invoice totals.
          </p>
          <textarea
            placeholder="Private context for merchant aliases, category preferences, and budgeting guidance"
            value={llmSettings.personal_context}
            onChange={(e) => setLlmSettings({ ...llmSettings, personal_context: e.target.value })}
            rows={4}
          />
        </div>
        <div className="panel">
          <BoxTitle title="Classification rules" />
          <div className="row">
            <input
              placeholder="Rule name"
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
            />
            <select value={ruleForm.field} onChange={(e) => setRuleForm({ ...ruleForm, field: e.target.value })}>
              <option value="description">Description</option>
              <option value="payee">Payee</option>
              <option value="notes">Notes</option>
            </select>
            <select
              value={ruleForm.operator}
              onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })}
            >
              <option value="contains">Contains</option>
              <option value="equals">Equals</option>
              <option value="starts_with">Starts with</option>
              <option value="ends_with">Ends with</option>
            </select>
            <input
              placeholder="Match value"
              value={ruleForm.value}
              onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
            />
            <select
              value={ruleForm.category_id}
              onChange={(e) => setRuleForm({ ...ruleForm, category_id: e.target.value })}
            >
              <option value="">Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <label className="row">
              <input
                type="checkbox"
                checked={ruleForm.is_active}
                onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <button onClick={createRule}>Add rule</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Field</th>
                <th>Op</th>
                <th>Value</th>
                <th>Category</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const category = categories.find((cat) => cat.id === rule.category_id);
                return (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>{rule.field}</td>
                    <td>{rule.operator}</td>
                    <td>{rule.value}</td>
                    <td>{category ? category.name : ""}</td>
                    <td>{rule.is_active ? "Yes" : "No"}</td>
                    <td>
                      <button onClick={() => toggleRule(rule)}>{rule.is_active ? "Disable" : "Enable"}</button>
                      <button onClick={() => deleteRule(rule.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Knowledge base (RAG)" />
          <div className="row">
            <input
              placeholder="Title"
              value={knowledgeForm.title}
              onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
            />
            <input
              placeholder="Tags"
              value={knowledgeForm.tags}
              onChange={(e) => setKnowledgeForm({ ...knowledgeForm, tags: e.target.value })}
            />
            <label className="row">
              <input
                type="checkbox"
                checked={knowledgeForm.is_active}
                onChange={(e) => setKnowledgeForm({ ...knowledgeForm, is_active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <button onClick={createKnowledge}>Add entry</button>
          </div>
          <textarea
            placeholder="Notes to guide classification and reporting"
            value={knowledgeForm.content}
            onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content: e.target.value })}
            rows={3}
          />
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Tags</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {knowledge.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.title}</td>
                  <td>{entry.tags || ""}</td>
                  <td>{entry.is_active ? "Yes" : "No"}</td>
                  <td>
                    <button onClick={() => toggleKnowledge(entry)}>{entry.is_active ? "Disable" : "Enable"}</button>
                    <button onClick={() => deleteKnowledge(entry.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Merchant profiles" />
        <div className="row">
          <input
            placeholder="Merchant name"
            value={merchantForm.name}
            onChange={(e) => setMerchantForm({ ...merchantForm, name: e.target.value })}
          />
          <input
            placeholder="Currency (USD)"
            value={merchantForm.currency}
            onChange={(e) => setMerchantForm({ ...merchantForm, currency: e.target.value.toUpperCase() })}
          />
          <select
            value={merchantForm.default_category_id}
            onChange={(e) => setMerchantForm({ ...merchantForm, default_category_id: e.target.value })}
          >
            <option value="">Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={merchantForm.default_classification}
            onChange={(e) => setMerchantForm({ ...merchantForm, default_classification: e.target.value })}
          >
            <option value="Personal">Personal</option>
            <option value="Business">Business</option>
          </select>
          <input
            placeholder="Notes"
            value={merchantForm.notes}
            onChange={(e) => setMerchantForm({ ...merchantForm, notes: e.target.value })}
          />
          <button onClick={createMerchant}>Add merchant</button>
        </div>
        {merchantError && <p className="form-error">{merchantError}</p>}
        {merchantStatus && <p className="muted">{merchantStatus}</p>}
        <div className="row">
          <span className="muted">
            Showing {formatCount(merchantStartIndex)}-{formatCount(merchantEndIndex)} of {formatCount(sortedMerchants.length)}
          </span>
          <div className="row">
            <span className="muted">Rows</span>
            <select value={merchantPageSize} onChange={(e) => setMerchantPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="row">
            <button
              className="button-ghost button-small"
              onClick={() => setMerchantPage((page) => Math.max(1, page - 1))}
              disabled={merchantPage <= 1}
            >
              Prev
            </button>
            <span className="muted">
              Page {formatCount(merchantPage)} of {formatCount(merchantTotalPages)}
            </span>
            <button
              className="button-ghost button-small"
              onClick={() => setMerchantPage((page) => Math.min(merchantTotalPages, page + 1))}
              disabled={merchantPage >= merchantTotalPages}
            >
              Next
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Currency</th>
              <th>Category</th>
              <th>Classification</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedMerchants.map((merchant) => (
              <Fragment key={`merchant-${merchant.id}`}>
                <tr>
                  <td>{merchant.name}</td>
                  <td>{merchant.currency || ""}</td>
                  <td>{categories.find((cat) => cat.id === merchant.default_category_id)?.name || ""}</td>
                  <td>{merchant.default_classification}</td>
                  <td>{merchant.notes || ""}</td>
                  <td>
                    <button className="button-ghost button-small" onClick={() => startMerchantEdit(merchant)}>
                      {merchantEditingId === merchant.id ? "Close" : "Edit"}
                    </button>
                    <button className="button-ghost button-small" onClick={() => deleteMerchant(merchant.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {merchantEditingId === merchant.id && (
                  <tr className="table-inline">
                    <td colSpan={6}>
                      <div className="row">
                        <input
                          placeholder="Merchant name"
                          value={merchantEditForm.name}
                          onChange={(e) => setMerchantEditForm({ ...merchantEditForm, name: e.target.value })}
                        />
                        <input
                          placeholder="Currency (USD)"
                          value={merchantEditForm.currency}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, currency: e.target.value.toUpperCase() })
                          }
                        />
                        <select
                          value={merchantEditForm.default_category_id}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, default_category_id: e.target.value })
                          }
                        >
                          <option value="">Category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={merchantEditForm.default_classification}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, default_classification: e.target.value })
                          }
                        >
                          <option value="Personal">Personal</option>
                          <option value="Business">Business</option>
                        </select>
                        <input
                          placeholder="Notes"
                          value={merchantEditForm.notes}
                          onChange={(e) => setMerchantEditForm({ ...merchantEditForm, notes: e.target.value })}
                        />
                        <label className="row">
                          <input
                            type="checkbox"
                            checked={merchantApplyExisting}
                            onChange={(e) => setMerchantApplyExisting(e.target.checked)}
                          />
                          <span>Apply changes to existing transactions</span>
                        </label>
                        <button onClick={saveMerchantEdit}>Save</button>
                        <button className="button-ghost button-small" onClick={cancelMerchantEdit}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </CollapsibleSection>

  );
}
