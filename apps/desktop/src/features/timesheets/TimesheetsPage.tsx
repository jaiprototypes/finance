import React, { Fragment, useEffect, useRef, useState } from "react";
import { API_BASE, apiDelete, apiGet, apiGetBlob, apiPost, apiPostForm, apiUrl, downloadDiagnostics, saveBlob } from "./api";
import {
  BoxTitle,
  CollapsibleSection,
  DEFAULT_LOCAL_AI_BASE_URL,
  DEFAULT_LOCAL_AI_MODEL,
  DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
  EMPTY_INVOICE_PREVIEW_PROFILE,
  InvoiceSheetPreview,
  MATRIX_BREAKDOWN_COLORS,
  PLAID_REFRESH_EVENT_KEY,
  RowDisclosureButton,
  SectionHeader,
  WorkspaceInsightCard,
  buildConicGradient,
  clearPendingPlaidLinkSession,
  currentMonthLabel,
  formatAmount,
  formatCompactCurrency,
  formatCount,
  formatCurrency,
  formatDuration,
  formatFileSize,
  formatHours,
  formatMonthLabel,
  formatMonthYearLabel,
  formatPlaidLinkExitError,
  formatRemainingSummary,
  formatSignedCurrency,
  formatTimestampLabel,
  isClosedReceivableStatus,
  loadPlaidScript,
  monthStateLabel,
  normalizeLlmSettings,
  notifyPlaidRefresh,
  renderMatrixMoney,
  savePendingPlaidLinkSession,
  toDateValue,
  toDatetimeLocal,
  toLogoSrc,
  todayDate,
  weekStartLabel
} from "../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../shared/financeUi";

export function Timesheets({ onInvoiceCreated }: { onInvoiceCreated?: () => void }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeEntry, setActiveEntry] = useState<any | null>(null);
  const [runningSeconds, setRunningSeconds] = useState(0);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [timeInvoiceError, setTimeInvoiceError] = useState<string | null>(null);
  const [timeInvoiceSuccess, setTimeInvoiceSuccess] = useState<string | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [projectForm, setProjectForm] = useState({ name: "", client_id: "", hourly_rate: "", tags: "" });
  const [taskForm, setTaskForm] = useState({ project_id: "", name: "" });
  const [entryForm, setEntryForm] = useState({
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
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: "",
    number: "",
    issue_date: todayDate(),
    due_date: "",
    currency: "AUD",
    group_by: "day"
  });
  const [selectedEntries, setSelectedEntries] = useState<Record<number, boolean>>({});

  const refresh = () =>
    Promise.all([
      apiGet<any[]>("/timesheets/entries"),
      apiGet<any[]>("/timesheets/projects"),
      apiGet<any[]>("/timesheets/tasks"),
      apiGet<any[]>("/business/clients")
    ])
      .then(([entriesData, projectsData, tasksData, clientsData]) => {
        setEntries(entriesData);
        setProjects(projectsData);
        setTasks(tasksData);
        setClients(clientsData);
        const running = entriesData.find((entry) => !entry.end_time);
        setActiveEntry(running || null);
        setActiveId(running ? running.id : null);
      })
      .catch(() => undefined);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!activeEntry?.start_time) {
      setRunningSeconds(0);
      return;
    }
    const startAt = new Date(activeEntry.start_time).getTime();
    if (Number.isNaN(startAt)) {
      setRunningSeconds(0);
      return;
    }
    const tick = () => setRunningSeconds(Math.max(0, Math.floor((Date.now() - startAt) / 1000)));
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [activeEntry?.start_time, activeEntry?.id]);

  const start = async () => {
    if (!projectId || activeEntry) return;
    const taskQuery = taskId ? `&task_id=${taskId}` : "";
    const data = await apiPost<any>(`/timesheets/timer/start?project_id=${projectId}${taskQuery}`);
    setActiveId(data.entry_id);
    refresh();
  };

  const stop = async () => {
    if (!activeId) return;
    await apiPost(`/timesheets/timer/stop?entry_id=${activeId}`);
    setActiveId(null);
    refresh();
  };

  const createProject = async () => {
    await apiPost("/timesheets/projects", {
      name: projectForm.name,
      client_id: projectForm.client_id ? Number(projectForm.client_id) : null,
      hourly_rate: projectForm.hourly_rate ? Number(projectForm.hourly_rate) : null,
      tags: projectForm.tags || null,
      is_active: true
    });
    setProjectForm({ name: "", client_id: "", hourly_rate: "", tags: "" });
    refresh();
  };

  const createTask = async () => {
    await apiPost("/timesheets/tasks", {
      project_id: Number(taskForm.project_id),
      name: taskForm.name,
      is_active: true
    });
    setTaskForm({ project_id: "", name: "" });
    refresh();
  };

  const createEntry = async () => {
    setEntryError(null);
    if (!entryForm.project_id) {
      setEntryError("Select a project before saving.");
      return;
    }
    const dateValue =
      entryForm.date || (entryForm.start_time ? entryForm.start_time.split("T")[0] : todayDate());
    const startValue = entryForm.start_time || "";
    const endValue = entryForm.end_time || "";
    if (endValue && !startValue) {
      setEntryError("Start time is required when an end time is set.");
      return;
    }
    if (startValue && endValue) {
      const startAt = new Date(startValue);
      const endAt = new Date(endValue);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        setEntryError("Start and end time must be valid.");
        return;
      }
      if (endAt <= startAt) {
        setEntryError("End time must be after start time.");
        return;
      }
    } else if (!startValue && !endValue) {
      const minutes = Number(entryForm.duration_minutes || 0);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setEntryError("Provide a duration or a start/end time.");
        return;
      }
    }
    try {
      await apiPost("/timesheets/entries", {
        project_id: Number(entryForm.project_id),
        task_id: entryForm.task_id ? Number(entryForm.task_id) : null,
        date: dateValue,
        start_time: startValue || null,
        end_time: endValue || null,
        duration_minutes: Number(entryForm.duration_minutes || 0),
        notes: entryForm.notes || null,
        billable: entryForm.billable,
        hourly_rate: entryForm.hourly_rate ? Number(entryForm.hourly_rate) : null,
        invoiced_invoice_id: entryForm.invoiced_invoice_id ? Number(entryForm.invoiced_invoice_id) : null
      });
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
      setEditingEntryId(null);
      refresh();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Unable to save entry.");
    }
  };

  const activeClients = clients.filter((client) => client.is_active !== 0);
  const startEditEntry = (entry: any) => {
    setEntryError(null);
    setEditingEntryId(entry.id);
    setEntryForm({
      project_id: String(entry.project_id),
      task_id: entry.task_id ? String(entry.task_id) : "",
      date: entry.date,
      start_time: toDatetimeLocal(entry.start_time || ""),
      end_time: toDatetimeLocal(entry.end_time || ""),
      duration_minutes: String(entry.duration_minutes || ""),
      notes: entry.notes || "",
      billable: Boolean(entry.billable),
      hourly_rate: entry.hourly_rate ? String(entry.hourly_rate) : "",
      invoiced_invoice_id: entry.invoiced_invoice_id ? String(entry.invoiced_invoice_id) : ""
    });
  };

  const saveEntryEdit = async () => {
    if (!editingEntryId) return;
    setEntryError(null);
    if (!entryForm.project_id) {
      setEntryError("Select a project before saving.");
      return;
    }
    const dateValue =
      entryForm.date || (entryForm.start_time ? entryForm.start_time.split("T")[0] : todayDate());
    const startValue = entryForm.start_time || "";
    const endValue = entryForm.end_time || "";
    if (endValue && !startValue) {
      setEntryError("Start time is required when an end time is set.");
      return;
    }
    if (startValue && endValue) {
      const startAt = new Date(startValue);
      const endAt = new Date(endValue);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        setEntryError("Start and end time must be valid.");
        return;
      }
      if (endAt <= startAt) {
        setEntryError("End time must be after start time.");
        return;
      }
    } else if (!startValue && !endValue) {
      const minutes = Number(entryForm.duration_minutes || 0);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setEntryError("Provide a duration or a start/end time.");
        return;
      }
    }
    try {
      await apiPost(`/timesheets/entries/${editingEntryId}`, {
        project_id: Number(entryForm.project_id),
        task_id: entryForm.task_id ? Number(entryForm.task_id) : null,
        date: dateValue,
        start_time: startValue || null,
        end_time: endValue || null,
        duration_minutes: Number(entryForm.duration_minutes || 0),
        notes: entryForm.notes || null,
        billable: entryForm.billable,
        hourly_rate: entryForm.hourly_rate ? Number(entryForm.hourly_rate) : null,
        invoiced_invoice_id: entryForm.invoiced_invoice_id ? Number(entryForm.invoiced_invoice_id) : null
      });
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
      refresh();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Unable to save entry.");
    }
  };

  const deleteEntry = async (entryId: number) => {
    await apiDelete(`/timesheets/entries/${entryId}`);
    refresh();
  };

  const deleteProject = async (projectIdToDelete: number) => {
    await apiDelete(`/timesheets/projects/${projectIdToDelete}`);
    refresh();
  };

  const deleteTask = async (taskIdToDelete: number) => {
    await apiDelete(`/timesheets/tasks/${taskIdToDelete}`);
    refresh();
  };

  const exportTimesheets = () => {
    window.open(apiUrl("/reports/timesheets/export"), "_blank");
  };

  const toggleEntry = (entryId: number) => {
    setSelectedEntries((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
  };

  const createInvoiceFromTime = async () => {
    setTimeInvoiceError(null);
    setTimeInvoiceSuccess(null);
    setCreatedInvoiceId(null);
    const entryIds = Object.entries(selectedEntries)
      .filter(([_, selected]) => selected)
      .map(([id]) => Number(id));
    if (!entryIds.length) {
      setTimeInvoiceError("Select at least one time entry.");
      return;
    }
    if (!invoiceForm.client_id) {
      setTimeInvoiceError("Select a client for the invoice.");
      return;
    }
    const issueDate = invoiceForm.issue_date || todayDate();
    setInvoiceForm((prev) => ({ ...prev, issue_date: issueDate }));
    try {
      const created = await apiPost<any>("/timesheets/invoice", {
        client_id: Number(invoiceForm.client_id),
        number: invoiceForm.number,
        status: "draft",
        issue_date: issueDate,
        due_date: invoiceForm.due_date || undefined,
        currency: invoiceForm.currency,
        time_entry_ids: entryIds,
        group_by: invoiceForm.group_by
      });
      setTimeInvoiceSuccess(
        `Created invoice ${created?.number ? `#${created.number}` : ""}`.trim() || "Invoice created."
      );
      setCreatedInvoiceId(created?.id ?? null);
      setSelectedEntries({});
      refresh();
      onInvoiceCreated?.();
    } catch (err) {
      setTimeInvoiceError(err instanceof Error ? err.message : "Unable to create invoice from time entries.");
    }
  };

  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.duration_minutes || 0), 0);
  const billableMinutes = entries.reduce(
    (sum, entry) => sum + (entry.billable ? Number(entry.duration_minutes || 0) : 0),
    0
  );
  const projectSummary = projects
    .map((project) => {
      const projectEntries = entries.filter((entry) => entry.project_id === project.id);
      const minutes = projectEntries.reduce((sum, entry) => sum + Number(entry.duration_minutes || 0), 0);
      const billable = projectEntries.reduce(
        (sum, entry) => sum + (entry.billable ? Number(entry.duration_minutes || 0) : 0),
        0
      );
      const client = clients.find((c) => c.id === project.client_id);
      return {
        id: project.id,
        name: project.name,
        client: client ? client.name : project.client_id || "",
        hourly_rate: project.hourly_rate || "",
        minutes,
        billable
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const weeklyBuckets: Record<
    string,
    { entries: any[]; totalMinutes: number; billableMinutes: number }
  > = {};
  entries.forEach((entry) => {
    const dateKey = entry.date || (entry.start_time ? String(entry.start_time).slice(0, 10) : "");
    const weekKey = weekStartLabel(dateKey);
    if (!weekKey) return;
    if (!weeklyBuckets[weekKey]) {
      weeklyBuckets[weekKey] = { entries: [], totalMinutes: 0, billableMinutes: 0 };
    }
    const minutes = Number(entry.duration_minutes || 0);
    weeklyBuckets[weekKey].entries.push(entry);
    weeklyBuckets[weekKey].totalMinutes += minutes;
    if (entry.billable) {
      weeklyBuckets[weekKey].billableMinutes += minutes;
    }
  });
  const weeklyRows = Object.entries(weeklyBuckets)
    .map(([week, data]) => ({ week, ...data }))
    .sort((a, b) => b.week.localeCompare(a.week));
  const selectedEntryCount = Object.values(selectedEntries).filter(Boolean).length;
  const projectSetupSummary =
    projects.length > 0 || tasks.length > 0
      ? `${formatCount(projects.length)} projects · ${formatCount(tasks.length)} tasks`
      : "Create projects and tasks once, then keep this tucked away.";
  const weeklySummary =
    weeklyRows.length > 0
      ? `${formatCount(weeklyRows.length)} weekly rollups · latest ${weeklyRows[0]?.week || ""}`
      : "Weekly rollups appear after entries are logged.";

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
                  href={apiUrl(`/business/invoices/${createdInvoiceId}/pdf`)}
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
