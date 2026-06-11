export function TimesheetsView({ model }: { model: any }) {
  const {
    featureUrl,
    BoxTitle,
    CollapsibleSection,
    SectionHeader,
    formatCount,
    formatDuration,
    formatHours,
    toDateValue,
    toDatetimeLocal,
    todayDate,
    entries,
    projects,
    tasks,
    clients,
    activeEntry,
    runningSeconds,
    editingEntryId,
    setEditingEntryId,
    entryError,
    timeInvoiceError,
    timeInvoiceSuccess,
    createdInvoiceId,
    projectId,
    setProjectId,
    taskId,
    setTaskId,
    projectForm,
    setProjectForm,
    taskForm,
    setTaskForm,
    entryForm,
    setEntryForm,
    invoiceForm,
    setInvoiceForm,
    selectedEntries,
    start,
    stop,
    createProject,
    createTask,
    createEntry,
    activeClients,
    startEditEntry,
    saveEntryEdit,
    deleteEntry,
    deleteProject,
    deleteTask,
    exportTimesheets,
    toggleEntry,
    createInvoiceFromTime,
    totalMinutes,
    billableMinutes,
    projectSummary,
    weeklyRows,
    selectedEntryCount,
    projectSetupSummary,
    weeklySummary
  } = model;

  return (
    <div className="page">
      <SectionHeader title="Projects + Time" subtitle="Track projects, weekly timesheets, and billable hours." />
      <div className="panel">
        <BoxTitle title="Projects tracker" />
        <div className="row">
          <span className="pill">Total hours {formatHours(totalMinutes)}</span>
          <span className="pill">Billable hours {formatHours(billableMinutes)}</span>
          <span className="pill">Active timer {activeEntry ? "Running" : "Idle"}</span>
          <span className="pill">Selected for invoice {formatCount(selectedEntryCount)}</span>
        </div>
        {projectSummary.length === 0 ? (
          <p className="muted">Create a project to track progress.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Rate</th>
                <th>Total hours</th>
                <th>Billable hours</th>
              </tr>
            </thead>
            <tbody>
              {projectSummary.map((project) => (
                <tr key={`summary-${project.id}`}>
                  <td>{project.name}</td>
                  <td>{project.client}</td>
                  <td>{project.hourly_rate}</td>
                  <td>{formatHours(project.minutes)}</td>
                  <td>{formatHours(project.billable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <CollapsibleSection
        title="Project setup"
        summary={projectSetupSummary}
        defaultOpen={projects.length === 0}
      >
        <div className="panel">
          <BoxTitle title="Create project" />
          <div className="row">
            <input
              placeholder="Project name"
              value={projectForm.name}
              onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
            />
            <select
              value={projectForm.client_id}
              onChange={(e) => setProjectForm({ ...projectForm, client_id: e.target.value })}
            >
              <option value="">Client (optional)</option>
              {activeClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Hourly rate"
              value={projectForm.hourly_rate}
              onChange={(e) => setProjectForm({ ...projectForm, hourly_rate: e.target.value })}
            />
            <input
              placeholder="Tags"
              value={projectForm.tags}
              onChange={(e) => setProjectForm({ ...projectForm, tags: e.target.value })}
            />
            <button onClick={createProject}>Add project</button>
          </div>
        </div>
        <div className="panel">
          <BoxTitle title="Projects" />
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Client</th>
                <th>Rate</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const client = clients.find((c) => c.id === project.client_id);
                return (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{client ? client.name : project.client_id || ""}</td>
                    <td>{project.hourly_rate || ""}</td>
                    <td>
                      <button onClick={() => deleteProject(project.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Create task" />
          <div className="row">
            <select
              value={taskForm.project_id}
              onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })}
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Task name"
              value={taskForm.name}
              onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
            />
            <button onClick={createTask}>Add task</button>
          </div>
        </div>
        <div className="panel">
          <BoxTitle title="Tasks" />
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Task</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const project = projects.find((p) => p.id === task.project_id);
                return (
                  <tr key={task.id}>
                    <td>{project ? project.name : task.project_id}</td>
                    <td>{task.name}</td>
                    <td>
                      <button onClick={() => deleteTask(task.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      <div className="panel">
        <div className="row">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">Task (optional)</option>
            {tasks
              .filter((task) => !projectId || String(task.project_id) === projectId)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
          </select>
          <button onClick={start}>Start timer</button>
          <button onClick={stop}>Stop timer</button>
          {activeEntry ? (
            <span className="muted">
              Running entry #{activeEntry.id} · {formatDuration(runningSeconds)}
            </span>
          ) : (
            <span className="muted">No active timer</span>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title={editingEntryId ? "Edit time entry" : "Add time entry"} />
        {entryError && <p className="form-error">{entryError}</p>}
        <div className="row">
          <select
            value={entryForm.project_id}
            onChange={(e) => setEntryForm({ ...entryForm, project_id: e.target.value })}
          >
            <option value="">Project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={entryForm.task_id}
            onChange={(e) => setEntryForm({ ...entryForm, task_id: e.target.value })}
          >
            <option value="">Task</option>
            {tasks
              .filter((task) => !entryForm.project_id || String(task.project_id) === entryForm.project_id)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
          </select>
          <input
            type="date"
            value={toDateValue(entryForm.date)}
            onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
          />
          <input
            type="datetime-local"
            value={toDatetimeLocal(entryForm.start_time)}
            onChange={(e) => setEntryForm({ ...entryForm, start_time: e.target.value })}
          />
          <input
            type="datetime-local"
            value={toDatetimeLocal(entryForm.end_time)}
            onChange={(e) => setEntryForm({ ...entryForm, end_time: e.target.value })}
          />
          <input
            placeholder="Duration minutes"
            value={entryForm.duration_minutes}
            onChange={(e) => setEntryForm({ ...entryForm, duration_minutes: e.target.value })}
          />
          <input placeholder="Notes" value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} />
          <label className="row">
            <input
              type="checkbox"
              checked={entryForm.billable}
              onChange={(e) => setEntryForm({ ...entryForm, billable: e.target.checked })}
            />
            <span>Billable</span>
          </label>
          <input
            placeholder="Hourly rate"
            value={entryForm.hourly_rate}
            onChange={(e) => setEntryForm({ ...entryForm, hourly_rate: e.target.value })}
          />
          {editingEntryId ? (
            <>
              <button onClick={saveEntryEdit}>Save entry</button>
              <button
                onClick={() => {
                  setEditingEntryId(null);
                  setEntryForm({
                    project_id: "",
                    task_id: "",
                    date: todayDate(),
                    start_time: "",
                    end_time: "",
                    duration_minutes: "",
                    notes: "",
                    billable: true,
                    hourly_rate: "",
                    invoiced_invoice_id: ""
                  });
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button onClick={createEntry}>Add entry</button>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Recent entries" />
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Date</th>
              <th>Project</th>
              <th>Task</th>
              <th>Duration</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedEntries[entry.id])}
                    onChange={() => toggleEntry(entry.id)}
                  />
                </td>
                <td>{entry.date}</td>
                <td>{projects.find((p) => p.id === entry.project_id)?.name || entry.project_id}</td>
                <td>{tasks.find((t) => t.id === entry.task_id)?.name || ""}</td>
                <td>
                  {entry.id === activeEntry?.id
                    ? `${formatDuration(runningSeconds)} (running)`
                    : `${entry.duration_minutes} min`}
                </td>
                <td>{entry.notes || ""}</td>
                <td>
                  <button onClick={() => startEditEntry(entry)}>Edit</button>
                  <button onClick={() => deleteEntry(entry.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={exportTimesheets}>Export CSV</button>
      </div>
      <CollapsibleSection
        title="Weekly rollup"
        summary={weeklySummary}
        defaultOpen={false}
      >
        <div className="panel">
          <BoxTitle title="Weekly timesheet" />
          {weeklyRows.length === 0 ? (
            <p className="muted">Log time entries to generate weekly timesheets.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Entries</th>
                  <th>Total hours</th>
                  <th>Billable hours</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((row) => (
                  <tr key={`week-${row.week}`}>
                    <td>{row.week}</td>
                    <td>{formatCount(row.entries.length)}</td>
                    <td>{formatHours(row.totalMinutes)}</td>
                    <td>{formatHours(row.billableMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CollapsibleSection>
      <div className="panel">
        <BoxTitle title="Invoice from time entries" />
        {timeInvoiceError && <p className="form-error">{timeInvoiceError}</p>}
        {timeInvoiceSuccess && (
          <div className="callout">
            <strong>{timeInvoiceSuccess}</strong>
            {createdInvoiceId && (
              <div>
                <a
                  href={featureUrl(`/business/invoices/${createdInvoiceId}/pdf`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open invoice PDF
                </a>
              </div>
            )}
          </div>
        )}
        <div className="row">
          <select
            value={invoiceForm.client_id}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, client_id: e.target.value })}
          >
            <option value="">Select client</option>
            {activeClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Invoice number (optional)"
            value={invoiceForm.number}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, number: e.target.value })}
          />
          <input
            type="date"
            value={toDateValue(invoiceForm.issue_date)}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })}
          />
          <input
            type="date"
            value={toDateValue(invoiceForm.due_date)}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
          />
          <select
            value={invoiceForm.currency}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}
          >
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
          <select
            value={invoiceForm.group_by}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, group_by: e.target.value })}
          >
            <option value="day">Group by day</option>
            <option value="task">Group by task</option>
          </select>
          <button onClick={createInvoiceFromTime}>Create invoice</button>
        </div>
      </div>
    </div>
  );
}
