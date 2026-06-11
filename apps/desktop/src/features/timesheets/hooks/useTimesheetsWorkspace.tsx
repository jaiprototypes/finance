import React, { Fragment, useEffect, useRef, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand, featureUrl } from "../api";
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
} from "../../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../../shared/financeUi";

export type TimesheetsWorkspaceProps = {
  onInvoiceCreated?: () => void;
};

export function useTimesheetsWorkspace({ onInvoiceCreated }: TimesheetsWorkspaceProps) {
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
      getFeatureData<any[]>("/timesheets/entries"),
      getFeatureData<any[]>("/timesheets/projects"),
      getFeatureData<any[]>("/timesheets/tasks"),
      getFeatureData<any[]>("/business/clients")
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
    const data = await sendFeatureCommand<any>(`/timesheets/timer/start?project_id=${projectId}${taskQuery}`);
    setActiveId(data.entry_id);
    refresh();
  };

  const stop = async () => {
    if (!activeId) return;
    await sendFeatureCommand(`/timesheets/timer/stop?entry_id=${activeId}`);
    setActiveId(null);
    refresh();
  };

  const createProject = async () => {
    await sendFeatureCommand("/timesheets/projects", {
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
    await sendFeatureCommand("/timesheets/tasks", {
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
      await sendFeatureCommand("/timesheets/entries", {
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
      await sendFeatureCommand(`/timesheets/entries/${editingEntryId}`, {
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
    await removeFeatureRecord(`/timesheets/entries/${entryId}`);
    refresh();
  };

  const deleteProject = async (projectIdToDelete: number) => {
    await removeFeatureRecord(`/timesheets/projects/${projectIdToDelete}`);
    refresh();
  };

  const deleteTask = async (taskIdToDelete: number) => {
    await removeFeatureRecord(`/timesheets/tasks/${taskIdToDelete}`);
    refresh();
  };

  const exportTimesheets = () => {
    window.open(featureUrl("/reports/timesheets/export"), "_blank");
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
      const created = await sendFeatureCommand<any>("/timesheets/invoice", {
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

  const viewModel = {
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
  };

  return viewModel;
}
