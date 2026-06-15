export function TimeEntriesSection({ model }: { model: any }) {
  const {
    BoxTitle,
    activeEntry,
    deleteEntry,
    entries,
    exportTimesheets,
    formatDuration,
    projects,
    runningSeconds,
    selectedEntries,
    startEditEntry,
    tasks,
    toggleEntry
  } = model;

  return (
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
          {entries.map((entry: any) => (
            <tr key={entry.id}>
              <td>
                <input
                  type="checkbox"
                  checked={Boolean(selectedEntries[entry.id])}
                  onChange={() => toggleEntry(entry.id)}
                />
              </td>
              <td>{entry.date}</td>
              <td>{projects.find((p: any) => p.id === entry.project_id)?.name || entry.project_id}</td>
              <td>{tasks.find((t: any) => t.id === entry.task_id)?.name || ""}</td>
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
  );
}
