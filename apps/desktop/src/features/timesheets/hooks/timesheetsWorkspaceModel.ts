import { formatCount, weekStartLabel } from "../../../shared/financeUi";

export function buildTimesheetsWorkspaceModel({
  clients,
  entries,
  projects,
  selectedEntries,
  tasks
}: {
  clients: any[];
  entries: any[];
  projects: any[];
  selectedEntries: Record<number, boolean>;
  tasks: any[];
}) {
  const activeClients = clients.filter((client) => client.is_active !== 0);
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

  return {
    activeClients,
    billableMinutes,
    projectSetupSummary,
    projectSummary,
    selectedEntryCount,
    totalMinutes,
    weeklyRows,
    weeklySummary
  };
}
