export function TimeEntryEditorSection({ model }: { model: any }) {
  const {
    BoxTitle,
    createEntry,
    editingEntryId,
    entryError,
    entryForm,
    projects,
    saveEntryEdit,
    setEditingEntryId,
    setEntryForm,
    tasks,
    toDateValue,
    toDatetimeLocal,
    todayDate
  } = model;

  return (
    <div className="panel">
      <BoxTitle title={editingEntryId ? "Edit time entry" : "Add time entry"} />
      {entryError && <p className="form-error">{entryError}</p>}
      <div className="row">
        <select
          value={entryForm.project_id}
          onChange={(e) => setEntryForm({ ...entryForm, project_id: e.target.value })}
        >
          <option value="">Project</option>
          {projects.map((project: any) => (
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
            .filter((task: any) => !entryForm.project_id || String(task.project_id) === entryForm.project_id)
            .map((task: any) => (
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
  );
}
